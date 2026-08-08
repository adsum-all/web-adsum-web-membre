import { type ReactNode, useEffect, useState } from "react";

import {
  ApiError,
  type MotifAbsence,
  type ParticipationMembre,
  declarerParticipation,
  getMotifsAbsence,
  getParticipation,
} from "../api.js";
import { useT } from "../i18n.js";
import { T } from "../proto.js";

/**
 * Declaring participation in one activity.
 *
 * The form asks three questions in sequence, and each one only makes sense given the
 * previous answer. That order is the whole point of this screen.
 *
 * It used to ask one question with three options on the same footing: Présent, Suivi
 * partiel, Absent. Having followed and how much of it were collapsed into a single
 * choice, so somebody could answer "partial" and then say they were on site, which
 * means nothing: in the room you were there or you were not. That combination
 * produced a hundred and nine rows in production that nobody can interpret.
 *
 * So: did you follow this activity. Then, if you did and no scan already proves it,
 * how. Then, if online, in full or in part, because that is the only place where
 * following partially is a real thing that happens.
 *
 * A member the controller scanned is not asked any of it. Their presence is proven,
 * and offering them a form on which they could declare an absence would let a
 * declaration contradict a fact.
 *
 * Confirmed once: after validation the whole form locks, so a status, a rating or an
 * opinion can never be revisited.
 */
