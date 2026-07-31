import { generateKeyPair, signQrToken } from "@adsum/qr";
import QRCode from "qrcode";
import { useEffect, useRef, useState } from "react";

import { getPhotoUrl } from "../api.js";
import { useT } from "../i18n.js";
import { initials } from "../name.js";
import { useMarque } from "../useMarque.js";

// The member digital card. When logged in, the QR holds the real token signed by
// the server (prop serverToken). In the offline preview, it is signed in the
// browser with a freshly generated key, with no fictional personal data.

interface QrCardProps {
  matricule: string;
  // Member-entered code (SR-...), shown next to the ADSUM matricule on the card.
  codeMembre?: string | null;
  membreId: string;
  verifie: boolean;
  preview: boolean;
  serverToken?: string | null;
  nom?: string | null;
  tribu?: string | null;
  commission?: string | null;
  engagement?: string | null;
  // Session token used to fetch the short-lived signed photo URL. When absent
  // (offline preview) the identity avatar simply shows the initials fallback.
  authToken?: string | null;
  // Raw first name and last name, used only to build the initials fallback when
  // the member has no photo. They are never rendered as text on the card.
  prenoms?: string | null;
  memberNom?: string | null;
  // Face focal point (0-100) so the photo is framed the same way everywhere.
  focusX?: number | null;
  focusY?: number | null;
  // Distinguished line under the name: the consecration name takes priority
  // (Berger/Bergere), otherwise the primary function title. Absent for a plain
  // member, in which case no extra line is shown.
  estBerger?: boolean;
  nomPastoral?: string | null;
  fonctionPrincipale?: string | null;
  fonctionPerimetre?: string | null;
  // Resolved organisational appellation and its winning category (central resolver).
  // Preferred for a title or special function (pure title, e.g. "Moderateur (Berger
  // David)"); ordinary/particular functions fall back to the role+scope line below.
  appellation?: string | null;
  categoriePrincipale?: string | null;
}

/**
 * Shorten the longest role words so a commission title still fits on one line.
 * CSS ellipsis is the final safety net; this keeps the readable start intact.
 */
function abregerRole(texte: string): string {
  return texte
    .replace(/\bResponsable\b/gi, "Respo.")
    .replace(/\bCoordination\b/gi, "Coord.")
    .replace(/\bCoordinateur\b/gi, "Coord.")
    .replace(/\bCoordinatrice\b/gi, "Coord.");
}

const ENGAGEMENT_LABELS: Record<string, string> = {
  membre_simple: "profil.statutSimple",
  membre_actif: "profil.statutActif",
  nouveau_engage: "infos.engNouvelEngage",
  nouvel_engage: "infos.engNouvelEngage",
  aspirant: "infos.engAspirant",
  engage: "infos.engEngage",
  berger: "infos.engBerger",
  responsable: "infos.engResponsable",
};

/** Human label for an engagement value: mapped when known, otherwise the raw
 * slug is prettified (underscores to spaces, first letter capitalised) so a raw
 * snake_case value can never appear on the card. */
