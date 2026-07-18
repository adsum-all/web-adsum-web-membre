import { useCallback, useEffect, useState } from "react";

import {
  ApiError,
  type ActionsAttendues,
  type EvenementOut,
  type InscriptionStatut,
  type MembreProfile,
  type PresenceOut,
  detectFuseau,
  compteurInformations,
  getActionsAttendues,
  getInscription,
  getMembreProfile,
  getPhotoUrl,
  logoutSession,
  photoObjectPosition,
  setFuseau,
} from "./api.js";
import { type Lang, LangContext, tr, useT } from "./i18n.js";
import { civilName, initials as memberInitials } from "./name.js";
import { T } from "./proto.js";
import { CompleterProfil } from "./components/CompleterProfil.js";
import { Activites } from "./components/Activites.js";
import { Calendrier } from "./components/Calendrier.js";
import { Carte } from "./components/Carte.js";
import { ActionBanner } from "./components/ActionBanner.js";
import { Consultations } from "./components/Consultations.js";
import { DetailPresence } from "./components/DetailPresence.js";
import { Document } from "./components/Document.js";
import { Dossier } from "./components/Dossier.js";
import { Demandes } from "./components/Demandes.js";
import { Engage } from "./components/Engage.js";
import { Forgot } from "./components/Forgot.js";
import { Historique } from "./components/Historique.js";
import { Informations } from "./components/Informations.js";
import { Identite } from "./components/Identite.js";
import { Infos } from "./components/Infos.js";
import { type AuthContext, Login } from "./components/Login.js";
import { PremiereConnexion } from "./components/PremiereConnexion.js";
import { Notifications } from "./components/Notifications.js";
import { Recensement } from "./components/Recensement.js";
import { Secu } from "./components/Secu.js";
import { Session } from "./components/Session.js";
import { MaHierarchie } from "./components/MaHierarchie.js";
import { MesApplications } from "./components/MesApplications.js";
import { Settings } from "./components/Settings.js";
import { Suivi } from "./components/Suivi.js";
import { TabBar, type TabId } from "./components/TabBar.js";

type ViewId =
  | "identite"
  | "suivi"
  | "detail"
  | "engage"
  | "document"
  | "settings"
  | "secu"
  | "session"
  | "sent"
  | "infos"
  | "demandes"
  | "consultations"
  | "mesApplications"
  | "hierarchie";

/** i18n key of each screen title, resolved through the translator at render. */
const VIEW_TITLES: Record<ViewId, string> = {
  identite: "profilNav.identite.title",
  suivi: "app.viewTitle.suivi",
  detail: "app.viewTitle.detail",
  engage: "app.viewTitle.engage",
  document: "app.viewTitle.document",
  settings: "settings.title",
  secu: "profilNav.secu.title",
  session: "app.viewTitle.session",
  sent: "app.viewTitle.sent",
  infos: "profilNav.infos.title",
  demandes: "profilNav.demandes.title",
  consultations: "profilNav.consultations.title",
  mesApplications: "profilNav.apps.title",
  hierarchie: "profilNav.hierarchie.title",
};

const HIDE_CHROME: ViewId[] = ["session", "sent"];

/** Persisted session token: restored on load so a refresh no longer logs out. */
const TOKEN_KEY = "adsum.token";
function loadToken(): string | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
  } catch {
    return null;
  }
}
function saveToken(jwt: string | null): void {
  try {
    if (typeof localStorage === "undefined") return;
    if (jwt) localStorage.setItem(TOKEN_KEY, jwt);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable (private mode): session stays in memory only. */
  }
}

