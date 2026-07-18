import { useMemo, useState } from "react";

import { type NotifCentreItem, getNotificationsCentre, markNotificationsRead, marquerNotificationLue, marquerNotificationNonLue, masquerNotification } from "../api.js";
import { formatDateTime } from "../format.js";
import { useLang } from "../i18n.js";
import { T } from "../proto.js";
import { useResource } from "../useResource.js";
import { EmptyState } from "./ui.js";

type Onglet = "toutes" | "non_lues" | "lues" | "actions" | "systeme";

const ONGLETS: { id: Onglet; fr: string; en: string }[] = [
  { id: "toutes", fr: "Toutes", en: "All" },
  { id: "non_lues", fr: "Non lues", en: "Unread" },
  { id: "lues", fr: "Lues", en: "Read" },
  { id: "actions", fr: "Actions", en: "Actions" },
  { id: "systeme", fr: "Système", en: "System" },
];

// Category label, short initial and accent colour. No emoji in source: a coloured
// disc with an initial reads as a clean, consistent category marker.
const CATS: Record<string, { fr: string; en: string; ini: string; c: string }> = {
  activites: { fr: "Activités", en: "Activities", ini: "A", c: "#2a4fad" },
  rappels: { fr: "Rappels", en: "Reminders", ini: "R", c: "#b26a00" },
  sondages: { fr: "Sondages", en: "Surveys", ini: "S", c: "#0f766e" },
  informations: { fr: "Informations", en: "Information", ini: "I", c: "#4338ca" },
  organisation: { fr: "Organisation", en: "Organization", ini: "O", c: "#7c3aed" },
  controles: { fr: "Contrôles", en: "Controls", ini: "C", c: "#475569" },
  documents: { fr: "Documents", en: "Documents", ini: "D", c: "#92652f" },
  compte_securite: { fr: "Compte et sécurité", en: "Account and security", ini: "!", c: "#c0392b" },
  systeme: { fr: "Système", en: "System", ini: "S", c: "#6b7280" },
};
const CAT_FILTRES = ["activites", "rappels", "sondages", "informations", "organisation", "controles", "documents", "compte_securite", "systeme"];

const LIMIT = 12;

function targetOf(titre: string | null, type: string | null): "document" | "recensement" | null {
  const t = `${titre ?? ""} ${type ?? ""}`.toLowerCase();
  if (t.includes("document") || t.includes("justificatif") || t.includes("piece")) return "document";
  if (t.includes("recensement")) return "recensement";
  return null;
}

// Ordered period bucket for one date, relative to now.
function periode(iso: string | null, en: boolean): { ord: number; label: string } {
  if (!iso) return { ord: 9, label: en ? "Undated" : "Sans date" };
  const d = new Date(iso);
  const now = new Date();
  const jour = 86400000;
  const memeJour = d.toDateString() === now.toDateString();
  if (memeJour) return { ord: 0, label: en ? "Today" : "Aujourd'hui" };
  const diff = (now.getTime() - d.getTime()) / jour;
  if (diff < 7) return { ord: 1, label: en ? "This week" : "Cette semaine" };
  if (d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()) return { ord: 2, label: en ? "This month" : "Ce mois-ci" };
  const moisFr = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
  const moisEn = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const label = `${((en ? moisEn : moisFr)[d.getMonth()] ?? "").toUpperCase()} ${d.getFullYear()}`;
  return { ord: 3 + (now.getFullYear() - d.getFullYear()), label };
}

/**
 * Notification center: categorized, status-tabbed, paginated and period-grouped,
 * separate from the Informations tab. TOUTES / NON LUES / LUES / ACTIONS / SYSTEME
 * plus a category filter. Reading, marking unread and hiding never destroy the
 * institutional record (hidden only removes it from the member's own view).
 */
