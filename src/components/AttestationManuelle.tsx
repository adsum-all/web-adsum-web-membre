import { useEffect, useRef, useState } from "react";

import { type AttestationInfo, getAttestation, uploadAttestation, uploadDocument } from "../api.js";
import { useT } from "../i18n.js";
import { attestationPdf, downloadBlob, printBlob } from "../pdf.js";
import { useMarque } from "../useMarque.js";
import { T } from "../proto.js";
import { useResource } from "../useResource.js";

// Statuts pour lesquels la tache est consideree comme terminee cote membre.
const DONE_STATUTS = new Set(["accepted", "not_required"]);

function joursRestants(echeance: string | null): number | null {
  if (!echeance) return null;
  const cible = new Date(`${echeance}T00:00:00`);
  if (Number.isNaN(cible.getTime())) return null;
  const now = new Date();
  const debutJour = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffMs = cible.getTime() - debutJour.getTime();
  return Math.round(diffMs / 86_400_000);
}

/** Turn an organisation name into something safe to save on any filesystem.
 *
 *  Accents are folded rather than dropped so "Paroisse Sainte-Thérèse" becomes
 *  "Paroisse-Sainte-Therese" and not "Paroisse-Sainte-Thrse". Anything left that is
 *  neither a letter, a digit nor a dash goes, because Windows refuses several of the
 *  punctuation marks an organisation may legitimately carry in its name.
 */
function nomDeFichier(organisation: string): string {
  // Built from escapes rather than written as a literal range: the combining marks
  // are invisible in an editor, so a stray keystroke inside them would silently stop
  // folding accents and nobody would see why.
  const marquesCombinantes = new RegExp("[\\u0300-\\u036f]", "g");
  const sansAccent = organisation.normalize("NFD").replace(marquesCombinantes, "");
  const propre = sansAccent.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return propre || "Attestation";
}

// Download and print happen entirely inside the app (a real PDF built in the
// browser, then a Blob download or a hidden-iframe print): never a new page.
//
// The organisation is passed in rather than written here: the file lands in the
// member's downloads folder, where a name from another organisation is the most
// visible way this product could betray whose platform it is.
function telechargerAttestation(titre: string, texte: string, organisation: string): void {
  downloadBlob(attestationPdf(titre, texte), `Attestation-${nomDeFichier(organisation)}.pdf`);
}
function imprimerAttestation(titre: string, texte: string): void {
  printBlob(attestationPdf(titre, texte));
}

function StatusBadge({ info, t }: { info: AttestationInfo; t: (k: string) => string }): JSX.Element {
  const map: Record<string, { key: string; bg: string; fg: string; bd: string }> = {
    under_review: { key: "attest.statusUnderReview", bg: T.okbg, fg: T.ok, bd: T.ok },
    rejected: { key: "attest.statusRejected", bg: T.tintr, fg: T.dng, bd: T.dng },
    reminded: { key: "attest.statusReminded", bg: T.warnbg, fg: T.warn, bd: T.warn },
    overdue: { key: "attest.statusOverdue", bg: T.tintr, fg: T.dng, bd: T.dng },
  };
  const meta = map[info.statut] ?? { key: "attest.statusAwaiting", bg: T.warnbg, fg: T.warn, bd: T.warn };
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: 11,
        fontWeight: 600,
        padding: "4px 11px",
        borderRadius: 20,
        background: meta.bg,
        color: meta.fg,
        border: `1px solid ${meta.bd}`,
      }}
    >
      {t(meta.key)}
    </span>
  );
}

function Echeance({ echeance, t }: { echeance: string | null; t: (k: string) => string }): JSX.Element {
  const restant = joursRestants(echeance);
  let libelle: string;
  let couleur: string = T.mut;
  if (echeance == null || restant == null) {
    libelle = t("attest.noDeadline");
  } else if (restant > 0) {
    libelle = t("attest.daysLeft").replace("{n}", String(restant));
  } else if (restant === 0) {
    libelle = t("attest.dueToday");
    couleur = T.warn;
  } else {
    libelle = t("attest.overdueBy").replace("{n}", String(-restant));
    couleur = T.dng;
  }
  return (
    <div style={{ fontSize: 12, color: couleur, marginTop: 6 }}>
      <span style={{ color: T.mut }}>{t("attest.deadline")} : </span>
      <strong>{echeance ?? "-"}</strong>
      {echeance && <span> · {libelle}</span>}
    </div>
  );
}

