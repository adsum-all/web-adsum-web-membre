import { useEffect, useMemo, useState } from "react";

import { getOrganigrammePublie, type OrganigrammePublie, type OrgNoeudPublie } from "../api.js";
import { useLang } from "../i18n.js";
import { T } from "../proto.js";

/**
 * Read-only, mobile-first view of the PUBLISHED organisation chart for members. Not an
 * editor. Shows the real nodes as function-dominant cards (function bold, occupant name
 * secondary, "Poste a pourvoir" when vacant), laid out as an indented vertical tree from
 * the hierarchical links, with a search box and the link legend. Only the published,
 * member-safe data is shown.
 */
const LIENS: { cle: string; couleur: string; fr: string; en: string }[] = [
  { cle: "hierarchique", couleur: "#2a4fad", fr: "Hiérarchie", en: "Hierarchy" },
  { cle: "coordination", couleur: "#0f6b6b", fr: "Coordination", en: "Coordination" },
  { cle: "supervision", couleur: "#653597", fr: "Supervision", en: "Supervision" },
  { cle: "responsabilite_tribu", couleur: "#5b82d8", fr: "Responsabilité de tribu", en: "Tribe responsibility" },
  { cle: "suivi_transversal", couleur: "#b6791b", fr: "Suivi transversal", en: "Transversal follow-up" },
  { cle: "assistance", couleur: "#676b73", fr: "Appui / assistance", en: "Support / assistance" },
];

function profondeurs(data: OrganigrammePublie): Map<string, number> {
  // Depth from the hierarchical links: a root has no incoming hierarchique edge.
  const parent = new Map<string, string>();
  for (const l of data.liens) {
    if (l.type_lien === "hierarchique") parent.set(l.cible_id, l.source_id);
  }
  const memo = new Map<string, number>();
  const prof = (id: string, seen: Set<string>): number => {
    if (memo.has(id)) return memo.get(id) as number;
    const p = parent.get(id);
    if (!p || seen.has(id)) { memo.set(id, 0); return 0; }
    seen.add(id);
    const d = 1 + prof(p, seen);
    memo.set(id, d);
    return d;
  };
  const out = new Map<string, number>();
  for (const n of data.noeuds) out.set(n.id, prof(n.id, new Set()));
  return out;
}

export function OrganigrammeGlobal({ token }: Readonly<{ token: string }>): JSX.Element {
  const en = useLang() === "en";
  const L = (fr: string, e: string): string => (en ? e : fr);
  const [data, setData] = useState<OrganigrammePublie | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getOrganigrammePublie(token)
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e instanceof Error ? e.message : "Erreur"))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [token]);

  const prof = useMemo(() => (data ? profondeurs(data) : new Map<string, number>()), [data]);
  const noeuds = useMemo(() => {
    if (!data) return [] as OrgNoeudPublie[];
    const ql = q.trim().toLowerCase();
    const filtres = data.noeuds.filter((n) =>
      !ql || [n.nom, n.membre_nom, n.sous_titre].some((x) => x && x.toLowerCase().includes(ql)));
    return filtres.slice().sort((a, b) => {
      const da = prof.get(a.id) ?? 0, db2 = prof.get(b.id) ?? 0;
      if (da !== db2) return da - db2;
      return (a.nom ?? "").localeCompare(b.nom ?? "");
    });
  }, [data, q, prof]);

  if (loading) return <p style={{ color: T.mut, fontSize: 13, padding: "14px 2px" }}>{L("Chargement…", "Loading…")}</p>;
  if (error) return <p style={{ color: T.dng, fontSize: 13, padding: "14px 2px" }}>{error}</p>;
  if (!data || !data.version) {
    return (
      <div style={{ padding: "18px 4px" }}>
        <p style={{ color: T.mut, fontSize: 13.5, lineHeight: 1.5 }}>
          {L("L'organigramme n'est pas encore publié. Il sera visible ici dès sa publication par la direction.",
            "The org chart is not published yet. It will appear here once the direction publishes it.")}
        </p>
      </div>
    );
  }

  return (
    <div style={{ padding: "8px 2px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
      <p style={{ fontSize: 12.5, color: T.mut, lineHeight: 1.5, margin: "0 2px" }}>
        {L("Organigramme publié de la gouvernance. Utilisez la recherche pour trouver une fonction, une unité ou une personne.",
          "Published governance org chart. Use search to find a function, a unit or a person.")}
      </p>

      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={L("Rechercher une fonction, une unité, une personne…", "Search a function, a unit, a person…")}
        aria-label={L("Rechercher dans l'organigramme", "Search the org chart")}
        style={{ height: 42, borderRadius: 11, border: `1px solid ${T.line}`, background: T.surf, color: T.ink, padding: "0 12px", fontSize: 13.5, fontFamily: "inherit", width: "100%" }}
      />

      {/* Legend */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: "2px 2px" }}>
        {LIENS.map((l) => (
          <span key={l.cle} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10.5, color: T.mut }}>
            <span aria-hidden="true" style={{ width: 14, height: 3, borderRadius: 2, background: l.couleur, display: "inline-block" }} />
            {en ? l.en : l.fr}
          </span>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {noeuds.map((n) => {
          // "Poste a pourvoir" only for a real function post with no holder, never for a
          // structural unit (a commission cell has no "occupant" but is not vacant).
          const estPoste = !!n.fonction_cle;
          const vacant = estPoste && (n.statut === "vacant" || !n.membre_nom);
          const fonction = n.nom || n.sous_titre || "-";
          const d = Math.min(prof.get(n.id) ?? 0, 6);
          return (
            <div key={n.id} style={{ marginLeft: d * 12 }}>
              <div style={{ background: T.surf, border: `1px solid ${vacant ? "#b6791b" : T.line}`, borderLeft: `3px solid ${n.couleur || T.b600}`, borderRadius: 11, padding: "10px 12px" }}>
                <div style={{ fontWeight: 800, fontSize: 14, color: T.ink }}>{fonction}</div>
                {n.sous_titre && n.sous_titre !== fonction && <div style={{ fontSize: 12, color: T.mut, marginTop: 2 }}>{n.sous_titre}</div>}
                {vacant
                  ? <div style={{ fontSize: 12, color: "#b6791b", fontWeight: 600, marginTop: 3 }}>{L("Poste à pourvoir", "Vacant post")}</div>
                  : (n.membre_nom ? <div style={{ fontSize: 12.5, color: T.mut, marginTop: 3 }}>{n.membre_nom}</div> : null)}
                {n.effectif ? <div style={{ fontSize: 11, color: T.faint, marginTop: 2 }}>{n.effectif} {L("membre(s)", "member(s)")}</div> : null}
              </div>
            </div>
          );
        })}
        {noeuds.length === 0 && (
          <p style={{ fontSize: 12.5, color: T.faint, padding: "8px 2px" }}>{L("Aucun résultat.", "No result.")}</p>
        )}
      </div>
    </div>
  );
}