export function CentreNotifications({
  token,
  onDocument,
  onRecensement,
  onCountChange,
}: Readonly<{ token: string; onDocument?: () => void; onRecensement?: () => void; onCountChange?: () => void }>): JSX.Element {
  const en = useLang() === "en";
  const [onglet, setOnglet] = useState<Onglet>("toutes");
  const [categorie, setCategorie] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [rev, setRev] = useState(0);
  const [lusLocal, setLusLocal] = useState<Set<string>>(new Set());
  const [nonLusLocal, setNonLusLocal] = useState<Set<string>>(new Set());
  const [masquesLocal, setMasquesLocal] = useState<Set<string>>(new Set());

  const offset = (page - 1) * LIMIT;
  const { data, loading, error } = useResource(
    () => getNotificationsCentre(token, { onglet, categorie: categorie || undefined, q: q || undefined, limit: LIMIT, offset }),
    [token, onglet, categorie, q, offset, rev],
  );

  const estLue = (n: NotifCentreItem): boolean => (nonLusLocal.has(n.id) ? false : n.lu || lusLocal.has(n.id));

  function ouvrir(n: NotifCentreItem): void {
    if (!estLue(n)) {
      setLusLocal((s) => new Set(s).add(n.id));
      setNonLusLocal((s) => { const c = new Set(s); c.delete(n.id); return c; });
      void marquerNotificationLue(token, n.id).catch(() => undefined).finally(() => onCountChange?.());
    }
    const target = targetOf(n.titre, n.type);
    if (target === "document") onDocument?.();
    else if (target === "recensement") onRecensement?.();
  }

  function marquerNonLu(id: string): void {
    setNonLusLocal((s) => new Set(s).add(id));
    setLusLocal((s) => { const c = new Set(s); c.delete(id); return c; });
    void marquerNotificationNonLue(token, id).catch(() => undefined).finally(() => onCountChange?.());
  }

  function masquer(id: string): void {
    setMasquesLocal((s) => new Set(s).add(id));
    void masquerNotification(token, id).catch(() => undefined).finally(() => onCountChange?.());
  }

  const items = useMemo(() => (data?.items ?? []).filter((n) => !masquesLocal.has(n.id)), [data, masquesLocal]);

  // Ordered period groups, preserving the server desc order inside each bucket.
  const groupes = useMemo(() => {
    const map = new Map<number, { label: string; items: NotifCentreItem[] }>();
    for (const n of items) {
      const p = periode(n.cree_le, en);
      const g = map.get(p.ord) ?? { label: p.label, items: [] };
      g.items.push(n);
      map.set(p.ord, g);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([, g]) => g);
  }, [items, en]);

  const nonLus = data?.non_lus ?? 0;

  return (
    <div>
      <div style={{ display: "flex", gap: 7, overflowX: "auto", padding: "0 2px 10px", WebkitOverflowScrolling: "touch" }}>
        {ONGLETS.map((o) => {
          const on = onglet === o.id;
          return (
            <button key={o.id} type="button" className="tap" onClick={() => { setOnglet(o.id); setPage(1); }}
              style={{ flex: "0 0 auto", padding: "7px 13px", borderRadius: 999, fontSize: 12, fontWeight: 700, whiteSpace: "nowrap", border: `1px solid ${on ? T.b600 : T.line}`, background: on ? T.b600 : T.surf, color: on ? "#fff" : T.ink }}>
              {en ? o.en : o.fr}{o.id === "non_lues" && nonLus > 0 ? ` (${nonLus})` : ""}
            </button>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 7, overflowX: "auto", padding: "0 2px 10px", WebkitOverflowScrolling: "touch" }}>
        <button type="button" className="tap" onClick={() => { setCategorie(""); setPage(1); }}
          style={{ flex: "0 0 auto", padding: "5px 10px", borderRadius: 999, fontSize: 11.5, fontWeight: 600, whiteSpace: "nowrap", border: `1px solid ${categorie === "" ? T.b600 : T.line}`, background: categorie === "" ? T.tintb : T.surf, color: categorie === "" ? T.b600 : T.mut }}>
          {en ? "All categories" : "Toutes catégories"}
        </button>
        {CAT_FILTRES.map((c) => {
          const on = categorie === c;
          return (
            <button key={c} type="button" className="tap" onClick={() => { setCategorie(c); setPage(1); }}
              style={{ flex: "0 0 auto", padding: "5px 10px", borderRadius: 999, fontSize: 11.5, fontWeight: 600, whiteSpace: "nowrap", border: `1px solid ${on ? CATS[c]?.c : T.line}`, background: on ? CATS[c]?.c : T.surf, color: on ? "#fff" : T.mut }}>
              {en ? CATS[c]?.en : CATS[c]?.fr}
            </button>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "0 2px 10px" }}>
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setPage(1); }}
          placeholder={en ? "Search a notification" : "Rechercher une notification"}
          style={{ flex: 1, height: 36, borderRadius: 9, border: `1px solid ${T.line}`, background: T.surf, color: T.ink, fontSize: 13, padding: "0 11px" }}
        />
        <button type="button" className="login-link" disabled={nonLus === 0} style={{ opacity: nonLus > 0 ? 1 : 0.5, whiteSpace: "nowrap" }}
          onClick={() => { void markNotificationsRead(token).finally(() => { setRev((r) => r + 1); onCountChange?.(); }); }}>
          {en ? "Mark all read" : "Tout marquer lu"}
        </button>
      </div>

      {loading ? (
        <EmptyState variant="loading" text={en ? "Loading..." : "Chargement..."} />
      ) : error ? (
        <EmptyState variant="error" text={error} />
      ) : items.length === 0 ? (
        <EmptyState variant="empty" title={en ? "No notification" : "Aucune notification"} text={en ? "Nothing to show for this filter." : "Rien à afficher pour ce filtre."} />
      ) : (
        <>
          {groupes.map((g) => (
            <section key={g.label} style={{ marginBottom: 10 }}>
              <h4 style={{ fontSize: 11, fontWeight: 800, color: T.faint, letterSpacing: 0.5, margin: "6px 2px", fontFamily: T.fm, textTransform: "uppercase" }}>{g.label}</h4>
              <ul className="list" style={{ margin: 0 }}>
                {g.items.map((n) => <NotifItem key={n.id} n={n} en={en} lue={estLue(n)} onOpen={() => ouvrir(n)} onNonLu={() => marquerNonLu(n.id)} onMasquer={() => masquer(n.id)} />)}
              </ul>
            </section>
          ))}
          <Pagineur page={data?.page ?? 1} pages={data?.pages ?? 1} total={data?.total ?? 0} en={en} onPrev={() => setPage((p) => Math.max(1, p - 1))} onNext={() => setPage((p) => p + 1)} />
        </>
      )}
    </div>
  );
}

function NotifItem({ n, en, lue, onOpen, onNonLu, onMasquer }: Readonly<{ n: NotifCentreItem; en: boolean; lue: boolean; onOpen: () => void; onNonLu: () => void; onMasquer: () => void }>): JSX.Element {
  const cat = CATS[n.categorie] ?? CATS.systeme;
  return (
    <li className={`list-item notif ${lue ? "" : "notif-unread"}`} style={{ flexDirection: "column", alignItems: "stretch", gap: 6 }}>
      <div className="row-tap" style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer" }} onClick={onOpen}>
        <span aria-hidden="true" style={{ flexShrink: 0, width: 26, height: 26, borderRadius: 8, background: cat?.c, color: "#fff", fontSize: 12, fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: T.fm }}>{cat?.ini}</span>
        <div className="list-main" style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <strong style={{ fontSize: 14 }}>{n.titre ?? (en ? "Notification" : "Notification")}</strong>
            {n.priorite === "haute" && <span style={{ background: "#fdecec", color: "#c0392b", fontSize: 9, fontWeight: 800, padding: "1px 6px", borderRadius: 6, fontFamily: T.fm }}>{en ? "PRIORITY" : "PRIORITÉ"}</span>}
            {n.action_requise && <span style={{ background: "#fff4e5", color: "#b26a00", fontSize: 9, fontWeight: 800, padding: "1px 6px", borderRadius: 6, fontFamily: T.fm }}>{en ? "ACTION" : "ACTION"}</span>}
          </div>
          {n.corps && <span className="list-sub">{n.corps}</span>}
          <span className="list-sub faint">{(en ? cat?.en : cat?.fr)} · {formatDateTime(n.cree_le)}</span>
        </div>
        {!lue && <span className="dot" aria-label={en ? "Unread" : "Non lu"} />}
      </div>
      <div style={{ display: "flex", gap: 12, paddingLeft: 36 }}>
        {lue && <button type="button" className="login-link" style={{ fontSize: 11.5 }} onClick={onNonLu}>{en ? "Mark unread" : "Marquer non lu"}</button>}
        <button type="button" className="login-link" style={{ fontSize: 11.5, color: T.faint }} onClick={onMasquer}>{en ? "Hide" : "Masquer"}</button>
      </div>
    </li>
  );
}

function Pagineur({ page, pages, total, onPrev, onNext, en }: Readonly<{ page: number; pages: number; total: number; onPrev: () => void; onNext: () => void; en: boolean }>): JSX.Element {
  if (pages <= 1) return <p style={{ textAlign: "center", fontSize: 11, color: T.faint, marginTop: 8 }}>{total} {en ? "notifications" : "notifications"}</p>;
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 12 }}>
      <button type="button" className="tap" disabled={page <= 1} onClick={onPrev} style={{ height: 36, padding: "0 12px", borderRadius: 9, border: `1px solid ${T.line}`, background: T.surf, color: page <= 1 ? T.faint : T.ink, fontSize: 12.5, fontWeight: 600 }}>{en ? "Previous" : "Précédent"}</button>
      <span style={{ fontSize: 11.5, color: T.mut, fontFamily: T.fm }}>{en ? `Page ${page} of ${pages}` : `Page ${page} sur ${pages}`} · {total}</span>
      <button type="button" className="tap" disabled={page >= pages} onClick={onNext} style={{ height: 36, padding: "0 12px", borderRadius: 9, border: `1px solid ${T.line}`, background: T.surf, color: page >= pages ? T.faint : T.ink, fontSize: 12.5, fontWeight: 600 }}>{en ? "Next" : "Suivant"}</button>
    </div>
  );
}
