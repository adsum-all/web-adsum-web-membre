import { createContext } from "react";

import type { OrgNode } from "../../api.js";

export type OrgMode = "consultation" | "edition";

/** Shared behaviour a custom node reaches through context, so the node card stays
 * a pure presentational component and its React Flow data never carries callbacks
 * (callbacks in data force a rebuild of every node on each render). */
export interface OrgCanvasCtx {
  mode: OrgMode;
  /** Ids currently collapsed: their hierarchical subtree is hidden. */
  collapsed: ReadonlySet<string>;
  onToggleCollapse: (id: string) => void;
  onEdit: (node: OrgNode) => void;
  onDelete: (node: OrgNode) => void;
}

export const OrgCanvasContext = createContext<OrgCanvasCtx | null>(null);
