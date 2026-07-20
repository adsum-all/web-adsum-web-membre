import dagre from "dagre";

import type { OrgLink, OrgNode } from "../../api.js";

export interface XY {
  x: number;
  y: number;
}

/** Fixed footprint of a node card, shared by dagre (spacing) and the CSS width. */
export const NODE_W = 236;
export const NODE_H = 96;
/** Default width of the central separator line. */
export const SEP_W = 4;

export function isSeparator(n: OrgNode): boolean {
  return n.type_noeud === "separateur" || n.cle === "separateur_central";
}

/** A particular branch lives in the right column: the shepherds college, the
 * patriarchs group and every tribe, plus all their hierarchical descendants. */
function isParticularRoot(n: OrgNode): boolean {
  const c = n.cle ?? "";
  return c === "college_bergers" || c === "groupe_patriarches" || c.startsWith("tribu:");
}

function childrenMap(links: OrgLink[]): Map<string, string[]> {
  const children = new Map<string, string[]>();
  for (const l of links) {
    // Tribal responsibility is a parent/child relation for the right column, so the
    // Patriarchs subtree (tribes and their members) moves and folds as one branch.
    if (l.type_lien !== "hierarchique" && l.type_lien !== "responsabilite_tribu") continue;
    const list = children.get(l.source_id) ?? [];
    list.push(l.cible_id);
    children.set(l.source_id, list);
  }
  return children;
}

function descendantsOf(id: string, children: Map<string, string[]>): Set<string> {
  const out = new Set<string>();
  const stack = [...(children.get(id) ?? [])];
  while (stack.length > 0) {
    const cur = stack.pop() as string;
    if (out.has(cur)) continue;
    out.add(cur);
    for (const c of children.get(cur) ?? []) stack.push(c);
  }
  return out;
}

interface Column {
  pos: Map<string, XY>;
  width: number;
  height: number;
}

/** Dagre top to bottom layout for one column, normalised to the origin. Only the
 * hierarchical links are used for ranking; the secondary links are drawn later as
 * overlay edges and must not distort the ranks. */
function dagreColumn(nodes: OrgNode[], links: OrgLink[]): Column {
  if (nodes.length === 0) return { pos: new Map(), width: 0, height: 0 };
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "TB", nodesep: 40, ranksep: 64, marginx: 0, marginy: 0 });
  g.setDefaultEdgeLabel(() => ({}));
  const ids = new Set(nodes.map((n) => n.id));
  for (const n of nodes) g.setNode(n.id, { width: NODE_W, height: NODE_H });
  // Rank within a column on the reporting links AND the tribal-responsibility links,
  // so the twelve tribes stack under the Patriarchs group instead of sitting in one
  // flat row. Cross-column links (coordination, supervision) never rank a column.
  for (const l of links) {
    const ranking = l.type_lien === "hierarchique" || l.type_lien === "responsabilite_tribu";
    if (ranking && ids.has(l.source_id) && ids.has(l.cible_id)) g.setEdge(l.source_id, l.cible_id);
  }
  dagre.layout(g);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const raw = new Map<string, XY>();
  for (const n of nodes) {
    const dn = g.node(n.id) as { x?: number; y?: number } | undefined;
    const x = (dn?.x ?? NODE_W / 2) - NODE_W / 2;
    const y = (dn?.y ?? NODE_H / 2) - NODE_H / 2;
    raw.set(n.id, { x, y });
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + NODE_W);
    maxY = Math.max(maxY, y + NODE_H);
  }
  const pos = new Map<string, XY>();
  for (const [id, p] of raw) pos.set(id, { x: p.x - minX, y: p.y - minY });
  return { pos, width: Math.max(0, maxX - minX), height: Math.max(0, maxY - minY) };
}

export interface AutoLayout {
  positions: Map<string, XY>;
  /** Full height of the central separator line, so the front sizes it correctly. */
  separatorHeight: number;
  separatorX: number;
}

