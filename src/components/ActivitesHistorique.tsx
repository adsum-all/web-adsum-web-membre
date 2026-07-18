import { useState } from "react";

import { type ActivitePasseeItem, type ControleAccesItem, getActivitesPassees, getControlesAcces } from "../api.js";
import { formatDateTime } from "../format.js";
import { useLang } from "../i18n.js";
import { T } from "../proto.js";
import { useResource } from "../useResource.js";
import { EmptyState } from "./ui.js";

const MOIS_FR = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const MOIS_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function moisAnnee(iso: string | null, en: boolean): string {
  if (!iso) return en ? "Undated" : "Sans date";
  const d = new Date(iso);
  const noms = en ? MOIS_EN : MOIS_FR;
  return `${(noms[d.getMonth()] ?? "").toUpperCase()} ${d.getFullYear()}`;
}

/** Group items into ordered month sections, preserving the incoming (desc) order. */
function grouperParMois<T extends { debut: string | null }>(items: T[], en: boolean): [string, T[]][] {
  const map = new Map<string, T[]>();
  for (const it of items) {
    const cle = moisAnnee(it.debut, en);
    const arr = map.get(cle) ?? [];
    arr.push(it);
    map.set(cle, arr);
  }
  return [...map.entries()];
}

const STATUT_META: Record<ActivitePasseeItem["statut_personnel"], { fr: string; en: string; bg: string; fg: string }> = {
  present: { fr: "Présent", en: "Present", bg: "#e7f6ec", fg: "#1a7a3a" },
  participe_en_ligne: { fr: "A participé en ligne", en: "Attended online", bg: "#e7f6ec", fg: "#1a7a3a" },
  partiel: { fr: "Partiel", en: "Partial", bg: "#fff4e5", fg: "#b26a00" },
  absent: { fr: "Absent", en: "Absent", bg: "#fdecec", fg: "#c0392b" },
  non_repondu: { fr: "N'a pas répondu", en: "Did not answer", bg: "#eef1f5", fg: "#5b6472" },
  cloture_sans_reponse: { fr: "Sondage clôturé sans réponse", en: "Survey closed, no answer", bg: "#eef1f5", fg: "#5b6472" },
};

function Pagineur({ page, pages, total, onPrev, onNext, en }: Readonly<{ page: number; pages: number; total: number; onPrev: () => void; onNext: () => void; en: boolean }>): JSX.Element {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 12 }}>
      <button type="button" className="tap" disabled={page <= 1} onClick={onPrev} style={{ height: 36, padding: "0 12px", borderRadius: 9, border: `1px solid ${T.line}`, background: T.surf, color: page <= 1 ? T.faint : T.ink, fontSize: 12.5, fontWeight: 600 }}>
        {en ? "Previous" : "Précédent"}
      </button>
      <span style={{ fontSize: 11.5, color: T.mut, fontFamily: T.fm }}>
        {en ? `Page ${page} of ${pages}` : `Page ${page} sur ${pages}`} · {total} {en ? "results" : "résultats"}
      </span>
      <button type="button" className="tap" disabled={page >= pages} onClick={onNext} style={{ height: 36, padding: "0 12px", borderRadius: 9, border: `1px solid ${T.line}`, background: T.surf, color: page >= pages ? T.faint : T.ink, fontSize: 12.5, fontWeight: 600 }}>
        {en ? "Next" : "Suivant"}
      </button>
    </div>
  );
}

const LIMIT = 8;
const FILTRES_STATUT: { id: string; fr: string; en: string }[] = [
  { id: "", fr: "Tous", en: "All" },
  { id: "present", fr: "Présent", en: "Present" },
  { id: "absent", fr: "Absent", en: "Absent" },
  { id: "non_repondu", fr: "Sans réponse", en: "No answer" },
];

/**
 * HISTORIQUE DES ACTIVITES: terminated activities with the member's OFFICIAL
 * participation status, taken from the survey (never from a scan). Server
 * paginated, filterable by status, grouped by month so it stays readable over
 * years. A short sub-text reminds that the status comes from the survey.
 */
