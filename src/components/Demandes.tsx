import { useEffect, useRef, useState } from "react";

import {
  type CatalogueCategorie,
  type CatalogueSous,
  type DemandeDetail,
  type DemandeMessage,
  createDemande,
  getDemande,
  getDemandeCatalogue,
  getDemandes,
  sendDemandeMessage,
  uploadDocument,
} from "../api.js";
import { useT } from "../i18n.js";
import { T, gradient } from "../proto.js";
import { useResource } from "../useResource.js";

interface Badge {
  labelKey: string;
  bg: string;
  fg: string;
}
const DEFAULT_BADGE: Badge = { labelKey: "demandes.badgeOuverte", bg: T.warnbg, fg: T.warn };
const STATUT_BADGE: Record<string, Badge> = {
  ouverte: DEFAULT_BADGE,
  en_cours: { labelKey: "demandes.badgeEnCours", bg: T.tintb, fg: T.b600 },
  pieces_demandees: { labelKey: "demandes.badgePiecesDemandees", bg: T.warnbg, fg: T.warn },
  attente_membre: { labelKey: "demandes.badgeAttenteMembre", bg: T.warnbg, fg: T.warn },
  en_validation: { labelKey: "demandes.badgeEnValidation", bg: T.tintb, fg: T.b600 },
  resolue: { labelKey: "demandes.badgeResolue", bg: T.okbg, fg: T.ok },
  refusee: { labelKey: "demandes.badgeRefusee", bg: T.tintr, fg: T.dng },
};

function badgeFor(statut: string): Badge {
  return STATUT_BADGE[statut] ?? DEFAULT_BADGE;
}

function fmt(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** Step path of a request, so the member sees at a glance what has been done,
 * where the request stands now and what remains until it is closed. */
function Etapes({ d }: { d: DemandeDetail }): JSX.Element {
  const t = useT();
  const closed = d.statut === "resolue" || d.statut === "refusee";
  const enCharge = Boolean(d.pris_en_charge_le) || d.statut !== "ouverte";
  const traitementLabel: Record<string, string> = {
    en_cours: "demandes.traitEnCours",
    pieces_demandees: "demandes.traitPiecesAttendues",
    attente_membre: "demandes.traitReponseAttendue",
    en_validation: "demandes.badgeEnValidation",
  };
  const traitKey = traitementLabel[d.statut];
  const steps: { label: string; date?: string | null; state: "done" | "current" | "todo" }[] = [
    { label: t("demandes.etapeEnvoyee"), date: d.cree_le, state: "done" },
    {
      label: t("demandes.etapePriseEnCharge"),
      date: d.pris_en_charge_le,
      state: enCharge ? "done" : "current",
    },
    {
      label: traitKey ? t(traitKey) : t("demandes.traitFallback"),
      state: closed ? "done" : enCharge ? "current" : "todo",
    },
    {
      label: d.statut === "resolue" ? t("demandes.badgeResolue") : d.statut === "refusee" ? t("demandes.badgeRefusee") : t("demandes.etapeCloture"),
      date: d.clos_le,
      state: closed ? "done" : "todo",
    },
  ];
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 0, background: T.surf, border: `1px solid ${T.line}`, borderRadius: 12, padding: "10px 8px", margin: "6px 0 4px" }}>
      {steps.map((s, i) => {
        const color = s.state === "done" ? T.ok : s.state === "current" ? T.b600 : T.faint;
        return (
          <div key={s.label} style={{ flex: 1, textAlign: "center", position: "relative" }}>
            {i > 0 && (
              <div style={{ position: "absolute", left: "-50%", right: "50%", top: 8, height: 2, background: s.state === "todo" ? T.line : T.ok }} />
            )}
            <div style={{ position: "relative", width: 16, height: 16, margin: "0 auto", borderRadius: "50%", background: s.state === "todo" ? T.bg : color, border: `2px solid ${color}`, color: "#fff", fontSize: 9, lineHeight: "12px", fontWeight: 700 }}>
              {s.state === "done" ? "✓" : ""}
            </div>
            <div style={{ fontSize: 9.5, fontWeight: s.state === "current" ? 700 : 500, color: s.state === "todo" ? T.mut : T.ink, marginTop: 4, lineHeight: 1.25 }}>{s.label}</div>
            {s.date && <div style={{ fontSize: 8.5, color: T.mut }}>{fmt(s.date)}</div>}
          </div>
        );
      })}
    </div>
  );
}

