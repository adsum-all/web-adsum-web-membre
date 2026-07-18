import { useEffect, useMemo, useRef, useState } from "react";

import { type MembreProfile, type RefItem, getReference, soumettreModifications, uploadPhoto } from "../api.js";
import { useT } from "../i18n.js";
import { uniteLabel } from "../name.js";
import { T } from "../proto.js";
import { type Focus, PhotoFocusEditor } from "./PhotoFocusEditor.js";

/** i18n key for EVERY member field the administration can unlock. Kept aligned
 * with the server _EDITABLE_FIELDS so any unlocked field is actually editable here
 * (a field unlocked but missing from this map would be silently non-editable). */
const LABELS: Record<string, string> = {
  nom: "modif.lblNom",
  prenoms: "modif.lblPrenoms",
  code_membre: "modif.lblCodeMembre",
  telephone: "completer.fTelephone",
  indicatif_telephone: "modif.lblIndicatif",
  date_naissance: "completer.fDateNaissance",
  naissance_annee_visible: "modif.lblAnneeVisible",
  genre: "completer.fGenre",
  pays: "completer.fPays",
  region: "completer.fRegion",
  ville: "completer.fVille",
  adresse: "completer.fAdresse",
  adresse_complement: "modif.lblComplementAdresse",
  commission_id: "completer.fCommission",
  intendance_id: "completer.axeIntendance",
  coordination_id: "completer.axeCoordination",
  tribu_id: "completer.fTribu",
  groupe: "completer.fSousCommission",
  profession: "completer.fProfession",
  niveau_etudes: "completer.fNiveauEtudes",
  situation_matrimoniale: "completer.fSituation",
  en_cheminement: "completer.fCheminement",
  type_mariage: "modif.lblTypeMariage",
  type_membre: "modif.lblStatutMembre",
  baptise: "modif.lblBaptise",
  confirme: "modif.lblConfirme",
  premiere_communion: "modif.lblPremiereCommunion",
};

const SITUATIONS: [string, string][] = [
  ["celibataire", "completer.sitCelibataire"], ["en_couple", "completer.sitEnCouple"], ["fiance", "completer.sitFiance"],
  ["marie", "completer.sitMarie"], ["veuf", "completer.sitVeuf"], ["divorce", "completer.sitDivorce"],
];
const GENRES: [string, string][] = [["homme", "completer.genreHomme"], ["femme", "completer.genreFemme"]];
const TYPES_MARIAGE: [string, string][] = [
  ["dot", "modif.mariageDot"], ["religieux", "modif.mariageReligieux"], ["dot_et_religieux", "modif.mariageDotReligieux"], ["civil", "modif.mariageCivil"],
];
const TYPES_MEMBRE: [string, string][] = [
  ["membre_simple", "profil.statutSimple"], ["membre_actif", "profil.statutActif"],
  ["nouveau_engage", "modif.membreNouvelEngage"], ["inspirant", "profil.statutInspirant"],
];
const OUI_NON: [string, string][] = [["true", "common.yes"], ["false", "common.no"]];

// Fields resolved from a reference list (id-based, except the group which is a name).
const REF_KIND: Record<string, string> = {
  commission_id: "commissions",
  intendance_id: "intendances",
  coordination_id: "coordinations",
  tribu_id: "tribus",
  groupe: "groupes",
};

function initialValue(field: string, profile: MembreProfile): string {
  const v = (profile as unknown as Record<string, unknown>)[field];
  if (typeof v === "boolean") return v ? "true" : "false";
  return v == null ? "" : String(v);
}

interface ModifierChampsProps {
  token: string;
  profile: MembreProfile;
  onSubmitted: () => void;
}

/**
 * Single, unified editor for everything the administration unlocked in the current
 * cycle: every unlocked field (text, dates, enums, booleans, and reference lists such
 * as commission / intendance / tribu / group, including the member code) AND the
 * identity photo, submitted ONCE. Selecting a photo only stages it. The one submit
 * files the whole proposal; the server consumes the unlock and this panel disappears.
 */