export function AttestationManuelle({ token }: { token: string }): JSX.Element | null {
  const marque = useMarque();
  const res = useResource<AttestationInfo>(() => getAttestation(token), [token]);
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<AttestationInfo | null>(null);
  // The full attestation flow opens in a modal so the card and its QR stay in
  // the fold: only a compact one-line banner sits above the card.
  const [open, setOpen] = useState(false);
  const t = useT();

  // The administration decides on its own side: refresh the task periodically
  // so the member never keeps looking at a stale state (e.g. still "under
  // review" after the decision) without reloading the page.
  useEffect(() => {
    const t = window.setInterval(() => {
      getAttestation(token).then(setInfo).catch(() => undefined);
    }, 15000);
    return () => window.clearInterval(t);
  }, [token]);

  const current = info ?? res.data;
  if (!current || !current.requise || DONE_STATUTS.has(current.statut)) return null;

  const rejected = current.statut === "rejected";
  // Once the signed scan is transmitted, nothing is expected from the member:
  // the card switches to a follow-up view (no upload zone, no send button).
  const sent = current.statut === "under_review";

  async function envoyer(): Promise<void> {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const documentId = await uploadDocument(token, "attestation", file);
      const maj = await uploadAttestation(token, documentId);
      setInfo(maj);
      setFile(null);
    } catch {
      setError(t("attest.error"));
    } finally {
      setBusy(false);
    }
  }

  const badge = <StatusBadge info={current} t={t} />;
  // Closed: a compact one-line banner, so the card and its QR stay in the fold.
  if (!open) {
    return (
      <button
        type="button"
        className="tap"
        onClick={() => setOpen(true)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          background: T.surf,
          border: `1px solid ${rejected ? T.dng : T.warn}`,
          borderRadius: 14,
          padding: "11px 13px",
          marginBottom: 14,
          textAlign: "left",
        }}
      >
        <span
          style={{
            fontFamily: T.fd,
            fontWeight: 700,
            fontSize: 13.5,
            color: T.ink,
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {t("attest.title")}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {badge}
          <span style={{ fontSize: 12, fontWeight: 600, color: T.b600 }}>{t("attest.open")}</span>
        </span>
      </button>
    );
  }

  // Open: the full flow in a modal, scrollable on its own, over the card.
  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={() => setOpen(false)}
      style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(9,12,20,0.45)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: T.surf,
          width: "min(480px, 100%)",
          maxHeight: "92dvh",
          overflowY: "auto",
          borderRadius: "18px 18px 0 0",
          padding: 14,
          textAlign: "left",
        }}
      >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ fontFamily: T.fd, fontWeight: 700, fontSize: 14, color: T.ink }}>{t("attest.title")}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {badge}
          <button type="button" className="tap" onClick={() => setOpen(false)} aria-label={t("common.close")} style={{ fontSize: 18, color: T.mut, lineHeight: 1, background: "none", border: "none" }}>
            ✕
          </button>
        </div>
      </div>

      {!sent && <Echeance echeance={current.echeance} t={t} />}

      {sent && (
        <div style={{ margin: "10px 0 2px" }}>
          {[
            { label: current.soumise_le ? t("attest.sentOn").replace("{d}", current.soumise_le) : t("attest.sent"), state: "done" as const },
            { label: t("attest.stepReview"), state: "current" as const },
            { label: t("attest.stepDecision"), state: "todo" as const },
          ].map((s) => (
            <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 9, padding: "5px 0" }}>
              <span
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: "50%",
                  flexShrink: 0,
                  background: s.state === "done" ? T.ok : s.state === "current" ? T.b600 : T.bg,
                  border: `2px solid ${s.state === "done" ? T.ok : s.state === "current" ? T.b600 : T.line}`,
                  color: "#fff",
                  fontSize: 9,
                  lineHeight: "12px",
                  fontWeight: 700,
                  textAlign: "center",
                }}
              >
                {s.state === "done" ? "✓" : ""}
              </span>
              <span style={{ fontSize: 12, fontWeight: s.state === "current" ? 700 : 500, color: s.state === "todo" ? T.mut : T.ink }}>
                {s.label}
              </span>
            </div>
          ))}
          <p style={{ fontSize: 11.5, color: T.ok, background: T.okbg, border: `1px solid ${T.ok}`, borderRadius: 11, padding: 10, margin: "8px 0 0", lineHeight: 1.5 }}>
            {t("attest.noAction")}
          </p>
        </div>
      )}

      {!sent && <p style={{ fontSize: 11.5, color: T.mut, lineHeight: 1.5, margin: "8px 0 0" }}>{t("attest.intro")}</p>}

      {rejected && (
        <p
          style={{
            background: T.tintr,
            border: `1px solid ${T.tintrl}`,
            borderRadius: 11,
            padding: 10,
            fontSize: 11.5,
            color: T.tintrf,
            margin: "10px 0 0",
          }}
        >
          {t("attest.rejectedHint")}
          {current.motif_rejet ? ` ${t("attest.motif").replace("{m}", current.motif_rejet)}` : ""}
        </p>
      )}

      {sent ? null : (
      <>


      <div
        style={{
          background: T.bg,
          border: `1px solid ${T.line}`,
          borderRadius: 11,
          padding: 11,
          margin: "12px 0",
          maxHeight: 150,
          overflow: "auto",
        }}
      >
        <div style={{ fontSize: 10.5, fontWeight: 600, color: T.mut, marginBottom: 5 }}>
          {t("attest.documentTitle")}
        </div>
        <pre
          style={{
            whiteSpace: "pre-wrap",
            fontFamily: T.fu,
            fontSize: 11.5,
            color: T.ink,
            margin: 0,
            lineHeight: 1.5,
          }}
        >
          {current.texte}
        </pre>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <div
          onClick={() => telechargerAttestation(t("attest.title"), current.texte, marque.organisation)}
          className="tap"
          style={{
            flex: 1,
            height: 42,
            border: `1.5px solid ${T.b600}`,
            borderRadius: 12,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 12.5,
            fontWeight: 600,
            color: T.b600,
          }}
        >
          {t("attest.downloadPdf")}
        </div>
        <div
          onClick={() => imprimerAttestation(t("attest.title"), current.texte)}
          className="tap"
          style={{
            flex: 1,
            height: 42,
            border: `1.5px solid ${T.b600}`,
            borderRadius: 12,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 12.5,
            fontWeight: 600,
            color: T.b600,
          }}
        >
          {t("attest.print")}
        </div>
      </div>

      <div style={{ fontSize: 11, fontWeight: 600, color: T.mut, marginBottom: 8 }}>{t("attest.uploadTitle")}</div>

      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png"
        style={{ display: "none" }}
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
      />
      <div
        onClick={() => inputRef.current?.click()}
        className="tap"
        style={{ border: `1.5px dashed ${T.b400}`, borderRadius: 12, padding: 16, textAlign: "center", marginBottom: 10 }}
      >
        <div style={{ fontSize: 22, marginBottom: 5 }}>⬆</div>
        <div style={{ fontSize: 12, fontWeight: 600 }}>{t("attest.uploadZone")}</div>
        <div style={{ fontSize: 10, color: T.mut, marginTop: 3 }}>{t("attest.uploadHint")}</div>
      </div>

      {file && (
        <div
          style={{
            background: T.surf,
            border: `1px solid ${T.line}`,
            borderRadius: 11,
            padding: 10,
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 10,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 11.5,
                fontWeight: 600,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {file.name}
            </div>
            <div style={{ fontSize: 10, color: T.ok }}>{t("attest.ready")}</div>
          </div>
          <span onClick={() => setFile(null)} className="tap" style={{ color: T.mut }}>
            ✕
          </span>
        </div>
      )}

      {error && <p style={{ color: T.dng, fontSize: 11.5, margin: "0 0 8px" }}>{error}</p>}

      <div
        onClick={file && !busy ? () => void envoyer() : undefined}
        className="tap"
        style={{
          height: 46,
          background: !file || busy ? T.faint : T.b600,
          borderRadius: 12,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#fff",
          fontWeight: 600,
          fontSize: 13,
          opacity: !file || busy ? 0.7 : 1,
        }}
      >
        {busy ? t("attest.sending") : t("attest.send")}
      </div>
      </>
      )}
      </div>
    </div>
  );
}
