import { T } from "../proto.js";

/** Light-markup renderer for Information contents: **gras**, *italique*,
 * __souligné__, plus line-level structures (## titre, - liste, > citation).
 * The input is ALWAYS treated as plain text (React escapes it), never as HTML,
 * so no injection is possible. Unmatched markers are shown as-is. */
const TOKEN = /(\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*)/g;

function Inline({ texte }: Readonly<{ texte: string }>): JSX.Element {
  const parts = texte.split(TOKEN);
  return (
    <>
      {parts.map((p, i) => {
        const key = `${i}-${p.slice(0, 8)}`;
        if (p.startsWith("**") && p.endsWith("**")) return <strong key={key}>{p.slice(2, -2)}</strong>;
        if (p.startsWith("__") && p.endsWith("__")) return <u key={key}>{p.slice(2, -2)}</u>;
        if (p.startsWith("*") && p.endsWith("*") && p.length > 2) return <em key={key}>{p.slice(1, -1)}</em>;
        return <span key={key}>{p}</span>;
      })}
    </>
  );
}

export function InfoRichText({ texte }: Readonly<{ texte: string }>): JSX.Element {
  const lignes = (texte || "").split("\n");
  return (
    <div style={{ fontSize: 15, lineHeight: 1.65, color: T.ink, wordBreak: "break-word" }}>
      {lignes.map((l, i) => {
        const key = `l${i}`;
        if (l.startsWith("## ")) {
          return (
            <p key={key} style={{ fontFamily: T.fd, fontWeight: 800, fontSize: 16.5, margin: "14px 0 4px", color: T.ink }}>
              <Inline texte={l.slice(3)} />
            </p>
          );
        }
        if (l.startsWith("- ")) {
          return (
            <p key={key} style={{ margin: "2px 0 2px 6px", display: "flex", gap: 8 }}>
              <span aria-hidden="true" style={{ color: T.b600, fontWeight: 700 }}>{"•"}</span>
              <span><Inline texte={l.slice(2)} /></span>
            </p>
          );
        }
        if (l.startsWith("> ")) {
          return (
            <p key={key} style={{ margin: "6px 0", padding: "6px 12px", borderLeft: `3px solid ${T.b600}`, background: T.tintb, borderRadius: "0 9px 9px 0", fontStyle: "italic" }}>
              <Inline texte={l.slice(2)} />
            </p>
          );
        }
        if (l.trim() === "") return <div key={key} style={{ height: 10 }} />;
        return (
          <p key={key} style={{ margin: "2px 0" }}>
            <Inline texte={l} />
          </p>
        );
      })}
    </div>
  );
}

/** Plain-text excerpt of a rich content (markers stripped), for list previews. */
export function texteBrut(s: string): string {
  return (s || "").replace(/^## /gm, "").replace(/^> /gm, "").replace(/^- /gm, "").replace(/\*\*|__|\*/g, "");
}