export function Demandes({ token, focusId }: { token: string; focusId?: string | null }): JSX.Element {
  // When a reminder deep-links to a specific request, open its thread straight away.
  const [mode, setMode] = useState<"list" | "new" | "thread">(focusId ? "thread" : "list");
  const [openId, setOpenId] = useState<string | null>(focusId ?? null);

  if (mode === "new") return <NewDemande token={token} onDone={() => setMode("list")} onCancel={() => setMode("list")} />;
  if (mode === "thread" && openId)
    return <Thread token={token} id={openId} onBack={() => setMode("list")} />;
  return (
    <List
      token={token}
      onNew={() => setMode("new")}
      onOpen={(id) => {
        setOpenId(id);
        setMode("thread");
      }}
    />
  );
}

function List({ token, onNew, onOpen }: { token: string; onNew: () => void; onOpen: (id: string) => void }): JSX.Element {
  const t = useT();
  const { data, loading, error } = useResource(() => getDemandes(token), [token]);
  const list = data ?? [];

  return (
    <div className="scr" style={{ padding: "8px 18px 14px" }}>
      <div onClick={onNew} className="tap" style={{ height: 48, background: gradient, borderRadius: 13, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 600, fontSize: 14, marginBottom: 14, boxShadow: "0 10px 22px -10px rgba(42,79,173,.7)" }}>
        {t("demandes.newRequest")}
      </div>
      {loading && <p style={{ color: T.mut, fontSize: 13 }}>{t("common.loading")}</p>}
      {error && <p style={{ background: T.warnbg, border: `1px solid ${T.warn}`, borderRadius: 12, padding: 12, fontSize: 12, color: T.ink }}>{error}</p>}
      {!loading && list.length === 0 && !error && (
        <div style={{ background: T.surf, border: `1px solid ${T.line}`, borderRadius: 14, padding: 20, textAlign: "center", color: T.mut, fontSize: 13 }}>
          {t("demandes.empty")}
        </div>
      )}
      {list.map((d) => {
        const s = badgeFor(d.statut);
        return (
          <div key={d.id} onClick={() => onOpen(d.id)} className="tap" style={{ background: T.surf, border: `1px solid ${T.line}`, borderRadius: 14, padding: 13, marginBottom: 9, display: "flex", alignItems: "center", gap: 11 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: T.ink }}>{d.sujet}</div>
              <div style={{ fontSize: 10.5, color: T.mut }}>
                <span style={{ fontFamily: T.fm }}>{d.numero}</span> · {d.nb_messages} {t("demandes.messagesSuffix")} · {fmt(d.cree_le)}
              </div>
            </div>
            <span style={{ fontSize: 10, fontWeight: 600, padding: "4px 9px", borderRadius: 20, background: s.bg, color: s.fg }}>{t(s.labelKey)}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Guided creation: pick a category, pick a request, the subject and message
 * come prewritten (editable). No document needed to submit; the member can
 * attach one later inside the ticket thread. */
function NewDemande({ token, onDone, onCancel }: { token: string; onDone: () => void; onCancel: () => void }): JSX.Element {
  const t = useT();
  const catalogue = useResource(() => getDemandeCatalogue(token), [token]);
  const [cat, setCat] = useState<CatalogueCategorie | null>(null);
  const [sous, setSous] = useState<CatalogueSous | null>(null);
  const [sujet, setSujet] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function pick(c: CatalogueCategorie, s: CatalogueSous): void {
    setCat(c);
    setSous(s);
    setSujet(s.sujet);
    setMessage(s.message);
  }

  async function submit(): Promise<void> {
    if (!cat || !sous) {
      setError(t("demandes.pickTypeFirst"));
      return;
    }
    if (!sujet.trim() || !message.trim()) {
      setError(t("demandes.subjectMessageRequired"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createDemande(token, {
        type: cat.categorie === "autre" ? "autre" : "modification_info",
        sujet: sujet.trim(),
        message: message.trim(),
        categorie: cat.categorie,
        sous_categorie: sous.cle,
      });
      onDone();
    } catch {
      setError(t("common.sendError"));
    } finally {
      setBusy(false);
    }
  }

  const lbl = { fontFamily: T.fm, fontSize: 9, color: T.mut, margin: "12px 0 5px", display: "block" } as const;
  const inp = { width: "100%", border: `1px solid ${T.line}`, borderRadius: 11, padding: "11px 12px", fontSize: 13.5, fontFamily: T.fu, background: T.surf } as const;
  const cats = catalogue.data?.categories ?? [];

  return (
    <div className="scr" style={{ padding: "8px 18px 14px" }}>
      <span style={lbl}>{t("demandes.step1")}</span>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
        {cats.map((c) => (
          <div key={c.categorie} onClick={() => { setCat(c); setSous(null); }} className="tap" style={{ padding: "8px 12px", borderRadius: 10, fontSize: 12, border: `1.5px solid ${cat?.categorie === c.categorie ? T.b600 : T.line}`, background: cat?.categorie === c.categorie ? T.tintb : T.surf, color: cat?.categorie === c.categorie ? T.b600 : T.ink, fontWeight: cat?.categorie === c.categorie ? 600 : 400 }}>
            {c.libelle}
          </div>
        ))}
      </div>
      {cat && (
        <>
          <span style={lbl}>{t("demandes.step2")}</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {cat.sous.map((s) => (
              <div key={s.cle} onClick={() => pick(cat, s)} className="tap" style={{ padding: "10px 12px", borderRadius: 11, fontSize: 12.5, border: `1.5px solid ${sous?.cle === s.cle ? T.b600 : T.line}`, background: sous?.cle === s.cle ? T.tintb : T.surf, fontWeight: sous?.cle === s.cle ? 600 : 400 }}>
                {s.libelle}
              </div>
            ))}
          </div>
        </>
      )}
      {sous && (
        <>
          <span style={lbl}>{t("demandes.step3")}</span>
          <input value={sujet} onChange={(e) => setSujet(e.target.value)} style={inp} />
          <span style={lbl}>{t("demandes.step4")}</span>
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={5} style={{ ...inp, resize: "vertical" }} />
          <p style={{ fontSize: 11, color: T.mut, lineHeight: 1.5, margin: "8px 2px 0" }}>
            {sous.piece === "recommandée"
              ? t("demandes.pieceRecommended")
              : t("demandes.pieceOptional")}
          </p>
        </>
      )}
      {error && <p style={{ color: T.dng, fontSize: 12 }}>{error}</p>}
      {sous && (
        <div onClick={busy ? undefined : () => void submit()} className="tap" style={{ marginTop: 14, height: 48, background: busy ? T.faint : gradient, borderRadius: 13, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 600, fontSize: 14 }}>
          {busy ? t("common.sending") : t("demandes.send")}
        </div>
      )}
      <div onClick={onCancel} className="tap" style={{ textAlign: "center", padding: 12, color: T.mut, fontSize: 12.5 }}>{t("common.cancel")}</div>
    </div>
  );
}

function Thread({ token, id, onBack }: { token: string; id: string; onBack: () => void }): JSX.Element {
  const t = useT();
  const [detail, setDetail] = useState<DemandeDetail | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let alive = true;
    const load = (): void => {
      getDemande(token, id).then((d) => alive && setDetail(d)).catch(() => undefined);
    };
    load();
    const t = window.setInterval(load, 5000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, [token, id]);

  async function send(): Promise<void> {
    if (!draft.trim()) return;
    const corps = draft.trim();
    setDraft("");
    setBusy(true);
    try {
      const m = await sendDemandeMessage(token, id, corps);
      setDetail((prev) => (prev ? { ...prev, messages: [...prev.messages, m] } : prev));
    } finally {
      setBusy(false);
    }
  }

  async function joindre(file: File): Promise<void> {
    setBusy(true);
    setNote(null);
    try {
      const docId = await uploadDocument(token, "autre", file);
      const m = await sendDemandeMessage(token, id, t("demandes.attachmentPrefix").replace("{name}", file.name), docId);
      setDetail((prev) => (prev ? { ...prev, messages: [...prev.messages, m] } : prev));
      setNote(t("demandes.pieceSent"));
    } catch {
      setNote(t("demandes.pieceSendError"));
    } finally {
      setBusy(false);
    }
  }

  const s = detail ? badgeFor(detail.statut) : null;

  return (
    <div className="scr" style={{ padding: "8px 16px 14px", display: "flex", flexDirection: "column", height: "100%" }}>
      <div onClick={onBack} className="tap" style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
        <span style={{ fontSize: 20, color: T.mut }}>‹</span>
        <span style={{ fontSize: 14, fontWeight: 600 }}>{detail?.sujet ?? t("demandes.requestFallback")}</span>
        {s && <span style={{ marginLeft: "auto", fontSize: 10, fontWeight: 600, padding: "3px 9px", borderRadius: 20, background: s.bg, color: s.fg }}>{t(s.labelKey)}</span>}
      </div>
      {detail && (
        <div style={{ fontSize: 10, color: T.mut, margin: "0 0 4px 28px", fontFamily: T.fm }}>
          {detail.numero} · {t("demandes.openedOn").replace("{date}", fmt(detail.cree_le))}
          {detail.motif_cloture ? ` · ${t("demandes.motif").replace("{m}", detail.motif_cloture)}` : ""}
        </div>
      )}
      {detail && <Etapes d={detail} />}
      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 9, padding: "8px 2px" }}>
        {(detail?.messages ?? []).map((m: DemandeMessage) => {
          if (m.auteur_type === "systeme") {
            return (
              <div key={m.id} style={{ alignSelf: "center", maxWidth: "92%", textAlign: "center" }}>
                <span style={{ fontSize: 10.5, color: T.mut, background: T.bg, border: `1px dashed ${T.line}`, borderRadius: 10, padding: "4px 10px", display: "inline-block" }}>
                  {m.corps} · {fmt(m.cree_le)}
                </span>
              </div>
            );
          }
          const mine = m.auteur_type === "membre";
          return (
            <div key={m.id} style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "82%" }}>
              <div style={{ background: mine ? T.b600 : T.surf, color: mine ? "#fff" : T.ink, border: mine ? "none" : `1px solid ${T.line}`, borderRadius: 13, padding: "9px 12px", fontSize: 13, lineHeight: 1.45 }}>
                {m.corps}
                {m.document_id && <div style={{ fontSize: 10.5, marginTop: 4, opacity: 0.85 }}>{t("demandes.documentAttached")}</div>}
              </div>
              <div style={{ fontSize: 9, color: T.faint, margin: "3px 4px", textAlign: mine ? "right" : "left" }}>
                {mine ? t("demandes.you") : m.auteur_nom ?? t("demandes.administration")} · {fmt(m.cree_le)}
                {mine && m.lu_par_staff_le ? <span style={{ color: T.ok, fontWeight: 700 }}> · {t("demandes.readAt").replace("{date}", fmt(m.lu_par_staff_le))}</span> : mine ? ` · ${t("demandes.sentLabel")}` : ""}
              </div>
            </div>
          );
        })}
      </div>
      {detail?.statut === "pieces_demandees" && (
        <p style={{ fontSize: 11.5, color: T.warn, background: T.warnbg, border: `1px solid ${T.warn}`, borderRadius: 10, padding: "8px 10px", margin: "0 0 6px" }}>
          {t("demandes.awaitingPiece")}
        </p>
      )}
      {detail?.statut === "attente_membre" && (
        <p style={{ fontSize: 11.5, color: T.warn, background: T.warnbg, border: `1px solid ${T.warn}`, borderRadius: 10, padding: "8px 10px", margin: "0 0 6px" }}>
          {t("demandes.awaitingResponse")}
          {detail.echeance_reponse
            ? t("demandes.responseDeadline").replace("{date}", new Date(detail.echeance_reponse).toLocaleDateString("fr-FR"))
            : ""}
        </p>
      )}
      {(detail?.statut === "en_cours" || detail?.statut === "en_validation") && (
        <p style={{ fontSize: 11, color: T.mut, margin: "0 0 6px" }}>
          {t("demandes.noActionNeeded")}
        </p>
      )}
      {note && <p style={{ fontSize: 11, color: T.mut, margin: "0 0 4px" }}>{note}</p>}
      <div style={{ display: "flex", gap: 7, paddingTop: 8 }}>
        <input ref={fileRef} type="file" accept="image/*,.pdf" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) void joindre(f); e.target.value = ""; }} />
        <div onClick={busy ? undefined : () => fileRef.current?.click()} className="tap" title={t("demandes.attachTitle")} style={{ width: 46, borderRadius: 11, border: `1.5px solid ${T.line}`, background: T.surf, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, color: T.b600 }}>
          +
        </div>
        <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void send()} placeholder={t("demandes.messagePlaceholder")} style={{ flex: 1, border: `1px solid ${T.line}`, borderRadius: 11, padding: "11px 12px", fontSize: 13, fontFamily: T.fu, background: T.surf }} />
        <div onClick={() => void send()} className="tap" style={{ width: 48, borderRadius: 11, background: gradient, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", opacity: busy ? 0.6 : 1 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4z" /></svg>
        </div>
      </div>
    </div>
  );
}
