import { useEffect, useState } from "react";

import { type MembreProfile, getDemandes, getPhotoUrl, photoObjectPosition, setPhotoFocus } from "../api.js";
import { type Focus, PhotoFocusEditor } from "./PhotoFocusEditor.js";
import { useT } from "../i18n.js";
import { civilName, civilNameComplet } from "../name.js";
import { T } from "../proto.js";
import { ModifierChamps } from "./ModifierChamps.js";

/** i18n keys for the unlockable elements (mirror of the server catalog): fields,
 * identity photo and official identity document. */
const ELEMENT_LABELS: Record<string, string> = {
  nom: "infos.elemNom",
  prenoms: "infos.elemPrenoms",
  telephone: "completer.fTelephone",
  date_naissance: "completer.fDateNaissance",
  genre: "completer.fGenre",
  pays: "completer.fPays",
  ville: "completer.fVille",
  profession: "completer.fProfession",
  niveau_etudes: "completer.fNiveauEtudes",
  situation_matrimoniale: "completer.fSituation",
  photo_identite: "app.profil.photoAlt",
  piece_identite: "infos.elemPiece",
};

const ENGAGEMENT: Record<string, string> = {
  membre_simple: "profil.statutSimple",
  nouveau_engage: "infos.engNouvelEngage",
  aspirant: "infos.engAspirant",
  engage: "infos.engEngage",
  berger: "infos.engBerger",
  responsable: "infos.engResponsable",
};
const MATRIMONIAL: Record<string, string> = {
  celibataire: "completer.sitCelibataire",
  en_couple: "completer.sitEnCouple",
  marie: "completer.sitMarie",
  fiance: "completer.sitFiance",
  veuf: "completer.sitVeuf",
  divorce: "completer.sitDivorce",
};

function pretty(v: string | null | undefined): string {
  if (!v) return "-";
  const s = v.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

/** Birth date honouring the year-visibility choice: full date if allowed,
 * otherwise only the day and month (the birthday). */
function naissance(date: string | null | undefined, anneeVisible: boolean): string {
  if (!date) return "-";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "-";
  const jour = d.getUTCDate();
  const mois = MOIS[d.getUTCMonth()] ?? "";
  return anneeVisible ? `${jour} ${mois} ${d.getUTCFullYear()}` : `${jour} ${mois}`;
}

function telephone(indicatif: string | null | undefined, numero: string | null | undefined): string {
  const n = numero?.trim();
  if (!n) return "-";
  return indicatif ? `${indicatif} ${n}` : n;
}

function fullName(profile: MembreProfile | null): string {
  // Header: capped civil name (family name first), never a function.
  return (profile ? civilName(profile) : "") || "-";
}

function fullNameComplet(profile: MembreProfile | null): string {
  // Detailed file: full civil name (family name + all given names).
  return (profile ? civilNameComplet(profile) : "") || "-";
}

function Group({ title, children }: { title: string; children: React.ReactNode }): JSX.Element {
  return (
    <>
      <p style={{ fontFamily: T.fm, fontSize: 9, letterSpacing: 0.8, color: T.mut, margin: "16px 2px 7px" }}>{title.toUpperCase()}</p>
      <div style={{ background: T.surf, border: `1px solid ${T.line}`, borderRadius: 14, overflow: "hidden" }}>{children}</div>
    </>
  );
}

function Row({ label, value, last }: { label: string; value: string; last?: boolean }): JSX.Element {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "12px 14px", borderBottom: last ? "none" : `1px solid ${T.line}` }}>
      <span style={{ fontSize: 12.5, color: T.mut }}>{label}</span>
      <span style={{ fontSize: 12.5, fontWeight: 600, color: T.ink, textAlign: "right", wordBreak: "break-word" }}>{value}</span>
    </div>
  );
}

