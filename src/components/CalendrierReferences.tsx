import { type DateReferenceOccurrence } from "../api.js";
import { useLang } from "../i18n.js";
import { T } from "../proto.js";

/**
 * Reference dates (institutional commemorations and catholic feasts) for the selected
 * day. These are NOT activities: no attendance, survey or QR. Each shows the "DATE DE
 * REFERENCE" badge, its category colour, the anniversary count when relevant and a
 * rich (server-sanitised) description. Purely informational.
 */
function fmtAnciennete(n: number, en: boolean): string {
  if (en) return `${n}${n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th"} anniversary`;
  return `${n}${n === 1 ? "er" : "e"} anniversaire`;
}

export function CalendrierReferences({ dates }: Readonly<{ dates: DateReferenceOccurrence[] }>): JSX.Element | null {
  const en = useLang() === "en";
  const L = (fr: string, e: string): string => (en ? e : fr);
  if (dates.length === 0) return null;

  return (
    <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
      <p style={{ fontFamily: T.fm, fontSize: 9, letterSpacing: 0.8, color: T.b600, margin: "0 2px", textTransform: "uppercase" }}>
        {L("Dates de référence", "Reference dates")}
      </p>
      {dates.map((d) => {
        const couleur = d.couleur_hex || "#8a5a12";
        return (
          <article key={`${d.origine}-${d.source_id}`} style={{ background: T.surf, border: `1px solid ${T.line}`, borderLeft: `4px solid ${couleur}`, borderRadius: 13, overflow: "hidden" }}>
            {d.image_url ? (
              <img src={d.image_url} alt="" style={{ width: "100%", maxHeight: 160, objectFit: "cover", display: "block" }} />
            ) : null}
            <div style={{ padding: "12px 14px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: 0.5, color: couleur, background: `${couleur}1a`, borderRadius: 999, padding: "2px 8px" }}>
                  {d.badge}
                </span>
                <span style={{ fontSize: 10, color: T.faint }}>
                  {d.origine === "liturgie" ? L("Calendrier catholique", "Catholic calendar") : L("Institution", "Institution")}
                </span>
              </div>
              <h3 style={{ margin: "8px 0 2px", fontSize: 15.5, fontWeight: 800, color: T.ink }}>{d.titre}</h3>
              {d.anciennete != null ? (
                <div style={{ fontSize: 12.5, color: couleur, fontWeight: 700 }}>{fmtAnciennete(d.anciennete, en)}</div>
              ) : null}
              {d.lieu ? <div style={{ fontSize: 12, color: T.mut, marginTop: 2 }}>{d.lieu}</div> : null}
              {d.description ? (
                <div
                  style={{ fontSize: 13.5, color: T.mut, lineHeight: 1.55, marginTop: 8 }}
                  // Server-sanitised HTML (allowlist), safe to render.
                  dangerouslySetInnerHTML={{ __html: d.description }}
                />
              ) : null}
              {d.lien ? (
                <a href={d.lien} target="_blank" rel="noopener noreferrer nofollow" style={{ display: "inline-block", marginTop: 8, fontSize: 12.5, color: T.tintbf, fontWeight: 600 }}>
                  {L("En savoir plus", "Learn more")} →
                </a>
              ) : null}
              {d.source ? <div style={{ fontSize: 10.5, color: T.faint, marginTop: 8 }}>{L("Source", "Source")} : {d.source}</div> : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}
