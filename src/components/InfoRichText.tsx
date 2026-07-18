import { T } from "../proto.js";

/** Light-markup renderer for Information contents: **gras**, *italique*,
 * __souligné__, line breaks preserved. The input is ALWAYS treated as plain text
 * (React escapes it), never as HTML, so no injection is possible. Unmatched
 * markers are shown as-is. */
const TOKEN = /(\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*)/g;

export function InfoRichText({ texte }: Readonly<{ texte: string }>): JSX.Element {
  const parts = texte.split(TOKEN);
  return (
    <div style={{ fontSize: 15, lineHeight: 1.6, color: T.ink, whiteSpace: "pre-wrap", wordBreak: "break-word", margin: "10px 0" }}>
      {parts.map((p, i) => {
        const key = `${i}-${p.slice(0, 8)}`;
        if (p.startsWith("**") && p.endsWith("**")) return <strong key={key}>{p.slice(2, -2)}</strong>;
        if (p.startsWith("__") && p.endsWith("__")) return <u key={key}>{p.slice(2, -2)}</u>;
        if (p.startsWith("*") && p.endsWith("*") && p.length > 2) return <em key={key}>{p.slice(1, -1)}</em>;
        return <span key={key}>{p}</span>;
      })}
    </div>
  );
}

/** Plain-text excerpt of a rich content (markers stripped), for list previews. */
export function texteBrut(s: string): string {
  return (s || "").replace(/\*\*|__|\*/g, "");
}
