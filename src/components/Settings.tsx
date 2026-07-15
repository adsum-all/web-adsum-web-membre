import { useEffect, useState } from "react";

import {
  type MembreProfile,
  type MfaState,
  type NotifPreferences,
  changePassword,
  demanderSuppression,
  enregistrerWhatsapp,
  exportDonneesRGPD,
  getMfaState,
  getNotifPreferences,
  revokeAppareilConfiance,
  setAnniversaireVisibilite,
  setDoubleFacteur,
  setLangue,
  setMfaCanal,
  setNotifPreferences,
  setTheme,
  telegramConfirmer,
  telegramLien,
  telegramVerifier,
} from "../api.js";
import { type Lang, useT } from "../i18n.js";
import { T } from "../proto.js";
import { PasswordInput } from "./PasswordInput.js";

function Toggle({ label, hint, on, onChange }: { label: string; hint?: string; on: boolean; onChange: (v: boolean) => void }): JSX.Element {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0", borderBottom: `1px solid ${T.line}` }}>
      <div>
        <div style={{ fontSize: 12.5, fontWeight: 600 }}>{label}</div>
        {hint && <div style={{ fontSize: 10, color: T.mut }}>{hint}</div>}
      </div>
      <div
        onClick={() => onChange(!on)}
        className="tap"
        role="switch"
        aria-checked={on}
        style={{ width: 46, height: 27, borderRadius: 999, boxSizing: "border-box", flexShrink: 0, background: on ? T.b600 : T.bg, border: `1.5px solid ${on ? T.b600 : "#c2c8d6"}`, position: "relative", transition: "background .15s, border-color .15s", cursor: "pointer" }}
      >
        <div style={{ position: "absolute", top: 2.5, left: on ? 22 : 3, width: 19, height: 19, borderRadius: "50%", background: "#fff", transition: "left .15s", boxShadow: "0 1px 3px rgba(0,0,0,.28)" }} />
      </div>
    </div>
  );
}

// Member-facing notification groups, same keys and order as the backend (GROUPES).
// Each is delivered on the channels the member enables in the matrix; in-app is always on.
const NOTIF_GROUPES: { key: string; label: string; hint: string }[] = [
  { key: "dossier", label: "settings.grpDossier", hint: "settings.grpDossierHint" },
  { key: "collaboration", label: "settings.grpCollaboration", hint: "settings.grpCollaborationHint" },
  { key: "changements", label: "settings.grpChangements", hint: "settings.grpChangementsHint" },
  { key: "demarrage", label: "settings.grpDemarrage", hint: "settings.grpDemarrageHint" },
  { key: "rappels", label: "settings.grpRappels", hint: "settings.grpRappelsHint" },
  { key: "recap", label: "settings.grpRecap", hint: "settings.grpRecapHint" },
  { key: "anniversaires", label: "settings.grpAnniversaires", hint: "settings.grpAnniversairesHint" },
  { key: "pointage", label: "settings.grpPointage", hint: "settings.grpPointageHint" },
  { key: "annonces", label: "settings.grpAnnonces", hint: "settings.grpAnnoncesHint" },
];

// A compact per-channel switch used in the notification matrix. When ``disabled`` (the
// master channel is off), it is greyed and non-interactive: the fine setting is inactive
// because the whole channel is off, and the UI must say so rather than look active.
function ChanChip({ on, onClick, disabled = false }: { on: boolean; onClick: () => void; disabled?: boolean }): JSX.Element {
  const shown = on && !disabled;
  return (
    <div style={{ width: 60, display: "flex", justifyContent: "center" }}>
      <div
        onClick={disabled ? undefined : onClick}
        className={disabled ? undefined : "tap"}
        role="switch"
        aria-checked={shown}
        aria-disabled={disabled}
        style={{ width: 40, height: 24, borderRadius: 999, boxSizing: "border-box", background: shown ? T.b600 : T.bg, border: `1.5px solid ${shown ? T.b600 : "#c2c8d6"}`, position: "relative", transition: "background .15s, border-color .15s", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.4 : 1 }}
      >
        <div style={{ position: "absolute", top: 2, left: shown ? 18 : 2.5, width: 17, height: 17, borderRadius: "50%", background: "#fff", transition: "left .15s", boxShadow: "0 1px 3px rgba(0,0,0,.28)" }} />
      </div>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }): JSX.Element {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <span style={{ fontFamily: T.fm, fontSize: 9, color: T.mut }}>{label}</span>
      <PasswordInput
        value={value}
        onChange={onChange}
        style={{ height: 44, background: T.surf, border: `1px solid ${T.line}`, borderRadius: 11, padding: "0 13px", fontSize: 14, fontFamily: T.fu }}
      />
    </label>
  );
}