/** Two columns separated by a central divider, like the reference diagram: the
 * main functional chain on the LEFT (top to bottom), the particular branches
 * (shepherds college, patriarchs group, tribes) on the RIGHT. The separator node
 * spans the full height at the boundary; the secondary links cross it.
 *
 * Only the currently VISIBLE nodes are laid out (a folded branch reserves no
 * space), so the general view and every drill stay compact and readable whatever
 * the full tree's size. Passing an empty ``hidden`` lays out everything. */
export function computeLayout(nodes: OrgNode[], links: OrgLink[], hidden: ReadonlySet<string> = new Set()): AutoLayout {
  const visible = hidden.size > 0 ? nodes.filter((n) => !hidden.has(n.id)) : nodes;
  const children = childrenMap(links);
  const rightSet = new Set<string>();
  for (const n of visible) {
    if (!isParticularRoot(n)) continue;
    rightSet.add(n.id);
    for (const d of descendantsOf(n.id, children)) rightSet.add(d);
  }
  const separators = visible.filter(isSeparator);
  const sepSet = new Set(separators.map((n) => n.id));
  const leftNodes = visible.filter((n) => !sepSet.has(n.id) && !rightSet.has(n.id));
  const rightNodes = visible.filter((n) => !sepSet.has(n.id) && rightSet.has(n.id));

  const left = dagreColumn(leftNodes, links);
  const right = dagreColumn(rightNodes, links);
  const topY = 48;
  const gap = 96;
  const positions = new Map<string, XY>();
  for (const [id, p] of left.pos) positions.set(id, { x: p.x, y: p.y + topY });
  const separatorX = left.width + gap;
  const rightX = separatorX + SEP_W + gap;
  for (const [id, p] of right.pos) positions.set(id, { x: p.x + rightX, y: p.y + topY });

  // Vertically align the two particular branches with their real levels on the left,
  // so the College of shepherds sits at the Mission-shepherd level (top) and the
  // Patriarchs group sits at the Intendances/Coordinations level (much lower), never
  // at the same height as the College. The patriarchs subtree (tribes, members) is
  // shifted as a whole to keep its internal ranking.
  const byCle = new Map<string, string>();
  for (const n of nodes) if (n.cle) byCle.set(n.cle, n.id);
  const leftY = (cle: string): number | undefined => {
    const id = byCle.get(cle);
    const p = id ? left.pos.get(id) : undefined;
    return p ? p.y + topY : undefined;
  };
  const collegeId = byCle.get("college_bergers");
  const yBerger = leftY("role:berger_missions");
  if (collegeId && yBerger !== undefined) positions.set(collegeId, { x: rightX, y: yBerger });
  const patrId = byCle.get("groupe_patriarches");
  const yBlocs = leftY("bloc_intendances") ?? leftY("role:intendant_general");
  if (patrId && yBlocs !== undefined) {
    const cur = positions.get(patrId);
    if (cur) {
      const delta = yBlocs - cur.y;
      const subtree = new Set<string>([patrId, ...descendantsOf(patrId, children)]);
      for (const id of subtree) {
        const p = positions.get(id);
        if (p) positions.set(id, { x: p.x, y: p.y + delta });
      }
    }
  }

  const separatorHeight = Math.min(Math.max(left.height, right.height, 300) + 48, 640);
  separators.forEach((s, i) => positions.set(s.id, { x: separatorX + i * 28, y: topY - 24 }));
  return { positions, separatorHeight, separatorX };
}

/** Final on-canvas position of each node: an explicit stored position (an admin
 * dragged the card, the choice is persisted server side) always wins over the
 * automatic two-column coordinate, so a manual arrangement survives a reload. */
export function resolvePositions(nodes: OrgNode[], links: OrgLink[], hidden: ReadonlySet<string> = new Set()): { positions: Map<string, XY>; separatorHeight: number } {
  const auto = computeLayout(nodes, links, hidden);
  const positions = new Map<string, XY>();
  for (const n of nodes) {
    const stored = n.pos_x !== null && n.pos_x !== undefined && n.pos_y !== null && n.pos_y !== undefined;
    positions.set(n.id, stored ? { x: n.pos_x as number, y: n.pos_y as number } : auto.positions.get(n.id) ?? { x: 0, y: 0 });
  }
  return { positions, separatorHeight: auto.separatorHeight };
}
