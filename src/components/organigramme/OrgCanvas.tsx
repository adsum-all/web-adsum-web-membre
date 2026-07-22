import { useCallback, useEffect, useMemo, useState } from "react";
import "@xyflow/react/dist/style.css";
import "./organigramme.css";
import "./organigramme-parts.css";
import {
  Background,
  BackgroundVariant,
  type Connection,
  Controls,
  type Edge,
  MiniMap,
  type Node,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  type NodeTypes,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from "@xyflow/react";

import type { OrgContenu, OrgNode } from "../../api.js";
import { computeLayout, NODE_H, NODE_W, resolvePositions } from "./layout.js";
import { buildFlow, buildHierarchy, hiddenIds } from "./mappers.js";
import { OrgCanvasContext, type OrgMode } from "./orgContext.js";
import { OrgLegende } from "./OrgLegende.js";
import { OrgNodeCard } from "./OrgNodeCard.js";
import { OrgSeparator } from "./OrgSeparator.js";

const nodeTypes: NodeTypes = { org: OrgNodeCard, separateur: OrgSeparator };

export interface OrgCanvasProps {
  contenu: OrgContenu;
  mode: OrgMode;
  onNodeMoved?: (id: string, x: number, y: number) => void;
  onEditNode?: (node: OrgNode) => void;
  onDeleteNode?: (node: OrgNode) => void;
  onConnectLink?: (source: string, target: string) => void;
  /** Open the link editor (type, label, endpoints, delete) on a click. */
  onEditLink?: (link: OrgContenu["liens"][number]) => void;
  /** Re-attach a link's endpoint by dragging it onto another node. */
  onReconnectLink?: (linkId: string, source: string, target: string) => void;
  onAddSeparator?: () => void;
  onAutoLayout?: (positions: { id: string; x: number; y: number }[]) => void;
  /** Opening the details panel: a click on a card reports the node here. */
  onSelectNode?: (node: OrgNode) => void;
  /** Id of the node whose details are open, highlighted on the canvas. */
  selectedNodeId?: string | null;
  /** Incrementing counter that asks the canvas to centre on selectedNodeId. */
  centerToken?: number;
}

const noop = (): void => undefined;
const normalize = (s: string): string => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Close the enclosing <details> "Affichage" menu after a command is chosen. */
const closeMenu = (e: { currentTarget: HTMLElement }): void => {
  (e.currentTarget.closest("details") as HTMLDetailsElement | null)?.removeAttribute("open");
};

/** Stable fingerprint of the content that actually affects the drawing. A 20s
 * background poll returns a fresh object with identical data: keying the layout on
 * this string, not on object identity, stops such a poll from re-syncing the canvas
 * and wiping a search highlight or an in-progress drag. */
function signatureOf(c: OrgContenu): string {
  const n = c.noeuds
    .map((x) => `${x.id}:${x.pos_x}:${x.pos_y}:${x.statut}:${x.nom}:${x.sous_titre ?? ""}:${x.effectif ?? ""}`)
    .join("|");
  const l = c.liens.map((x) => `${x.id}:${x.type_lien}:${x.source_id}:${x.cible_id}:${x.libelle ?? ""}`).join("|");
  return `${c.version.id}#${n}#${l}`;
}

/** Parents whose sub-branches are folded by default, so the first view is a
 * readable synthetic one: the deep commission branches and the tribe members are
 * hidden until the reader expands them. */
/** The general view keeps only the big blocks: the functional chain down to the
 * general steward, then the folded "Intendances", "Coordinations" and "Patriarchs"
 * blocks (each with its count), plus the College. Everything deeper is folded so the
 * reader expands one level at a time, horizontally then vertically. */
const BLOCS_REPLIES = new Set([
  "bloc_intendances",
  "bloc_coordinations",
  "groupe_patriarches",
]);
// Every parent below the blocks is folded by default, so the first view shows only
// the apex and the big blocks, and the reader drills one level at a time:
// bloc -> unit -> responsibles group -> commission -> members.
const PREFIXES_REPLIES = ["intendance:", "coordination:", "respgrp:", "commission:", "sousresp:", "tribu:"];

function defautReplie(nodes: OrgContenu["noeuds"]): Set<string> {
  const out = new Set<string>();
  for (const n of nodes) {
    const c = n.cle ?? "";
    if (BLOCS_REPLIES.has(c) || PREFIXES_REPLIES.some((p) => c.startsWith(p))) out.add(n.id);
  }
  return out;
}

function OrgCanvasInner({
  contenu,
  mode,
  onNodeMoved,
  onEditNode,
  onDeleteNode,
  onConnectLink,
  onEditLink,
  onReconnectLink,
  onAddSeparator,
  onAutoLayout,
  onSelectNode,
  selectedNodeId,
  centerToken,
}: OrgCanvasProps): JSX.Element {
  const rf = useReactFlow();
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => defautReplie(contenu.noeuds));
  const [query, setQuery] = useState("");
  const [searchMsg, setSearchMsg] = useState<string | null>(null);
  // Undo stack for manual moves: the node's position captured at drag start, so a
  // slip during layout is reverted in one click and re-persisted. Session-local.
  const [moveHistory, setMoveHistory] = useState<{ id: string; x: number; y: number }[]>([]);

  const contentSig = useMemo(() => signatureOf(contenu), [contenu]);
  // The collapse signature (which parents are folded) drives a compact re-layout:
  // only the visible nodes are placed, so a folded branch reserves no space and the
  // view never zooms out to a thumbnail. Sorted so the memo key is stable per state.
  const collapsedSig = useMemo(() => [...collapsed].sort().join(","), [collapsed]);
  const hidden = useMemo(
    () => hiddenIds(collapsed, buildHierarchy(contenu.liens)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [contentSig, collapsedSig],
  );
  // Keyed on the content AND collapse signatures, not on object identity, so an
  // identical poll is a no-op but folding recomputes a compact layout.
  const layout = useMemo(
    () => resolvePositions(contenu.noeuds, contenu.liens, hidden),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [contentSig, hidden],
  );
  const positions = layout.positions;
  const editable = mode === "edition";
  const desired = useMemo(
    // eslint-disable-next-line react-hooks/exhaustive-deps
    () => buildFlow(contenu.noeuds, contenu.liens, positions, collapsed, layout.separatorHeight, editable),
    [contentSig, positions, collapsed, editable],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // Re-sync the canvas only when structure, positions or collapse state change:
  // a drag mutates React Flow local state without touching these inputs, so a
  // manual arrangement is never clobbered before it is persisted and reloaded.
  useEffect(() => {
    setNodes(desired.flowNodes);
    setEdges(desired.flowEdges);
  }, [desired, setNodes, setEdges]);

  // Frame the whole graph ONLY when the version first loads. Expanding or folding a
  // branch must NOT recentre the canvas: the reader keeps looking where they were,
  // and the newly revealed cards appear in place. Re-framing is available on demand
  // through the "Adapter à l'écran" button.
  useEffect(() => {
    const handle = window.setTimeout(() => {
      void rf.fitView({ padding: 0.18, duration: 400, minZoom: 0.35, maxZoom: 1 });
    }, 80);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contenu.version.id, rf]);

  const onToggleCollapse = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Reset to the synthetic default whenever the version changes (not on a poll).
  const versionId = contenu.version.id;
  useEffect(() => {
    setCollapsed(defautReplie(contenu.noeuds));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versionId]);

  // The view buttons are EXPLICIT reframe commands, so after changing the collapse
  // state they refit the view to the newly visible nodes. This differs from a
  // per-node +/- toggle, which deliberately never recentres (the reader stays put).
  // The delay lets React Flow re-render the new node set before framing it.
  const reframe = useCallback(() => {
    window.setTimeout(() => void rf.fitView({ padding: 0.18, duration: 400, minZoom: 0.05, maxZoom: 1 }), 120);
  }, [rf]);

  // "Afficher tout": expand everything. "Réduire tout": fold every parent.
  // "Vue générale": back to the big-blocks synthetic view.
  const toutAfficher = useCallback(() => {
    setCollapsed(new Set<string>());
    reframe();
  }, [reframe]);
  const toutReduire = useCallback(() => {
    const parents = new Set<string>();
    for (const l of contenu.liens) if (l.type_lien === "hierarchique") parents.add(l.source_id);
    setCollapsed(parents);
    reframe();
  }, [contenu.liens, reframe]);
  const vueGenerale = useCallback(() => {
    setCollapsed(defautReplie(contenu.noeuds));
    reframe();
  }, [contenu.noeuds, reframe]);

  const ctxValue = useMemo(
    () => ({
      mode,
      collapsed,
      onToggleCollapse,
      onEdit: onEditNode ?? noop,
      onDelete: onDeleteNode ?? noop,
    }),
    [mode, collapsed, onToggleCollapse, onEditNode, onDeleteNode],
  );

  // Parent lookup (hierarchical + tribal), to reveal a node's ancestors before
  // centring on it. Stable per content.
  const parentOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of contenu.liens) {
      if (l.type_lien === "hierarchique" || l.type_lien === "responsabilite_tribu") m.set(l.cible_id, l.source_id);
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentSig]);

  // Reveal a node (expand its whole ancestor chain) and centre on it, using a FRESH
  // layout for the revealed state, never the memoised positions: with the compact
  // layout a folded node has no real coordinate, so reading the stale map would jump
  // the viewport to the origin (0,0) instead of the target. This backs both the
  // search box and the details panel's "Centrer" button.
  const revealAndCenter = useCallback(
    (id: string, zoom: number) => {
      const next = new Set(collapsed);
      let cur = parentOf.get(id);
      while (cur) {
        next.delete(cur);
        cur = parentOf.get(cur);
      }
      setCollapsed(next);
      const fresh = resolvePositions(contenu.noeuds, contenu.liens, hiddenIds(next, buildHierarchy(contenu.liens)));
      const pos = fresh.positions.get(id);
      window.setTimeout(() => {
        if (pos) void rf.setCenter(pos.x + NODE_W / 2, pos.y + NODE_H / 2, { zoom, duration: 500 });
        setNodes((nds) => nds.map((n) => ({ ...n, selected: n.id === id })));
      }, 130);
    },
    [collapsed, parentOf, contenu.noeuds, contenu.liens, rf, setNodes],
  );

  const runSearch = useCallback(
    (raw: string) => {
      const q = normalize(raw.trim());
      if (!q) {
        setSearchMsg(null);
        return;
      }
      const found = contenu.noeuds.find((n) =>
        [n.nom, n.sous_titre ?? "", n.fonction_cle ?? ""].some((f) => normalize(f).includes(q)),
      );
      if (!found) {
        setSearchMsg("Aucun nœud ne correspond.");
        return;
      }
      setSearchMsg(null);
      // Reveal the path to the match and centre on its real, freshly computed position.
      revealAndCenter(found.id, 1.15);
    },
    [contenu.noeuds, revealAndCenter],
  );

  const onConnect = useCallback(
    (c: Connection) => {
      if (mode === "edition" && onConnectLink && c.source && c.target && c.source !== c.target) {
        onConnectLink(c.source, c.target);
      }
    },
    [mode, onConnectLink],
  );

  // Revert the last manual move: restore the pre-drag position on the canvas and
  // persist it, so the undo survives a reload just like any deliberate move.
  const annulerDeplacement = useCallback(() => {
    setMoveHistory((prev) => {
      const last = prev[prev.length - 1];
      if (!last) return prev;
      setNodes((nds) => nds.map((n) => (n.id === last.id ? { ...n, position: { x: last.x, y: last.y } } : n)));
      onNodeMoved?.(last.id, last.x, last.y);
      return prev.slice(0, -1);
    });
  }, [onNodeMoved, setNodes]);

  // Centre on the selected node when the parent asks (click or the panel's button):
  // reveal its ancestor path and centre on its fresh coordinate, so folding the
  // node's branch before pressing "Centrer" no longer jumps to the empty origin.
  // This is an EXPLICIT recentre, never triggered by a plain fold/expand.
  useEffect(() => {
    if (!centerToken || !selectedNodeId) return;
    revealAndCenter(selectedNodeId, 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centerToken]);

  return (
    <OrgCanvasContext.Provider value={ctxValue}>
      <div className="org-canvas-inner">
        {/* A real toolbar ABOVE the canvas, so tools are always visible and never
            covered by the cards or hidden behind the flow. */}
        <div className="org-bar">
          <form
            className="org-search"
            onSubmit={(e) => {
              e.preventDefault();
              runSearch(query);
            }}
            role="search"
          >
            <input
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                if (!e.target.value) setSearchMsg(null);
              }}
              placeholder="Rechercher un nom, une fonction..."
              aria-label="Rechercher un nœud dans l'organigramme"
            />
            <button type="submit" className="btn btn-primary btn-inline">Centrer</button>
          </form>
          {/* The view controls are grouped in a compact "Affichage" menu so the
              toolbar stays a single thin row and never covers the chart, especially
              on a phone. The menu closes as soon as a command is chosen. */}
          <details className="org-menu">
            <summary className="btn btn-ghost btn-inline org-menu-summary" title="Options d'affichage de l'organigramme">
              Affichage
              <span className="org-menu-chev" aria-hidden="true" />
            </summary>
            <div className="org-menu-list" role="menu">
              <button type="button" role="menuitem" className="org-menu-item" onClick={(e) => { vueGenerale(); closeMenu(e); }}>
                Vue générale
              </button>
              <button type="button" role="menuitem" className="org-menu-item" onClick={(e) => { toutAfficher(); closeMenu(e); }}>
                Afficher tout
              </button>
              <button type="button" role="menuitem" className="org-menu-item" onClick={(e) => { toutReduire(); closeMenu(e); }}>
                Réduire tout
              </button>
              <button type="button" role="menuitem" className="org-menu-item" onClick={(e) => { void rf.fitView({ padding: 0.18, duration: 400, maxZoom: 1 }); closeMenu(e); }}>
                Adapter à l'écran
              </button>
            </div>
          </details>
          {editable ? (
            <>
              <span className="org-bar-sep" aria-hidden="true" />
              <button type="button" className="btn btn-ghost btn-inline" onClick={() => onAddSeparator?.()} title="Ajouter un trait de séparation">
                + Séparateur
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-inline"
                onClick={annulerDeplacement}
                disabled={moveHistory.length === 0}
                title="Annuler le dernier déplacement de nœud"
              >
                Annuler le déplacement
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-inline"
                onClick={() => {
                  const auto = computeLayout(contenu.noeuds, contenu.liens).positions;
                  onAutoLayout?.(contenu.noeuds.map((n) => {
                    const p = auto.get(n.id) ?? { x: 0, y: 0 };
                    return { id: n.id, x: Math.round(p.x), y: Math.round(p.y) };
                  }));
                }}
                title="Recalculer la disposition en deux colonnes et l'enregistrer"
              >
                Disposition automatique
              </button>
            </>
          ) : null}
          {searchMsg ? <span className="org-search-msg">{searchMsg}</span> : null}
        </div>
        <div className="org-flow">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeDragStart={(_, node) =>
              setMoveHistory((prev) => [
                ...prev.slice(-19),
                { id: node.id, x: Math.round(node.position.x), y: Math.round(node.position.y) },
              ])
            }
            onNodeDragStop={(_, node) => onNodeMoved?.(node.id, Math.round(node.position.x), Math.round(node.position.y))}
            onNodeClick={(_, node) => {
              const found = contenu.noeuds.find((x) => x.id === node.id);
              if (found && found.type_noeud !== "separateur") onSelectNode?.(found);
            }}
            onEdgeClick={(_, edge) => {
              if (!editable) return;
              // A click opens the link editor (type, label, endpoints, delete) instead
              // of deleting outright, so a mis-placed but correct link can be corrected.
              const link = contenu.liens.find((l) => l.id === edge.id);
              if (link) onEditLink?.(link);
            }}
            onReconnect={
              editable
                ? (oldEdge, conn) => {
                    // Ignore a self-drop (endpoint dropped on the node already at the other
                    // end), consistent with onConnect, so it is silent rather than a 400.
                    if (conn.source && conn.target && conn.source !== conn.target) {
                      onReconnectLink?.(oldEdge.id, conn.source, conn.target);
                    }
                  }
                : undefined
            }
            nodesDraggable={editable}
            nodesConnectable={editable}
            elementsSelectable
            deleteKeyCode={null}
            minZoom={0.02}
            maxZoom={2}
            fitView
            fitViewOptions={{ padding: 0.18, maxZoom: 1 }}
            proOptions={{ hideAttribution: true }}
            aria-label="Organigramme hiérarchique"
            // Virtualise the DOM: with the full tree expanded (~604 cards, each with
            // several handles) only the nodes inside the viewport are mounted, so a
            // large expansion no longer floods the DOM with thousands of elements.
            onlyRenderVisibleElements
          >
            <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="var(--adsum-dot)" />
            <Controls position="bottom-left" showInteractive={editable} />
            <MiniMap
              position="bottom-right"
              pannable
              zoomable
              ariaLabel="Vue d'ensemble de l'organigramme"
              nodeColor={() => "#c3cde6"}
              maskColor="rgba(16, 18, 24, 0.08)"
            />
            <Panel position="top-right">
              <OrgLegende />
            </Panel>
          </ReactFlow>
        </div>
      </div>
    </OrgCanvasContext.Provider>
  );
}

/** React Flow canvas shared by both modes. Wrapped in its own provider so the
 * search box and the fit-to-view controls can call the flow instance, and so two
 * canvases (published view, draft editor) never share one store. */
export function OrgCanvas(props: OrgCanvasProps): JSX.Element {
  return (
    <ReactFlowProvider>
      <OrgCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
