import type { OrgLinkType, OrgNodeType, OrgStatut } from "../../api.js";

/** Accented French wording and a stable visual signature for every node status.
 * The dot color is doubled by an explicit label so status never depends on color
 * alone (WCAG, colour blindness). */
export interface StatutMeta {
  label: string;
  /** CSS modifier suffix, e.g. "actif" -> class org-dot-actif. */
  cle: OrgStatut;
}

export const STATUT_META: Record<OrgStatut, StatutMeta> = {
  actif: { label: "Actif", cle: "actif" },
  vacant: { label: "Poste vacant", cle: "vacant" },
  attente: { label: "En attente", cle: "attente" },
  archive: { label: "Archivé", cle: "archive" },
};

export const TYPE_NOEUD_LABEL: Record<OrgNodeType, string> = {
  personne: "Personne",
  structure: "Structure",
  groupe: "Groupe",
  separateur: "Séparateur",
  note: "Note",
  zone: "Zone",
};

/** Accessible accent palette offered by the colour tool. */
export const PALETTE: { hex: string; nom: string }[] = [
  { hex: "#2a4fad", nom: "Bleu marine" },
  { hex: "#0f6b6b", nom: "Sarcelle" },
  { hex: "#653597", nom: "Violet" },
  { hex: "#1f8a5b", nom: "Vert" },
  { hex: "#b6791b", nom: "Ambre" },
  { hex: "#c0392b", nom: "Rouge" },
  { hex: "#3d4047", nom: "Ardoise" },
  { hex: "#5b82d8", nom: "Bleu clair" },
];

/** Full description of one link kind: label, the accessible signature used both
 * in the legend and on the edge (color, dash pattern, routing), so two kinds stay
 * distinguishable without relying on color only. */
export interface LinkMeta {
  type: OrgLinkType;
  label: string;
  description: string;
  /** Stroke color, taken from the design token palette. */
  color: string;
  /** SVG dash array; empty string means a solid stroke. */
  dash: string;
  /** React Flow built-in edge routing that best carries this kind. */
  routing: "smoothstep" | "step" | "straight";
  /** Preferred geometric orientation, used to pick node handles. */
  orientation: "vertical" | "horizontal";
}

export const LINK_META: Record<OrgLinkType, LinkMeta> = {
  hierarchique: {
    type: "hierarchique",
    label: "Hiérarchique",
    description: "Rattachement direct : trait plein vertical, flèche vers le bas.",
    color: "#2a4fad",
    dash: "",
    routing: "smoothstep",
    orientation: "vertical",
  },
  coordination: {
    type: "coordination",
    label: "Coordination",
    description: "Coordination entre pairs : trait plein horizontal avec flèche.",
    color: "#0f6b6b",
    dash: "",
    routing: "smoothstep",
    orientation: "horizontal",
  },
  supervision: {
    type: "supervision",
    label: "Supervision",
    description: "Supervision : trait en angle qui descend jusqu'à l'entité suivie.",
    color: "#653597",
    dash: "",
    routing: "step",
    orientation: "vertical",
  },
  suivi_transversal: {
    type: "suivi_transversal",
    label: "Suivi transversal",
    description: "Suivi transversal : trait en pointillés larges.",
    color: "#b6791b",
    dash: "7 5",
    routing: "straight",
    orientation: "horizontal",
  },
  responsabilite_tribu: {
    type: "responsabilite_tribu",
    label: "Responsabilité de tribu",
    description: "Responsabilité de tribu : trait plein qui relie le groupe à ses tribus.",
    color: "#5b82d8",
    dash: "",
    routing: "smoothstep",
    orientation: "vertical",
  },
  assistance: {
    type: "assistance",
    label: "Assistance",
    description: "Assistance : trait en pointillés fins.",
    color: "#676b73",
    dash: "2 4",
    routing: "straight",
    orientation: "horizontal",
  },
};

/** Ordered list for the legend, hierarchical first. */
export const LINK_ORDER: OrgLinkType[] = [
  "hierarchique",
  "coordination",
  "supervision",
  "responsabilite_tribu",
  "suivi_transversal",
  "assistance",
];

/** Up to two uppercase initials from a display name, for the node avatar. */
export function initiales(nom: string): string {
  const parts = nom
    .trim()
    .split(/\s+/)
    .filter((p) => p.length > 0);
  if (parts.length === 0) return "?";
  const first = parts[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1] ?? "") : "";
  const a = first.charAt(0);
  const b = last.charAt(0);
  return (a + b).toUpperCase() || "?";
}
