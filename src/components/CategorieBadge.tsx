import type { JSX } from "react";

import { CATEGORIES_ATTRIBUTION } from "../api.js";

/** One CSS badge class per attribution category, all light pastel tones aligned
 * with the design system badges. */
const CAT_CLASS: Record<string, string> = {
  titre: "badge-cat-titre",
  fonction_speciale: "badge-cat-speciale",
  fonction: "badge-cat-fonction",
  fonction_particuliere: "badge-cat-particuliere",
};

const CAT_LABEL: Record<string, string> = Object.fromEntries(
  CATEGORIES_ATTRIBUTION.map((c) => [c.code, c.label]),
);

/** Accented French label of an attribution category code, falling back to the raw
 * code when the category is unknown. */
export function categorieLabel(code: string | null | undefined): string {
  if (!code) return "";
  return CAT_LABEL[code] ?? code;
}

/** True when a category carries a compact abbreviation (Fonction, Fonction
 * particulière). Titles and special functions are always displayed in full. */
export function categorieUtiliseAbreviation(code: string): boolean {
  return code === "fonction" || code === "fonction_particuliere";
}

/** Colored badge identifying one of the four attribution categories, so a reader
 * tells a title from a function at a glance. */
export function CategorieBadge({ code }: { code: string | null | undefined }): JSX.Element {
  const c = code ?? "";
  return <span className={`badge ${CAT_CLASS[c] ?? "badge-mut"}`}>{categorieLabel(c) || "Non classé"}</span>;
}
