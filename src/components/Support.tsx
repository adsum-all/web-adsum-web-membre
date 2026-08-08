import { useEffect, useState } from "react";

import {
  ApiError,
  completerDemandeSupport,
  getCategoriesSupport,
  getDemandeSupport,
  getDemandesSupport,
  ouvrirDemandeSupport,
  type DemandeSupport,
  type EchangeSupport,
} from "../api.js";
import { useT } from "../i18n.js";
import { T } from "../proto.js";
import { EmptyState } from "./ui.js";

/**
 * Contacting support, from inside the application.
 *
 * A member who hits a problem had nowhere to go: their message reached a personal
 * mailbox or nobody. This works without any mailbox at all, which matters because a
 * support address can be full, misconfigured, or not yet created, and a person must
 * still be able to reach someone.
 *
 * The member never meets a state machine. A request is open or it is answered; the
 * priority, the assignee and the internal statuses belong to the people handling it.
 */
export function Support({ token }: { token: string }): JSX.Element {
  const t = useT();
  const [demandes, setDemandes] = useState<DemandeSupport[] | null>(null);
  const [categories, setCategories] = useState<{ code: string; libelle: string }[]>([]);
  const [ouverte, setOuverte] = useState<string | null>(null);
  const [echanges, setEchanges] = useState<EchangeSupport[]>([]);
  const [redaction, setRedaction] = useState(false);
  const [sujet, setSujet] = useState("");
  const [message, setMessage] = useState("");
  const [categorie, setCategorie] = useState("autre");
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function recharger(): Promise<void> {
    try {
      setDemandes(await getDemandesSupport(token));
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : t("sup.erreurReseau"));
    }
  }

  useEffect(() => {
    void recharger();
    void getCategoriesSupport(token).then(setCategories).catch(() => undefined);
  }, [token]);

  async function ouvrirFil(id: string): Promise<void> {
    setOuverte(id);
    setErreur(null);
    try {
      const d = await getDemandeSupport(token, id);
      setEchanges(d.echanges);
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : t("sup.erreurReseau"));
    }
  }

  async function envoyer(): Promise<void> {
    setBusy(true);
    setErreur(null);
    setNote(null);
    try {
      const r = await ouvrirDemandeSupport(token, { sujet: sujet.trim(), message: message.trim(), categorie });
      setNote(`${t("sup.envoyee")} ${r.reference}`);
      setSujet("");
      setMessage("");
      setRedaction(false);
      await recharger();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : t("sup.erreurReseau"));
    } finally {
      setBusy(false);
    }
  }

  async function completer(id: string, texte: string): Promise<void> {
    setBusy(true);
    setErreur(null);
    try {
      await completerDemandeSupport(token, id, texte.trim());
      await ouvrirFil(id);
      await recharger();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : t("sup.erreurReseau"));
    } finally {
      setBusy(false);
    }
  }

  if (ouverte) {
    const fil = (demandes ?? []).find((d) => d.id === ouverte);
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <button type="button" className="tap" onClick={() => setOuverte(null)} style={boutonRetour}>
          {t("sup.retour")}
        </button>
        {fil && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <strong style={{ fontSize: 15 }}>{fil.sujet}</strong>
            <span style={{ fontSize: 12, color: T.mut }}>
              {fil.reference} · {fil.ouvert ? t("sup.enCours") : t("sup.close")}
            </span>
          </div>
        )}
        {erreur && <p style={alerte}>{erreur}</p>}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {echanges.map((e) => (
            <div key={e.id} style={e.entrant ? bulleMoi : bulleSupport}>
              <span style={{ fontSize: 11, color: T.mut }}>
                {e.entrant ? t("sup.vous") : t("sup.equipe")}
              </span>
              <p style={{ margin: "2px 0 0", fontSize: 14, whiteSpace: "pre-wrap" }}>{e.corps}</p>
            </div>
          ))}
        </div>
        {fil?.ouvert && <Ajout busy={busy} onEnvoyer={(texte) => void completer(fil.id, texte)} />}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {erreur && <p style={alerte}>{erreur}</p>}
      {note && <p style={succes}>{note}</p>}

      {!redaction && (
        <button type="button" className="tap" onClick={() => setRedaction(true)} style={boutonPrincipal}>
          {t("sup.nouvelle")}
        </button>
      )}

      {redaction && (
        <div style={carte}>
          <label style={champ}>
            <span style={libelle}>{t("sup.champCategorie")}</span>
            <select value={categorie} onChange={(e) => setCategorie(e.target.value)} style={saisie}>
              {categories.map((c) => (
                <option key={c.code} value={c.code}>{c.libelle}</option>
              ))}
            </select>
          </label>
          <label style={champ}>
            <span style={libelle}>{t("sup.champSujet")}</span>
            <input value={sujet} onChange={(e) => setSujet(e.target.value)} style={saisie} maxLength={160} />
          </label>
          <label style={champ}>
            <span style={libelle}>{t("sup.champMessage")}</span>
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={5} style={saisie} maxLength={8000} />
            <span style={{ fontSize: 11, color: T.mut }}>{t("sup.aideMessage")}</span>
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              className="tap"
              disabled={busy || sujet.trim().length < 3 || message.trim().length < 10}
              onClick={() => void envoyer()}
              style={boutonPrincipal}
            >
              {t("sup.envoyer")}
            </button>
            <button type="button" className="tap" onClick={() => setRedaction(false)} style={boutonRetour}>
              {t("sup.annuler")}
            </button>
          </div>
        </div>
      )}

      {demandes !== null && demandes.length === 0 && !redaction && (
        <EmptyState variant="empty" title={t("sup.aucuneTitre")} text={t("sup.aucuneTexte")} />
      )}

      {(demandes ?? []).map((d) => (
        <button key={d.id} type="button" className="tap" onClick={() => void ouvrirFil(d.id)} style={ligne}>
          <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2 }}>
            <strong style={{ fontSize: 14 }}>{d.sujet}</strong>
            <span style={{ fontSize: 12, color: T.mut }}>
              {d.reference} · {d.ouvert ? t("sup.enCours") : t("sup.close")}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}

