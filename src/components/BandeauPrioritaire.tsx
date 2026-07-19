import { useEffect, useState } from "react";

import { type InformationPrioritaire, getInformationsPrioritaires } from "../api.js";
import { useLang } from "../i18n.js";
import { T } from "../proto.js";

// Sober, non-alarming palette per level. IMPORTANT is amber, URGENT is a calm red,
// never a full-screen flashing alert. INFO never triggers this banner.
function meta(p: string, en: boolean): { bg: string; fg: string; label: string; glyph: string } {
  if (p === "urgente") return { bg: "#fdecec", fg: "#c0392b", label: en ? "URGENT" : "URGENT", glyph: "!" };
  return { bg: "#fff4e5", fg: "#b26a00", label: en ? "IMPORTANT" : "IMPORTANT", glyph: "◆" };
}

const CLE_VU = "adsum.info.vu";

function dejaVu(id: string): boolean {
  try {
    return (JSON.parse(localStorage.getItem(CLE_VU) || "[]") as string[]).includes(id);
  } catch {
    return false;
  }
}
function marquerVu(id: string): void {
  try {
    const vus = new Set(JSON.parse(localStorage.getItem(CLE_VU) || "[]") as string[]);
    vus.add(id);
    localStorage.setItem(CLE_VU, JSON.stringify([...vus].slice(-200)));
  } catch { /* storage unavailable */ }
}

/**
 * Discreet priority banner shown at app open for an active URGENT/IMPORTANT
 * Information the member has not read. Sober by design: a coloured strip with a
 * badge, the title and a "Voir" link, dismissible, shown once per Information and
 * per member (localStorage). No modal, no sound, no full-screen alarm. Tapping
 * "Voir" opens the Informations tab.
 */
export function BandeauPrioritaire({ token, onOuvrir }: Readonly<{ token: string; onOuvrir: () => void }>): JSX.Element | null {
  const en = useLang() === "en";
  const [item, setItem] = useState<InformationPrioritaire | null>(null);
  const [ferme, setFerme] = useState(false);

  useEffect(() => {
    let vivant = true;
    void getInformationsPrioritaires(token)
      .then((liste) => {
        if (!vivant) return;
        const premier = liste.find((i) => !dejaVu(i.id));
        if (premier) setItem(premier);
      })
      .catch(() => undefined);
    return () => { vivant = false; };
  }, [token]);

  if (!item || ferme) return null;
  const m = meta(item.priorite, en);
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, background: m.bg, border: `1px solid ${m.fg}33`, borderLeft: `4px solid ${m.fg}`, borderRadius: 12, padding: "10px 12px", margin: "0 0 12px" }}>
      <span aria-hidden="true" style={{ flexShrink: 0, width: 22, height: 22, borderRadius: 7, background: m.fg, color: "#fff", fontSize: 12, fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: T.fm }}>{m.glyph}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 0.6, color: m.fg, fontFamily: T.fm }}>{m.label}</div>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: T.ink, margin: "1px 0 2px", lineHeight: 1.3 }}>{item.titre}</div>
        {item.sous_titre && <div style={{ fontSize: 11.5, color: T.mut, lineHeight: 1.4 }}>{item.sous_titre}</div>}
        <button
          type="button"
          onClick={() => { marquerVu(item.id); onOuvrir(); }}
          style={{ marginTop: 6, background: "none", border: "none", padding: 0, color: m.fg, fontSize: 12, fontWeight: 700, cursor: "pointer" }}
        >
          {en ? "See the information" : "Voir l'information"}
        </button>
      </div>
      <button
        type="button"
        aria-label={en ? "Dismiss" : "Fermer"}
        onClick={() => { marquerVu(item.id); setFerme(true); }}
        style={{ flexShrink: 0, background: "none", border: "none", color: m.fg, fontSize: 16, fontWeight: 700, cursor: "pointer", lineHeight: 1, padding: 2 }}
      >
        &times;
      </button>
    </div>
  );
}