export function ModifierChamps({ token, profile, onSubmitted }: ModifierChampsProps): JSX.Element | null {
  const t = useT();
  const deverrouilles = profile.champs_deverrouilles ?? [];
  const unlocked = useMemo(() => deverrouilles.filter((f) => f in LABELS), [deverrouilles]);
  const photoUnlocked = deverrouilles.includes("photo_identite");

  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(unlocked.map((f) => [f, initialValue(f, profile)])),
  );
  const [refs, setRefs] = useState<Record<string, RefItem[]>>({});
  const photoInput = useRef<HTMLInputElement | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoFocus, setPhotoFocus] = useState<Focus>({ x: 50, y: 30 });
  const [photoStaged, setPhotoStaged] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load the reference lists needed by the unlocked reference fields (once).
  useEffect(() => {
    const kinds = new Set(unlocked.map((f) => REF_KIND[f]).filter(Boolean) as string[]);
    for (const kind of kinds) {
      void getReference(token, kind)
        .then((list) => setRefs((prev) => ({ ...prev, [kind]: list })))
        .catch(() => undefined);
    }
  }, [token, unlocked]);

  if (unlocked.length === 0 && !photoUnlocked) return null;

  async function stagePhoto(file: File, focus: Focus): Promise<void> {
    setPhotoBusy(true);
    setError(null);
    try {
      await uploadPhoto(token, file, focus);
      setPhotoStaged(true);
      setPhotoFocus(focus);
      setPhotoPreview(URL.createObjectURL(file));
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : t("modif.photoLoadError"));
    } finally {
      setPhotoBusy(false);
      setPendingFile(null);
    }
  }

  async function submit(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const champs: Record<string, string> = {};
      for (const f of unlocked) champs[f] = values[f] ?? "";
      const res = await soumettreModifications(token, champs, photoStaged);
      if (res.pending_validation) {
        setDone(true);
        onSubmitted();
      }
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : t("common.sendError"));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div style={{ background: T.warnbg, border: `1px solid ${T.warn}`, borderRadius: 14, padding: "14px 16px", margin: "12px 0" }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: T.warn, margin: 0 }}>{t("modif.pendingTitle")}</p>
        <p style={{ fontSize: 12, color: T.mut, margin: "6px 0 0", lineHeight: 1.5 }}>
          {t("modif.pendingBodyA")}{photoStaged ? t("modif.pendingPhoto") : ""}{t("modif.pendingBodyB")}
        </p>
      </div>
    );
  }

  return (
    <div style={{ background: T.surf, border: `1px solid ${T.line}`, borderRadius: 14, padding: "14px 16px", margin: "12px 0" }}>
      <p style={{ fontSize: 13, fontWeight: 700, color: T.ink, margin: "0 0 4px", fontFamily: T.fd }}>
        {t("modif.title")}
      </p>
      <p style={{ fontSize: 11.5, color: T.mut, margin: "0 0 12px", lineHeight: 1.5 }}>
        {t("modif.intro")}
      </p>

      {photoUnlocked && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: unlocked.length ? 14 : 4 }}>
          {photoPreview ? (
            <img src={photoPreview} alt={t("modif.newPhotoAlt")} style={{ width: 56, height: 56, borderRadius: "50%", objectFit: "cover", objectPosition: `${photoFocus.x}% ${photoFocus.y}%`, border: `2px solid ${T.b500}` }} />
          ) : (
            <div style={{ width: 56, height: 56, borderRadius: "50%", background: T.tintb, color: T.b600, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>
              {"📷"}
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <input
              ref={photoInput}
              type="file"
              accept="image/jpeg,image/png"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) setPendingFile(f);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              disabled={photoBusy || busy}
              onClick={() => photoInput.current?.click()}
              className="tap"
              style={{ height: 38, padding: "0 14px", borderRadius: 10, background: photoStaged ? T.ok : T.b600, color: "#fff", border: "none", fontWeight: 600, fontSize: 12.5, opacity: photoBusy ? 0.6 : 1 }}
            >
              {photoBusy ? t("common.loading") : photoStaged ? t("modif.photoReadyChange") : t("modif.choosePhoto")}
            </button>
            <p style={{ fontSize: 11, color: T.mut, margin: "6px 0 0", lineHeight: 1.4 }}>
              {photoStaged
                ? t("modif.photoReadyNote")
                : t("modif.photoNotSentNote")}
            </p>
          </div>
        </div>
      )}

      {unlocked.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {unlocked.map((f) => (
            <label key={f} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 11, color: T.mut }}>{t(LABELS[f] ?? f)}</span>
              <Field field={f} value={values[f] ?? ""} refs={refs} onChange={(val) => setValues((prev) => ({ ...prev, [f]: val }))} />
            </label>
          ))}
        </div>
      )}

      {error && <p style={{ fontSize: 12, color: T.dng, margin: "10px 0 0" }}>{error}</p>}
      <button
        type="button"
        disabled={busy || photoBusy}
        onClick={() => void submit()}
        className="tap"
        style={{
          marginTop: 14,
          width: "100%",
          height: 46,
          background: `linear-gradient(180deg,${T.b500},${T.b600})`,
          borderRadius: 12,
          border: "none",
          color: "#fff",
          fontWeight: 600,
          fontSize: 14,
          opacity: busy || photoBusy ? 0.6 : 1,
        }}
      >
        {busy ? t("common.sending") : t("modif.submit")}
      </button>

      {pendingFile && (
        <PhotoFocusEditor
          file={pendingFile}
          busy={photoBusy}
          onCancel={() => setPendingFile(null)}
          onConfirm={(focus) => void stagePhoto(pendingFile, focus)}
        />
      )}
    </div>
  );
}