export function HistoriqueActivites({ token }: Readonly<{ token: string }>): JSX.Element {
  const en = useLang() === "en";
  const [page, setPage] = useState(1);
  const [statut, setStatut] = useState("");
  const offset = (page - 1) * LIMIT;
  const { data, loading, error } = useResource(() => getActivitesPassees(token, { limit: LIMIT, offset, statut: statut || undefined }), [token, offset, statut]);

  return (
    <div>
      <p style={{ fontSize: 11.5, color: T.mut, margin: "0 2px 8px" }}>
        {en ? "Your participation status comes from the official survey." : "Votre statut de participation provient du sondage officiel."}
      </p>
      <div style={{ display: "flex", gap: 7, overflowX: "auto", padding: "0 2px 10px", WebkitOverflowScrolling: "touch" }}>
        {FILTRES_STATUT.map((f) => (
          <button key={f.id || "tous"} type="button" className="tap" onClick={() => { setStatut(f.id); setPage(1); }}
            style={{ flex: "0 0 auto", padding: "6px 11px", borderRadius: 999, fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", border: `1px solid ${statut === f.id ? T.b600 : T.line}`, background: statut === f.id ? T.b600 : T.surf, color: statut === f.id ? "#fff" : T.ink }}>
            {en ? f.en : f.fr}
          </button>
        ))}
      </div>
      {loading ? (
        <EmptyState variant="loading" text={en ? "Loading..." : "Chargement..."} />
      ) : error ? (
        <EmptyState variant="error" text={error} />
      ) : !data || data.items.length === 0 ? (
        <EmptyState variant="empty" title={en ? "No activity" : "Aucune activité"} text={en ? "No past activity for this filter." : "Aucune activité passée pour ce filtre."} />
      ) : (
        <>
          {grouperParMois(data.items, en).map(([mois, items]) => (
            <section key={mois} style={{ marginBottom: 12 }}>
              <h4 style={{ fontSize: 11, fontWeight: 800, color: T.faint, letterSpacing: 0.5, margin: "6px 2px", fontFamily: T.fm }}>{mois}</h4>
              <ul className="list" style={{ margin: 0 }}>
                {items.map((a) => {
                  const m = STATUT_META[a.statut_personnel];
                  const modeLabel = a.mode === "en_ligne" ? (en ? "Online" : "En ligne") : a.mode === "hybride" ? (en ? "Hybrid" : "Hybride") : a.mode === "presentiel" ? (en ? "In person" : "Présentiel") : null;
                  return (
                    <li key={a.id} className="list-item" style={{ flexDirection: "column", alignItems: "stretch", gap: 5, borderLeft: `3px solid ${a.couleur || m.fg}` }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                        <strong style={{ fontSize: 14.5 }}>{a.titre}</strong>
                        <span style={{ flexShrink: 0, background: m.bg, color: m.fg, fontSize: 10, fontWeight: 800, padding: "3px 8px", borderRadius: 7, fontFamily: T.fm }}>{en ? m.en : m.fr}</span>
                      </div>
                      <span className="list-sub">{formatDateTime(a.debut)}</span>
                      <span className="list-sub" style={{ color: T.faint }}>{[a.type, modeLabel, a.lieu].filter(Boolean).join(" · ")}</span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          <Pagineur page={data.page} pages={data.pages} total={data.total} en={en} onPrev={() => setPage((p) => Math.max(1, p - 1))} onNext={() => setPage((p) => p + 1)} />
        </>
      )}
    </div>
  );
}

/**
 * HISTORIQUE DES CONTROLES D'ACCES: identity checks (scans) at an entrance. A scan
 * verifies an identity, it is NOT a proof of participation and never drives the
 * official presence statistics. Every screen reminds the member of this.
 */
export function ControlesAcces({ token }: Readonly<{ token: string }>): JSX.Element {
  const en = useLang() === "en";
  const [page, setPage] = useState(1);
  const offset = (page - 1) * LIMIT;
  const { data, loading, error } = useResource(() => getControlesAcces(token, { limit: LIMIT, offset }), [token, offset]);

  return (
    <div>
      <p style={{ fontSize: 11.5, color: T.mut, margin: "0 2px 4px" }}>
        {en ? "Identity checks performed at some activities." : "Vérifications d'identité effectuées lors de certaines activités."}
      </p>
      <p style={{ fontSize: 11, color: T.faint, margin: "0 2px 10px", fontStyle: "italic" }}>
        {en ? "The official participation status comes from the survey." : "Le statut officiel de participation provient du sondage."}
      </p>
      {loading ? (
        <EmptyState variant="loading" text={en ? "Loading..." : "Chargement..."} />
      ) : error ? (
        <EmptyState variant="error" text={error} />
      ) : !data || data.items.length === 0 ? (
        <EmptyState variant="empty" title={en ? "No control" : "Aucun contrôle"} text={en ? "No identity check recorded." : "Aucune vérification d'identité enregistrée."} />
      ) : (
        <>
          {grouperParMois(data.items.map((c) => ({ ...c, debut: c.arrivee ?? c.debut })), en).map(([mois, items]) => (
            <section key={mois} style={{ marginBottom: 12 }}>
              <h4 style={{ fontSize: 11, fontWeight: 800, color: T.faint, letterSpacing: 0.5, margin: "6px 2px", fontFamily: T.fm }}>{mois}</h4>
              <ul className="list" style={{ margin: 0 }}>
                {items.map((c: ControleAccesItem & { debut: string | null }, i) => (
                  <ControleItem key={`${c.evenement_id}-${i}`} c={c} en={en} />
                ))}
              </ul>
            </section>
          ))}
          <Pagineur page={data.page} pages={data.pages} total={data.total} en={en} onPrev={() => setPage((p) => Math.max(1, p - 1))} onNext={() => setPage((p) => p + 1)} />
        </>
      )}
    </div>
  );
}

function ControleItem({ c, en }: Readonly<{ c: ControleAccesItem & { debut: string | null }; en: boolean }>): JSX.Element {
  const [open, setOpen] = useState(false);
  const methodeLabel = c.methode === "qr" ? "QR" : c.methode === "manuelle" ? (en ? "Manual" : "Manuelle") : c.methode === "lien" ? (en ? "Link" : "Lien") : c.methode ?? "";
  const modeLabel = c.mode === "en_ligne" ? (en ? "Online" : "En ligne") : c.mode === "presentiel" ? (en ? "In person" : "Présentiel") : c.mode ?? "";
  return (
    <li className="list-item" style={{ flexDirection: "column", alignItems: "stretch", gap: 5 }}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start", background: "none", border: "none", padding: 0, textAlign: "left", cursor: "pointer", fontFamily: "inherit", color: T.ink }}>
        <span className="list-main">
          <strong style={{ fontSize: 14 }}>{c.evenement_titre}</strong>
          <span className="list-sub">{formatDateTime(c.arrivee ?? c.debut)}</span>
        </span>
        <span style={{ flexShrink: 0, background: "#e7f6ec", color: "#1a7a3a", fontSize: 10, fontWeight: 800, padding: "3px 8px", borderRadius: 7, fontFamily: T.fm }}>
          {en ? "Identity verified" : "Identité vérifiée"}
        </span>
      </button>
      {open && (
        <div style={{ fontSize: 12, color: T.mut, background: T.tintb, borderRadius: 9, padding: "8px 10px", display: "flex", flexDirection: "column", gap: 3 }}>
          {c.lieu && <span>{en ? "Checkpoint" : "Point de contrôle"} : {c.lieu}</span>}
          <span>{en ? "Method" : "Méthode"} : {methodeLabel}{modeLabel ? ` · ${modeLabel}` : ""}</span>
          {c.depart && <span>{en ? "Left" : "Sortie"} : {formatDateTime(c.depart)}</span>}
        </div>
      )}
    </li>
  );
}
