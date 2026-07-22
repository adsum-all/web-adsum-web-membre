import { useEffect, useMemo, useState } from "react";

import {
  type OrgContenu,
  type OrgContenuPublie,
  type OrgNode,
  type OrgStatistiques,
  getOrganigrammePublie,
  getOrganigrammeStatistiques,
} from "../../api.js";
import { useLang } from "../../i18n.js";
import { T } from "../../proto.js";
import { OrgCanvas } from "./OrgCanvas.js";
import { OrgDetailPanel } from "./OrgDetailPanel.js";
import "./organigramme-badges.css";

/**
 * Member read-only view of the PUBLISHED organisation chart. It renders the exact same
 * React-Flow tree as the back-office (same OrgCanvas engine, same nodes, links, colours
 * and legend), in consultation mode: zoom, pan, search, fit, collapse/expand and node
 * details are available, but nothing can be edited. A "Me centrer" button reveals and
 * centres on the connected member's own node.
 */
export function OrganigrammePublieMembre({ token, membreId, affichage = "interactif" }: Readonly<{ token: string; membreId?: string | null; affichage?: "interactif" | "image" }>): JSX.Element {
  const en = useLang() === "en";
  const L = (fr: string, e: string): string => (en ? e : fr);
  const [data, setData] = useState<OrgContenuPublie | null>(null);
  const [stats, setStats] = useState<OrgStatistiques | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailNode, setDetailNode] = useState<OrgNode | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [centerToken, setCenterToken] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    getOrganigrammePublie(token)
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e instanceof Error ? e.message : "Erreur"))
      .finally(() => alive && setLoading(false));
    getOrganigrammeStatistiques(token).then((s) => alive && setStats(s)).catch(() => undefined);
    return () => { alive = false; };
  }, [token]);

  const monNoeud = useMemo(
    () => (membreId && data ? data.noeuds.find((n) => n.membre_id === membreId) ?? null : null),
    [data, membreId],
  );

  function centrerSurMoi(): void {
    if (!monNoeud) return;
    setSelectedId(monNoeud.id);
    setDetailNode(monNoeud);
    setCenterToken((t) => t + 1);
  }

  if (loading) return <p style={{ color: T.mut, fontSize: 13, padding: "14px 2px" }}>{L("Chargement…", "Loading…")}</p>;
  if (error) return <p style={{ color: T.dng, fontSize: 13, padding: "14px 2px" }}>{error}</p>;
  if (!data || !data.version) {
    return (
      <div style={{ padding: "18px 4px" }}>
        <p style={{ color: T.mut, fontSize: 13.5, lineHeight: 1.5 }}>
          {L("L'organigramme n'est pas encore publié. Il apparaîtra ici dès sa publication par la direction.",
            "The org chart is not published yet. It will appear here once the direction publishes it.")}
        </p>
      </div>
    );
  }

  const contenu = data as OrgContenu; // version present, safe to render
  const publieLe = contenu.version.publie_le ? new Date(contenu.version.publie_le).toLocaleDateString(en ? "en-GB" : "fr-FR") : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11.5, color: T.faint }}>
          {L("Organigramme publié", "Published org chart")}{publieLe ? ` · ${L("publié le", "published on")} ${publieLe}` : ""}
        </span>
        {monNoeud ? (
          <button type="button" className="tap" onClick={centrerSurMoi}
            style={{ height: 34, padding: "0 14px", borderRadius: 10, border: `1px solid ${T.b600}`, background: T.tintb, color: T.tintbf, fontWeight: 700, fontSize: 12.5, fontFamily: "inherit", cursor: "pointer" }}>
            {L("Me centrer", "Center on me")}
          </button>
        ) : null}
      </div>

      <div style={{ position: "relative", height: "min(72vh, 640px)", border: `1px solid ${T.line}`, borderRadius: 14, overflow: "hidden", background: T.surf }}>
        <OrgCanvas
          contenu={contenu}
          mode="consultation"
          minimal={affichage === "image"}
          onSelectNode={(n) => { setDetailNode(n); setSelectedId(n.id); }}
          selectedNodeId={selectedId}
          centerToken={centerToken}
        />
        {detailNode ? (
          <OrgDetailPanel
            node={detailNode}
            stats={stats}
            canEdit={false}
            onClose={() => setDetailNode(null)}
            onCenter={() => setCenterToken((t) => t + 1)}
            onEdit={() => undefined}
          />
        ) : null}
      </div>
    </div>
  );
}
