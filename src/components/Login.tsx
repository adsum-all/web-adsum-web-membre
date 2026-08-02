import { useState } from "react";

import { ApiError, login, loginVerify, requestLoginCode } from "../api.js";
import { useT } from "../i18n.js";
import { useMarque } from "../useMarque.js";
import { T } from "../proto.js";
import { PasswordInput } from "./PasswordInput.js";

export interface AuthContext {
  token: string;
  doitChangerMdp: boolean;
  email: string;
  motDePasse: string;
}

interface LoginProps {
  onAuth: (ctx: AuthContext) => void;
  onForgot?: () => void;
  /** Why the previous session ended, so coming back here is explained rather than
   *  abrupt. Absent on a first sign-in. */
  avis?: string;
}

type Methode = "email" | "matricule" | "code";

export function Login({ onAuth, onForgot, avis }: LoginProps): JSX.Element {
  const t = useT();
  const marque = useMarque();
  // The identifier field carries the e-mail (default), the ADSUM matricule, or the
  // member code, depending on the chosen method. The server resolves all three.
  const [methode, setMethode] = useState<Methode>("email");
  const [identifiant, setIdentifiant] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Second factor step: shown only when the server asks for a code.
  const [step, setStep] = useState<"password" | "otp">("password");
  const [canal, setCanal] = useState<string | null>(null);
  // Why the mailbox refused our last messages, when it did. Composed by the server,
  // which is the only side that knows what the provider reported.
  const [alerteEmail, setAlerteEmail] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [confiance, setConfiance] = useState(true);
  const [renvoye, setRenvoye] = useState(false);

  async function submitPassword(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await login(identifiant.trim(), password);
      if (res.otpRequired) {
        setCanal(res.canal);
        setAlerteEmail(res.alerteEmail);
        setStep("otp");
      } else if (res.token) {
        // For the first-login flow, always hand over the canonical e-mail so the
        // e-mail based OTP works even after a matricule/code sign-in.
        onAuth({ token: res.token, doitChangerMdp: res.doitChangerMdp, email: res.email ?? identifiant.trim(), motDePasse: password });
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("common.networkError"));
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await loginVerify(identifiant.trim(), password, code.trim(), confiance);
      if (res.token) onAuth({ token: res.token, doitChangerMdp: res.doitChangerMdp, email: res.email ?? identifiant.trim(), motDePasse: password });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("common.networkError"));
    } finally {
      setBusy(false);
    }
  }

  async function renvoyer(canalChoisi: "email" | "telegram" | "sms" | "auto" = "auto"): Promise<void> {
    setError(null);
    try {
      const canalUtilise = await requestLoginCode(identifiant.trim(), canalChoisi);
      setCanal(canalUtilise);
      setRenvoye(true);
    } catch {
      setError(t("login.resendError"));
    }
  }

  const canalLabel = canal === "telegram" ? t("login.canalTelegram") : t("login.canalEmail");
  const methodes: { key: Methode; label: string }[] = [
    { key: "email", label: t("login.methodEmail") },
    { key: "matricule", label: t("login.methodMatricule") },
    { key: "code", label: t("login.methodCode") },
  ];
  const identLabel = methode === "email" ? t("login.email") : methode === "matricule" ? t("login.identMatricule") : t("login.identCode");
  const identPlaceholder = methode === "email" ? "" : methode === "matricule" ? t("login.phMatricule") : t("login.phCode");

  return (
    <div className="login">
      <div className="login-logo" aria-hidden="true">
        {marque.initiale}
      </div>
      <div className="login-brand">{marque.marque}</div>
      <p className="login-sub">{t("login.tagline")}</p>

      {avis && (
        <p
          style={{
            fontSize: 11.5, lineHeight: 1.5, color: T.mut, background: T.surf,
            border: `1px solid ${T.line}`, borderRadius: 11, padding: "10px 12px",
            margin: "2px 0 6px", textAlign: "center",
          }}
        >
          {avis}
        </p>
      )}

      {step === "password" ? (
        <form onSubmit={submitPassword} className="login-form">
          <div
            role="tablist"
            aria-label={t("login.methodLabel")}
            style={{ display: "flex", gap: 6, background: "rgba(127,127,127,.10)", borderRadius: 12, padding: 4, marginBottom: 2 }}
          >
            {methodes.map((m) => {
              const actif = methode === m.key;
              return (
                <button
                  key={m.key}
                  type="button"
                  role="tab"
                  aria-selected={actif}
                  onClick={() => { setMethode(m.key); setError(null); }}
                  style={{
                    flex: 1,
                    minHeight: 40,
                    border: "none",
                    borderRadius: 9,
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: actif ? 700 : 500,
                    color: actif ? "#0b1a3a" : "#5a6478",
                    background: actif ? "#fff" : "transparent",
                    boxShadow: actif ? "0 1px 4px rgba(0,0,0,.14)" : "none",
                    transition: "background .15s, color .15s",
                  }}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
          <label>
            <span>{identLabel}</span>
            <input
              type={methode === "email" ? "email" : "text"}
              inputMode={methode === "email" ? "email" : "text"}
              autoCapitalize={methode === "email" ? "off" : "characters"}
              autoCorrect="off"
              spellCheck={false}
              autoComplete="username"
              placeholder={identPlaceholder}
              value={identifiant}
              onChange={(e) => setIdentifiant(e.target.value)}
              required
            />
          </label>
          {methode === "email" && <p className="login-sub" style={{ margin: "-4px 0 2px", fontSize: 11.5, opacity: 0.75 }}>{t("login.methodHint")}</p>}
          <label>
            <span>{t("login.password")}</span>
            <PasswordInput autoComplete="current-password" value={password} onChange={setPassword} required />
          </label>
          {error && <p className="login-error">{error}</p>}
          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy ? t("login.connecting") : t("login.signIn")}
          </button>
          <button type="button" className="login-link" onClick={onForgot}>
            {t("login.forgot")}
          </button>
        </form>
      ) : (
        <form onSubmit={submitCode} className="login-form">
          <p className="login-sub" style={{ marginTop: 0 }}>
            {t("login.otpIntro").replace("{canal}", canalLabel)}
          </p>
          {/* Placed right under the announcement it qualifies: on its own the line
              above says a code is on its way, which is not true when the mailbox has
              been bouncing every message. */}
          {alerteEmail && <p className="banner banner-warn small">{alerteEmail}</p>}
          <label>
            <span>{t("login.otpLabel")}</span>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="123456"
              required
              autoFocus
            />
          </label>
          <label style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <input type="checkbox" checked={confiance} onChange={(e) => setConfiance(e.target.checked)} style={{ width: 18, height: 18 }} />
            <span style={{ fontWeight: 500 }}>{t("login.trustDevice")}</span>
          </label>
          {error && <p className="login-error">{error}</p>}
          <button type="submit" className="btn btn-primary btn-block" disabled={busy || code.length < 6}>
            {busy ? t("login.verifying") : t("login.validateCode")}
          </button>
          <button type="button" className="login-link" onClick={() => void renvoyer(canal === "telegram" ? "telegram" : "email")}>
            {renvoye ? t("login.codeSent") : t("login.resendCode")}
          </button>
          {canal === "telegram" && (
            <button type="button" className="login-link" onClick={() => void renvoyer("email")}>
              {t("login.receiveByEmail")}
            </button>
          )}
          <button type="button" className="login-link" onClick={() => { setStep("password"); setCode(""); setError(null); setRenvoye(false); }}>
            {t("login.backToLogin")}
          </button>
        </form>
      )}
    </div>
  );
}