function Row({ label, hint, value, onClick }: { label: string; hint?: string; value?: string; onClick?: () => void }): JSX.Element {
  return (
    <div
      onClick={onClick}
      className={onClick ? "tap" : undefined}
      style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 0", borderBottom: `1px solid ${T.line}` }}
    >
      <div>
        <div style={{ fontSize: 12.5, fontWeight: 600 }}>{label}</div>
        {hint && <div style={{ fontSize: 10, color: T.mut }}>{hint}</div>}
      </div>
      <span style={{ fontSize: 12, color: T.mut }}>{value ?? "›"}</span>
    </div>
  );
}

export function Settings({
  token,
  profile,
  onLogout,
  onLang,
}: {
  token: string;
  profile: MembreProfile | null;
  onLogout: () => void;
  onLang?: (l: Lang) => void;
}): JSX.Element {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [ancien, setAncien] = useState("");
  const [nouveau, setNouveau] = useState("");
  const [confirme, setConfirme] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [prefs, setPrefs] = useState<NotifPreferences | null>(null);
  const [annivVisible, setAnnivVisible] = useState<boolean>(profile?.anniversaire_visible_annuaire ?? true);

  useEffect(() => {
    void getNotifPreferences(token).then(setPrefs).catch(() => undefined);
  }, [token]);

  useEffect(() => {
    if (profile) setAnnivVisible(profile.anniversaire_visible_annuaire);
  }, [profile?.anniversaire_visible_annuaire]);

  function toggleAnnivVisible(v: boolean): void {
    setAnnivVisible(v);
    void setAnniversaireVisibilite(token, v).catch(() => setAnnivVisible(!v));
  }

  function togglePref(key: keyof NotifPreferences, value: boolean): void {
    if (!prefs) return;
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    void setNotifPreferences(token, next).catch(() => undefined);
  }

  function setMatrice(groupe: string, canal: "email" | "telegram", value: boolean): void {
    if (!prefs) return;
    const cur = prefs.matrice_canaux ?? {};
    const grp = { ...(cur[groupe] ?? {}), [canal]: value };
    // Per-group choice only. The master channel switches are NOT forced on here, so a
    // member who turned a channel off keeps it off (the previous forcing was the reason
    // disabling a channel had no effect).
    const next = { ...prefs, matrice_canaux: { ...cur, [groupe]: grp } };
    setPrefs(next);
    void setNotifPreferences(token, next).catch(() => undefined);
  }

  function allegerEmails(): void {
    if (!prefs) return;
    const cur = prefs.matrice_canaux ?? {};
    const next2: NotifPreferences["matrice_canaux"] = {};
    for (const g of NOTIF_GROUPES) next2[g.key] = { ...(cur[g.key] ?? {}), email: false, telegram: true };
    const next = { ...prefs, matrice_canaux: next2 };
    setPrefs(next);
    setMsg({ kind: "ok", text: t("settings.reduceEmailsDone") });
    void setNotifPreferences(token, next).catch(() => undefined);
  }

  const strong = nouveau.length >= 8 && /[A-Z]/.test(nouveau) && /[0-9]/.test(nouveau);

  async function save(): Promise<void> {
    if (!strong || nouveau !== confirme) {
      setMsg({ kind: "err", text: t("settings.msgWeakPw") });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      await changePassword(token, ancien, nouveau);
      setMsg({ kind: "ok", text: t("settings.msgPwUpdated") });
      setAncien("");
      setNouveau("");
      setConfirme("");
      setOpen(false);
    } catch {
      setMsg({ kind: "err", text: t("settings.msgPwWrong") });
    } finally {
      setBusy(false);
    }
  }

  async function exportData(): Promise<void> {
    try {
      const data = await exportDonneesRGPD(token);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `adsum-mes-donnees-${profile?.matricule ?? "export"}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setMsg({ kind: "ok", text: t("settings.msgExportOk") });
    } catch {
      setMsg({ kind: "err", text: t("settings.msgExportErr") });
    }
  }

  async function requestDeletion(): Promise<void> {
    try {
      const r = await demanderSuppression(token);
      setMsg({
        kind: "ok",
        text: r.deja_demandee ? t("settings.msgDeleteAlready") : t("settings.msgDeleteOk"),
      });
    } catch {
      setMsg({ kind: "err", text: t("settings.msgDeleteErr") });
    }
  }

  return (
    <div className="scr" style={{ padding: "6px 18px 14px" }}>
      <p style={{ fontFamily: T.fm, fontSize: 9, color: T.mut, margin: "4px 0 4px" }}>{t("settings.account")}</p>
      <Row label={t("settings.changePassword")} hint={t("settings.changePasswordHint")} onClick={() => setOpen((v) => !v)} value={open ? "▾" : "›"} />
      {open && (
        <div style={{ display: "flex", flexDirection: "column", gap: 9, padding: "12px 0" }}>
          <Field label={t("settings.pwCurrentLabel")} value={ancien} onChange={setAncien} />
          <Field label={t("settings.pwNewLabel")} value={nouveau} onChange={setNouveau} />
          <Field label={t("settings.pwConfirmLabel")} value={confirme} onChange={setConfirme} />
          <div style={{ display: "flex", gap: 8, fontSize: 9.5, color: strong ? T.ok : T.mut }}>
            <span>{nouveau.length >= 8 ? "✓" : "○"} {t("settings.pwLen")}</span>
            <span>{/[A-Z]/.test(nouveau) ? "✓" : "○"} {t("settings.pwUpper")}</span>
            <span>{/[0-9]/.test(nouveau) ? "✓" : "○"} {t("settings.pwDigit")}</span>
          </div>
          <div onClick={() => void save()} className="tap" style={{ height: 44, background: T.b600, color: "#fff", borderRadius: 11, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600, fontSize: 13, opacity: busy ? 0.7 : 1 }}>
            {busy ? t("settings.saving") : t("settings.pwSubmit")}
          </div>
        </div>
      )}
      <MfaSection token={token} />

      <p style={{ fontFamily: T.fm, fontSize: 9, color: T.mut, margin: "16px 0 4px" }}>{t("settings.preferences")}</p>
      <LangueRow token={token} initial={profile?.langue === "en" ? "en" : "fr"} onLang={onLang} />
      <ThemeRow token={token} initial={profile?.theme ?? "light"} />

      <p style={{ fontFamily: T.fm, fontSize: 9, color: T.mut, margin: "16px 0 4px" }}>{t("settings.notifications")}</p>
      {prefs ? (
        <>
          <p style={{ fontSize: 10.5, color: T.mut, lineHeight: 1.5, margin: "0 0 8px" }}>{t("settings.notifIntro")}</p>
          {/* Master per-channel switches: turning one OFF stops that channel everywhere. */}
          <Toggle label={t("settings.masterEmail")} hint={t("settings.masterEmailHint")} on={prefs.email} onChange={(v) => togglePref("email", v)} />
          <Toggle label={t("settings.masterTelegram")} hint={t("settings.masterTelegramHint")} on={prefs.telegram} onChange={(v) => togglePref("telegram", v)} />
          <p style={{ fontSize: 10, color: T.faint, lineHeight: 1.5, margin: "4px 0 8px" }}>{t("settings.notifPerGroup")}</p>
          {/* Column header: one switch per channel, per notification group. */}
          <div style={{ display: "flex", alignItems: "flex-end", padding: "2px 0 4px" }}>
            <div style={{ flex: 1 }} />
            <div style={{ width: 60, textAlign: "center", fontSize: 9.5, fontWeight: 700, color: T.mut, opacity: prefs.email ? 1 : 0.4 }}>{t("settings.chanEmail")}</div>
            <div style={{ width: 60, textAlign: "center", fontSize: 9.5, fontWeight: 700, color: T.b600, opacity: prefs.telegram ? 1 : 0.4 }}>{t("settings.chanTelegram")}</div>
          </div>
          {NOTIF_GROUPES.map((g) => {
            const grp = prefs.matrice_canaux?.[g.key] ?? {};
            return (
              <div key={g.key} style={{ display: "flex", alignItems: "center", padding: "9px 0", borderBottom: `1px solid ${T.line}` }}>
                <div style={{ flex: 1, paddingRight: 8 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600 }}>{t(g.label)}</div>
                  <div style={{ fontSize: 10, color: T.mut, lineHeight: 1.4 }}>{t(g.hint)}</div>
                </div>
                <ChanChip on={grp.email !== false} disabled={!prefs.email} onClick={() => setMatrice(g.key, "email", grp.email === false)} />
                <ChanChip on={grp.telegram !== false} disabled={!prefs.telegram} onClick={() => setMatrice(g.key, "telegram", grp.telegram === false)} />
              </div>
            );
          })}
          <button
            type="button"
            onClick={allegerEmails}
            style={{ marginTop: 10, width: "100%", height: 40, borderRadius: 11, border: `1px solid ${T.b600}33`, background: `${T.b600}0f`, color: T.b600, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
          >
            {t("settings.reduceEmails")}
          </button>
          <p style={{ fontSize: 10, color: T.faint, lineHeight: 1.5, margin: "8px 0 0" }}>{t("settings.notifInApp")}</p>
        </>
      ) : (
        <Row label={t("settings.notifications")} hint={t("common.loading")} />
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 0", borderBottom: `1px solid ${T.line}` }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600 }}>{t("settings.securityTitle")}</div>
          <div style={{ fontSize: 10, color: T.mut, lineHeight: 1.5 }}>{t("settings.securityBody")}</div>
        </div>
        <span style={{ fontSize: 10, fontWeight: 700, color: T.mut, background: T.bg, border: `1px solid ${T.line}`, borderRadius: 8, padding: "3px 8px", whiteSpace: "nowrap" }}>
          {t("settings.alwaysOn")}
        </span>
      </div>

      <p style={{ fontFamily: T.fm, fontSize: 9, color: T.mut, margin: "16px 0 4px" }}>{t("settings.calendar")}</p>
      {prefs ? (
        <>
          <Toggle label={t("settings.calVip")} hint={t("settings.calVipHint")} on={prefs.cal_vip} onChange={(v) => togglePref("cal_vip", v)} />
          <Toggle label={t("settings.calResponsables")} hint={t("settings.calResponsablesHint")} on={prefs.cal_responsables} onChange={(v) => togglePref("cal_responsables", v)} />
          <Toggle label={t("settings.calCommission")} hint={t("settings.calCommissionHint")} on={prefs.cal_commission} onChange={(v) => togglePref("cal_commission", v)} />
          <Toggle label={t("settings.calTribu")} hint={t("settings.calTribuHint")} on={prefs.cal_tribu} onChange={(v) => togglePref("cal_tribu", v)} />
          <Toggle label={t("settings.calCoordination")} hint={t("settings.calCoordinationHint")} on={prefs.cal_coordination} onChange={(v) => togglePref("cal_coordination", v)} />
          <Toggle label={t("settings.calIntendance")} hint={t("settings.calIntendanceHint")} on={prefs.cal_intendance} onChange={(v) => togglePref("cal_intendance", v)} />
          <Toggle label={t("settings.annivPairs")} hint={t("settings.annivPairsHint")} on={prefs.anniv_pairs} onChange={(v) => togglePref("anniv_pairs", v)} />
        </>
      ) : (
        <Row label={t("settings.calendar")} hint={t("common.loading")} />
      )}
      <Toggle label={t("settings.annivVisible")} hint={t("settings.annivVisibleHint")} on={annivVisible} onChange={toggleAnnivVisible} />

      <p style={{ fontFamily: T.fm, fontSize: 9, color: T.mut, margin: "16px 0 4px" }}>{t("settings.channels")}</p>
      <Canaux token={token} prefs={prefs} onPref={togglePref} onMsg={setMsg} />

      <p style={{ fontFamily: T.fm, fontSize: 9, color: T.mut, margin: "16px 0 4px" }}>{t("settings.data")}</p>
      <Row label={t("settings.export")} hint={t("settings.exportHint")} onClick={() => void exportData()} />
      <Row label={t("settings.delete")} hint={t("settings.deleteHint")} onClick={() => void requestDeletion()} />

      {msg && (
        <div style={{ marginTop: 14, background: msg.kind === "ok" ? T.okbg : T.warnbg, border: `1px solid ${msg.kind === "ok" ? T.ok : T.warn}`, borderRadius: 11, padding: 11, fontSize: 11.5, color: T.ink }}>
          {msg.text}
        </div>
      )}

      <div onClick={onLogout} className="tap" style={{ marginTop: 16, height: 46, border: `1px solid ${T.line}`, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: T.mut, background: T.surf }}>
        {t("settings.logout")}
      </div>
    </div>
  );
}

function LangueRow({ token, initial, onLang }: { token: string; initial: "fr" | "en"; onLang?: (l: Lang) => void }): JSX.Element {
  const [lang, setLang] = useState<"fr" | "en">(initial);
  function choose(l: "fr" | "en"): void {
    setLang(l);
    if (typeof localStorage !== "undefined") localStorage.setItem("adsum.lang", l);
    onLang?.(l);
    void setLangue(token, l).catch(() => undefined);
  }
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 0", borderBottom: `1px solid ${T.line}` }}>
      <div style={{ fontSize: 12.5, fontWeight: 600 }}>Langue / Language</div>
      <div style={{ display: "flex", gap: 6 }}>
        {(["fr", "en"] as const).map((l) => (
          <div
            key={l}
            onClick={() => choose(l)}
            className="tap"
            style={{ padding: "6px 12px", borderRadius: 9, fontSize: 12, fontWeight: 600, background: lang === l ? T.b600 : T.surf, color: lang === l ? "#fff" : T.mut, border: `1px solid ${lang === l ? T.b600 : T.line}` }}
          >
            {l === "fr" ? "Français" : "English"}
          </div>
        ))}
      </div>
    </div>
  );
}

type Theme = "light" | "dark" | "system";

function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === "dark") root.setAttribute("data-theme", "dark");
  else if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", "light");
}

function ThemeRow({ token, initial }: { token: string; initial: Theme }): JSX.Element {
  const t = useT();
  const [theme, setTh] = useState<Theme>(initial);
  const options: Array<{ key: Theme; label: string }> = [
    { key: "light", label: t("settings.themeLight") },
    { key: "dark", label: t("settings.themeDark") },
    { key: "system", label: t("settings.themeSystem") },
  ];
  function choose(v: Theme): void {
    setTh(v);
    applyTheme(v);
    if (typeof localStorage !== "undefined") localStorage.setItem("adsum.theme", v);
    void setTheme(token, v).catch(() => undefined);
  }
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 0", borderBottom: `1px solid ${T.line}` }}>
      <div>
        <div style={{ fontSize: 12.5, fontWeight: 600 }}>{t("settings.appearance")}</div>
        <div style={{ fontSize: 10, color: T.mut }}>{t("settings.appearanceHint")}</div>
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        {options.map((o) => (
          <div
            key={o.key}
            onClick={() => choose(o.key)}
            className="tap"
            style={{ padding: "6px 11px", borderRadius: 9, fontSize: 11.5, fontWeight: 600, background: theme === o.key ? T.b600 : T.surf, color: theme === o.key ? "#fff" : T.mut, border: `1px solid ${theme === o.key ? T.b600 : T.line}` }}
          >
            {o.label}
          </div>
        ))}
      </div>
    </div>
  );
}

function MfaSection({ token }: { token: string }): JSX.Element {
  const t = useT();
  const [mfa, setMfa] = useState<MfaState | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function reload(): void {
    void getMfaState(token).then(setMfa).catch(() => setErr(t("settings.mfaLoadError")));
  }
  useEffect(() => {
    reload();
  }, [token]);

  async function toggle(on: boolean): Promise<void> {
    if (!mfa || busy) return;
    setErr(null);
    setBusy(true);
    // Optimistic, with rollback on failure so no false "enabled" is ever shown.
    setMfa({ ...mfa, actif: on, recommander: !on });
    try {
      await setDoubleFacteur(token, on);
      reload();
    } catch {
      setMfa({ ...mfa, actif: !on });
      setErr(t("settings.mfaChangeError"));
    } finally {
      setBusy(false);
    }
  }

  async function chooseCanal(canal: "auto" | "telegram" | "email"): Promise<void> {
    if (!mfa) return;
    const prev = mfa.canal;
    setMfa({ ...mfa, canal });
    try {
      await setMfaCanal(token, canal);
    } catch {
      setMfa({ ...mfa, canal: prev });
      setErr(t("settings.mfaChangeError"));
    }
  }

  async function revoke(id: string): Promise<void> {
    if (!mfa) return;
    setMfa({ ...mfa, appareils: mfa.appareils.filter((a) => a.id !== id) });
    try {
      await revokeAppareilConfiance(token, id);
    } catch {
      reload();
      setErr(t("settings.mfaRevokeError"));
    }
  }

  if (!mfa) {
    return <Row label={t("settings.2fa")} hint={t("common.loading")} />;
  }

  const jours = mfa.actif ? t("settings.mfa2faDays7") : t("settings.mfa2faDays30");
  return (
    <div style={{ padding: "6px 0" }}>
      {/* Honest status: 2FA is active on the account (it cannot be silently
          switched off), so this is a state, not a fake on/off toggle. */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0", borderBottom: `1px solid ${T.line}` }}>
        <div style={{ flex: 1, paddingRight: 10 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600 }}>{t("settings.mfaTitle")}</div>
          <div style={{ fontSize: 10, color: T.mut, lineHeight: 1.5 }}>{t("settings.mfaStatusBody").replace("{jours}", jours)}</div>
        </div>
        {mfa.verification_active && (
          <span style={{ fontSize: 10, fontWeight: 700, color: T.ok, background: T.okbg, border: `1px solid ${T.ok}33`, borderRadius: 8, padding: "3px 9px", whiteSpace: "nowrap" }}>{t("settings.mfaActive")}</span>
        )}
      </div>

      {/* Recommendation banner: the member has not opted in. During the test phase
          no code is sent to a plain member in the grace window, but the app must
          tell them it will become mandatory. Staff are told it is already required. */}
      {mfa.recommander && (
        <div
          style={{
            margin: "10px 0",
            padding: "10px 12px",
            borderRadius: 10,
            background: mfa.relance_forte ? T.warnbg : `${T.b600}0f`,
            border: `1px solid ${mfa.relance_forte ? T.warn : `${T.b600}33`}`,
          }}
        >
          <div style={{ fontSize: 11.5, fontWeight: 700, color: mfa.relance_forte ? T.warn : T.b600, marginBottom: 3 }}>
            {mfa.est_staff ? t("settings.mfaRecoStaffTitle") : t("settings.mfaRecoTitle")}
          </div>
          <div style={{ fontSize: 10.5, color: T.mut, lineHeight: 1.5 }}>
            {mfa.est_staff
              ? t("settings.mfaRecoStaffBody")
              : mfa.jours_avant_obligation !== null && mfa.jours_avant_obligation > 0
                ? t("settings.mfaRecoCountdown").replace("{jours}", String(mfa.jours_avant_obligation))
                : t("settings.mfaRecoNowMandatory")}
          </div>
        </div>
      )}

      {/* Clear on/off control, always visible. A plain member can enable OR disable
          two-factor authentication at any time; disabling brings the recommendation
          back. Staff have it mandatory, shown locked with the reinforced sub-option. */}
      {mfa.est_staff ? (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0", borderBottom: `1px solid ${T.line}` }}>
            <div style={{ flex: 1, paddingRight: 10 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600 }}>{t("settings.mfa2faLabel")}</div>
              <div style={{ fontSize: 10, color: T.mut, lineHeight: 1.5 }}>{t("settings.mfaStaffLocked")}</div>
            </div>
            <span style={{ fontSize: 10, fontWeight: 700, color: T.ok, background: T.okbg, border: `1px solid ${T.ok}33`, borderRadius: 8, padding: "3px 9px", whiteSpace: "nowrap" }}>{t("settings.mfaAlwaysOn")}</span>
          </div>
          <Toggle
            label={t("settings.mfaReinforced")}
            hint={t("settings.mfaReinforcedHint")}
            on={mfa.actif}
            onChange={(v) => void toggle(v)}
          />
        </>
      ) : (
        <Toggle
          label={t("settings.mfa2faLabel")}
          hint={t("settings.mfa2faHint")}
          on={mfa.actif}
          onChange={(v) => void toggle(v)}
        />
      )}

      {mfa.verification_active && (
        <>
          <div style={{ padding: "12px 0 6px" }}>
            <div style={{ fontSize: 11.5, fontWeight: 600, color: T.ink, marginBottom: 6 }}>{t("settings.mfaReceiveCode")}</div>
            <div style={{ display: "flex", gap: 6 }}>
              {([
                { key: "auto", label: t("settings.mfaCanalAuto") },
                { key: "telegram", label: t("settings.telegram") },
                { key: "email", label: t("settings.mfaCanalEmail") },
              ] as const).map((o) => (
                <div
                  key={o.key}
                  onClick={() => void chooseCanal(o.key)}
                  className="tap"
                  style={{ padding: "6px 11px", borderRadius: 9, fontSize: 11.5, fontWeight: 600, background: mfa.canal === o.key ? T.b600 : T.surf, color: mfa.canal === o.key ? "#fff" : T.mut, border: `1px solid ${mfa.canal === o.key ? T.b600 : T.line}` }}
                >
                  {o.label}
                </div>
              ))}
            </div>
            <div style={{ fontSize: 10, color: T.faint, marginTop: 5 }}>{t("settings.mfaCanalNote")}</div>
          </div>

          <div style={{ padding: "6px 0" }}>
            <div style={{ fontSize: 11.5, fontWeight: 600, color: T.ink, marginBottom: 4 }}>{t("settings.mfaTrustedDevices")}</div>
            {mfa.appareils.length === 0 ? (
              <div style={{ fontSize: 11, color: T.faint }}>{t("settings.mfaNoTrustedDevices")}</div>
            ) : (
              mfa.appareils.map((a) => (
                <div key={a.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${T.line}` }}>
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 600 }}>{a.libelle}</div>
                    <div style={{ fontSize: 10, color: T.mut }}>{a.expire_le ? t("settings.mfaValidUntil").replace("{date}", new Date(a.expire_le).toLocaleDateString("fr-FR")) : ""}</div>
                  </div>
                  <div onClick={() => void revoke(a.id)} className="tap" style={{ fontSize: 11.5, fontWeight: 600, color: T.dng, cursor: "pointer" }}>
                    {t("settings.mfaRemove")}
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}
      {err && <div style={{ fontSize: 11, color: T.dng, marginTop: 4 }}>{err}</div>}
    </div>
  );
}