function engagementDisplay(value: string | null | undefined, t: (key: string) => string): string {
  if (!value) return t("app.profil.memberChip");
  const known = ENGAGEMENT_LABELS[value];
  if (known) return t(known);
  const words = value.replace(/_/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function QrCard({
  matricule,
  codeMembre,
  membreId,
  verifie,
  preview,
  serverToken,
  nom,
  tribu,
  commission,
  engagement,
  authToken,
  prenoms,
  memberNom,
  focusX,
  focusY,
  estBerger,
  nomPastoral,
  fonctionPrincipale,
  fonctionPerimetre,
  appellation,
  categoriePrincipale,
}: QrCardProps): JSX.Element {
  const t = useT();
  const marqueCarte = useMarque();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [previewToken] = useState(() => {
    const kp = generateKeyPair();
    return signQrToken({ membreId, jetonId: crypto.randomUUID(), versionCle: 1, privateKey: kp.privateKey });
  });
  const token = serverToken ?? previewToken;

  // Short-lived signed URL for the member's identity photo. It is resolved on
  // mount (and whenever the session token changes) because the URL expires. A
  // null result means the member has no photo yet: we then show the initials
  // fallback instead, without any console noise.
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  // Responsive QR size driven by the available viewport height, so the whole
  // card fits without scroll on short phones while staying at its natural size on
  // tall screens. The QR is re-rendered at this exact pixel size (crisp, no CSS
  // upscaling). Close scanning uses the dedicated fullscreen view.
  const [qrSize, setQrSize] = useState(190);
  useEffect(() => {
    const compute = (): void => {
      const h = typeof window !== "undefined" ? window.innerHeight : 844;
      setQrSize(Math.max(120, Math.min(190, Math.round(h - 500))));
    };
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, []);

  useEffect(() => {
    if (canvasRef.current) {
      void QRCode.toCanvas(canvasRef.current, token, {
        width: qrSize,
        margin: 1,
        color: { dark: "#101218", light: "#ffffff" },
      });
    }
  }, [token, qrSize]);

  useEffect(() => {
    if (!authToken) {
      setPhotoUrl(null);
      return;
    }
    let alive = true;
    getPhotoUrl(authToken)
      .then((res) => {
        if (alive) setPhotoUrl(res.url);
      })
      .catch(() => {
        if (alive) setPhotoUrl(null);
      });
    return () => {
      alive = false;
    };
  }, [authToken]);

  const engagementLabel = engagementDisplay(engagement, t);
  const avatarInitials = initials({ prenoms, nom: memberNom });

  // The distinguished line follows the central precedence. A title or special
  // function uses the resolved appellation as-is (pure title, written in full,
  // e.g. "Moderateur (Berger David)" or "Berger David"). Ordinary and particular
  // functions keep the compact role+scope line. A plain member shows nothing.
  const appellationTitre =
    (categoriePrincipale === "titre" || categoriePrincipale === "fonction_speciale") && appellation
      ? appellation
      : estBerger && nomPastoral
        ? nomPastoral
        : null;
  const fonctionLigne = !appellationTitre && fonctionPrincipale
    ? abregerRole(fonctionPerimetre ? `${fonctionPrincipale} - ${fonctionPerimetre}` : fonctionPrincipale)
    : null;

  return (
    <div className="card">
      <div className="card-top">
        <span className="card-brand">{marqueCarte.marque}</span>
        <span className="card-chip" aria-hidden="true" />
      </div>
      <div className="card-identity">
        <div className="card-photo">
          {photoUrl ? (
            <img className="card-photo-img" src={photoUrl} alt={t("app.profil.photoAlt")} style={{ objectPosition: `${focusX ?? 50}% ${focusY ?? 30}%` }} />
          ) : (
            <span className="card-photo-fallback" aria-hidden="true">
              {avatarInitials}
            </span>
          )}
        </div>
        <div className="card-identity-text">
          {nom && <p className="card-name">{nom}</p>}
          {appellationTitre && (
            <p
              className="card-role"
              style={{ margin: "1px 0 0", fontSize: 12.5, fontWeight: 700, color: "#ffd98a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}
              title={appellationTitre}
            >
              {appellationTitre}
            </p>
          )}
          {fonctionLigne && (
            <p
              className="card-role"
              style={{ margin: "1px 0 0", fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.92)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}
              title={fonctionLigne}
            >
              {fonctionLigne}
            </p>
          )}
          <p className="card-tribu">
            {tribu ? t("qrcard.tribu").replace("{tribu}", tribu) : marqueCarte.organisation}
            {commission ? ` · ${commission}` : ""}
          </p>
        </div>
      </div>
      <div className="card-qr">
        <canvas ref={canvasRef} width={qrSize} height={qrSize} aria-label={t("carte.qrAria")} />
      </div>
      <div className="card-meta">
        <div className="card-codes">
          <div className="card-code-box">
            <span>{t("infos.rowMatricule")}</span>
            <strong title={matricule}>{matricule}</strong>
          </div>
          <div className="card-code-box">
            <span>{t("infos.rowCodeMembre")}</span>
            <strong title={codeMembre ?? undefined}>{codeMembre && codeMembre.trim() ? codeMembre : "-"}</strong>
          </div>
        </div>
        <div className="card-meta-row">
          <div className="card-meta-item">
            <span>{t("qrcard.engagement")}</span>
            <strong>{engagementLabel}</strong>
          </div>
          <span className={`badge ${verifie ? "badge-ok" : "badge-mut"}`}>{verifie ? t("qrcard.verified") : t("qrcard.pending")}</span>
        </div>
      </div>
      <p className="card-hint">
        {serverToken
          ? t("qrcard.hintServer")
          : preview
            ? t("qrcard.hintPreview")
            : t("qrcard.hintDefault")}
      </p>
    </div>
  );
}