const INPUT_STYLE: React.CSSProperties = {
  height: 42,
  border: `1px solid ${T.line}`,
  borderRadius: 10,
  padding: "0 12px",
  fontSize: 13.5,
  color: T.ink,
  background: T.surf,
  width: "100%",
};

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: [string, string][] }): JSX.Element {
  const t = useT();
  return (
    <select style={INPUT_STYLE} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{t("completer.selectPlaceholder")}</option>
      {options.map(([v, l]) => (
        <option key={v} value={v}>{t(l)}</option>
      ))}
    </select>
  );
}

function Field({
  field, value, refs, onChange,
}: {
  field: string;
  value: string;
  refs: Record<string, RefItem[]>;
  onChange: (v: string) => void;
}): JSX.Element {
  const t = useT();
  if (field === "situation_matrimoniale") return <Select value={value} onChange={onChange} options={SITUATIONS} />;
  if (field === "genre") return <Select value={value} onChange={onChange} options={GENRES} />;
  if (field === "type_mariage") return <Select value={value} onChange={onChange} options={TYPES_MARIAGE} />;
  if (field === "type_membre") return <Select value={value} onChange={onChange} options={TYPES_MEMBRE} />;
  if (field === "baptise" || field === "confirme" || field === "premiere_communion" || field === "naissance_annee_visible" || field === "en_cheminement") {
    return <Select value={value} onChange={onChange} options={OUI_NON} />;
  }
  const kind = REF_KIND[field];
  if (kind) {
    const list = refs[kind] ?? [];
    // The group is stored by name; the organisational units by id.
    const asName = field === "groupe";
    return (
      <select style={INPUT_STYLE} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{t("completer.selectPlaceholder")}</option>
        {list.map((item) => (
          <option key={item.id} value={asName ? item.nom : item.id}>
            {field === "commission_id" ? uniteLabel(item) : item.nom}
          </option>
        ))}
      </select>
    );
  }
  const upper = field === "nom" || field === "code_membre";
  return (
    <input
      style={{ ...INPUT_STYLE, ...(upper ? { textTransform: "uppercase" } : {}) }}
      type={field === "date_naissance" ? "date" : "text"}
      value={value}
      onChange={(e) => onChange(upper ? e.target.value.toUpperCase() : e.target.value)}
    />
  );
}
