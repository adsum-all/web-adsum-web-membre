import { useEffect, useRef, useState } from "react";

import { useLang } from "../i18n.js";
import { T } from "../proto.js";

const VITESSES = [0.75, 1, 1.25, 1.5] as const;
const CLE_VITESSE = "adsum.tts.vitesse";

function vitesseInitiale(): number {
  try {
    const v = Number(localStorage.getItem(CLE_VITESSE));
    return VITESSES.includes(v as (typeof VITESSES)[number]) ? v : 1;
  } catch {
    return 1;
  }
}

/** Pick the best available voice for a language: a local, natural-sounding voice
 * when the platform offers one, otherwise any voice for that language. */
function choisirVoix(voix: SpeechSynthesisVoice[], lang: string): SpeechSynthesisVoice | undefined {
  const prefixe = lang.slice(0, 2);
  const pourLangue = voix.filter((v) => v.lang.toLowerCase().startsWith(prefixe));
  return pourLangue.find((v) => v.localService) ?? pourLangue[0];
}

/**
 * "Écouter ce texte": on-demand text-to-speech of a visible content, using the
 * device's native speech synthesis (Web Speech API). No audio ever starts without
 * an explicit tap. Playback can be paused, resumed and stopped, and the reading
 * speed is remembered. When the platform has no speech synthesis, a clear message
 * is shown instead of a broken control. A neural cloud voice can be layered later
 * behind the same control; the native voice is the always-available baseline.
 */
export function EcouterTexte({ texte }: { texte: string }): JSX.Element | null {
  const lang = useLang();
  const supporte = typeof window !== "undefined" && "speechSynthesis" in window;
  const [etat, setEtat] = useState<"arret" | "lecture" | "pause">("arret");
  const [vitesse, setVitesse] = useState<number>(vitesseInitiale);
  const utterRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    if (!supporte) return;
    // Warm the voice list (some platforms populate it asynchronously) and always
    // stop any speech when this view is left.
    window.speechSynthesis.getVoices();
    return () => window.speechSynthesis.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!supporte) {
    return (
      <p style={{ fontSize: 11.5, color: T.mut, margin: "6px 0" }}>
        {lang === "en" ? "Voice reading is not available on this device." : "La lecture vocale n'est pas disponible sur cet appareil."}
      </p>
    );
  }

  function demarrer(): void {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(texte.replace(/\s+/g, " ").trim());
    u.lang = lang === "en" ? "en-US" : "fr-FR";
    const voix = choisirVoix(window.speechSynthesis.getVoices(), u.lang);
    if (voix) u.voice = voix;
    u.rate = vitesse;
    u.onend = () => setEtat("arret");
    u.onerror = () => setEtat("arret");
    utterRef.current = u;
    window.speechSynthesis.speak(u);
    setEtat("lecture");
  }

  function basculer(): void {
    if (etat === "arret") {
      demarrer();
      return;
    }
    if (etat === "lecture") {
      window.speechSynthesis.pause();
      setEtat("pause");
      return;
    }
    window.speechSynthesis.resume();
    setEtat("lecture");
  }

  function arreter(): void {
    window.speechSynthesis.cancel();
    setEtat("arret");
  }

  function changerVitesse(v: number): void {
    setVitesse(v);
    try {
      localStorage.setItem(CLE_VITESSE, String(v));
    } catch {
      /* storage unavailable */
    }
    // Apply immediately by restarting only when actively playing; a paused reading
    // keeps its position and the new speed applies on the next start.
    if (etat === "lecture") {
      arreter();
      window.setTimeout(() => {
        const u = utterRef.current;
        if (u) {
          u.rate = v;
          window.speechSynthesis.speak(u);
          setEtat("lecture");
        }
      }, 60);
    }
  }

  const enCours = etat !== "arret";
  const en = lang === "en";
  let labelPrincipal: string;
  if (etat === "lecture") labelPrincipal = "Pause";
  else if (etat === "pause") labelPrincipal = en ? "Resume" : "Reprendre";
  else labelPrincipal = en ? "Listen to this text" : "Écouter ce texte";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", margin: "4px 0 2px" }}>
      <button
        type="button"
        className="tap"
        onClick={basculer}
        aria-label={labelPrincipal}
        style={{ display: "inline-flex", alignItems: "center", gap: 7, height: 38, padding: "0 14px", borderRadius: 10, border: `1px solid ${T.b600}`, background: enCours ? T.b600 : T.tintb, color: enCours ? "#fff" : T.b600, fontWeight: 700, fontSize: 12.5, fontFamily: "inherit" }}
      >
        <span aria-hidden="true" style={{ fontSize: 14 }}>{etat === "lecture" ? "⏸" : "▶"}</span>
        {labelPrincipal}
      </button>
      {enCours && (
        <button type="button" className="tap" onClick={arreter} aria-label={lang === "en" ? "Stop" : "Arrêter"} style={{ height: 38, width: 38, borderRadius: 10, border: `1px solid ${T.line}`, background: T.surf, color: T.ink, fontSize: 12, fontWeight: 700 }}>
          ■
        </button>
      )}
      <label style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: T.mut }}>
        <span aria-hidden="true">{en ? "Speed" : "Vitesse"}</span>
        <select
          value={vitesse}
          onChange={(e) => changerVitesse(Number(e.target.value))}
          aria-label={en ? "Reading speed" : "Vitesse de lecture"}
          style={{ height: 32, borderRadius: 8, border: `1px solid ${T.line}`, background: T.surf, color: T.ink, fontSize: 12, padding: "0 6px" }}
        >
          {VITESSES.map((v) => (
            <option key={v} value={v}>{v}x</option>
          ))}
        </select>
      </label>
    </div>
  );
}
