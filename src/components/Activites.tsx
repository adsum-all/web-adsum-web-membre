import { useEffect, useMemo, useState } from "react";

import { type EvenementOut, getEvenements } from "../api.js";
import { formatDateTime } from "../format.js";
import { useLang, useT } from "../i18n.js";
import { T } from "../proto.js";
import { useResource } from "../useResource.js";
import { ControlesAcces, HistoriqueActivites } from "./ActivitesHistorique.js";
import { Participation } from "./Participation.js";
import { Questionnaire } from "./Questionnaire.js";
import { EmptyState } from "./ui.js";

type TabAct = "en_cours" | "a_declarer" | "a_venir" | "historique" | "controles";
const PAGE = 5;

/**
 * ACTIVITES: a mobile-first tabbed screen, coherent with the Informations page.
 * Four scrollable tabs with short labels on phone and full titles in the content:
 * EN COURS, A VENIR, HISTORIQUE DES ACTIVITES (official survey status) and
 * CONTROLES (identity-check scans, never a proof of participation). The screen
 * opens on EN COURS only when something is actually ongoing, otherwise on A VENIR.
 */
export function Activites({
  token,
  onJoin,
}: Readonly<{ token: string; onJoin?: (evenement: EvenementOut) => void }>): JSX.Element {
  const t = useT();
  const en = useLang() === "en";
  const { data, loading, error } = useResource(() => getEvenements(token), [token]);
  const [tab, setTab] = useState<TabAct | null>(null);
  const [limitAvenir, setLimitAvenir] = useState(PAGE);

  const groups = useMemo(() => {
    // An activity whose declaration window is still open belongs to neither the
    // ongoing list nor the upcoming one. Folded into "ended" it vanished from every
    // screen, and the answer it was still waiting for became a non-response the
    // member never chose.
    const g = { enCours: [] as EvenementOut[], aDeclarer: [] as EvenementOut[], aVenir: [] as EvenementOut[] };
    for (const e of data ?? []) {
      if (e.phase === "en_cours") g.enCours.push(e);
      else if (e.phase === "a_declarer") g.aDeclarer.push(e);
      else if (e.phase !== "termine") g.aVenir.push(e);
    }
    g.enCours.sort((a, b) => +new Date(a.debut) - +new Date(b.debut));
    // Most recent first: the one just finished is the one still expecting an answer.
    g.aDeclarer.sort((a, b) => +new Date(b.debut) - +new Date(a.debut));
    g.aVenir.sort((a, b) => +new Date(a.debut) - +new Date(b.debut));
    return g;
  }, [data]);

  // Default tab: EN COURS when something is ongoing, otherwise A VENIR. The
  // member's manual choice is kept afterwards.
  useEffect(() => {
    // A pending declaration outranks anything upcoming: it expires, the rest does not.
    if (tab === null && data) {
      setTab(groups.enCours.length > 0 ? "en_cours" : groups.aDeclarer.length > 0 ? "a_declarer" : "a_venir");
    }
  }, [data, groups.enCours.length, groups.aDeclarer.length, tab]);

  const active: TabAct = tab ?? "a_venir";
  const besoinEvenements = active === "en_cours" || active === "a_declarer" || active === "a_venir";

  const TABS: { id: TabAct; court: string; complet: string }[] = [
    { id: "en_cours", court: en ? "Ongoing" : "En cours", complet: en ? "Ongoing" : "En cours" },
    { id: "a_declarer", court: en ? "To declare" : "À déclarer", complet: en ? "Awaiting your declaration" : "En attente de votre déclaration" },
    { id: "a_venir", court: en ? "Upcoming" : "À venir", complet: en ? "Upcoming" : "À venir" },
    { id: "historique", court: en ? "History" : "Historique", complet: en ? "Activity history" : "Historique des activités" },
    { id: "controles", court: en ? "Controls" : "Contrôles", complet: en ? "Access controls" : "Historique des contrôles d'accès" },
  ];
  const complet = TABS.find((x) => x.id === active)?.complet ?? "";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", gap: 7, overflowX: "auto", padding: "0 2px 12px", WebkitOverflowScrolling: "touch" }}>
        {TABS.map((x) => {
          const on = active === x.id;
          const compteur = x.id === "en_cours" ? groups.enCours.length : x.id === "a_declarer" ? groups.aDeclarer.length : x.id === "a_venir" ? groups.aVenir.length : 0;
          return (
            <button
              key={x.id}
              type="button"
              className="tap"
              onClick={() => { setTab(x.id); }}
              style={{ flex: "0 0 auto", padding: "7px 13px", borderRadius: 999, fontSize: 12, fontWeight: 700, whiteSpace: "nowrap", border: `1px solid ${on ? T.b600 : T.line}`, background: on ? T.b600 : T.surf, color: on ? "#fff" : T.ink }}
            >
              {x.court}{compteur > 0 ? ` (${compteur})` : ""}
            </button>
          );
        })}
      </div>

      <h3 style={{ fontSize: 12.5, fontWeight: 800, color: T.ink, letterSpacing: 0.3, textTransform: "uppercase", margin: "0 2px 8px", fontFamily: T.fd }}>{complet}</h3>

      {besoinEvenements && loading && <EmptyState variant="loading" text={t("act.loading")} />}
      {besoinEvenements && error && <EmptyState variant="error" title={t("act.errorTitle")} text={error} />}

      {active === "en_cours" && !loading && !error && (
        groups.enCours.length === 0
          ? <EmptyState variant="empty" title={en ? "Nothing ongoing" : "Rien en cours"} text={en ? "No activity is running right now." : "Aucune activité n'est en cours pour le moment."} />
          : <ul className="list" style={{ margin: 0 }}>{groups.enCours.map((e) => <ActiviteItem key={e.id} e={e} token={token} onJoin={onJoin} groupe="enCours" />)}</ul>
      )}

      {active === "a_declarer" && !loading && !error && (
        groups.aDeclarer.length === 0
          ? <EmptyState variant="empty" title={en ? "Nothing to declare" : "Rien à déclarer"} text={en ? "You are up to date: no activity is waiting for your answer." : "Vous êtes à jour : aucune activité n'attend votre réponse."} />
          : <ul className="list" style={{ margin: 0 }}>{groups.aDeclarer.map((e) => <ActiviteItem key={e.id} e={e} token={token} onJoin={onJoin} groupe="enCours" />)}</ul>
      )}

      {active === "a_venir" && !loading && !error && (
        groups.aVenir.length === 0
          ? <EmptyState variant="empty" title={en ? "Nothing upcoming" : "Rien à venir"} text={en ? "No upcoming activity for now." : "Aucune activité à venir pour le moment."} />
          : (
            <>
              <ul className="list" style={{ margin: 0 }}>{groups.aVenir.slice(0, limitAvenir).map((e) => <ActiviteItem key={e.id} e={e} token={token} onJoin={onJoin} groupe="aVenir" />)}</ul>
              {groups.aVenir.length > limitAvenir && (
                <button type="button" onClick={() => setLimitAvenir((l) => l + PAGE)} style={{ width: "100%", marginTop: 8, background: "none", border: `1px solid ${T.line}`, borderRadius: 10, padding: "9px 12px", color: T.mut, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                  {t("act.voirPlus")} ({groups.aVenir.length - limitAvenir})
                </button>
              )}
            </>
          )
      )}

      {active === "historique" && <HistoriqueActivites token={token} />}
      {active === "controles" && <ControlesAcces token={token} />}
    </div>
  );
}

// One activity row for the EN COURS and A VENIR tabs. The participation survey and
// questionnaire are collapsed behind a single action so the list stays scannable.
function ActiviteItem({ e, token, onJoin, groupe }: Readonly<{ e: EvenementOut; token: string; onJoin?: (evenement: EvenementOut) => void; groupe: "enCours" | "aVenir" }>): JSX.Element {
  const t = useT();
  const [open, setOpen] = useState(false);
  const modeLabel = e.mode === "en_ligne" ? t("part.modEnLigne") : e.mode === "hybride" ? t("act.modeHybride") : e.mode === "presentiel" ? t("caljour.modePresentiel") : null;
  const meta = [modeLabel, e.lieu].filter(Boolean).join(" · ");
  return (
    <li className="list-item" style={{ flexDirection: "column", alignItems: "stretch", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div className="list-main">
          <strong>{e.titre}</strong>
          <span className="list-sub">{formatDateTime(e.debut)}</span>
          {meta && <span className="list-sub" style={{ color: T.faint }}>{meta}</span>}
          {e.cible_type && e.cible_type !== "general" && e.cible_libelle && (
            <span className="list-sub" style={{ color: T.warn }}>{t("act.reserved").replace("{c}", e.cible_libelle)}</span>
          )}
        </div>
        {groupe === "aVenir" ? (
          <PhaseBadge phase={e.phase} volet={e.volet} />
        ) : (
          <span className="badge badge-mut" style={{ flexShrink: 0 }}>{t("act.voletLabel").replace("{v}", e.volet)}</span>
        )}
      </div>
      {e.joignable && (
        <button type="button" className="btn btn-primary btn-block" onClick={() => onJoin?.(e)}>
          {t("part.joinSession")}
        </button>
      )}
      {e.formulaire_ouvert && (
        <>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            style={{ width: "100%", background: "none", border: `1px solid ${open ? T.b600 : T.line}`, borderRadius: 10, padding: "9px 12px", color: open ? T.b600 : T.mut, fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
          >
            {open ? t("act.masquer") : t("act.confirmerPresence")}
          </button>
          {open && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <Participation token={token} eventId={e.id} flat />
              <Questionnaire token={token} eventId={e.id} flat />
            </div>
          )}
        </>
      )}
    </li>
  );
}

function PhaseBadge({ phase, volet }: Readonly<{ phase: EvenementOut["phase"]; volet: string }>): JSX.Element {
  const t = useT();
  if (phase === "en_cours") return <span className="badge badge-ok">{t("act.phaseEnCours")}</span>;
  if (phase === "bientot") return <span className="badge" style={{ background: T.warnbg, color: T.warn }}>{t("act.phaseBientot")}</span>;
  // Ended, but the answer is still expected and the window closes. Shown as an
  // alert rather than a neutral badge: the member has something to do, briefly.
  if (phase === "a_declarer") return <span className="badge" style={{ background: T.warnbg, color: T.warn }}>{t("act.phaseADeclarer")}</span>;
  if (phase === "termine") return <span className="badge badge-mut">{t("act.phaseTermine")}</span>;
  return <span className="badge badge-mut">{t("act.phaseAVenir")} · {volet}</span>;
}
