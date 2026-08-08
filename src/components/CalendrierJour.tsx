import { useEffect, useState } from "react";

import { type AnniversaireOut, type EvenementOut, type PieceEvenement, getEvenementPieces } from "../api.js";
import { useT } from "../i18n.js";
import { civilName } from "../name.js";
import { formatTime } from "../format.js";
import { T } from "../proto.js";

function isFormation(e: EvenementOut): boolean {
  const kind = `${e.type ?? ""} ${e.volet}`.toLowerCase();
  return kind.includes("formation");
}

function modeLabelKey(mode: string | null | undefined): string {
  return mode === "en_ligne" ? "part.modEnLigne" : mode === "hybride" ? "caljour.modeHybride" : "caljour.modePresentiel";
}

function phaseLabelKey(phase: string): string {
  if (phase === "en_cours") return "act.enCours";
  if (phase === "bientot") return "act.phaseBientot";
  // Without its own label this fell through to "à venir", telling the member an
  // activity that has already happened was still ahead of them.
  if (phase === "a_declarer") return "act.phaseADeclarer";
  if (phase === "termine") return "act.phaseTermine";
  return "act.aVenir";
}

/** The agenda list for the selected day: events first (primary), then a subtle
 * birthdays block. Kept as a separate component so Calendrier stays small. */
