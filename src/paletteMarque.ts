/**
 * The brand blues, derived from the colour the organisation configured.
 *
 * The palette was five hex literals. An organisation could set its colour in the back
 * office, see it in its e-mails, and never once in the application: every button,
 * chip and gradient stayed indigo. The setting existed and did nothing.
 *
 * They stay hex strings rather than becoming CSS variables because the application
 * concatenates alpha onto them (`${T.b600}33`), which only works on a literal. So the
 * values are held here and read through getters: a change lands on the next render,
 * and every existing call site keeps working untouched.
 *
 * The shades are derived from the single configured colour by moving it toward white
 * or black. An organisation should name one colour, not five, and asking for a whole
 * scale is how a settings screen stops being usable.
 */

/** What the platform shipped with. Also the fallback when nothing is configured. */
const ORIGINE = {
  b400: "#5b82d8",
  b500: "#3563c9",
  b600: "#2a4fad",
  b700: "#223f8a",
  b900: "#172a5a",
};

let courante = { ...ORIGINE };

function versCanaux(hex: string): [number, number, number] | null {
  const v = hex.trim().replace("#", "");
  const complet = v.length === 3 ? v.split("").map((c) => c + c).join("") : v;
  if (complet.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(complet)) return null;
  return [
    parseInt(complet.slice(0, 2), 16),
    parseInt(complet.slice(2, 4), 16),
    parseInt(complet.slice(4, 6), 16),
  ];
}

function versHex([r, v, b]: [number, number, number]): string {
  const deux = (n: number): string => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${deux(r)}${deux(v)}${deux(b)}`;
}

/** Move a colour toward white (ratio > 0) or black (ratio < 0). */
function nuance(canaux: [number, number, number], ratio: number): string {
  const cible = ratio > 0 ? 255 : 0;
  const force = Math.abs(ratio);
  return versHex([
    canaux[0] + (cible - canaux[0]) * force,
    canaux[1] + (cible - canaux[1]) * force,
    canaux[2] + (cible - canaux[2]) * force,
  ]);
}

/**
 * Adopt the organisation's colour. Ignores anything that is not a valid hex, so a
 * mistyped setting leaves the application legible instead of unreadable.
 */
export function appliquerCouleurMarque(couleur: string | null | undefined, sombre?: string | null): void {
  const canaux = versCanaux(couleur ?? "");
  if (!canaux) {
    courante = { ...ORIGINE };
    return;
  }
  const base = versHex(canaux);
  // An organisation that kept the shipped brand colour keeps the shipped scale, to
  // the byte. Deriving it would shift three shades by a few points for no reason, and
  // "nothing changes until you decide" has to be true of pixels too. The dark colour
  // is not part of the test: it serves the e-mail gradient, not this scale.
  if (base.toLowerCase() === ORIGINE.b600) {
    courante = { ...ORIGINE };
    return;
  }
  const canauxSombre = versCanaux(sombre ?? "");
  courante = {
    b400: nuance(canaux, 0.28),
    b500: nuance(canaux, 0.14),
    b600: base,
    b700: nuance(canaux, -0.18),
    b900: canauxSombre ? nuance(canauxSombre, -0.2) : nuance(canaux, -0.45),
  };
}

/** The palette as it stands, read at each render. */
export const palette = {
  get b400(): string {
    return courante.b400;
  },
  get b500(): string {
    return courante.b500;
  },
  get b600(): string {
    return courante.b600;
  },
  get b700(): string {
    return courante.b700;
  },
  get b900(): string {
    return courante.b900;
  },
};
