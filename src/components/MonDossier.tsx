import { type MembreProfile, getDocuments, getEngagements } from "../api.js";
import { useT } from "../i18n.js";
import { T } from "../proto.js";
import { useResource } from "../useResource.js";

/** Provider status of one submitted document, in the member's own words. */
const DOC_STATUT: Record<string, { labelKey: string; ok: boolean }> = {
  demande: { labelKey: "dossier.statutDemande", ok: false },
  recu: { labelKey: "dossier.statutRecu", ok: false },
  lu: { labelKey: "dossier.statutLu", ok: false },
  traite: { labelKey: "dossier.statutTraite", ok: true },
};

function pretty(value: string | null): string {
  if (!value) return "Document";
  const v = value.replace(/_/g, " ");
  return v.charAt(0).toUpperCase() + v.slice(1);
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
}

function Piece({
  titre,
  sousTitre,
  done,
  onClick,
}: {
  titre: string;
  sousTitre: string;
  done: boolean;
  onClick?: () => void;
}): JSX.Element {
  return (
    <div
      onClick={onClick}
      className={onClick ? "tap" : undefined}
      style={{ background: T.surf, border: `1px solid ${T.line}`, borderRadius: 13, padding: 13, display: "flex", alignItems: "center", gap: 11 }}
    >
      <div style={{ width: 36, height: 36, borderRadius: 9, background: done ? T.okbg : T.bg, color: done ? T.ok : T.mut, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>
        {done ? "✓" : "◻"}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600 }}>{titre}</div>
        <div style={{ fontSize: 10.5, color: done ? T.ok : T.mut }}>{sousTitre}</div>
      </div>
      {onClick && <span style={{ color: T.mut }}>›</span>}
    </div>
  );
}

function Titre({ children }: { children: string }): JSX.Element {
  return <p style={{ fontFamily: T.fm, fontSize: 9, color: T.mut, margin: "18px 0 8px", letterSpacing: 0.4 }}>{children}</p>;
}

/** The member's file: what is required, what has been submitted, where it stands.
 *
 *  The profile used to carry two entries, "Identité" and "Mon dossier", reading the
 *  very same two sources: the required pieces on one side, the same pieces listed
 *  with their processing status on the other. A member had to open both to know
 *  whether they were done, and neither answered the question alone. They are one
 *  screen now: the requirement and its status sit on the same line. */