export function Participation({ token, eventId, flat = false }: { token: string; eventId: string; flat?: boolean }): JSX.Element | null {
  const [data, setData] = useState<ParticipationMembre | null>(null);
  const [aSuivi, setASuivi] = useState<boolean | null>(null);
  const [mode, setMode] = useState<"presentiel" | "en_ligne" | null>(null);
  const [niveau, setNiveau] = useState<"complet" | "partiel" | null>(null);
  const [motif, setMotif] = useState("");
  const [motifCommentaire, setMotifCommentaire] = useState("");
  const [motifs, setMotifs] = useState<MotifAbsence[]>([]);
  const [avis, setAvis] = useState("");
  const [note, setNote] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const t = useT();

  useEffect(() => {
    void getParticipation(token, eventId)
      .then((d) => {
        setData(d);
        // Restore a draft into the shape of the three questions.
        if (d.statut === "absent") setASuivi(false);
        else if (d.statut) setASuivi(true);
        if (d.modalite) setMode(d.modalite);
        if (d.statut === "partiel") setNiveau("partiel");
        else if (d.statut === "present" && d.modalite === "en_ligne") setNiveau("complet");
        // The evaluation is anonymous: a member's own rating and comment are never
        // read back to them, so those inputs always start empty.
      })
      .catch(() => undefined);
    // The catalogue is administrable, so it is fetched rather than hard-coded here.
    void getMotifsAbsence(token).then(setMotifs).catch(() => undefined);
  }, [token, eventId]);

  if (!data) return null;

  const locked = data.verrouille;
  const scanned = data.deja_scanne;

  // Before the activity starts, and with nothing recorded, the form is hidden: no
  // premature declaration, no dead card on an upcoming activity.
  if (!data.ouvert && !scanned && !locked) return null;

  if (data.cloture && !locked && !scanned && data.statut == null) {
    return (
      <Card flat={flat}>
        <Title text={t("part.title")} />
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: T.bg, border: `1px dashed ${T.line}`, borderRadius: 10, padding: "10px 12px" }}>
          <span style={{ color: T.mut, fontWeight: 700 }}>-</span>
          <span style={{ fontSize: 12.5, color: T.mut }}>{t("part.closed")}</span>
        </div>
      </Card>
    );
  }

  if (locked) {
    return (
      <Card flat={flat}>
        <Title text={t("part.recorded")} />
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: T.okbg, borderRadius: 10, padding: "10px 12px", marginBottom: 8 }}>
          <span style={{ color: T.ok, fontWeight: 700 }}>OK</span>
          <span style={{ fontSize: 12.5, color: T.ink }}>
            {t("part.yourStatus")} : <b>{resumeVerrouille(data, t)}</b>
          </span>
        </div>
        {data.deja_evalue && <p style={{ fontSize: 11, color: T.ok, margin: "0 0 6px" }}>{t("part.anonSaved")}</p>}
        <p style={{ fontSize: 11, color: T.faint, margin: 0 }}>{t("part.immutable")}</p>
      </Card>
    );
  }

  const motifChoisi = motifs.find((m) => m.code === motif);
  const commentaireManquant = Boolean(motifChoisi?.commentaire_requis) && !motifCommentaire.trim();

  // What must be answered before the form can be sent, question by question.
  const peutValider =
    scanned ||
    (aSuivi === false && !commentaireManquant) ||
    (aSuivi === true && mode === "presentiel") ||
    (aSuivi === true && mode === "en_ligne" && niveau !== null);

  const showFeedback = (scanned || aSuivi === true) && !data.deja_evalue;

  async function valider(): Promise<void> {
    setBusy(true);
    setMsg(null);
    try {
      const body: Parameters<typeof declarerParticipation>[2] = { valider: true };
      if (!scanned) {
        body.a_suivi = aSuivi ?? undefined;
        if (aSuivi === true && mode) body.mode_suivi = mode;
        // Only sent for an online follow: on site the question is not asked, and
        // sending it anyway is what the server now refuses.
        if (aSuivi === true && mode === "en_ligne" && niveau) body.niveau_en_ligne = niveau;
        if (aSuivi === false && motif) {
          body.absence_motif = motif;
          if (motifCommentaire.trim()) body.absence_commentaire = motifCommentaire.trim();
        }
      }
      if (avis.trim()) body.avis = avis.trim();
      if (note) body.note = note;
      await declarerParticipation(token, eventId, body);
      setData(await getParticipation(token, eventId));
    } catch (e) {
      // Never fail silently: the member must know why nothing happened. The server's
      // own reason is preferred, since it is the precise one.
      const raison =
        e instanceof ApiError && typeof e.detail === "string" && e.detail.trim()
          ? e.detail
          : e instanceof Error && e.message
            ? e.message
            : t("part.error");
      setMsg(raison);
      try {
        setData(await getParticipation(token, eventId));
      } catch {
        /* keep the current view if the refresh itself fails */
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card flat={flat}>
      <Title text={t("part.title")} />

      {scanned ? (
        <div style={{ background: T.okbg, borderRadius: 10, padding: "10px 12px", marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: T.ok, fontWeight: 700 }}>OK</span>
            <span style={{ fontSize: 12.5, color: T.ink }}>{t("part.scanned")}</span>
          </div>
          <div style={{ fontSize: 11, color: T.mut, marginTop: 4 }}>{t("part.modKnown")}</div>
        </div>
      ) : (
        <>
          <Question texte={t("part.qSuivi")} />
          <Choix
            options={[
              { valeur: "oui", label: t("part.oui"), aide: t("part.ouiHint") },
              { valeur: "non", label: t("part.non"), aide: t("part.nonHint") },
            ]}
            choisi={aSuivi === null ? null : aSuivi ? "oui" : "non"}
            onChoisir={(v) => {
              setASuivi(v === "oui");
              setMode(null);
              setNiveau(null);
              setMotif("");
              setMotifCommentaire("");
            }}
          />

          {aSuivi === true && (
            <>
              <Question texte={t("part.qMode")} />
              <Choix
                enLigne
                options={[
                  { valeur: "presentiel", label: t("part.modPresentiel") },
                  { valeur: "en_ligne", label: t("part.modEnLigne") },
                ]}
                choisi={mode}
                onChoisir={(v) => {
                  setMode(v as "presentiel" | "en_ligne");
                  setNiveau(null);
                }}
              />
              {mode === "presentiel" && (
                <p style={{ fontSize: 10.5, color: T.faint, margin: "6px 0 0", lineHeight: 1.5 }}>
                  {t("part.declareeNote")}
                </p>
              )}
            </>
          )}

          {/* Only online. On site there is no degree of presence to report. */}
          {aSuivi === true && mode === "en_ligne" && (
            <>
              <Question texte={t("part.qNiveau")} />
              <Choix
                options={[
                  { valeur: "complet", label: t("part.enEntier") },
                  { valeur: "partiel", label: t("part.unePartie") },
                ]}
                choisi={niveau}
                onChoisir={(v) => setNiveau(v as "complet" | "partiel")}
              />
              <p style={{ fontSize: 10.5, color: T.faint, margin: "6px 0 0", lineHeight: 1.5 }}>
                {t("part.niveauHint")}
              </p>
            </>
          )}

          {aSuivi === false && (
            <>
              <Question texte={t("part.qMotif")} />
              <select
                value={motif}
                onChange={(e) => setMotif(e.target.value)}
                style={{ width: "100%", border: `1px solid ${T.line}`, borderRadius: 9, padding: "10px 9px", fontSize: 13, background: T.surf, color: T.ink, boxSizing: "border-box" }}
              >
                <option value="">{t("part.motifAucun")}</option>
                {motifs.map((m) => (
                  <option key={m.code} value={m.code}>{m.libelle}</option>
                ))}
              </select>
              {motifChoisi?.commentaire_requis && (
                <textarea
                  value={motifCommentaire}
                  onChange={(e) => setMotifCommentaire(e.target.value)}
                  rows={2}
                  placeholder={t("part.motifPrecision")}
                  style={{ width: "100%", marginTop: 6, border: `1px solid ${commentaireManquant ? T.dng : T.line}`, borderRadius: 9, padding: 8, fontSize: 13, resize: "vertical", boxSizing: "border-box" }}
                />
              )}
              {/* Said before sending, not discovered afterwards: giving a reason is a
                  request, and somebody else decides what it is worth. */}
              <p style={{ fontSize: 10.5, color: T.faint, margin: "6px 0 0", lineHeight: 1.5 }}>
                {t("part.absenceNote")}
              </p>
            </>
          )}
        </>
      )}

      {showFeedback && (
        <div style={{ marginTop: 12 }}>
          <p style={{ fontSize: 10.5, color: T.ok, background: T.okbg, border: `1px solid ${T.ok}`, borderRadius: 9, padding: "7px 9px", margin: "0 0 8px", lineHeight: 1.5 }}>
            {t("part.anonNoticeA")}
            <strong>{t("part.anonNoticeBold")}</strong>
            {t("part.anonNoticeB")}
          </p>
          <div style={{ fontSize: 11, color: T.mut, marginBottom: 4 }}>{t("part.yourRating")}</div>
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setNote(n)}
                style={{ width: 36, height: 36, borderRadius: 9, border: `1px solid ${note === n ? T.b600 : T.line}`, background: note === n ? T.b600 : T.surf, color: note === n ? "#fff" : T.ink, fontWeight: 600 }}
              >
                {n}
              </button>
            ))}
          </div>
          <textarea
            value={avis}
            onChange={(e) => setAvis(e.target.value)}
            rows={2}
            placeholder={t("part.opinion")}
            style={{ width: "100%", border: `1px solid ${T.line}`, borderRadius: 9, padding: 8, fontSize: 13, resize: "vertical", boxSizing: "border-box" }}
          />
        </div>
      )}

      {msg && <p style={{ fontSize: 11.5, color: T.dng, margin: "8px 0 0" }}>{msg}</p>}
      <p style={{ fontSize: 10.5, color: T.faint, margin: "8px 0 6px" }}>
        {t("part.confirmOnce")}
        {data.cloture_le
          ? ` ${t("part.openUntil").replace("{d}", new Date(data.cloture_le).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }))}`
          : ""}
      </p>

      <button
        type="button"
        disabled={busy || !peutValider}
        onClick={() => void valider()}
        className="tap"
        style={{ width: "100%", height: 44, borderRadius: 11, border: "none", background: `linear-gradient(180deg,${T.b500},${T.b600})`, color: "#fff", fontWeight: 600, fontSize: 13.5, opacity: busy || !peutValider ? 0.6 : 1 }}
      >
        {busy ? t("part.sending") : scanned ? t("part.validateOpinion") : t("part.validate")}
      </button>
    </Card>
  );
}