/** Adding to a conversation, kept separate so its draft never leaks into a new request. */
function Ajout({ busy, onEnvoyer }: { busy: boolean; onEnvoyer: (texte: string) => void }): JSX.Element {
  const t = useT();
  const [texte, setTexte] = useState("");
  return (
    <div style={carte}>
      <textarea
        value={texte}
        onChange={(e) => setTexte(e.target.value)}
        rows={3}
        style={saisie}
        placeholder={t("sup.champMessage")}
        maxLength={8000}
      />
      <button
        type="button"
        className="tap"
        disabled={busy || texte.trim().length < 2}
        onClick={() => {
          onEnvoyer(texte);
          setTexte("");
        }}
        style={boutonPrincipal}
      >
        {t("sup.envoyer")}
      </button>
    </div>
  );
}

const carte: React.CSSProperties = {
  display: "flex", flexDirection: "column", gap: 10,
  background: T.surf, border: `1px solid ${T.line}`, borderRadius: 12, padding: 14,
};
const champ: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 4 };
const libelle: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: T.ink };
const saisie: React.CSSProperties = {
  width: "100%", padding: "9px 11px", borderRadius: 10,
  border: `1px solid ${T.line}`, background: T.bg, color: T.ink, font: "inherit", fontSize: 14,
};
const boutonPrincipal: React.CSSProperties = {
  padding: "10px 14px", borderRadius: 10, border: "none",
  background: T.b600, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer",
};
const boutonRetour: React.CSSProperties = {
  padding: "10px 14px", borderRadius: 10, border: `1px solid ${T.line}`,
  background: "none", color: T.ink, fontSize: 13, fontWeight: 600, cursor: "pointer",
};
const ligne: React.CSSProperties = {
  display: "flex", justifyContent: "space-between", alignItems: "center",
  width: "100%", padding: "12px 14px", borderRadius: 12,
  border: `1px solid ${T.line}`, background: T.surf, cursor: "pointer", textAlign: "left",
};
const bulleMoi: React.CSSProperties = {
  alignSelf: "flex-end", maxWidth: "88%", padding: "9px 12px", borderRadius: "12px 12px 3px 12px",
  background: T.b600, color: "#fff",
};
const bulleSupport: React.CSSProperties = {
  alignSelf: "flex-start", maxWidth: "88%", padding: "9px 12px", borderRadius: "12px 12px 12px 3px",
  background: T.surf, border: `1px solid ${T.line}`, color: T.ink,
};
const alerte: React.CSSProperties = {
  margin: 0, padding: "10px 12px", borderRadius: 10,
  background: T.tintr, color: T.tintrf, fontSize: 13,
};
const succes: React.CSSProperties = {
  margin: 0, padding: "10px 12px", borderRadius: 10,
  background: T.okbg, color: T.ok, fontSize: 13,
};
