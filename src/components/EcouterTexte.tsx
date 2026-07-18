import { useEffect, useRef, useState } from "react";

import { synthetiserTexte } from "../api.js";
import { useLang } from "../i18n.js";
import { T } from "../proto.js";

const VITESSES = [0.75, 1, 1.25, 1.5] as const;
const CLE_VITESSE = "adsum.tts.vitesse";
const CLE_GENRE = "adsum.tts.genre";

function prefNombre(cle: string, defaut: number, valides: readonly number[]): number {
  try {
    const v = Number(localStorage.getItem(cle));
    return valides.includes(v) ? v : defaut;
  } catch {
    return defaut;
  }
}
function prefGenre(): "homme" | "femme" {
  try {
    return localStorage.getItem(CLE_GENRE) === "homme" ? "homme" : "femme";
  } catch {
    return "femme";
  }
}

/** The exact text a voice should read: content only. Mirrors the server cleaning:
 * markup markers, URLs and pictograms are stripped so the voice never describes an
 * emoji and stays faithful to the content. */
export function nettoyerPourVoix(texte: string): string {
  let s = (texte || "").replace(/https?:\/\/\S+/g, "");
  s = s.replace(/\*\*|__|\*/g, "");
  // Pictograms, symbols, variation selectors, joiners (built from code points).
  const plages: [number, number][] = [
    [0x1f000, 0x1fbff], [0x2190, 0x21ff], [0x2300, 0x27bf], [0x2b00, 0x2bff], [0xfe00, 0xfe0f], [0x200d, 0x200d],
  ];
  s = [...s].filter((ch) => {
    const c = ch.codePointAt(0) ?? 0;
    return !plages.some(([a, b]) => c >= a && c <= b);
  }).join("");
  return s.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

const FEMMES = ["denise", "vivienne", "eloise", "charlotte", "julie", "hortense", "amelie", "celine", "audrey", "virginie", "female", "femme", "aria", "jenny", "libby", "sonia", "nova"];
const HOMMES = ["henri", "paul", "claude", "thierry", "jerome", "antoine", "fabrice", "male", "homme", "guy", "ryan", "davis"];

/** Pick the most natural available device voice for the language and genre:
 * neural "Natural/Online" voices first, then a genre-matching name, then any
 * voice of the language. Keeps the native fallback as pleasant as the device allows. */
function choisirVoix(voix: SpeechSynthesisVoice[], lang: string, genre: "homme" | "femme"): SpeechSynthesisVoice | undefined {
  const prefixe = lang.slice(0, 2);
  const candidates = voix.filter((v) => v.lang.toLowerCase().startsWith(prefixe));
  const genreListe = genre === "femme" ? FEMMES : HOMMES;
  const score = (v: SpeechSynthesisVoice): number => {
    const n = v.name.toLowerCase();
    let s = 0;
    if (n.includes("natural") || n.includes("neural") || n.includes("online")) s += 4;
    if (genreListe.some((g) => n.includes(g))) s += 3;
    if ((genre === "femme" ? HOMMES : FEMMES).some((g) => n.includes(g))) s -= 3;
    if (n.includes("google")) s += 1;
    return s;
  };
  return [...candidates].sort((a, b) => score(b) - score(a))[0];
}

/**
 * "Écouter ce texte": reads the CONTENT (cleaned of markers, URLs and emojis).
 * When the platform's neural voice service is configured (Réglages IA), the audio
 * is synthesised server side with a natural voice and played here; otherwise the
 * best available device voice is used. The member chooses a female or male voice
 * and the reading speed; both are remembered. Nothing ever starts without a tap.
 */
export function EcouterTexte({ texte, token }: Readonly<{ texte: string; token?: string }>): JSX.Element | null {
  const lang = useLang();
  const en = lang === "en";
  const supporte = typeof window !== "undefined" && "speechSynthesis" in window;
  const [etat, setEtat] = useState<"arret" | "chargement" | "lecture" | "pause">("arret");
  const [vitesse, setVitesse] = useState<number>(() => prefNombre(CLE_VITESSE, 1, VITESSES));
  const [genre, setGenre] = useState<"homme" | "femme">(prefGenre);
  const [sourceNeurale, setSourceNeurale] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const neuralCache = useRef<Map<string, string>>(new Map());

  useEffect(() => () => {
    if (supporte) window.speechSynthesis.cancel();
    audioRef.current?.pause();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const propre = nettoyerPourVoix(texte);

  function lireNatif(): void {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(propre);
    u.lang = en ? "en-US" : "fr-FR";
    const voix = choisirVoix(window.speechSynthesis.getVoices(), u.lang, genre);
    if (voix) u.voice = voix;
    u.rate = vitesse;
    u.onend = () => setEtat("arret");
    u.onerror = () => setEtat("arret");
    window.speechSynthesis.speak(u);
    setSourceNeurale(false);
    setEtat("lecture");
  }

  async function demarrer(): Promise<void> {
    // Neural first when a token is available: the server returns a natural voice
    // (cached by content); any failure falls back to the device voice.
    if (token) {
      const cleCache = `${genre}|${propre.slice(0, 128)}|${propre.length}`;
      let url = neuralCache.current.get(cleCache);
      if (!url) {
        setEtat("chargement");
        try {
          const r = await synthetiserTexte(token, propre, genre);
          url = `data:${r.mime};base64,${r.audio}`;
          neuralCache.current.set(cleCache, url);
        } catch {
          url = undefined;
        }
      }
      if (url) {
        const a = audioRef.current ?? new Audio();
        audioRef.current = a;
        a.src = url;
        a.playbackRate = vitesse;
        a.onended = () => setEtat("arret");
        a.onerror = () => setEtat("arret");
        try {
          await a.play();
          setSourceNeurale(true);
          setEtat("lecture");
          return;
        } catch {
          /* autoplay refusal or decode error: fall through to the device voice */
        }
      }
    }
    if (supporte) lireNatif();
    else setEtat("arret");
  }

  function basculer(): void {
    if (etat === "chargement") return;
    if (etat === "arret") {
      void demarrer();
      return;
    }
    if (sourceNeurale && audioRef.current) {
      const a = audioRef.current;
      if (etat === "lecture") {
        a.pause();
        setEtat("pause");
      } else {
        void a.play();
        setEtat("lecture");
      }
      return;
    }
    if (etat === "lecture") {
      window.speechSynthesis.pause();
      setEtat("pause");
    } else {
      window.speechSynthesis.resume();
      setEtat("lecture");
    }
  }

  function arreter(): void {
    if (sourceNeurale && audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    } else if (supporte) {
      window.speechSynthesis.cancel();
    }
    setEtat("arret");
  }

  function changerVitesse(v: number): void {
    setVitesse(v);
    try {
      localStorage.setItem(CLE_VITESSE, String(v));
    } catch { /* storage unavailable */ }
    if (sourceNeurale && audioRef.current) {
      audioRef.current.playbackRate = v;
    } else if (etat === "lecture") {
      arreter();
      window.setTimeout(() => lireNatif(), 60);
    }
  }

  function changerGenre(g: "homme" | "femme"): void {
    setGenre(g);
    try {
      localStorage.setItem(CLE_GENRE, g);
    } catch { /* storage unavailable */ }
    if (etat !== "arret") arreter();
  }

  if (!supporte && !token) {
    return (
      <p style={{ fontSize: 11.5, color: T.mut, margin: "6px 0" }}>
        {en ? "Voice reading is not available on this device." : "La lecture vocale n'est pas disponible sur cet appareil."}
      </p>
    );
  }

  const enCours = etat === "lecture" || etat === "pause";
  let labelPrincipal: string;
  if (etat === "chargement") labelPrincipal = en ? "Preparing..." : "Préparation...";
  else if (etat === "lecture") labelPrincipal = "Pause";
  else if (etat === "pause") labelPrincipal = en ? "Resume" : "Reprendre";
  else labelPrincipal = en ? "Listen to this text" : "Écouter ce texte";

  const petitSelect = { height: 32, borderRadius: 8, border: `1px solid ${T.line}`, background: T.surf, color: T.ink, fontSize: 12, padding: "0 6px" } as const;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", margin: "4px 0 2px" }}>
      <button
        type="button"
        className="tap"
        onClick={basculer}
        aria-label={labelPrincipal}
        disabled={etat === "chargement"}
        style={{ display: "inline-flex", alignItems: "center", gap: 7, height: 38, padding: "0 14px", borderRadius: 10, border: `1px solid ${T.b600}`, background: enCours ? T.b600 : T.tintb, color: enCours ? "#fff" : T.b600, fontWeight: 700, fontSize: 12.5, fontFamily: "inherit", opacity: etat === "chargement" ? 0.7 : 1 }}
      >
        <span aria-hidden="true" style={{ fontSize: 14 }}>{etat === "lecture" ? "⏸" : "▶"}</span>
        {labelPrincipal}
      </button>
      {enCours && (
        <button type="button" className="tap" onClick={arreter} aria-label={en ? "Stop" : "Arrêter"} style={{ height: 38, width: 38, borderRadius: 10, border: `1px solid ${T.line}`, background: T.surf, color: T.ink, fontSize: 12, fontWeight: 700 }}>
          ■
        </button>
      )}
      <select
        value={genre}
        onChange={(e) => changerGenre(e.target.value as "homme" | "femme")}
        aria-label={en ? "Voice" : "Voix"}
        style={petitSelect}
      >
        <option value="femme">{en ? "Female voice" : "Voix femme"}</option>
        <option value="homme">{en ? "Male voice" : "Voix homme"}</option>
      </select>
      <label style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: T.mut }}>
        <span aria-hidden="true">{en ? "Speed" : "Vitesse"}</span>
        <select value={vitesse} onChange={(e) => changerVitesse(Number(e.target.value))} aria-label={en ? "Reading speed" : "Vitesse de lecture"} style={petitSelect}>
          {VITESSES.map((v) => (
            <option key={v} value={v}>{v}x</option>
          ))}
        </select>
      </label>
    </div>
  );
}