function Canaux({
  token,
  prefs,
  onPref,
  onMsg,
}: {
  token: string;
  prefs: NotifPreferences | null;
  onPref: (k: keyof NotifPreferences, v: boolean) => void;
  onMsg: (m: { kind: "ok" | "err"; text: string }) => void;
}): JSX.Element {
  const t = useT();
  const [deepLink, setDeepLink] = useState<string | null>(null);
  const [awaitingCode, setAwaitingCode] = useState(false);
  const [code, setCode] = useState("");
  const [wa, setWa] = useState("");
  const [busy, setBusy] = useState(false);
  const [linkedNow, setLinkedNow] = useState(false);
  const telegramLie = (prefs?.telegram_lie ?? false) || linkedNow;

  async function lierTelegram(): Promise<void> {
    setBusy(true);
    try {
      const r = await telegramLien(token);
      setDeepLink(r.deep_link);
      setAwaitingCode(false);
      setCode("");
      window.open(r.deep_link, "_blank", "noopener");
    } catch {
      onMsg({ kind: "err", text: t("settings.msgTelegramNotConfigured") });
    } finally {
      setBusy(false);
    }
  }
  // Step 1: capture the chat and ask the bot to send a confirmation code TO it.
  async function verifierTelegram(): Promise<void> {
    setBusy(true);
    try {
      const r = await telegramVerifier(token);
      if (r.pending_confirmation) {
        setAwaitingCode(true);
        onMsg({ kind: "ok", text: r.message ?? t("settings.telegramCodeSent") });
      } else {
        onMsg({ kind: "err", text: r.message ?? t("settings.msgTelegramNotDetected") });
      }
    } finally {
      setBusy(false);
    }
  }
  // Step 2: the member re-enters the code the bot sent, proving they control the chat.
  async function confirmerTelegram(): Promise<void> {
    if (!code.trim()) return;
    setBusy(true);
    try {
      const r = await telegramConfirmer(token, code.trim());
      if (r.linked) {
        setLinkedNow(true);
        onPref("telegram", true);
        setDeepLink(null);
        setAwaitingCode(false);
        setCode("");
        onMsg({ kind: "ok", text: t("settings.msgTelegramLinked") });
      }
    } catch {
      onMsg({ kind: "err", text: t("settings.telegramCodeInvalid") });
    } finally {
      setBusy(false);
    }
  }
  async function saveWa(): Promise<void> {
    if (!wa.trim()) return;
    setBusy(true);
    try {
      await enregistrerWhatsapp(token, wa.trim());
      onPref("whatsapp", true);
      onMsg({ kind: "ok", text: t("settings.msgWhatsappSaved") });
    } catch {
      onMsg({ kind: "err", text: t("settings.msgWhatsappInvalid") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div style={{ padding: "12px 0", borderBottom: `1px solid ${T.line}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 600 }}>{t("settings.telegram")}</div>
            <div style={{ fontSize: 10, color: T.mut }}>{t("settings.telegramHint")}</div>
          </div>
          <div
            onClick={() => void lierTelegram()}
            className="tap"
            style={{ padding: "8px 14px", borderRadius: 10, background: telegramLie ? T.okbg : T.b600, color: telegramLie ? T.ok : "#fff", fontSize: 12, fontWeight: 600, opacity: busy ? 0.6 : 1 }}
          >
            {telegramLie ? t("settings.linked") : t("settings.link")}
          </div>
        </div>
        {deepLink && !awaitingCode && (
          <div onClick={() => void verifierTelegram()} className="tap" style={{ marginTop: 8, textAlign: "center", padding: "9px", borderRadius: 10, border: `1px solid ${T.b600}`, color: T.b600, fontSize: 12, fontWeight: 600 }}>
            {t("settings.telegramVerify")}
          </div>
        )}
        {awaitingCode && (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 10.5, color: T.mut, marginBottom: 6 }}>{t("settings.telegramCodeHint")}</div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                placeholder="000000"
                style={{ flex: 1, height: 40, border: `1px solid ${T.line}`, borderRadius: 10, padding: "0 12px", fontSize: 15, letterSpacing: 3, textAlign: "center" }}
              />
              <div onClick={() => void confirmerTelegram()} className="tap" style={{ padding: "0 16px", height: 40, display: "flex", alignItems: "center", borderRadius: 10, background: T.b600, color: "#fff", fontSize: 12, fontWeight: 600, opacity: busy || code.length < 6 ? 0.6 : 1 }}>
                {t("settings.telegramConfirm")}
              </div>
            </div>
          </div>
        )}
      </div>

      <div style={{ padding: "12px 0", borderBottom: `1px solid ${T.line}` }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>{t("settings.whatsapp")}</div>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={wa}
            onChange={(e) => setWa(e.target.value)}
            placeholder="+225 07 00 00 00 00"
            style={{ flex: 1, height: 40, border: `1px solid ${T.line}`, borderRadius: 10, padding: "0 12px", fontSize: 13 }}
          />
          <div onClick={() => void saveWa()} className="tap" style={{ padding: "0 16px", height: 40, display: "flex", alignItems: "center", borderRadius: 10, background: T.b600, color: "#fff", fontSize: 12, fontWeight: 600 }}>
            {prefs?.whatsapp ? t("settings.whatsappEdit") : t("settings.whatsappAdd")}
          </div>
        </div>
      </div>
    </>
  );
}
