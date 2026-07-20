import type { OrgNode, OrgStatistiques } from "../../api.js";
import { CategorieBadge } from "../CategorieBadge.js";
import { STATUT_META, TYPE_NOEUD_LABEL } from "./orgLabels.js";

const UNITE_LABEL: Record<string, string> = {
  commission: "Commission / Mission",
  coordination: "Coordination",
  intendance: "Intendance",
  tribu: "Tribu",
  college: "Collège des bergers",
  groupe: "Groupe",
};

function Ligne({ label, value }: Readonly<{ label: string; value: React.ReactNode }>): JSX.Element | null {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="org-detail-row">
      <span className="org-detail-key">{label}</span>
      <span className="org-detail-val">{value}</span>
    </div>
  );
}

/** Live organisation counters, computed server side from the real data. Distinct
 * members holding a responsibility versus the total of active responsibilities:
 * the gap is the cumul. Any integrity anomaly found in the data is surfaced. */
function StatsSection({ stats }: Readonly<{ stats: OrgStatistiques }>): JSX.Element {
  const a = stats.affectations;
  const p = stats.placement;
  return (
    <section className="org-detail-body org-detail-stats">
      <p className="org-detail-section">Statistiques de l'organisation</p>
      <div className="org-stats-grid">
        <div className="org-stat">
          <span className="org-stat-num">{a.effectif_unique}</span>
          <span className="org-stat-lab">Effectif unique</span>
          <span className="org-stat-hint">membres avec responsabilité</span>
        </div>
        <div className="org-stat">
          <span className="org-stat-num">{a.affectations_actives}</span>
          <span className="org-stat-lab">Affectations actives</span>
          <span className="org-stat-hint">{a.principales} principale(s), {a.secondaires} secondaire(s)</span>
        </div>
        <div className="org-stat">
          <span className="org-stat-num">{a.membres_en_cumul}</span>
          <span className="org-stat-lab">Membres en cumul</span>
          <span className="org-stat-hint">écart de cumul: {a.ecart_cumul}</span>
        </div>
        <div className="org-stat">
          <span className="org-stat-num">{p.membres_places}</span>
          <span className="org-stat-lab">Membres placés</span>
          <span className="org-stat-hint">{p.intendances} int., {p.coordinations} coord., {p.commissions} comm.</span>
        </div>
      </div>
      {stats.anomalies.length > 0 ? (
        <div className="org-stats-anomalies">
          <p className="org-detail-section">Anomalies détectées</p>
          <ul className="org-anomalies-list">
            {stats.anomalies.map((an) => (
              <li key={an.code} className="org-anomalie">
                <span className="org-anomalie-num">{an.nombre}</span>
                <span className="org-anomalie-lab">{an.libelle}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="org-detail-note">Aucune anomalie d'affectation détectée dans les données actives.</p>
      )}
      <p className="org-detail-note">Compteurs calculés depuis la base, hors membres inactifs ou archivés.</p>
    </section>
  );
}

/** Type-aware overview built from the node's own real data (no invented values). */
function ApercuSection({ node }: Readonly<{ node: OrgNode }>): JSX.Element {
  const estUnite = !!node.unite_type;
  const effLabel = node.unite_type === "commission" || node.unite_type === "college" ? "Membres" : "Effectif";
  const aEffectif = node.effectif !== null && node.effectif !== undefined;
  return (
    <section className="org-detail-body">
      <p className="org-detail-section">Aperçu</p>
      {node.categorie ? (
        <div className="org-detail-row">
          <span className="org-detail-key">Catégorie</span>
          <span className="org-detail-val"><CategorieBadge code={node.categorie} /></span>
        </div>
      ) : null}
      <Ligne label="Type de nœud" value={TYPE_NOEUD_LABEL[node.type_noeud]} />
      {estUnite ? <Ligne label="Structure" value={UNITE_LABEL[node.unite_type ?? ""] ?? node.unite_type} /> : null}
      {node.membre_nom ? <Ligne label="Titulaire" value={node.membre_nom} /> : null}
      {node.fonction_cle ? <Ligne label="Fonction" value={node.sous_titre} /> : null}
      {aEffectif ? (
        <Ligne label={effLabel} value={`${node.effectif} membre${(node.effectif ?? 0) > 1 ? "s" : ""} (source: base de données)`} />
      ) : null}
      {estUnite ? (
        <>
          <p className="org-detail-section">Rattachement</p>
          <p className="org-detail-note">
            Dépliez cette unité dans le graphe pour voir ses responsables, sous-responsables et membres. Les
            effectifs sont calculés à partir des membres actifs rattachés dans la base.
          </p>
        </>
      ) : null}
    </section>
  );
}

/**
 * Right-side details drawer opened when a node is clicked. The chart stays visible
 * on the left; the panel shows a uniform, type-aware summary built from the node's
 * real data (no invented statistics), plus actions to centre the node, open the
 * linked member profile and, for administrators, edit the node.
 */
export function OrgDetailPanel({
  node,
  stats,
  canEdit,
  onClose,
  onCenter,
  onEdit,
}: Readonly<{
  node: OrgNode;
  stats: OrgStatistiques | null;
  canEdit: boolean;
  onClose: () => void;
  onCenter: (node: OrgNode) => void;
  onEdit: (node: OrgNode) => void;
}>): JSX.Element {
  const statut = STATUT_META[node.statut];

  return (
    <aside className="org-detail" aria-label="Détails de l'organisation">
      <div className="org-detail-head">
        <h3 className="org-detail-title">Détails de l'organisation</h3>
        <button type="button" className="drawer-close" onClick={onClose} aria-label="Fermer le panneau">
          &times;
        </button>
      </div>

      <div className="org-detail-hero">
        {node.afficher_photo && node.photo_url ? (
          <img className="org-detail-photo" src={node.photo_url} alt="" />
        ) : (
          <span className="org-detail-avatar" style={node.couleur ? { background: node.couleur } : undefined} aria-hidden="true">
            {(node.membre_nom ?? node.nom).slice(0, 2).toUpperCase()}
          </span>
        )}
        <div>
          <div className="org-detail-name">{node.membre_nom ?? node.nom}</div>
          <div className="org-detail-sub">{node.sous_titre ?? TYPE_NOEUD_LABEL[node.type_noeud]}</div>
          <span className="org-status">
            <span className={`org-dot org-dot-${statut.cle}`} aria-hidden="true" />
            {statut.label}
          </span>
        </div>
      </div>

      <ApercuSection node={node} />

      {stats ? <StatsSection stats={stats} /> : null}

      <div className="org-detail-actions">
        <button type="button" className="btn btn-ghost btn-inline" onClick={() => onCenter(node)}>
          Centrer dans l'organigramme
        </button>
        {node.membre_id && canEdit ? (
          <a className="btn btn-ghost btn-inline" href={`#/membres/${node.membre_id}`}>
            Voir le profil
          </a>
        ) : null}
        {canEdit ? (
          <button type="button" className="btn btn-primary btn-inline" onClick={() => onEdit(node)}>
            Modifier
          </button>
        ) : null}
      </div>
    </aside>
  );
}