export function Infos({
  token,
  profile,
  onDemande,
  onProfileChange,
}: {
  token: string | null;
  profile: MembreProfile | null;
  onDemande: () => void;
  onProfileChange: () => void;
}): JSX.Element {
  const t = useT();
  const deverrouilles = profile?.champs_deverrouilles ?? [];
  const unlocked = deverrouilles.length > 0;
  const pieceDebloquee = deverrouilles.includes("piece_identite");

  // Identity photo shown at the top of "Mes informations" (signed short-lived
  // URL, initials fallback when the member has no photo yet).
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!token) return undefined;
    let alive = true;
    getPhotoUrl(token)
      .then((r) => {
        if (alive) setPhotoUrl(r.url);
      })
      .catch(() => {
        if (alive) setPhotoUrl(null);
      });
    return () => {
      alive = false;
    };
  }, [token, profile?.photo_url]);

  // Re-frame the current photo (display-only focal point, no re-validation).
  const [cadrer, setCadrer] = useState(false);
  const [cadreBusy, setCadreBusy] = useState(false);
  async function enregistrerCadrage(focus: Focus): Promise<void> {
    if (!token) return;
    setCadreBusy(true);
    try {
      await setPhotoFocus(token, focus.x, focus.y);
      setCadrer(false);
      onProfileChange();
    } catch {
      setCadrer(false);
    } finally {
      setCadreBusy(false);
    }
  }

  // Deadline granted with the unlock: read from the member's own requests.
  const [echeance, setEcheance] = useState<string | null>(null);
  useEffect(() => {
    if (!token || !unlocked) {
      setEcheance(null);
      return;
    }
    getDemandes(token)
      .then((ds) => {
        const attente = ds.find((d) => d.statut === "attente_membre" && d.echeance_reponse);
        setEcheance(attente?.echeance_reponse ?? null);
      })
      .catch(() => setEcheance(null));
  }, [token, unlocked]);

  const initiales = `${(profile?.prenoms ?? " ")[0] ?? ""}${(profile?.nom ?? " ")[0] ?? ""}`.trim().toUpperCase() || "?";
  const engagement = profile?.type_membre ? (t(ENGAGEMENT[profile.type_membre] ?? "") || pretty(profile.type_membre)) : "-";
  const matrimonial = profile?.situation_matrimoniale
    ? (t(MATRIMONIAL[profile.situation_matrimoniale] ?? "") || pretty(profile.situation_matrimoniale))
    : "-";
  const marriage = profile?.type_mariage ? ` (${pretty(profile.type_mariage)})` : "";
  // Show the relational journey only for the situations it applies to.
  const cheminement = profile?.en_cheminement === true ? ` · ${t("completer.fCheminement")}` : "";

  const adresse = [profile?.adresse, profile?.adresse_complement].filter(Boolean).join(", ");
  const localisation = [profile?.ville, profile?.region, profile?.pays].filter(Boolean).join(", ");

  return (
    <div className="scr" style={{ padding: "6px 18px 24px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "10px 2px 4px" }}>
        {photoUrl ? (
          <img src={photoUrl} alt={t("app.profil.photoAlt")} style={{ width: 64, height: 64, borderRadius: "50%", objectFit: "cover", objectPosition: photoObjectPosition(profile), border: `2px solid ${T.line}` }} />
        ) : (
          <div style={{ width: 64, height: 64, borderRadius: "50%", background: T.b600, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 20 }}>
            {initiales}
          </div>
        )}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: T.fd, fontWeight: 700, fontSize: 16, color: T.ink }}>{fullName(profile)}</div>
          <div style={{ fontSize: 11.5, color: T.mut, fontFamily: T.fm }}>{profile?.matricule ?? ""}</div>
          {profile?.est_berger && profile?.nom_pastoral_affiche && (
            <div style={{ fontSize: 12.5, fontWeight: 700, color: T.warn, marginTop: 3 }}>{profile.nom_pastoral_affiche}</div>
          )}
          {(profile?.fonctions ?? []).map((f, i) => (
            <div key={i} style={{ fontSize: 11.5, color: T.b600, fontWeight: 600, marginTop: 2 }}>
              {f.libelle}
              {f.perimetre ? ` - ${f.perimetre}` : ""}
            </div>
          ))}
          {!(profile?.est_berger && profile?.nom_pastoral_affiche) && (profile?.fonctions ?? []).length === 0 && (
            <div style={{ fontSize: 11.5, color: T.mut, marginTop: 2 }}>{t("app.profil.memberChip")}</div>
          )}
          {profile?.photo_pending && (
            <div style={{ fontSize: 10.5, color: T.warn, marginTop: 3, fontWeight: 600 }}>
              {t("infos.photoPending")}
            </div>
          )}
          {photoUrl && (
            <button
              type="button"
              onClick={() => setCadrer(true)}
              style={{ marginTop: 4, padding: 0, background: "none", border: "none", color: T.b600, fontSize: 11, fontWeight: 600, cursor: "pointer" }}
            >
              {t("infos.adjustFraming")}
            </button>
          )}
        </div>
      </div>

      {cadrer && photoUrl && (
        <PhotoFocusEditor
          imageUrl={photoUrl}
          initialFocus={
            profile?.photo_focus_x != null && profile?.photo_focus_y != null
              ? { x: profile.photo_focus_x, y: profile.photo_focus_y }
              : null
          }
          busy={cadreBusy}
          onCancel={() => setCadrer(false)}
          onConfirm={(focus) => void enregistrerCadrage(focus)}
        />
      )}

      {unlocked && (
        <div style={{ background: T.warnbg, border: `1px solid ${T.warn}`, borderRadius: 13, padding: 13, margin: "10px 0 4px" }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: T.warn }}>
            {t("infos.unlockedBanner").replace("{elements}", deverrouilles.map((c) => (ELEMENT_LABELS[c] ? t(ELEMENT_LABELS[c]) : c)).join(", "))}
          </div>
          <div style={{ fontSize: 11.5, color: T.warn, marginTop: 4, lineHeight: 1.5 }}>
            {echeance
              ? t("infos.deadlineNote").replace("{date}", new Date(echeance).toLocaleDateString("fr-FR"))
              : ""}
            {deverrouilles.some((c) => ELEMENT_LABELS[c] && c !== "piece_identite")
              ? t("infos.correctBelow")
              : ""}
            {pieceDebloquee ? t("infos.piecePaperclip") : ""}
          </div>
        </div>
      )}

      <Group title={t("infos.groupIdentite")}>
        <Row label={t("completer.recapNom")} value={fullNameComplet(profile)} />
        {profile?.nom_naissance && <Row label={t("infos.rowNomNaissance")} value={profile.nom_naissance} />}
        {profile?.nom_marital && <Row label={t("infos.rowNomMarital")} value={profile.nom_marital} />}
        {profile?.est_berger && profile?.nom_pastoral_affiche && (
          <Row label={t("infos.rowNomPastoral")} value={profile.nom_pastoral_affiche} />
        )}
        {(profile?.fonctions ?? []).map((f, i) => (
          <Row key={i} label={i === 0 ? t("infos.rowFonction") : ""} value={f.perimetre ? `${f.libelle} - ${f.perimetre}` : f.libelle} />
        ))}
        <Row label={t("completer.fGenre")} value={pretty(profile?.genre)} />
        <Row label={profile?.naissance_annee_visible ? t("completer.fDateNaissance") : t("infos.rowAnniversaire")} value={naissance(profile?.date_naissance, !!profile?.naissance_annee_visible)} />
        <Row label={t("infos.rowMatricule")} value={profile?.matricule ?? "-"} />
        <Row label={t("infos.rowCodeMembre")} value={profile?.code_membre ?? "-"} last />
      </Group>

      <Group title={t("infos.groupCoordonnees")}>
        <Row label={t("completer.fTelephone")} value={telephone(profile?.indicatif_telephone, profile?.telephone)} />
        <Row label={t("infos.rowCourriel")} value={profile?.email ?? "-"} />
        <Row label={t("infos.rowLocalisation")} value={localisation || "-"} />
        <Row label={t("infos.rowAdresse")} value={adresse || "-"} last />
      </Group>

      <Group title={t("infos.groupEcclesiale")}>
        <Row label={t("app.profil.tribu")} value={profile?.tribu ?? "-"} />
        <Row label={t("infos.rowPatriarche")} value={profile?.patriarche ?? "-"} />
        <Row label={t("infos.rowNiveauEngagement")} value={engagement} />
        <Row label={t("infos.rowPromotion")} value={profile?.promotion ?? "-"} />
        <Row label={t("infos.rowCheminement")} value={pretty(profile?.cheminement_pastoral)} last />
      </Group>

      <Group title={t("infos.groupOrganisation")}>
        <Row label={t("app.profil.commission")} value={profile?.commission ?? "-"} />
        <Row label={t("completer.axeIntendance")} value={profile?.intendance ?? "-"} />
        <Row label={profile?.intendant_titre ?? t("infos.rowIntendant")} value={profile?.intendant ?? "-"} />
        <Row label={t("completer.axeCoordination")} value={profile?.coordination ?? "-"} />
        <Row label={profile?.coordinateur_titre ?? t("infos.rowCoordinateur")} value={profile?.coordinateur ?? "-"} last />
      </Group>

      <Group title={t("infos.groupVie")}>
        <Row label={t("infos.rowSituation")} value={matrimonial + marriage + cheminement} />
        <Row label={t("completer.fProfession")} value={profile?.profession ?? "-"} />
        <Row label={t("completer.fNiveauEtudes")} value={profile?.niveau_etudes ?? "-"} last />
      </Group>

      {unlocked && token && profile && (
        <ModifierChamps token={token} profile={profile} onSubmitted={onProfileChange} />
      )}

      <p style={{ fontSize: 11, color: T.mut, lineHeight: 1.5, margin: "14px 2px 10px" }}>{t("infos.footer")}</p>
      <div
        onClick={onDemande}
        className="tap"
        style={{ height: 48, background: `linear-gradient(180deg,${T.b500},${T.b600})`, borderRadius: 13, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 600, fontSize: 14, boxShadow: "0 10px 22px -10px rgba(42,79,173,.7)" }}
      >
        {t("infos.requestChange")}
      </div>
    </div>
  );
}
