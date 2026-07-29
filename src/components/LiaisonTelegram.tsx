import { useCallback, useEffect, useRef, useState } from "react";
import {
  delierTelegram,
  getTelegramEtat,
  telegramConfirmer,
  telegramLien,
  telegramVerifier,
} from "../api.js";
import { T } from "../proto.js";

type Etape = "depart" | "ouvrir" | "code" | "liee";

function Puce({ n, actif, fait }: { n: number; actif: boolean; fait: boolean }): JSX.Element {
  return (
    <div
      aria-hidden="true"
      style={{
        width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 11, fontWeight: 700,
        background: fait ? T.ok : actif ? T.b600 : T.bg,
        color: fait || actif ? "#fff" : T.mut,
        border: `1px solid ${fait ? T.ok : actif ? T.b600 : T.line}`,
      }}
    >
      {fait ? "✓" : n}
    </div>
  );
}

function Etiquette({ children, ton }: { children: string; ton: "ok" | "attente" | "neutre" }): JSX.Element {
  const c = ton === "ok" ? T.ok : ton === "attente" ? T.warn : T.mut;
  const f = ton === "ok" ? T.okbg : ton === "attente" ? T.warnbg : T.bg;
  return (
    <span style={{ fontSize: 9.5, fontWeight: 700, color: c, background: f, border: `1px solid ${c}33`, borderRadius: 7, padding: "2px 8px", whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
}

/** Guided Telegram linking, in the three steps the member actually goes through.
 *
 *  The flow was already secure (single-use deep-link token, a code sent to the
 *  candidate chat, proof of possession before binding), but the interface exposed
 *  it as three unlabelled buttons with no state: a member who did not know what to
 *  expect could not tell whether they had succeeded, were waiting, or had to start
 *  again. The security is unchanged; what is added is knowing where you are. */
export function LiaisonTelegram({
  token,
  onLie,
  onMsg,
}: {
  token: string;
  onLie: (lie: boolean) => void;
  onMsg: (m: { kind: "ok" | "err"; text: string }) => void;
}): JSX.Element {
  const [etape, setEtape] = useState<Etape>("depart");
  const [disponible, setDisponible] = useState(true);
  const [deepLink, setDeepLink] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [restant, setRestant] = useState(0);
  const [essais, setEssais] = useState(5);
  const [detail, setDetail] = useState<string | null>(null);
  const monte = useRef(true);

  const relire = useCallback(async () => {
    try {
      const e = await getTelegramEtat(token);
      if (!monte.current) return e;
      setDisponible(e.disponible);
      setRestant(e.secondes_restantes);
      setEssais(e.essais_restants);
      if (e.liee) setEtape("liee");
      else if (e.en_attente_de_code) setEtape("code");
      else if (e.lien_demande) setEtape((p) => (p === "depart" ? "ouvrir" : p));
      return e;
    } catch {
      return null;
    }
  }, [token]);

  useEffect(() => {
    monte.current = true;
    void relire();
    return () => {
      monte.current = false;
    };
  }, [relire]);

  // Countdown on the ten-minute confirmation window, so an expired code is visible
  // as expired instead of silently refusing the member's input.
  useEffect(() => {
    if (etape !== "code" || restant <= 0) return;
    const id = window.setInterval(() => setRestant((v) => Math.max(0, v - 1)), 1000);
    return () => window.clearInterval(id);
  }, [etape, restant]);

  async function ouvrirTelegram(): Promise<void> {
    setBusy(true);
    setDetail(null);
    try {
      const r = await telegramLien(token);
      setDeepLink(r.deep_link);
      setEtape("ouvrir");
      window.open(r.deep_link, "_blank", "noopener");
    } catch {
      onMsg({ kind: "err", text: "Telegram n'est pas configuré sur la plateforme pour le moment." });
    } finally {
      setBusy(false);
    }
  }

  async function detecter(): Promise<void> {
    setBusy(true);
    setDetail(null);
    try {
      const r = await telegramVerifier(token);
      if (r.pending_confirmation) {
        setEtape("code");
        setCode("");
        await relire();
        onMsg({ kind: "ok", text: "Un code à 6 chiffres vient d'être envoyé dans votre conversation Telegram." });
      } else {
        setDetail(
          "La conversation n'a pas encore été détectée. Ouvrez Telegram, appuyez sur Démarrer dans la " +
            "conversation avec le robot ADSUM, puis revenez appuyer sur ce bouton.",
        );
      }
    } catch {
      setDetail("La détection n'a pas abouti. Réessayez dans quelques secondes.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmer(): Promise<void> {
    if (code.trim().length < 6) return;
    setBusy(true);
    setDetail(null);
    try {
      await telegramConfirmer(token, code.trim());
      setEtape("liee");
      onLie(true);
      onMsg({ kind: "ok", text: "Telegram est lié à votre compte. Vos notifications peuvent désormais y être envoyées." });
    } catch {
      const e = await relire();
      const reste = e?.essais_restants ?? 0;
      setDetail(
        reste > 0
          ? `Ce code ne correspond pas. Il vous reste ${reste} ${reste > 1 ? "essais" : "essai"}.`
          : "Trop de tentatives. Recommencez la liaison depuis le début.",
      );
      if (reste <= 0) setEtape("depart");
    } finally {
      setBusy(false);
    }
  }

  async function delier(): Promise<void> {
    setBusy(true);
    setDetail(null);
    try {
      await delierTelegram(token);
      setEtape("depart");
      setDeepLink(null);
      setCode("");
      onLie(false);
      onMsg({ kind: "ok", text: "Telegram a été délié. Vous ne recevrez plus de notification sur ce canal." });
    } catch {
      onMsg({ kind: "err", text: "La déliaison n'a pas abouti. Réessayez dans un instant." });
    } finally {
      setBusy(false);
    }
  }

  if (!disponible) {
    return (
      <div style={{ padding: "12px 0", borderBottom: `1px solid ${T.line}` }}>
        <div style={{ fontSize: 12.5, fontWeight: 600 }}>Telegram</div>
        <div style={{ fontSize: 10.5, color: T.mut, lineHeight: 1.5, marginTop: 3 }}>
          Ce canal n'est pas activé sur la plateforme pour le moment.
        </div>
      </div>
    );
  }

  if (etape === "liee") {
    return (
      <div style={{ padding: "12px 0", borderBottom: `1px solid ${T.line}` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, display: "flex", alignItems: "center", gap: 7 }}>
              Telegram
              <Etiquette ton="ok">Lié</Etiquette>
            </div>
            <div style={{ fontSize: 10.5, color: T.mut, lineHeight: 1.5, marginTop: 3 }}>
              Vos notifications peuvent être envoyées dans votre conversation avec le robot ADSUM.
            </div>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => void delier()}
            style={{ border: `1px solid ${T.line}`, background: T.surf, color: T.mut, borderRadius: 10, padding: "8px 13px", fontSize: 11.5, fontWeight: 600, cursor: busy ? "default" : "pointer" }}
          >
            Délier
          </button>
        </div>
      </div>
    );
  }

  const minutes = Math.floor(restant / 60);
  const secondes = restant % 60;

  return (
    <div style={{ padding: "12px 0", borderBottom: `1px solid ${T.line}` }}>
      <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 2 }}>Telegram</div>
      <div style={{ fontSize: 10.5, color: T.mut, lineHeight: 1.5, marginBottom: 10 }}>
        Recevez vos notifications ADSUM dans Telegram. Trois étapes, une minute.
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "8px 0" }}>
        <Puce n={1} actif={etape === "depart"} fait={etape !== "depart"} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 600 }}>Ouvrir la conversation ADSUM</div>
          <div style={{ fontSize: 10.5, color: T.mut, lineHeight: 1.5, marginTop: 2 }}>
            Telegram s'ouvre sur le robot ADSUM. Appuyez sur Démarrer dans la conversation.
          </div>
          {etape === "depart" && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void ouvrirTelegram()}
              style={{ marginTop: 8, height: 40, width: "100%", borderRadius: 10, border: "none", background: T.b600, color: "#fff", fontSize: 12, fontWeight: 600, cursor: busy ? "default" : "pointer", opacity: busy ? 0.7 : 1 }}
            >
              Ouvrir Telegram
            </button>
          )}
          {etape !== "depart" && deepLink && (
            <a
              href={deepLink}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: "inline-block", marginTop: 6, fontSize: 10.5, color: T.b600, textDecoration: "underline" }}
            >
              Rouvrir le lien Telegram
            </a>
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "8px 0" }}>
        <Puce n={2} actif={etape === "ouvrir"} fait={etape === "code"} />
        <div style={{ flex: 1, opacity: etape === "depart" ? 0.5 : 1 }}>
          <div style={{ fontSize: 12, fontWeight: 600 }}>Revenir ici et recevoir le code</div>
          <div style={{ fontSize: 10.5, color: T.mut, lineHeight: 1.5, marginTop: 2 }}>
            Le robot vous envoie un code à 6 chiffres, dans Telegram. Il prouve que la conversation est bien la vôtre.
          </div>
          {etape === "ouvrir" && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void detecter()}
              style={{ marginTop: 8, height: 40, width: "100%", borderRadius: 10, border: `1px solid ${T.b600}`, background: "transparent", color: T.b600, fontSize: 12, fontWeight: 600, cursor: busy ? "default" : "pointer", opacity: busy ? 0.7 : 1 }}
            >
              {busy ? "Détection en cours" : "J'ai appuyé sur Démarrer, envoyez le code"}
            </button>
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "8px 0" }}>
        <Puce n={3} actif={etape === "code"} fait={false} />
        <div style={{ flex: 1, opacity: etape === "code" ? 1 : 0.5 }}>
          <div style={{ fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 7 }}>
            Saisir le code reçu
            {etape === "code" && restant > 0 && (
              <Etiquette ton="attente">{`Valide ${minutes}:${String(secondes).padStart(2, "0")}`}</Etiquette>
            )}
            {etape === "code" && restant === 0 && <Etiquette ton="neutre">Expiré</Etiquette>}
          </div>
          {etape === "code" && (
            <>
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="000000"
                  aria-label="Code de liaison Telegram"
                  style={{ flex: 1, height: 42, border: `1px solid ${T.line}`, borderRadius: 10, padding: "0 12px", fontSize: 16, letterSpacing: 4, textAlign: "center", background: T.surf, color: T.ink }}
                />
                <button
                  type="button"
                  disabled={busy || code.length < 6 || restant === 0}
                  onClick={() => void confirmer()}
                  style={{ padding: "0 16px", height: 42, borderRadius: 10, border: "none", background: T.b600, color: "#fff", fontSize: 12, fontWeight: 600, cursor: busy || code.length < 6 ? "default" : "pointer", opacity: busy || code.length < 6 || restant === 0 ? 0.6 : 1 }}
                >
                  Confirmer
                </button>
              </div>
              <div style={{ fontSize: 10, color: T.faint, marginTop: 5 }}>
                {essais > 0 ? `${essais} ${essais > 1 ? "essais restants" : "essai restant"}.` : ""} Vous ne recevez rien ?{" "}
                <button
                  type="button"
                  onClick={() => void detecter()}
                  style={{ border: "none", background: "none", color: T.b600, fontSize: 10, padding: 0, textDecoration: "underline", cursor: "pointer" }}
                >
                  Renvoyer un code
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {detail && (
        <p style={{ fontSize: 10.5, color: T.mut, lineHeight: 1.5, background: T.bg, border: `1px solid ${T.line}`, borderRadius: 10, padding: 10, margin: "6px 0 0" }}>
          {detail}
        </p>
      )}
    </div>
  );
}