/** What the member sees once the answer is final, in the vocabulary they answered in. */
function resumeVerrouille(d: ParticipationMembre, t: (k: string) => string): string {
  if (d.source === "scan") return t("part.resumeScan");
  if (d.statut === "absent") return t("part.resumeAbsent");
  if (d.statut === "partiel") return t("part.resumePartiel");
  if (d.modalite === "en_ligne") return t("part.resumeEnLigne");
  return t("part.resumePresentiel");
}

function Question({ texte }: { texte: string }): JSX.Element {
  return <p style={{ fontSize: 12.5, fontWeight: 600, color: T.ink, margin: "12px 0 7px" }}>{texte}</p>;
}

function Choix({
  options,
  choisi,
  onChoisir,
  enLigne = false,
}: {
  options: { valeur: string; label: string; aide?: string }[];
  choisi: string | null;
  onChoisir: (v: string) => void;
  enLigne?: boolean;
}): JSX.Element {
  return (
    <div style={{ display: "flex", flexDirection: enLigne ? "row" : "column", gap: 8 }}>
      {options.map((o) => (
        <div
          key={o.valeur}
          onClick={() => onChoisir(o.valeur)}
          className="tap"
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onChoisir(o.valeur); }}
          style={{
            flex: enLigne ? 1 : undefined,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "11px 13px",
            borderRadius: 11,
            border: `1.5px solid ${choisi === o.valeur ? T.b600 : T.line}`,
            background: choisi === o.valeur ? T.b600 : T.surf,
            color: choisi === o.valeur ? "#fff" : T.ink,
            cursor: "pointer",
          }}
        >
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 600 }}>{o.label}</div>
            {o.aide && (
              <div style={{ fontSize: 10.5, color: choisi === o.valeur ? "rgba(255,255,255,.85)" : T.mut }}>{o.aide}</div>
            )}
          </div>
          {!enLigne && <span style={{ fontSize: 15 }}>{choisi === o.valeur ? "●" : "○"}</span>}
        </div>
      ))}
    </div>
  );
}

function Card({ children, flat }: { children: ReactNode; flat?: boolean }): JSX.Element {
  // Flat variant for when the module is nested inside an already-bordered activity
  // card: a top rule and inset rather than a second frame.
  const style = flat
    ? { borderTop: `1px solid ${T.line}`, paddingTop: 12, marginTop: 4 }
    : { background: T.surf, border: `1px solid ${T.line}`, borderRadius: 12, padding: 12, marginTop: 6 };
  return <div style={style}>{children}</div>;
}

function Title({ text }: { text: string }): JSX.Element {
  return <p style={{ fontSize: 12.5, fontWeight: 700, color: T.ink, margin: "0 0 8px", fontFamily: T.fd }}>{text}</p>;
}