export function App(): JSX.Element {
  const [token, setToken] = useState<string | null>(() => loadToken());
  const [profile, setProfile] = useState<MembreProfile | null>(null);
  const [tab, setTab] = useState<TabId>("carte");
  const [notifOpen, setNotifOpen] = useState(false);
  const [recensementOpen, setRecensementOpen] = useState(false);
  const [dossierOpen, setDossierOpen] = useState(false);
  const [view, setView] = useState<ViewId | null>(null);
  const [detailItem, setDetailItem] = useState<PresenceOut | null>(null);
  const [activeEvent, setActiveEvent] = useState<EvenementOut | null>(null);
  const [authView, setAuthView] = useState<"login" | "forgot">("login");
  const [firstLogin, setFirstLogin] = useState<AuthContext | null>(null);
  const [inscription, setInscription] = useState<InscriptionStatut | null>(null);
  const [inscriptionError, setInscriptionError] = useState(false);
  // A technical/admin account (no member profile) logging into the member app.
  const [compteNonMembre, setCompteNonMembre] = useState(false);
  // Requests awaiting the member's own action (documents asked, fields unlocked),
  // driving the discreet reminder banner and the profile/nav badges.
  const [actions, setActions] = useState<ActionsAttendues | null>(null);
  // When the member opens the reminder for a single request, deep-link straight to it.
  const [demandeFocus, setDemandeFocus] = useState<string | null>(null);
  // Session-only dismissal of the calm banner (a real deadline is never dismissible).
  const [actionsMasquees, setActionsMasquees] = useState(false);

  const refreshInscription = useCallback((jwt: string) => {
    setInscriptionError(false);
    void getInscription(jwt)
      .then((s) => {
        setInscription(s);
        setInscriptionError(false);
      })
      // Never fabricate a status on error: assuming "approuve" would let an
      // incomplete member into the full app (skipping the wizard) or hide a
      // submitted member's tracking. Keep the last known value and surface a retry.
      .catch(() => setInscriptionError(true));
  }, []);

  const enter = useCallback(
    (jwt: string) => {
      // Show the app immediately; load the profile in the background so the first
      // paint does not wait on a second round trip (the card fills in when ready).
      saveToken(jwt);
      setToken(jwt);
      setCompteNonMembre(false);
      refreshInscription(jwt);
      void getMembreProfile(jwt)
        .then(setProfile)
        .catch((e: unknown) => {
          // A technical/admin account has no member space: say so clearly instead
          // of showing an empty card.
          if (e instanceof ApiError && e.status === 403) setCompteNonMembre(true);
        });
    },
    [refreshInscription],
  );

  // Report the device time zone once per session so server-rendered times
  // (notifications, surveys, reminders) localize to the member's real zone.
  useEffect(() => {
    if (!token) return;
    const tz = detectFuseau();
    const key = "adsum.tz.sent";
    const already = typeof localStorage !== "undefined" ? localStorage.getItem(key) : null;
    if (tz && already !== tz) {
      void setFuseau(token, tz)
        .then(() => {
          if (typeof localStorage !== "undefined") localStorage.setItem(key, tz);
        })
        .catch(() => undefined);
    }
  }, [token]);

  const [lang, setLang] = useState<Lang>(() => {
    const stored = typeof localStorage !== "undefined" ? localStorage.getItem("adsum.lang") : null;
    return stored === "en" || stored === "fr" ? stored : "fr";
  });
  // App is the LangContext provider, so it cannot read it through useT here (that
  // would return the default). Translate against the live lang state instead.
  const t = (key: string): string => tr(lang, key);
  useEffect(() => {
    if (profile?.langue === "en" || profile?.langue === "fr") setLang(profile.langue);
  }, [profile?.langue]);

  // Apply the member's display theme. light/dark set data-theme explicitly (fixed);
  // system removes it so the device preference (prefers-color-scheme) drives the
  // @adsum/tokens variables. Default stays light until a profile says otherwise.
  useEffect(() => {
    const root = document.documentElement;
    const th = profile?.theme;
    if (th === "dark") root.setAttribute("data-theme", "dark");
    else if (th === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", "light");
  }, [profile?.theme]);
  useEffect(() => {
    if (typeof localStorage !== "undefined") localStorage.setItem("adsum.lang", lang);
  }, [lang]);

  const reloadProfile = useCallback(() => {
    if (token) void getMembreProfile(token).then(setProfile).catch(() => undefined);
  }, [token]);

  // Pending-action summary: refreshed on demand (open, act, come back). A failure
  // never fabricates a count, it simply leaves the last known state untouched.
  const refreshActions = useCallback(() => {
    if (token) void getActionsAttendues(token).then(setActions).catch(() => undefined);
  }, [token]);

  // Unread Informations count, for the badge on the Informations tab. Refreshed the
  // same way as the action summary; a failure never fabricates a count.
  const [infoNonLus, setInfoNonLus] = useState(0);
  const refreshInfoCount = useCallback(() => {
    if (token) void compteurInformations(token).then((r) => setInfoNonLus(r.non_lus)).catch(() => undefined);
  }, [token]);
  useEffect(() => {
    if (!token) {
      setInfoNonLus(0);
      return;
    }
    refreshInfoCount();
    const onFocus = (): void => refreshInfoCount();
    window.addEventListener("focus", onFocus);
    const timer = window.setInterval(refreshInfoCount, 180000);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.clearInterval(timer);
    };
  }, [token, refreshInfoCount]);

  // Keep the reminder honest without polling hard: load it on sign-in, refresh it
  // when the member returns to the app (a request may have moved server-side), and
  // once every few minutes while the app stays open.
  useEffect(() => {
    if (!token) {
      setActions(null);
      return;
    }
    refreshActions();
    const onFocus = (): void => refreshActions();
    window.addEventListener("focus", onFocus);
    const timer = window.setInterval(refreshActions, 180000);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.clearInterval(timer);
    };
  }, [token, refreshActions]);

  const onAuth = useCallback(
    (ctx: AuthContext) => {
      if (ctx.doitChangerMdp) {
        setFirstLogin(ctx);
        return;
      }
      enter(ctx.token);
    },
    [enter],
  );

  const logout = useCallback(() => {
    if (token) void logoutSession(token).catch(() => undefined);
    saveToken(null);
    setToken(null);
    setProfile(null);
    setView(null);
    setFirstLogin(null);
    setInscription(null);
    setActions(null);
    setDemandeFocus(null);
    setActionsMasquees(false);
    setTab("carte");
  }, [token]);

  // Open the pending request(s) from any surface: jump straight to the single
  // request when there is exactly one, else open the list so nothing is hidden.
  const openDemandes = useCallback((focusId: string | null) => {
    setDemandeFocus(focusId);
    setNotifOpen(false);
    setRecensementOpen(false);
    setDossierOpen(false);
    setView("demandes");
  }, []);

  // Restore a persisted session on load: fetch the profile and status; if the
  // token is no longer valid (expired or revoked) sign out cleanly.
  useEffect(() => {
    if (!token || profile) return;
    refreshInscription(token);
    void getMembreProfile(token)
      .then(setProfile)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) logout();
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // While a member is on the "inscription en cours d'examen" waiting screen, poll
  // the status so an administration approval reflects WITHOUT a manual re-login:
  // refresh on a timer and whenever the app returns to the foreground. Stops as
  // soon as access is granted (approved or identity verified). This fixes the case
  // where a member validated by the administration keeps seeing "en cours de
  // traitement" because their open session never re-fetched the new status.
  const waitingForDecision =
    inscription !== null && inscription.verifie !== true && (inscription.statut === "soumis" || inscription.statut === "en_revue");
  useEffect(() => {
    if (!token || !waitingForDecision) return;
    const tick = (): void => refreshInscription(token);
    const id = window.setInterval(tick, 25000);
    const onVisible = (): void => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [token, waitingForDecision, refreshInscription]);

  if (firstLogin) {
    return (
      <Shell>
        <PremiereConnexion
          email={firstLogin.email}
          motDePasseTemporaire={firstLogin.motDePasse}
          onDone={(jwt) => {
            setFirstLogin(null);
            enter(jwt);
          }}
        />
      </Shell>
    );
  }

  if (!token) {
    return (
      <Shell>
        {authView === "forgot" ? (
          <Forgot onBack={() => setAuthView("login")} onDone={() => setAuthView("login")} />
        ) : (
          <Login onAuth={onAuth} onForgot={() => setAuthView("forgot")} />
        )}
      </Shell>
    );
  }

  // A technical or administrative account (super-admin, staff) has no member
  // space: it must use the back office, not this app. Say so clearly.
  if (compteNonMembre) {
    return (
      <Shell>
        <header className="topbar">
          <span className="topbar-title">ADSUM</span>
          <button type="button" className="bell" onClick={logout} aria-label={t("app.aria.quit")}>
            ⏻
          </button>
        </header>
        <main className="screen">
          <div style={{ textAlign: "center", padding: "2rem 1rem", maxWidth: 420, margin: "0 auto" }}>
            <h2>{t("app.nonMembre.title")}</h2>
            <p style={{ color: T.mut, lineHeight: 1.6 }}>{t("app.nonMembre.body")}</p>
            <p style={{ color: T.mut }}>
              <a href="https://adsum-back-office.pages.dev" style={{ color: T.tintbf, fontWeight: 600 }}>
                {t("app.nonMembre.link")}
              </a>
            </p>
            <button type="button" className="btn-secondary" onClick={logout} style={{ marginTop: 12 }}>
              {t("settings.logout")}
            </button>
          </div>
        </main>
      </Shell>
    );
  }

  // Registration status not loaded yet (or its fetch failed): show a loading /
  // retry screen rather than falling through to the full app on a guessed status.
  if (inscription === null) {
    return (
      <Shell>
        <header className="topbar">
          <span className="topbar-title">{t("app.title.inscription")}</span>
          <button type="button" className="bell" onClick={logout} aria-label={t("app.aria.quit")}>
            ⏻
          </button>
        </header>
        <main className="screen">
          <div style={{ textAlign: "center", padding: "2rem 1rem", maxWidth: 420, margin: "0 auto" }}>
            {inscriptionError ? (
              <>
                <h2>{t("app.inscriptionLoad.errorTitle")}</h2>
                <p style={{ color: T.mut, lineHeight: 1.6 }}>{t("app.inscriptionLoad.errorBody")}</p>
                <button type="button" className="btn-primary" onClick={() => refreshInscription(token)} style={{ marginTop: 12 }}>
                  {t("app.inscriptionLoad.retry")}
                </button>
              </>
            ) : (
              <p style={{ color: T.mut }}>{t("app.inscriptionLoad.loading")}</p>
            )}
          </div>
        </main>
      </Shell>
    );
  }

  // Registration gating: a member whose dossier is not yet approved sees the
  // completion form or the tracking screen, not the full app.
  const st = inscription?.statut;
  // A member whose identity the administration has VERIFIED has access to their
  // space, even when the inscription-decision path left statut_inscription at
  // "soumis"/"en_revue": the back office shows such a member VERIFIE + ACTIF, so
  // the app must stay consistent and never keep a verified member on the waiting
  // screen. A correction request or a refusal still take priority over this.
  const verifie = inscription?.verifie === true;
  if (st === "incomplet" || st === "modification_demandee") {
    return (
      <LangContext.Provider value={lang}>
        <Shell>
          <header className="topbar">
            <span className="topbar-title">{t("app.title.inscription")}</span>
            <button type="button" className="bell" onClick={logout} aria-label={t("app.aria.quit")}>
              ⏻
            </button>
          </header>
          <main className="screen">
            <CompleterProfil
              token={token}
              profile={profile}
              statut={st}
              motif={inscription?.motif_refus}
              champsACorriger={inscription?.champs_a_corriger ?? []}
              onSubmitted={() => refreshInscription(token)}
            />
          </main>
        </Shell>
      </LangContext.Provider>
    );
  }
  if (st === "refuse" || (!verifie && (st === "soumis" || st === "en_revue"))) {
    return (
      <LangContext.Provider value={lang}>
        <Shell>
          <InscriptionAttente statut={st} motif={inscription?.motif_refus} onLogout={logout} onRefresh={() => refreshInscription(token)} />
        </Shell>
      </LangContext.Provider>
    );
  }

  const chromeHidden = view !== null && HIDE_CHROME.includes(view);

  return (
    <LangContext.Provider value={lang}>
    <Shell>
      {!chromeHidden && (
        <header className="topbar">
          <span className="topbar-title">
            {view
              ? t(VIEW_TITLES[view])
              : recensementOpen
                ? t("app.title.recensement")
                : dossierOpen
                  ? t("profilNav.dossier.title")
                  : notifOpen
                    ? t("app.title.notifications")
                    : tabTitle(tab, t)}
          </span>
          {view ? (
            <button
              type="button"
              className="bell"
              onClick={() => {
                // Leaving a request may have changed what awaits the member (they
                // just replied or sent a document): refresh the reminder.
                if (view === "demandes") {
                  setDemandeFocus(null);
                  refreshActions();
                }
                setView(view === "suivi" || view === "engage" ? "identite" : null);
              }}
            >
              {t("common.close")}
            </button>
          ) : recensementOpen || dossierOpen ? (
            <button
              type="button"
              className="bell"
              onClick={() => {
                setRecensementOpen(false);
                setDossierOpen(false);
              }}
            >
              {t("common.close")}
            </button>
          ) : (
            <button
              type="button"
              className="bell"
              aria-label={notifOpen ? t("app.aria.notifsClose") : t("app.title.notifications")}
              onClick={() => setNotifOpen((v) => !v)}
            >
              {notifOpen ? t("common.close") : "◉"}
            </button>
          )}
        </header>
      )}
      <main className="screen">
        {view === "identite" ? (
          <Identite token={token} profile={profile} onEngagements={() => setView("engage")} onSuivi={() => setView("suivi")} />
        ) : view === "suivi" ? (
          <Suivi token={token} profile={profile} />
        ) : view === "detail" && detailItem ? (
          <DetailPresence presence={detailItem} />
        ) : view === "engage" ? (
          <Engage token={token} onDone={() => setView("identite")} />
        ) : view === "document" ? (
          <Document token={token} onSent={() => setView("suivi")} />
        ) : view === "settings" ? (
          <Settings token={token} profile={profile} onLogout={logout} onLang={setLang} />
        ) : view === "infos" ? (
          <Infos token={token} profile={profile} onDemande={() => setView("demandes")} onProfileChange={reloadProfile} />
        ) : view === "demandes" ? (
          <Demandes token={token} focusId={demandeFocus} />
        ) : view === "consultations" ? (
          <Consultations token={token} />
        ) : view === "mesApplications" ? (
          <MesApplications token={token} />
        ) : view === "hierarchie" ? (
          <MaHierarchie token={token} />
        ) : view === "secu" ? (
          <Secu token={token} onSettings={() => setView("settings")} />
        ) : view === "session" && activeEvent ? (
          <Session
            token={token}
            evenement={activeEvent}
            onBack={() => {
              setView(null);
              setTab("activites");
            }}
            onDone={() => {
              setView(null);
              setTab("activites");
            }}
          />
        ) : recensementOpen ? (
          <Recensement token={token} />
        ) : dossierOpen ? (
          <Dossier token={token} />
        ) : notifOpen ? (
          <Notifications
            token={token}
            onDocument={() => {
              setNotifOpen(false);
              setView("document");
            }}
            onRecensement={() => {
              setNotifOpen(false);
              setRecensementOpen(true);
            }}
          />
        ) : (
          <>
            {actions && actions.total > 0 && !(actionsMasquees && actions.urgence_max === "normale") && (
              <ActionBanner
                actions={actions}
                onOpen={() => openDemandes(actions.cible_unique_id)}
                onDismiss={actions.urgence_max === "normale" ? () => setActionsMasquees(true) : undefined}
              />
            )}
            {tab === "carte" && <Carte token={token} profile={profile} />}
            {tab === "activites" && (
              <>
                <Activites
                  token={token}
                  onJoin={(ev) => {
                    setActiveEvent(ev);
                    setView("session");
                  }}
                />
                {/* Past activities live at the bottom of the Activités tab, folded by
                    default, so they no longer clutter the upcoming list. */}
                <details style={{ marginTop: 16 }}>
                  <summary style={{ cursor: "pointer", padding: "8px 2px", fontSize: 13, fontWeight: 700, color: "var(--adsum-mut, #6b7280)" }}>
                    {t("hist.sectionTitle")}
                  </summary>
                  <div style={{ marginTop: 8 }}>
                    <Historique
                      token={token}
                      onSelect={(p) => {
                        setDetailItem(p);
                        setView("detail");
                      }}
                    />
                  </div>
                </details>
              </>
            )}
            {tab === "calendrier" && (
              <Calendrier
                token={token}
                onJoin={(ev) => {
                  setActiveEvent(ev);
                  setView("session");
                }}
              />
            )}
            {tab === "informations" && (
              <Informations token={token} onCountChange={refreshInfoCount} />
            )}
            {tab === "profil" && (
              <Profil
                token={token}
                profile={profile}
                onRecensement={() => setRecensementOpen(true)}
                onDossier={() => setDossierOpen(true)}
                onIdentite={() => setView("identite")}
                onSecu={() => setView("secu")}
                onSettings={() => setView("settings")}
                onInfos={() => setView("infos")}
                onDemandes={() => openDemandes(null)}
                onConsultations={() => setView("consultations")}
                onMesApplications={() => setView("mesApplications")}
                onHierarchie={() => setView("hierarchie")}
                demandesBadge={actions?.total ?? 0}
              />
            )}
          </>
        )}
      </main>
      {!chromeHidden && (
        <TabBar
          active={tab}
          profilBadge={actions?.total ?? 0}
          infoBadge={infoNonLus}
          onChange={(t) => {
            setNotifOpen(false);
            setRecensementOpen(false);
            setDossierOpen(false);
            setView(null);
            setActiveEvent(null);
            setTab(t);
            refreshActions();
            refreshInfoCount();
          }}
        />
      )}
    </Shell>
    </LangContext.Provider>
  );
}

function Shell({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <div className="phone">
      <div className="phone-inner">{children}</div>
    </div>
  );
}

function InscriptionAttente({
  statut,
  motif,
  onLogout,
  onRefresh,
}: {
  statut: string;
  motif?: string | null;
  onLogout: () => void;
  onRefresh?: () => void;
}): JSX.Element {
  const t = useT();
  const refuse = statut === "refuse";
  const steps = [
    { key: "soumis", label: t("inscription.stepSubmitted") },
    { key: "en_revue", label: t("inscription.stepReview") },
    { key: "decision", label: refuse ? t("inscription.stepRefused") : t("inscription.stepDecision") },
  ];
  const reached = refuse ? 3 : statut === "en_revue" ? 2 : 1;
  return (
    <div className="login" style={{ justifyContent: "flex-start", paddingTop: 48 }}>
      <div
        className="login-logo"
        aria-hidden="true"
        style={{ background: refuse ? "linear-gradient(140deg,#c0392b,#922b21)" : undefined }}
      >
        {refuse ? "!" : "⏳"}
      </div>
      <div style={{ fontFamily: T.fd, fontWeight: 700, fontSize: 21, textAlign: "center" }}>
        {refuse ? t("inscription.refusedTitle") : t("inscription.reviewTitle")}
      </div>
      <p className="login-sub">{refuse ? t("inscription.refusedSub") : t("inscription.reviewSub")}</p>
      <div style={{ margin: "10px 0 18px" }}>
        {steps.map((s, i) => {
          const done = i + 1 < reached;
          const active = i + 1 === reached;
          const color = refuse && i === 2 ? T.dng : done ? T.ok : active ? T.b600 : T.line;
          return (
            <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 2px" }}>
              <div style={{ width: 26, height: 26, borderRadius: 13, background: color, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, flexShrink: 0 }}>
                {done ? "✓" : i + 1}
              </div>
              <span style={{ fontSize: 13.5, fontWeight: active ? 600 : 400, color: active || done ? T.ink : T.mut }}>{s.label}</span>
            </div>
          );
        })}
      </div>
      {refuse && motif && (
        <p style={{ background: T.tintr, border: `1px solid ${T.tintrl}`, borderRadius: 11, padding: 12, fontSize: 12.5, color: T.tintrf }}>
          {t("attest.motif").replace("{m}", motif)}
        </p>
      )}
      {!refuse && onRefresh && (
        <>
          <button type="button" className="btn btn-primary btn-block" onClick={onRefresh} style={{ marginTop: 14 }}>
            {t("inscription.refresh")}
          </button>
          <p style={{ fontSize: 11, color: T.mut, textAlign: "center", margin: "8px 0 0" }}>
            {t("inscription.autoRefresh")}
          </p>
        </>
      )}
      <button type="button" className="btn btn-ghost btn-block" onClick={onLogout} style={{ marginTop: refuse ? 14 : 8 }}>
        {t("settings.logout")}
      </button>
    </div>
  );
}

function tabTitle(tab: TabId, t: (key: string) => string): string {
  return { carte: t("nav.carte"), activites: t("nav.activites"), calendrier: t("nav.calendrier"), informations: t("nav.informations"), profil: t("nav.profil") }[tab];
}

function NavRow({
  glyph,
  title,
  subtitle,
  onClick,
  accent,
  badge = 0,
}: {
  glyph: string;
  title: string;
  subtitle: string;
  onClick: () => void;
  accent?: boolean;
  badge?: number;
}): JSX.Element {
  return (
    <div
      onClick={onClick}
      className="tap"
      style={{
        background: accent ? T.okbg : T.surf,
        border: `1px solid ${accent ? T.ok : T.line}`,
        borderRadius: 14,
        padding: "12px 13px",
        display: "flex",
        alignItems: "center",
        gap: 12,
        marginBottom: 9,
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          flexShrink: 0,
          background: accent ? T.ok : T.tintb,
          color: accent ? "#fff" : T.tintbf,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 16,
        }}
      >
        {glyph}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: accent ? T.ok : T.ink }}>{title}</div>
        <div style={{ fontSize: 10.5, color: T.mut, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {subtitle}
        </div>
      </div>
      {badge > 0 && (
        <span
          aria-label={`${badge} action${badge > 1 ? "s" : ""} en attente`}
          style={{
            minWidth: 20,
            height: 20,
            padding: "0 6px",
            borderRadius: 10,
            background: T.warn,
            color: "#fff",
            fontSize: 11,
            fontWeight: 700,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {badge}
        </span>
      )}
      <span style={{ color: T.faint, fontSize: 18 }}>›</span>
    </div>
  );
}

function Profil({
  token,
  profile,
  onRecensement,
  onDossier,
  onIdentite,
  onSecu,
  onSettings,
  onInfos,
  onDemandes,
  onConsultations,
  onMesApplications,
  onHierarchie,
  demandesBadge = 0,
}: {
  token: string;
  profile: MembreProfile | null;
  onRecensement: () => void;
  onDossier: () => void;
  onIdentite: () => void;
  onSecu: () => void;
  onSettings: () => void;
  onInfos: () => void;
  onDemandes: () => void;
  onConsultations: () => void;
  onMesApplications: () => void;
  onHierarchie: () => void;
  demandesBadge?: number;
}): JSX.Element {
  const t = useT();
  const fullName =
    profile && (profile.prenoms || profile.nom || profile.nom_affichage)
      ? civilName(profile)
      : (profile?.email ?? t("app.profil.fallbackName"));
  const initials = profile ? memberInitials(profile) : "?";
  const fonctionsList = profile?.fonctions ?? [];
  const bergerLabel = profile?.est_berger ? profile.nom_pastoral_affiche : null;
  const verified = profile?.verifie ?? false;
  const since = profile?.date_entree ? new Date(profile.date_entree).getFullYear() : null;
  // Signed URL of the identity photo; falls back to initials when absent.
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void getPhotoUrl(token)
      .then((r) => {
        if (alive) setPhotoUrl(r.url);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [token]);

  return (
    <div className="profil" style={{ padding: "10px 2px 14px" }}>
      <div className="profil-head">
        {photoUrl ? (
          <img className="avatar avatar-photo" src={photoUrl} alt={t("app.profil.photoAlt")} style={{ objectPosition: photoObjectPosition(profile) }} />
        ) : (
          <div className="avatar" aria-hidden="true">
            {initials}
          </div>
        )}
        <h2 style={{ marginBottom: 4 }}>{fullName}</h2>
        <p className="profil-role" style={{ marginBottom: 8 }}>
          {profile?.matricule ?? ""}
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center", marginBottom: 8 }}>
          {bergerLabel && (
            <span style={{ fontSize: 12.5, fontWeight: 700, color: T.warn, background: T.warnbg, border: `1px solid ${T.warn}`, padding: "3px 11px", borderRadius: 20 }}>
              {bergerLabel}
            </span>
          )}
          {fonctionsList.map((f, i) => (
            <span key={i} style={{ fontSize: 12, fontWeight: 600, color: T.tintbf, background: T.tintb, border: `1px solid ${T.b600}33`, padding: "3px 11px", borderRadius: 20 }}>
              {f.libelle}
              {f.perimetre ? ` - ${f.perimetre}` : ""}
            </span>
          ))}
          {!bergerLabel && fonctionsList.length === 0 && (
            <span style={{ fontSize: 12, fontWeight: 600, color: T.mut, background: T.chip, border: `1px solid ${T.line}`, padding: "3px 11px", borderRadius: 20 }}>
              {t("app.profil.memberChip")}
            </span>
          )}
        </div>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            padding: "4px 11px",
            borderRadius: 20,
            background: verified ? T.okbg : T.warnbg,
            color: verified ? T.ok : T.warn,
          }}
        >
          {verified ? t("app.profil.verified") : t("app.profil.unverified")}
        </span>
      </div>

      <div style={{ background: T.surf, border: `1px solid ${T.line}`, borderRadius: 14, overflow: "hidden", margin: "4px 0 16px" }}>
        {[
          [t("app.profil.commission"), profile?.commission ?? "-"],
          [t("app.profil.tribu"), profile?.tribu ?? "-"],
          [t("app.profil.since"), since ? String(since) : "-"],
        ].map(([label, value], i) => (
          <div
            key={label}
            style={{ display: "flex", justifyContent: "space-between", padding: "12px 14px", borderBottom: i < 2 ? `1px solid ${T.line}` : "none" }}
          >
            <span style={{ fontSize: 12.5, color: T.mut }}>{label}</span>
            <span style={{ fontSize: 12.5, fontWeight: 600 }}>{value}</span>
          </div>
        ))}
      </div>

      <NavRow glyph="✓" title={t("profilNav.identite.title")} subtitle={t("profilNav.identite.sub")} onClick={onIdentite} accent={verified} />
      <NavRow glyph="≣" title={t("profilNav.infos.title")} subtitle={t("profilNav.infos.sub")} onClick={onInfos} />
      <NavRow glyph="✉" title={t("profilNav.demandes.title")} subtitle={t("profilNav.demandes.sub")} onClick={onDemandes} badge={demandesBadge} />
      <NavRow glyph="🗳" title={t("profilNav.consultations.title")} subtitle={t("profilNav.consultations.sub")} onClick={onConsultations} />
      <NavRow glyph="🗎" title={t("profilNav.dossier.title")} subtitle={t("profilNav.dossier.sub")} onClick={onDossier} />
      <NavRow glyph="▦" title={t("profilNav.apps.title")} subtitle={t("profilNav.apps.sub")} onClick={onMesApplications} />
      <NavRow glyph="⋔" title={t("profilNav.hierarchie.title")} subtitle={t("profilNav.hierarchie.desc")} onClick={onHierarchie} />
      <NavRow glyph="🔒" title={t("profilNav.secu.title")} subtitle={t("profilNav.secu.sub")} onClick={onSecu} />
      <NavRow glyph="⚙" title={t("profilNav.settings.title")} subtitle={t("profilNav.settings.sub")} onClick={onSettings} />
      <NavRow glyph="↻" title={t("profilNav.recensement.title")} subtitle={t("profilNav.recensement.sub")} onClick={onRecensement} />
    </div>
  );
}
