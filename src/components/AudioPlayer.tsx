import { useEffect, useRef, useState } from "react";

import { useLang } from "../i18n.js";
import { T } from "../proto.js";

const VITESSES = [0.75, 1, 1.25, 1.5] as const;

function fmt(s: number): string {
  if (!Number.isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

/** Reliable audio player for voice notes: play/pause, seek bar, 10-second jumps,
 * playback speed. Nothing ever auto-plays; network errors surface a clear message
 * instead of a dead control. */
export function AudioPlayer({ src }: Readonly<{ src: string }>): JSX.Element {
  const lang = useLang();
  const en = lang === "en";
  const ref = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [duree, setDuree] = useState(0);
  const [vitesse, setVitesse] = useState(1);
  const [erreur, setErreur] = useState(false);

  useEffect(() => () => ref.current?.pause(), []);

  const audio = (): HTMLAudioElement | null => ref.current;

  function basculer(): void {
    const a = audio();
    if (!a) return;
    if (playing) {
      a.pause();
    } else {
      void a.play().catch(() => setErreur(true));
    }
  }

  function sauter(delta: number): void {
    const a = audio();
    if (a) a.currentTime = Math.max(0, Math.min(a.duration || 0, a.currentTime + delta));
  }

  const btn = { height: 36, minWidth: 40, borderRadius: 10, border: `1px solid ${T.line}`, background: T.surf, color: T.ink, fontWeight: 700, fontSize: 12 } as const;

  if (erreur) {
    return <p style={{ fontSize: 12, color: T.dng, margin: "6px 0" }}>{en ? "Audio unavailable (network error)." : "Audio indisponible (erreur réseau)."}</p>;
  }

  return (
    <div style={{ border: `1px solid ${T.line}`, borderRadius: 13, padding: "10px 12px", margin: "8px 0", background: T.surf }}>
      <audio
        ref={ref}
        src={src}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(e) => setPos(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuree(e.currentTarget.duration)}
        onError={() => setErreur(true)}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="tap" onClick={basculer} aria-label={playing ? "Pause" : en ? "Play" : "Lire"} style={{ ...btn, background: T.b600, color: "#fff", border: "none", minWidth: 46 }}>
          {playing ? "⏸" : "▶"}
        </button>
        <button type="button" className="tap" onClick={() => sauter(-10)} aria-label={en ? "Back 10 seconds" : "Reculer de 10 secondes"} style={btn}>-10s</button>
        <button type="button" className="tap" onClick={() => sauter(10)} aria-label={en ? "Forward 10 seconds" : "Avancer de 10 secondes"} style={btn}>+10s</button>
        <select
          value={vitesse}
          onChange={(e) => {
            const v = Number(e.target.value);
            setVitesse(v);
            const a = audio();
            if (a) a.playbackRate = v;
          }}
          aria-label={en ? "Playback speed" : "Vitesse de lecture"}
          style={{ height: 34, borderRadius: 9, border: `1px solid ${T.line}`, background: T.bg, color: T.ink, fontSize: 12, padding: "0 6px" }}
        >
          {VITESSES.map((v) => <option key={v} value={v}>{v}x</option>)}
        </select>
        <span style={{ fontSize: 11.5, color: T.mut, fontVariantNumeric: "tabular-nums", marginLeft: "auto" }}>
          {fmt(pos)} / {fmt(duree)}
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={duree || 0}
        step={0.5}
        value={Math.min(pos, duree || 0)}
        onChange={(e) => {
          const a = audio();
          if (a) a.currentTime = Number(e.target.value);
        }}
        aria-label={en ? "Position in the audio" : "Position dans l'audio"}
        style={{ width: "100%", marginTop: 8, accentColor: T.b600 }}
      />
    </div>
  );
}
