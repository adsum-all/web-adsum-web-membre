import { type CSSProperties, useContext } from "react";
import { Handle, type NodeProps, Position, type Node } from "@xyflow/react";

import type { OrgNode } from "../../api.js";
import { CategorieBadge } from "../CategorieBadge.js";
import { OrgCanvasContext } from "./orgContext.js";
import { STATUT_META, TYPE_NOEUD_LABEL, initiales } from "./orgLabels.js";

export interface OrgNodeData extends Record<string, unknown> {
  node: OrgNode;
  hasChildren: boolean;
  /** Number of descendants hidden while this node is collapsed. */
  hiddenCount: number;
}

export type OrgFlowNode = Node<OrgNodeData, "org">;

/** Premium card used as a React Flow custom node: avatar with initials, name,
 * perimeter subtitle, category badge, member count and an accessible status
 * indicator. In edit mode it exposes an inline edit and delete menu; in both
 * modes a parent with children can collapse or expand its branch. Interactive
 * controls carry the React Flow "nodrag" class so a click never starts a drag. */
export function OrgNodeCard({ data, selected }: NodeProps<OrgFlowNode>): JSX.Element {
  const ctx = useContext(OrgCanvasContext);
  const { node, hasChildren, hiddenCount } = data;
  const statut = STATUT_META[node.statut];
  const collapsed = ctx?.collapsed.has(node.id) ?? false;
  const editable = ctx?.mode === "edition";

  // FUNCTION-DOMINANT display: the node label (its function / unit) is primary, the
  // occupant's name is secondary. A function post with no holder shows "Poste a pourvoir"
  // and never disappears. A structural unit shows its scope/type instead of an occupant.
  const estPoste = !!node.fonction_cle || node.type_noeud === "personne";
  const vacant = estPoste && (node.statut === "vacant" || !node.membre_nom);
  // FUNCTION-DOMINANT: for a person/post the FUNCTION (sous_titre) is the bold primary
  // line and the occupant's NAME is the non-bold secondary line. A structural unit that
  // is not a post keeps its own label primary and shows its scope/count as secondary.
  const principal = estPoste
    ? (node.sous_titre || node.nom || TYPE_NOEUD_LABEL[node.type_noeud])
    : (node.nom || TYPE_NOEUD_LABEL[node.type_noeud]);
  const secondaire = estPoste
    ? (vacant ? "Poste à pourvoir" : (node.membre_nom ?? node.nom ?? null))
    : (node.sous_titre && node.sous_titre !== principal ? node.sous_titre : null);
  const avatarBase = node.membre_nom ?? node.nom;
  const montrerPhoto = node.afficher_photo && !!node.photo_url;
  const style = node.couleur ? ({ "--org-accent": node.couleur } as CSSProperties) : undefined;

  return (
    <div
      className={`org-node org-node-${node.statut} ${selected ? "is-selected" : ""} ${
        node.type_noeud === "personne" ? "" : "org-node-unit"
      } ${node.couleur ? "org-node-colore" : ""}`}
      data-kind={node.type_noeud}
      style={style}
    >
      <Handle id="t" type="target" position={Position.Top} className="org-h" />
      <Handle id="b" type="source" position={Position.Bottom} className="org-h" />
      <Handle id="l-in" type="target" position={Position.Left} className="org-h" style={{ top: "38%" }} />
      <Handle id="l-out" type="source" position={Position.Left} className="org-h" style={{ top: "62%" }} />
      <Handle id="r-in" type="target" position={Position.Right} className="org-h" style={{ top: "38%" }} />
      <Handle id="r-out" type="source" position={Position.Right} className="org-h" style={{ top: "62%" }} />

      <div className="org-node-top">
        {montrerPhoto ? (
          <img className="org-avatar org-avatar-photo" src={node.photo_url ?? ""} alt="" data-kind={node.type_noeud} />
        ) : (
          <span className="org-avatar" data-kind={node.type_noeud} aria-hidden="true">
            {initiales(avatarBase)}
          </span>
        )}
        <span className="org-node-body">
          <span className="org-node-name" title={principal}>
            {principal}
          </span>
          {secondaire ? (
            <span className={`org-node-sub ${vacant ? "org-node-sub-vacant" : ""}`} title={secondaire}>
              {secondaire}
            </span>
          ) : (
            <span className="org-node-sub org-node-sub-mut">{TYPE_NOEUD_LABEL[node.type_noeud]}</span>
          )}
        </span>
      </div>

      <div className="org-node-meta">
        {node.categorie ? <CategorieBadge code={node.categorie} /> : null}
        {node.effectif !== null && node.effectif !== undefined ? (
          <span className="org-count">{node.effectif} membre{node.effectif > 1 ? "s" : ""}</span>
        ) : null}
        <span className="org-status">
          <span className={`org-dot org-dot-${statut.cle}`} aria-hidden="true" />
          {statut.label}
        </span>
      </div>

      {editable ? (
        <div className="org-node-actions nodrag">
          <button
            type="button"
            className="org-mini-btn"
            onClick={(e) => {
              e.stopPropagation();
              ctx?.onEdit(node);
            }}
            title="Éditer ce nœud"
          >
            Éditer
          </button>
          <button
            type="button"
            className="org-mini-btn org-mini-danger"
            onClick={(e) => {
              e.stopPropagation();
              ctx?.onDelete(node);
            }}
            title="Supprimer ce nœud"
          >
            Supprimer
          </button>
        </div>
      ) : null}

      {hasChildren ? (
        <button
          type="button"
          className={`org-collapse nodrag ${collapsed ? "is-collapsed" : ""}`}
          onClick={(e) => {
            // Folding must not also open the details drawer: stop the click from
            // bubbling to the node's select handler.
            e.stopPropagation();
            ctx?.onToggleCollapse(node.id);
          }}
          aria-expanded={!collapsed}
          aria-label={collapsed ? `Déplier ${hiddenCount} entité${hiddenCount > 1 ? "s" : ""} rattachée${hiddenCount > 1 ? "s" : ""}` : "Replier la branche"}
          title={collapsed ? `Déplier (${hiddenCount})` : "Replier la branche"}
        >
          {collapsed ? `+ ${hiddenCount}` : "−"}
        </button>
      ) : null}
    </div>
  );
}