export function CalendrierJour({
  token,
  events,
  anniversaires,
  onJoin,
}: {
  token: string;
  events: EvenementOut[];
  anniversaires: AnniversaireOut[];
  onJoin?: (evenement: EvenementOut) => void;
}): JSX.Element {
  const t = useT();
  const [ouvert, setOuvert] = useState<string | null>(null);

  if (events.length === 0 && anniversaires.length === 0) {
    return <p style={{ fontSize: 12.5, color: T.mut, padding: "14px 2px" }}>{t("calendar.empty")}</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 8 }}>
      {events.map((e) => {
        const formation = isFormation(e);
        // UNIVERSAL colour, identical to the back office and collaboration: the catalogue
        // type colour, or a single shared neutral (#64748B) when the event has no type.
        const color = e.couleur || "#64748B";
        return (
          <div
            key={e.id}
            style={{ background: T.surf, border: `1px solid ${T.line}`, borderRadius: 13, padding: "11px 13px", borderLeft: `3px solid ${color}` }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3, flexWrap: "wrap" }}>
              <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, color: "#fff", background: color, padding: "2px 7px", borderRadius: 8 }}>
                {e.type_evenement_nom || (formation ? t("calendar.formation") : t("calendar.activity"))}
              </span>
              {formatTime(e.debut) && <span style={{ fontFamily: T.fm, fontSize: 10, color: T.mut }}>{formatTime(e.debut)}</span>}
            </div>
            <div
              onClick={() => setOuvert((o) => (o === e.id ? null : e.id))}
              className="tap"
              style={{ fontSize: 13.5, fontWeight: 600, color: T.ink, cursor: "pointer", display: "flex", justifyContent: "space-between", gap: 8 }}
            >
              <span>{e.titre}</span>
              <span style={{ color: T.faint, fontSize: 12 }}>{ouvert === e.id ? "▴" : "▾"}</span>
            </div>
            {e.lieu && <div style={{ fontSize: 11, color: T.mut, marginTop: 2 }}>{e.lieu}</div>}
            {(e.tags ?? []).length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 6 }}>
                {(e.tags ?? []).map((tg) => (
                  <span key={tg.id} style={{ fontSize: 9.5, fontWeight: 600, color: T.warn, background: T.warnbg, borderRadius: 7, padding: "2px 7px" }}>
                    {tg.libelle}
                  </span>
                ))}
              </div>
            )}
            {ouvert === e.id && (
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${T.line}`, display: "flex", flexDirection: "column", gap: 4 }}>
                {e.type_evenement_nom && <DetailRow label="Type" value={e.type_evenement_nom} />}
                <DetailRow label={t("caljour.horaires")} value={`${formatTime(e.debut)}${e.fin ? ` - ${formatTime(e.fin)}` : ""}`} />
                <DetailRow label={t("detail.mode")} value={t(modeLabelKey(e.mode))} />
                {e.lieu && <DetailRow label={t("caljour.lieu")} value={e.lieu} />}
                <DetailRow label={t("caljour.etat")} value={t(phaseLabelKey(e.phase))} />
                {e.cible_libelle && <DetailRow label={t("caljour.concerne")} value={e.cible_libelle} />}
                {e.intervenant_principal && <DetailRow label="Orateur principal" value={e.intervenant_principal} />}
                {(e.intervenants ?? []).length > 0 && <DetailRow label="Autres orateurs" value={(e.intervenants ?? []).join(", ")} />}
                {e.description && (
                  <div style={{ marginTop: 4 }}>
                    <div style={{ color: T.mut, fontSize: 11.5, marginBottom: 3 }}>Détails</div>
                    <div
                      style={{ fontSize: 12.5, color: T.ink, lineHeight: 1.5 }}
                      // Server-sanitised HTML subset (see back office RichEditor): safe to render.
                      dangerouslySetInnerHTML={{ __html: e.description }}
                    />
                  </div>
                )}
                <ActiviteDocuments token={token} evenementId={e.id} />
              </div>
            )}
            {e.session_ouverte && (
              <button
                type="button"
                className="btn btn-primary btn-block"
                style={{ marginTop: 9 }}
                onClick={() => {
                  if (e.lien_session) window.open(e.lien_session, "_blank", "noopener");
                  onJoin?.(e);
                }}
              >
                {t("calendar.join")}
              </button>
            )}
          </div>
        );
      })}

      {anniversaires.length > 0 && (
        <div style={{ background: T.surf, border: `1px solid ${T.line}`, borderRadius: 13, padding: "11px 13px" }}>
          <div style={{ fontFamily: T.fm, fontSize: 9, letterSpacing: 0.6, color: T.mut, marginBottom: 7 }}>
            {t("calendar.birthdays").toUpperCase()}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {anniversaires.map((a) => (
              <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 13 }} aria-hidden="true">🎂</span>
                <span style={{ fontSize: 12.5, color: T.ink }}>
                  {a.appellation || civilName({ prenoms: a.prenoms })}
                  {a.est_vip && <span style={{ color: T.warn, marginLeft: 6, fontSize: 10 }}>★</span>}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 11.5 }}>
      <span style={{ color: T.mut }}>{label}</span>
      <span style={{ color: T.ink, fontWeight: 600, textAlign: "right" }}>{value}</span>
    </div>
  );
}

function estImage(p: PieceEvenement): boolean {
  return (p.type || "").startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(p.nom || "");
}
function estPdf(p: PieceEvenement): boolean {
  return (p.type || "") === "application/pdf" || /\.pdf$/i.test(p.nom || "");
}

/** Public documents of the activity. Read inside the app: the member opens a document
 * in an in-app viewer (image or PDF), closes it, and may download it explicitly. A
 * document is never forced out of the app. */
function ActiviteDocuments({ token, evenementId }: { token: string; evenementId: string }): JSX.Element | null {
  const t = useT();
  const [pieces, setPieces] = useState<PieceEvenement[]>([]);
  const [apercu, setApercu] = useState<PieceEvenement | null>(null);

  useEffect(() => {
    let vivant = true;
    getEvenementPieces(token, evenementId).then((ps) => { if (vivant) setPieces(ps); }).catch(() => undefined);
    return () => { vivant = false; };
  }, [token, evenementId]);

  if (pieces.length === 0) return null;

  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ color: T.mut, fontSize: 11.5, marginBottom: 4 }}>{t("caljour.documents")}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {pieces.map((p) => (
          <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, background: T.surf, border: `1px solid ${T.line}`, borderRadius: 10, padding: "7px 10px" }}>
            <span aria-hidden style={{ fontSize: 15 }}>{estImage(p) ? "🖼️" : estPdf(p) ? "📄" : "📎"}</span>
            <span style={{ flex: 1, fontSize: 12.5, color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.nom}</span>
            <button type="button" className="btn btn-ghost btn-inline" style={{ fontSize: 11 }} onClick={() => setApercu(p)}>{t("caljour.ouvrir")}</button>
            <a href={p.url} download={p.nom} className="btn btn-ghost btn-inline" style={{ fontSize: 11, textDecoration: "none" }}>{t("caljour.telecharger")}</a>
          </div>
        ))}
      </div>
      {apercu && <DocumentViewer piece={apercu} onClose={() => setApercu(null)} labelClose={t("caljour.fermer")} labelDl={t("caljour.telecharger")} />}
    </div>
  );
}

function DocumentViewer({ piece, onClose, labelClose, labelDl }: { piece: PieceEvenement; onClose: () => void; labelClose: string; labelDl: string }): JSX.Element {
  useEffect(() => {
    const onKey = (ev: KeyboardEvent): void => { if (ev.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={piece.nom}
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.72)", zIndex: 1000, display: "flex", flexDirection: "column", padding: 12 }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, color: "#fff", padding: "4px 4px 10px" }}>
        <span style={{ flex: 1, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{piece.nom}</span>
        <a href={piece.url} download={piece.nom} onClick={(e) => e.stopPropagation()} className="btn btn-ghost btn-inline" style={{ color: "#fff", borderColor: "rgba(255,255,255,0.4)", textDecoration: "none", fontSize: 12 }}>{labelDl}</a>
        <button type="button" onClick={onClose} className="btn btn-ghost btn-inline" style={{ color: "#fff", borderColor: "rgba(255,255,255,0.4)", fontSize: 12 }}>{labelClose}</button>
      </div>
      <div onClick={(e) => e.stopPropagation()} style={{ flex: 1, minHeight: 0, background: "#fff", borderRadius: 12, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {estImage(piece) ? (
          <img src={piece.url} alt={piece.nom} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
        ) : estPdf(piece) ? (
          <iframe title={piece.nom} src={piece.url} style={{ width: "100%", height: "100%", border: "none" }} />
        ) : (
          <div style={{ padding: 24, textAlign: "center", color: "#333", fontSize: 13 }}>
            Aperçu non disponible pour ce format. Utilisez « {labelDl} » pour l&apos;ouvrir.
          </div>
        )}
      </div>
    </div>
  );
}
