import { useContext } from "react";
import { type Node, type NodeProps } from "@xyflow/react";

import type { OrgNode } from "../../api.js";
import { OrgCanvasContext } from "./orgContext.js";

export interface OrgSeparatorData extends Record<string, unknown> {
  node: OrgNode;
  hauteur: number;
}

export type OrgSeparatorFlowNode = Node<OrgSeparatorData, "separateur">;

/** A free vertical divider between the main functional chain and the particular
 * branches, like the reference diagram. It is draggable and, in edit mode, offers
 * a rename and a delete action. Its colour and height are configurable. */
export function OrgSeparator({ data, selected }: NodeProps<OrgSeparatorFlowNode>): JSX.Element {
  const ctx = useContext(OrgCanvasContext);
  const { node, hauteur } = data;
  const editable = ctx?.mode === "edition";
  const h = node.hauteur ?? hauteur;

  const teinte = node.couleur ?? "var(--adsum-acc)";
  return (
    <div className={`org-sep ${selected ? "is-selected" : ""}`} style={{ height: h }}>
      <div className="org-sep-line" style={{ background: teinte }} aria-hidden="true" />
      <span className="org-sep-label" style={{ color: teinte }}>{node.nom || "Séparation"}</span>
      {editable ? (
        <div className="org-sep-actions nodrag">
          <button type="button" className="org-mini-btn" onClick={() => ctx?.onEdit(node)} title="Renommer ce séparateur">
            Éditer
          </button>
          <button type="button" className="org-mini-btn org-mini-danger" onClick={() => ctx?.onDelete(node)} title="Supprimer ce séparateur">
            Supprimer
          </button>
        </div>
      ) : null}
    </div>
  );
}