export function MonDossier({
  token,
  profile,
  onEngagements,
  onSuivi,
}: {
  token: string;
  profile: MembreProfile | null;
  onEngagements: () => void;
  onSuivi: () => void;
}): JSX.Element {
  const t = useT();
  const docs = useResource(() => getDocuments(token), [token]);
  const engs = useResource(() => getEngagements(token), [token]);

  const verified = profile?.verifie ?? false;
  const documents = docs.data ?? [];
  const engagements = engs.data ?? [];
  const photoOk = verified || documents.some((d) => d.type === "photo" && d.statut === "traite");
  const pieceOk = verified || documents.some((d) => d.type === "piece_identite" && d.statut === "traite");
  const engagementsOk = verified || (engagements.length > 0 && engagements.every((e) => e.signe));
  const doneCount = [photoOk, pieceOk, engagementsOk].filter(Boolean).length;
  // Pieces the member sent beyond the two required ones: an administration request,
  // a supporting document. Listing them separately keeps the requirement readable.
  const autresPieces = documents.filter((d) => d.type !== "photo" && d.type !== "piece_identite");

  return (
    <div className="scr" style={{ padding: "6px 18px 14px" }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ flex: 1, height: 5, borderRadius: 3, background: i < doneCount ? T.b600 : T.line }} />
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <Piece titre={t("app.profil.photoAlt")} sousTitre={photoOk ? t("suivi.validated") : t("identite.toProvide")} done={photoOk} />
        <Piece titre={t("identite.officialDoc")} sousTitre={pieceOk ? t("identite.keptProtected") : t("identite.toProvide")} done={pieceOk} />
        <Piece
          titre={t("identite.engagementsSigned")}
          sousTitre={engagementsOk ? t("identite.engagementsDetail") : t("identite.toReadSign")}
          done={engagementsOk}
          onClick={onEngagements}
        />
      </div>

      {verified ? (
        <div style={{ marginTop: 14, background: T.okbg, border: `1px solid ${T.ok}`, borderRadius: 14, padding: 14, textAlign: "center" }}>
          <div style={{ fontFamily: T.fd, fontWeight: 700, fontSize: 15, color: T.ok }}>{t("suivi.identityValidated")}</div>
          <div style={{ fontSize: 11, color: T.mut, marginTop: 4, lineHeight: 1.5 }}>
            {t("identite.validatedBy")}
            <br />
            {t("identite.cardQrFullyActive")}
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 14, background: T.warnbg, border: `1px solid ${T.warn}`, borderRadius: 14, padding: 14, textAlign: "center" }}>
          <div style={{ fontFamily: T.fd, fontWeight: 700, fontSize: 15, color: T.warn }}>{t("identite.awaitingVerification")}</div>
          <div style={{ fontSize: 11, color: T.mut, marginTop: 4, lineHeight: 1.5 }}>{t("identite.notFullyActive")}</div>
        </div>
      )}

      <Titre>{t("dossier.sectionEngagements").toUpperCase()}</Titre>
      {engs.loading && <p style={{ fontSize: 11.5, color: T.mut }}>{t("common.loading")}</p>}
      {engs.error && (
        <p style={{ fontSize: 11.5, color: T.warn, background: T.warnbg, border: `1px solid ${T.warn}`, borderRadius: 10, padding: 10 }}>{engs.error}</p>
      )}
      {!engs.loading && engagements.length === 0 && (
        <p style={{ fontSize: 11.5, color: T.mut }}>{t("dossier.emptyEngagements")}</p>
      )}
      {engagements.map((e) => (
        <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 0", borderBottom: `1px solid ${T.line}` }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600 }}>{pretty(e.type)}</div>
            <div style={{ fontSize: 10.5, color: T.mut }}>{t("dossier.version").replace("{v}", String(e.version))}</div>
          </div>
          <span
            style={{
              fontSize: 9.5, fontWeight: 700, borderRadius: 7, padding: "3px 8px", whiteSpace: "nowrap",
              color: e.signe ? T.ok : T.mut,
              background: e.signe ? T.okbg : T.bg,
              border: `1px solid ${e.signe ? `${T.ok}33` : T.line}`,
            }}
          >
            {e.signe ? t("dossier.signed") : t("dossier.toSign")}
          </span>
        </div>
      ))}

      <Titre>{t("dossier.sectionPieces").toUpperCase()}</Titre>
      {docs.loading && <p style={{ fontSize: 11.5, color: T.mut }}>{t("common.loading")}</p>}
      {docs.error && (
        <p style={{ fontSize: 11.5, color: T.warn, background: T.warnbg, border: `1px solid ${T.warn}`, borderRadius: 10, padding: 10 }}>{docs.error}</p>
      )}
      {!docs.loading && documents.length === 0 && (
        <p style={{ fontSize: 11.5, color: T.mut }}>{t("dossier.emptyPieces")}</p>
      )}
      {documents.map((d) => {
        const s = DOC_STATUT[d.statut];
        const ok = s?.ok ?? false;
        return (
          <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 0", borderBottom: `1px solid ${T.line}` }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600 }}>{pretty(d.type)}</div>
              {d.demande_le && (
                <div style={{ fontSize: 10.5, color: T.mut }}>
                  {t("dossier.requestedOn").replace("{date}", formatDate(d.demande_le))}
                </div>
              )}
            </div>
            <span
              style={{
                fontSize: 9.5, fontWeight: 700, borderRadius: 7, padding: "3px 8px", whiteSpace: "nowrap",
                color: ok ? T.ok : T.mut,
                background: ok ? T.okbg : T.bg,
                border: `1px solid ${ok ? `${T.ok}33` : T.line}`,
              }}
            >
              {s ? t(s.labelKey) : pretty(d.statut)}
            </span>
          </div>
        );
      })}
      {autresPieces.length > 0 && (
        <p style={{ fontSize: 10, color: T.faint, lineHeight: 1.5, margin: "8px 0 0" }}>
          {autresPieces.length === 1
            ? "1 pièce complémentaire a été demandée ou déposée en plus des pièces obligatoires."
            : `${autresPieces.length} pièces complémentaires ont été demandées ou déposées en plus des pièces obligatoires.`}
        </p>
      )}

      <div
        onClick={onSuivi}
        className="tap"
        style={{ marginTop: 16, height: 44, border: `1.5px solid ${T.ink}`, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12.5, fontWeight: 600 }}
      >
        {t("identite.trackProcessing")}
      </div>

      <div style={{ textAlign: "center", fontFamily: T.fm, fontSize: 8.5, color: T.faint, marginTop: 14 }}>
        {t("identite.gdprNote")}
      </div>
    </div>
  );
}
