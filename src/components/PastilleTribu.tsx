import { T } from "../proto.js";

/** Hexadecimal, three or six digits. Anything else is not drawn. */
const HEXADECIMAL = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/**
 * The colour a tribe is known by, shown beside its name.
 *
 * Members find their own tribe by its colour before they read the word, so the two
 * belong together everywhere the name appears.
 *
 * Two things this deliberately does not do. It draws nothing when the organisation
 * has set no colour, rather than falling back to one: a default would come to stand
 * for a group nobody assigned it to, and this product serves organisations whose
 * groups it knows nothing about. And it never lets an unvalidated value reach the
 * style attribute, because the colour is administrator input on a page any member
 * can open.
 *
 * The ring matters more than it looks. One of these tribes is white, and a white
 * disc on a white card is not a colour, it is a gap; the ring is what makes it read
 * as a deliberate white in both the light and the dark theme.
 */
export function PastilleTribu({ couleur, taille = 12 }: Readonly<{ couleur?: string | null; taille?: number }>): JSX.Element | null {
  const valeur = (couleur ?? "").trim();
  if (!HEXADECIMAL.test(valeur)) return null;
  return (
    <span
      aria-hidden
      style={{
        display: "inline-block",
        width: taille,
        height: taille,
        borderRadius: "50%",
        background: valeur,
        border: `1px solid ${T.line}`,
        boxShadow: "inset 0 0 0 1px rgba(255,255,255,.35)",
        flexShrink: 0,
        verticalAlign: "middle",
      }}
    />
  );
}
