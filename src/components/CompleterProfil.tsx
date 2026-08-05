import { useEffect, useMemo, useRef, useState } from "react";

import {
  ApiError,
  type DocumentItem,
  type FonctionItem,
  type CategorieAttribution,
  type MembreProfile,
  type NiveauItem,
  type ProfilFields,
  type RefItem,
  getDocuments,
  getFonctions,
  getNiveaux,
  getReference,
  isNeedsSignature,
  soumettreInscription,
  soumettreReason,
  updateProfil,
  uploadDocument,
  uploadPhoto,
} from "../api.js";
import { useLang, useT } from "../i18n.js";
import { capitaliserPrenoms, nomMajuscule, uniteLabel } from "../name.js";
import { T, gradient } from "../proto.js";
import {
  DOC_TYPES,
  Field,
  GENRES,
  NIVEAUX_ETUDES,
  SITUATIONS,
  SacrementCheck,
  Stepper,
  TYPES_MARIAGE,
  TelegramInvite,
  WIZARD_STEPS,
  WizardNav,
  baseInp,
  bordureManquante,
  initialFields,
} from "./CompleterProfilParts.js";
import { PaysSelect, PhoneField, indicatifDePays } from "./FormFields.js";
import { CompleterRecap } from "./CompleterRecap.js";
import { PiecesJustificatives } from "./PiecesJustificatives.js";
import { RecadragePhoto } from "./RecadragePhoto.js";
import { SignatureEngagement } from "./SignatureEngagement.js";

interface Props {
  token: string;
  profile: MembreProfile | null;
  statut?: string;
  motif?: string | null;
  champsACorriger?: string[];
  onSubmitted: () => void;
}

/** Which wizard step owns each field, used to jump straight to a correction. */
const FIELD_STEP: Record<string, number> = {
  prenoms: 0, nom: 0, genre: 0, date_naissance: 0, telephone: 0, indicatif_telephone: 0,
  pays: 1, region: 1, ville: 1, commission_id: 1, groupe: 1, intendance_id: 1, coordination_id: 1,
  rattachement: 1, tribu_id: 1,
  type_membre: 2, fonction_cle: 2, adresse: 2, adresse_complement: 2,
  situation_matrimoniale: 2, en_cheminement: 2, profession: 2, niveau_etudes: 2,
  photo: 3, piece: 3,
};

/** Organizational axis of a member: an intendance, a coordination, or (rarely)
 * both. At least one is required; the default is an intendance. */
type AxeOrga = "intendance" | "coordination" | "deux";
const AXES: { value: AxeOrga; labelKey: string }[] = [
  { value: "intendance", labelKey: "completer.axeIntendance" },
  { value: "coordination", labelKey: "completer.axeCoordination" },
  { value: "deux", labelKey: "completer.axeDeux" },
];

/** Human-readable reason for a failure while saving the profile or files, so
 * the member sees what to fix rather than a generic "Soumission impossible". */
function saveReason(err: unknown, t: (key: string) => string): string {
  if (err instanceof ApiError) {
    const detail = err.detail as { locked_fields?: string[] } | undefined;
    if (err.status === 403 && Array.isArray(detail?.locked_fields) && detail.locked_fields.length > 0) {
      return t("completer.errLockedFields").replace("{fields}", detail.locked_fields.join(", "));
    }
    if (err.status === 403) {
      // A photo replacement needs an administration unlock: guide, do not dead-end.
      return t("completer.errPhotoUnlock");
    }
    if (err.status === 413) {
      return t("completer.errFileTooBig");
    }
    if (err.status === 400) {
      return t("completer.errFileFormat");
    }
  }
  return t("completer.errSaveGeneric");
}

/** localStorage key of the in-progress registration draft for a given member. */
function cleBrouillon(membreId: string): string {
  return `adsum.inscription.brouillon.${membreId}`;
}

function lireBrouillon(membreId: string): ProfilFields | null {
  try {
    const brut = localStorage.getItem(cleBrouillon(membreId));
    return brut ? (JSON.parse(brut) as ProfilFields) : null;
  } catch {
    return null;
  }
}

/** Split a single given-names string into (first given name, other given names). */
function decouperPrenoms(prenoms: string | null | undefined): { premier: string; autres: string } {
  const parts = (prenoms ?? "").trim().split(/\s+/).filter(Boolean);
  return { premier: parts[0] ?? "", autres: parts.slice(1).join(" ") };
}

/** Merge freshly loaded profile data over the form without wiping fields the member
 *  has already filled: a late profile load must never erase in-progress input. */
function fusionnerProfil(base: ProfilFields, saisi: ProfilFields): ProfilFields {
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [cle, val] of Object.entries(saisi as Record<string, unknown>)) {
    const vide = val === "" || val === null || val === undefined || (Array.isArray(val) && val.length === 0);
    if (!vide) out[cle] = val;
  }
  return out as ProfilFields;
}

export function CompleterProfil({ token, profile, statut, motif, champsACorriger = [], onSubmitted }: Props): JSX.Element {
  const t = useT();
  const enLangue = useLang() === "en";
  const correction = statut === "modification_demandee";
  const flagged = useMemo(() => new Set(champsACorriger), [champsACorriger]);
  const hl = (name: string): boolean => correction && flagged.has(name);

  // Required fields left empty when the member last tried to move on. Held so the
  // fields themselves can say what is missing: the message under the button named
  // the problem but not its place, and on a long step that meant scrolling back and
  // hunting. Emptied as soon as a field is filled, so nothing stays red once it is
  // answered.
  const [manquants, setManquants] = useState<ReadonlySet<string>>(new Set());
  const manque = (name: string): boolean => manquants.has(name);
  /** Drop a field's mark once it has been answered. */
  function oublierManquant(name: string): void {
    setManquants((prev) => {
      if (!prev.has(name)) return prev;
      const suite = new Set(prev);
      suite.delete(name);
      return suite;
    });
  }

  const [tribus, setTribus] = useState<RefItem[]>([]);
  const [commissions, setCommissions] = useState<RefItem[]>([]);
  const [intendances, setIntendances] = useState<RefItem[]>([]);
  const [coordinations, setCoordinations] = useState<RefItem[]>([]);
  const [groupes, setGroupes] = useState<RefItem[]>([]);
  // Which organizational axis the member is filling. Null until they pick one,
  // in which case it is derived from the loaded data (default: intendance).
  const [axeManuel, setAxeManuel] = useState<AxeOrga | null>(null);
  const [fonctions, setFonctions] = useState<FonctionItem[]>([]);
  const [niveaux, setNiveaux] = useState<NiveauItem[]>([]);
  const [docs, setDocs] = useState<DocumentItem[]>([]);

  const [f, setF] = useState<ProfilFields>(() => initialFields(profile));
  // Given names are captured as two independently-typed inputs (first name, other
  // given names) so a space can be typed freely; f.prenoms is recomposed from them.
  const [premierPrenom, setPremierPrenom] = useState(() => decouperPrenoms(initialFields(profile).prenoms).premier);
  const [autresPrenoms, setAutresPrenoms] = useState(() => decouperPrenoms(initialFields(profile).prenoms).autres);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [photoDejaEnvoyee, setPhotoDejaEnvoyee] = useState(false);
  const [pieceType, setPieceType] = useState("piece_identite");
  const [pieceFile, setPieceFile] = useState<File | null>(null);
  const [pieceDejaEnvoyee, setPieceDejaEnvoyee] = useState(false);
  const [signed, setSigned] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const topRef = useRef<HTMLDivElement | null>(null);
  // Set once the member starts typing, so a late profile load merges without wiping
  // in-progress input.
  const dirty = useRef(false);

  // When a profile finishes loading after first paint, prefill the form WITHOUT
  // overwriting anything the member already filled (non-destructive merge).
  const loadedId = useRef<string | null>(null);
  useEffect(() => {
    if (profile && profile.id !== loadedId.current) {
      loadedId.current = profile.id;
      const charge = initialFields(profile);
      // Restore a locally saved draft (survives a page refresh / back button) over
      // the server data, so a member never loses what they had already typed.
      const brouillon = lireBrouillon(profile.id);
      const base = brouillon ? fusionnerProfil(charge, brouillon) : charge;
      setF((prev) => (dirty.current ? fusionnerProfil(base, prev) : base));
      // Sync the given-name sub-inputs from the restored data only if the member
      // has not started typing them.
      if (!premierPrenom && !autresPrenoms) {
        const d = decouperPrenoms(base.prenoms);
        setPremierPrenom(d.premier);
        setAutresPrenoms(d.autres);
      }
    }
    // premierPrenom/autresPrenoms intentionally omitted: the id guard runs this once
    // per profile, and reading them here must not re-trigger it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  // A silent failure here used to leave EMPTY dropdowns (commissions, tribes,
  // attachments...) with no explanation. Every load error now raises a visible
  // banner with a retry action, so the member never faces a mute empty list.
  const [refsError, setRefsError] = useState(false);
  const chargerReferentiels = useMemo(() => {
    return (): void => {
      setRefsError(false);
      const signale = (): void => setRefsError(true);
      void getReference(token, "tribus").then(setTribus).catch(signale);
      void getReference(token, "commissions").then(setCommissions).catch(signale);
      void getReference(token, "intendances").then(setIntendances).catch(signale);
      void getReference(token, "coordinations").then(setCoordinations).catch(signale);
      void getReference(token, "groupes").then(setGroupes).catch(signale);
      void getFonctions(token).then((list) => setFonctions(list.filter((x) => x.actif))).catch(signale);
      void getNiveaux(token).then((list) => setNiveaux(list.filter((x) => x.actif))).catch(signale);
      void getDocuments(token).then(setDocs).catch(signale);
    };
  }, [token]);
  useEffect(() => {
    chargerReferentiels();
  }, [chargerReferentiels]);

  // Autosave the draft locally once the member has started editing, so a refresh or
  // an accidental back never loses the input. Cleared on a successful submission.
  useEffect(() => {
    if (!profile?.id || !dirty.current) return;
    try {
      localStorage.setItem(cleBrouillon(profile.id), JSON.stringify(f));
    } catch {
      /* storage full or unavailable: the in-memory form still works */
    }
  }, [f, profile?.id]);

  function set<K extends keyof ProfilFields>(k: K, v: ProfilFields[K]): void {
    dirty.current = true;
    setF((prev) => ({ ...prev, [k]: v }));
    // Answering a field clears its mark straight away, rather than at the next
    // attempt to move on: a field that stays red after being filled reads as a
    // refusal of what was just typed.
    const rempli = v !== "" && v !== null && v !== undefined;
    if (rempli && manquants.has(k as string)) {
      setManquants((prev) => {
        const suite = new Set(prev);
        suite.delete(k as string);
        return suite;
      });
    }
  }
  function inp(name: string): React.CSSProperties {
    // A missing required field wins over a correction mark: the member cannot move
    // on until it is filled, so that is the more urgent of the two things to say.
    if (manque(name)) return { ...baseInp, ...bordureManquante };
    return hl(name) ? { ...baseInp, border: `1px solid ${T.warn}` } : baseInp;
  }

  // Attribution declarations (special functions, functions, particular functions):
  // multi-select, each mapped to a fonctions_souhaitees entry with optional scope.
  // The catalogue is filtered strictly by category, so a title never appears in a
  // function block and no category leaks into another.
  const parCategorie = (c: CategorieAttribution): FonctionItem[] => fonctions.filter((fn) => fn.categorie === c);
  const labelFonction = (fn: FonctionItem): string =>
    f.genre === "femme" ? (fn.libelle_f || fn.libelle_n) : f.genre === "homme" ? (fn.libelle_h || fn.libelle_n) : (fn.libelle_n || fn.libelle_h);
  const souhaitees = f.fonctions_souhaitees ?? [];
  const estSelectionnee = (cle: string): boolean => souhaitees.some((x) => x.cle === cle);
  const basculerFonction = (cle: string): void =>
    set("fonctions_souhaitees", estSelectionnee(cle) ? souhaitees.filter((x) => x.cle !== cle) : [...souhaitees, { cle, perimetre: "" }]);
  const definirPerimetre = (cle: string, v: string): void =>
    set("fonctions_souhaitees", souhaitees.map((x) => (x.cle === cle ? { ...x, perimetre: v } : x)));
  const perimetreDe = (cle: string): string => souhaitees.find((x) => x.cle === cle)?.perimetre ?? "";

  function BlocFonctions({ categorie, note, avecPerimetre }: { categorie: CategorieAttribution; note: string; avecPerimetre: boolean }): JSX.Element | null {
    const items = parCategorie(categorie);
    if (items.length === 0) return null;
    return (
      <div style={{ margin: "4px 2px 12px" }}>
        <p style={{ fontSize: 11, color: T.mut, lineHeight: 1.5, margin: "2px 0 8px" }}>{note}</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {items.map((fn) => {
            const sel = estSelectionnee(fn.cle);
            return (
              <div key={fn.cle}>
                <button
                  type="button"
                  className="tap"
                  onClick={() => basculerFonction(fn.cle)}
                  aria-pressed={sel}
                  style={{
                    // One weight, ticked or not. Bolding on selection made the list
                    // reflow as the member worked through it, and put the emphasis on
                    // whichever answers happened to be chosen rather than on the
                    // question. The frame and the tint already say what is selected.
                    width: "100%", textAlign: "left", cursor: "pointer", fontFamily: "inherit", fontSize: 14,
                    padding: "11px 13px", borderRadius: 11, fontWeight: 500,
                    border: `1.5px solid ${sel ? T.b600 : T.line}`,
                    background: sel ? T.tintb : "transparent", color: sel ? T.tintbf : T.ink,
                    display: "flex", alignItems: "center", gap: 10,
                  }}
                >
                  <span aria-hidden style={{
                    width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                    border: `1.5px solid ${sel ? T.b600 : T.faint}`, background: sel ? T.b600 : "transparent",
                  }} />
                  {labelFonction(fn)}
                </button>
                {sel && avecPerimetre && (
                  // The scope is ALWAYS picked from the configured units (no free
                  // text): free entry would create uncontrolled values and break the
                  // statistics. Options come from the real referential lists.
                  <select
                    style={{ ...baseInp, marginTop: 6 }}
                    value={perimetreDe(fn.cle)}
                    onChange={(e) => definirPerimetre(fn.cle, e.target.value)}
                    aria-label={t("completer.phPerimetre")}
                  >
                    <option value="">{t("completer.perimetreAucun")}</option>
                    {commissions.length > 0 && (
                      <optgroup label={t("hierarchie.commission")}>
                        {commissions.map((u) => <option key={`cm-${u.id}`} value={`Commission ${u.nom}`}>{u.nom}</option>)}
                      </optgroup>
                    )}
                    {coordinations.length > 0 && (
                      <optgroup label={t("hierarchie.coordination")}>
                        {coordinations.map((u) => <option key={`co-${u.id}`} value={`Coordination ${u.nom}`}>{u.nom}</option>)}
                      </optgroup>
                    )}
                    {intendances.length > 0 && (
                      <optgroup label={t("hierarchie.intendance")}>
                        {intendances.map((u) => <option key={`it-${u.id}`} value={`Intendance ${u.nom}`}>{u.nom}</option>)}
                      </optgroup>
                    )}
                    {tribus.length > 0 && (
                      <optgroup label={t("hierarchie.maTribu")}>
                        {tribus.map((u) => <option key={`tr-${u.id}`} value={`Tribu ${u.nom}`}>{u.nom}</option>)}
                      </optgroup>
                    )}
                  </select>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // The active axis: an explicit choice wins; otherwise it is inferred from the
  // loaded data so a returning member sees the right dropdowns pre-filled.
  const axe: AxeOrga = axeManuel ?? (f.coordination_id ? (f.intendance_id ? "deux" : "coordination") : "intendance");
  const montrerIntendance = axe === "intendance" || axe === "deux";
  const montrerCoordination = axe === "coordination" || axe === "deux";
  // Switching axis clears the now-irrelevant field so a stale value is never
  // submitted (e.g. keeping an old intendance after choosing a coordination).
  function choisirAxe(next: AxeOrga): void {
    setAxeManuel(next);
    if (next === "intendance") set("coordination_id", "");
    else if (next === "coordination") set("intendance_id", "");
  }
  // At least one axis must be provided; "deux" requires both.
  const axeOk = axe === "deux" ? !!f.intendance_id && !!f.coordination_id : axe === "coordination" ? !!f.coordination_id : !!f.intendance_id;

  const photoProvided = !!profile?.photo_url;
  // A document counts as provided only when it has really been uploaded (statut
  // 'recu' / a recu_le), not when the administration merely REQUESTED it (statut
  // 'demande', no file). Otherwise the recap says "fourni" while the server refuses
  // the submission with needs_document, leaving the member stuck without knowing why.
  const pieceProvided = docs.some(
    (d) => d.type != null && DOC_TYPES.includes(d.type) && (d.statut === "recu" || !!d.recu_le),
  );

  const requiredOk =
    !!f.prenoms?.trim() && !!f.nom?.trim() && !!f.telephone?.trim() && !!f.indicatif_telephone?.trim() &&
    !!f.date_naissance && !!f.genre && !!f.pays?.trim() && !!f.ville?.trim() && !!f.commission_id && !!f.tribu_id &&
    !!f.date_entree && !!f.situation_matrimoniale && axeOk &&
    (f.berger_declare !== true || !!f.berger_nom_declare?.trim());
  // A document is required only if it is not already provided, or if it was
  // explicitly flagged for correction.
  const photoOk = photoProvided ? true : !!photoFile;
  const pieceOk = pieceProvided ? true : !!pieceFile;
  const photoNeedsRedo = hl("photo") && !photoFile;
  const pieceNeedsRedo = hl("piece") && !pieceFile;

  /** Blocking message of a step, or null when the member can move on. */
  function stepBlocker(i: number): string | null {
    if (i === 0) {
      if (!f.prenoms?.trim() || !f.nom?.trim() || !f.genre || !f.date_naissance) {
        return t("completer.errNamesRequired");
      }
      if (!f.telephone?.trim() || !f.indicatif_telephone?.trim()) {
        return t("completer.errPhoneRequired");
      }
      return null;
    }
    if (i === 1) {
      if (!f.pays?.trim() || !f.ville?.trim()) return t("completer.errCountryCity");
      if (!f.commission_id) return t("completer.errCommission");
      if (!axeOk) {
        return axe === "deux" ? t("completer.errBothAxes") : t("completer.errOneAxis");
      }
      if (!f.tribu_id) return t("completer.errTribu");
      return null;
    }
    if (i === 2) {
      // The entry date into the organisation is mandatory (community journey), and
      // the marital situation is a core profile fact: neither is left optional.
      // Declaring oneself a berger without giving the consecration name leaves a
      // title attached to nobody, which the administration cannot confirm.
      if (f.berger_declare === true && !f.berger_nom_declare?.trim()) {
        return t("completer.errBergerNom");
      }
      if (!f.date_entree) return t("completer.errDateEntree");
      if (!f.situation_matrimoniale) return t("completer.errSituation");
      return null;
    }
    if (i === 3) {
      if (!photoOk || !pieceOk) return t("completer.errDocsRequired");
      if (photoNeedsRedo || pieceNeedsRedo) return t("completer.errDocRedo");
      return null;
    }
    if (i === 4 && !signed) return t("consent.signBeforeSubmit");
    return null;
  }

  /**
   * Which required fields of a step are still empty.
   *
   * Deliberately a second reading of the same rules as stepBlocker rather than a
   * refactor of it: that one answers "may the member move on", in one message and in
   * a chosen order, and this one answers "which fields are at fault", all of them at
   * once. Merging them would force one of the two answers into the shape of the
   * other.
   */
  function champsManquants(i: number): string[] {
    if (i === 0) {
      return [
        !f.prenoms?.trim() && "prenoms",
        !f.nom?.trim() && "nom",
        !f.genre && "genre",
        !f.date_naissance && "date_naissance",
        !f.indicatif_telephone?.trim() && "indicatif_telephone",
        !f.telephone?.trim() && "telephone",
      ].filter((x): x is string => typeof x === "string");
    }
    if (i === 1) {
      const axes = axe === "deux"
        ? [!f.intendance_id && "intendance_id", !f.coordination_id && "coordination_id"]
        : [axe === "coordination" ? !f.coordination_id && "coordination_id" : !f.intendance_id && "intendance_id"];
      return [
        !f.pays?.trim() && "pays",
        !f.ville?.trim() && "ville",
        !f.commission_id && "commission_id",
        ...axes,
        !f.tribu_id && "tribu_id",
      ].filter((x): x is string => typeof x === "string");
    }
    if (i === 2) {
      return [
        f.berger_declare === true && !f.berger_nom_declare?.trim() && "berger_nom_declare",
        !f.date_entree && "date_entree",
        !f.situation_matrimoniale && "situation_matrimoniale",
      ].filter((x): x is string => typeof x === "string");
    }
    if (i === 3) {
      return [
        (!photoOk || photoNeedsRedo) && "photo",
        (!pieceOk || pieceNeedsRedo) && "piece",
      ].filter((x): x is string => typeof x === "string");
    }
    return [];
  }

  /** Bring the first field at fault into view, so the red mark is seen, not hunted. */
  function allerAuPremierManquant(champs: string[]): void {
    const premier = champs[0];
    if (!premier || typeof document === "undefined") return;
    // After the state update, so the field is already marked when it is scrolled to.
    requestAnimationFrame(() => {
      const cible = document.querySelector(`[data-champ="${premier}"]`);
      cible?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  }

  function goTo(i: number): void {
    setError(null);
    setManquants(new Set());
    setStep(Math.max(0, Math.min(WIZARD_STEPS.length - 1, i)));
    topRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }
  function goNext(): void {
    const blocker = stepBlocker(step);
    if (blocker) {
      setError(blocker);
      const champs = champsManquants(step);
      setManquants(new Set(champs));
      allerAuPremierManquant(champs);
      return;
    }
    goTo(step + 1);
  }

  const firstFlaggedStep = useMemo(() => {
    const steps = champsACorriger.map((c) => FIELD_STEP[c]).filter((s) => s !== undefined);
    return steps.length ? Math.min(...steps) : null;
  }, [champsACorriger]);

  async function submit(): Promise<void> {
    setError(null);
    if (!requiredOk) {
      setError(t("completer.errAllRequired"));
      return;
    }
    if (!photoOk || !pieceOk) {
      setError(t("completer.errDocsRequired"));
      return;
    }
    if (photoNeedsRedo || pieceNeedsRedo) {
      setError(t("completer.errDocRedo"));
      return;
    }
    if (!signed) {
      setError(t("consent.signBeforeSubmit"));
      return;
    }
    setBusy(true);
    try {
      // Phase 1: persist the profile and any new files. A failure here is about
      // saving the data, not about the final submission gate. Each file is uploaded
      // ONCE: on a later retry (e.g. the signature was invalidated meanwhile) the
      // photo is not pushed again, which would hit the replacement 403 and block the
      // member for good.
      try {
        await updateProfil(token, f);
        if (photoFile && !photoDejaEnvoyee) {
          await uploadPhoto(token, photoFile);
          setPhotoDejaEnvoyee(true);
        }
        if (pieceFile && !pieceDejaEnvoyee) {
          await uploadDocument(token, pieceType, pieceFile);
          setPieceDejaEnvoyee(true);
        }
      } catch (saveErr) {
        setError(saveReason(saveErr, t));
        return;
      }
      // Phase 2: the server-side submission gate (fields, document, signature).
      await soumettreInscription(token);
      // Dossier accepted for review: the local draft is no longer needed.
      if (profile?.id) {
        try {
          localStorage.removeItem(cleBrouillon(profile.id));
        } catch {
          /* ignore */
        }
      }
      onSubmitted();
    } catch (err) {
      if (isNeedsSignature(err)) {
        setSigned(false);
        setError(t("consent.signBeforeSubmit"));
        goTo(4);
      } else {
        // Surface the precise server reason (missing field, document) instead
        // of a generic message that hides why the submission was refused.
        setError(soumettreReason(err) ?? t("completer.errSubmit"));
      }
    } finally {
      setBusy(false);
    }
  }

  const commissionSel = commissions.find((c) => c.id === f.commission_id);
  const commissionNom = commissionSel ? uniteLabel(commissionSel) : "";
  const tribuNom = tribus.find((x) => x.id === f.tribu_id)?.nom ?? "";
  const intendanceNom = intendances.find((x) => x.id === f.intendance_id)?.nom ?? "";
  const coordinationNom = coordinations.find((x) => x.id === f.coordination_id)?.nom ?? "";
  const rattachementTxt = [
    coordinationNom && t("completer.rattCoordination").replace("{n}", coordinationNom),
    intendanceNom && t("completer.rattIntendance").replace("{n}", intendanceNom),
  ]
    .filter(Boolean)
    .join(" . ");

  // The two given-name inputs are the source of truth (independent state), so a
  // space is always typable; f.prenoms is recomposed from them on every change. The
  // recomposition trims/collapses only the STORED value, never the input text.
  function majPremier(premier: string): void {
    dirty.current = true;
    setPremierPrenom(premier);
    set("prenoms", `${premier} ${autresPrenoms}`.replace(/\s+/g, " ").trim());
  }
  function majAutres(autres: string): void {
    dirty.current = true;
    setAutresPrenoms(autres);
    set("prenoms", `${premierPrenom} ${autres}`.replace(/\s+/g, " ").trim());
  }
  // On blur, normalise the given names to title case (particles lowercase) without
  // fighting the person while they type.
  function capitaliserPrenomsChamps(): void {
    const p = capitaliserPrenoms(premierPrenom);
    const a = capitaliserPrenoms(autresPrenoms);
    setPremierPrenom(p);
    setAutresPrenoms(a);
    set("prenoms", `${p} ${a}`.replace(/\s+/g, " ").trim());
  }

  return (
    <div ref={topRef} className="scr" style={{ padding: "10px 18px 28px" }}>
      <div style={{ fontFamily: T.fd, fontWeight: 700, fontSize: 19 }}>{t("completer.wizardTitle")}</div>
      <p style={{ fontSize: 12.5, color: T.mut, lineHeight: 1.55, margin: "6px 0 4px" }}>
        {t("completer.introA")}<span style={{ color: T.dng }}>*</span>{t("completer.introB")}
      </p>
      {correction && (
        <div style={{ background: T.warnbg, border: `1px solid ${T.warn}`, borderRadius: 11, padding: 12, margin: "8px 0" }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: T.warn }}>
            {motif ? t("correction.banner").replace("{motif}", motif) : t("correction.bannerNoMotif")}
          </div>
          {champsACorriger.length > 0 && (
            <div style={{ fontSize: 11, color: T.warn, marginTop: 6 }}>
              {t("correction.fieldsIntro")} : {champsACorriger.join(", ")}
            </div>
          )}
          {firstFlaggedStep !== null && firstFlaggedStep !== step && (
            <div onClick={() => goTo(firstFlaggedStep)} className="tap" style={{ marginTop: 8, height: 36, borderRadius: 9, background: T.warn, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600, fontSize: 12 }}>
              {t("completer.goToFirstError")}
            </div>
          )}
        </div>
      )}

      <Stepper step={step} />

      {refsError && (
        <div style={{ background: T.warnbg, border: `1px solid ${T.warn}`, borderRadius: 11, padding: "10px 12px", margin: "8px 0", display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={{ fontSize: 12, color: T.warn, lineHeight: 1.45 }}>{t("completer.refsError")}</span>
          <button type="button" className="tap" onClick={chargerReferentiels} style={{ alignSelf: "flex-start", border: `1.5px solid ${T.warn}`, background: "transparent", color: T.warn, borderRadius: 9, padding: "7px 14px", fontSize: 12.5, fontWeight: 600, fontFamily: "inherit", cursor: "pointer" }}>
            {t("completer.refsRetry")}
          </button>
        </div>
      )}

      {step === 0 && (
        <>
          <TelegramInvite token={token} />
          <Field label={t("completer.fNom")} required champ="nom" manquant={manque("nom")} highlight={hl("nom")} info={t("completer.iNom")}><input style={inp("nom")} value={f.nom} onChange={(e) => set("nom", nomMajuscule(e.target.value))} placeholder={t("completer.phNom")} /></Field>
          <Field label={t("completer.fNomNaissance")} highlight={hl("nom_naissance")} info={t("completer.iNomNaissance")}><input style={inp("nom_naissance")} value={f.nom_naissance ?? ""} onChange={(e) => set("nom_naissance", nomMajuscule(e.target.value))} placeholder={t("completer.phNomNaissance")} /></Field>
          <Field label={t("completer.fPremierPrenom")} required champ="prenoms" manquant={manque("prenoms")} highlight={hl("prenoms")} info={t("completer.iPremierPrenom")}><input style={inp("prenoms")} value={premierPrenom} onChange={(e) => majPremier(e.target.value)} onBlur={capitaliserPrenomsChamps} placeholder={t("completer.phPremierPrenom")} /></Field>
          <Field label={t("completer.fAutresPrenoms")} info={t("completer.iAutresPrenoms")}><input style={baseInp} value={autresPrenoms} onChange={(e) => majAutres(e.target.value)} onBlur={capitaliserPrenomsChamps} placeholder={t("completer.phAutresPrenoms")} /></Field>
          <Field label={t("completer.fGenre")} required champ="genre" manquant={manque("genre")} highlight={hl("genre")}>
            <select style={inp("genre")} value={f.genre} onChange={(e) => set("genre", e.target.value)}>
              <option value="">{t("completer.selectPlaceholder")}</option>
              {GENRES.map((g) => <option key={g.value} value={g.value}>{t(g.labelKey)}</option>)}
            </select>
          </Field>
          <Field label={t("completer.fDateNaissance")} required champ="date_naissance" manquant={manque("date_naissance")} highlight={hl("date_naissance")} info={t("completer.iDateNaissance")}><input type="date" style={inp("date_naissance")} value={f.date_naissance} onChange={(e) => set("date_naissance", e.target.value)} /></Field>
          <label style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 2px 2px", fontSize: 12, color: T.mut }}>
            <input type="checkbox" checked={!!f.naissance_annee_visible} onChange={(e) => set("naissance_annee_visible", e.target.checked)} style={{ width: 17, height: 17, accentColor: T.b600 }} />
            {t("completer.anneeVisible")}
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 10, padding: "2px 2px 4px", fontSize: 12, color: T.mut }}>
            <input type="checkbox" checked={f.anniversaire_visible_annuaire !== false} onChange={(e) => set("anniversaire_visible_annuaire", e.target.checked)} style={{ width: 17, height: 17, accentColor: T.b600 }} />
            {t("completer.anniversaireVisible")}
          </label>
          <Field label={t("completer.fTelephone")} required champ="telephone" manquant={manque("telephone") || manque("indicatif_telephone")} highlight={hl("telephone")} info={t("completer.iTelephone")}>
            <PhoneField
              indicatif={f.indicatif_telephone ?? ""}
              numero={f.telephone ?? ""}
              onIndicatif={(i) => set("indicatif_telephone", i)}
              onNumero={(n) => set("telephone", n)}
            />
          </Field>
          <Field label={t("completer.fWhatsapp")} highlight={hl("whatsapp_numero")} info={t("completer.iWhatsapp")}><input style={inp("whatsapp_numero")} value={f.whatsapp_numero ?? ""} onChange={(e) => set("whatsapp_numero", e.target.value)} placeholder={t("completer.phWhatsapp")} inputMode="tel" /></Field>
        </>
      )}

      {step === 1 && (
        <>
          <Field label={t("completer.fPays")} required champ="pays" manquant={manque("pays")} highlight={hl("pays")} info={t("completer.iPays")}>
            <PaysSelect
              value={f.pays ?? ""}
              onChange={(nom) => {
                set("pays", nom);
                if (!f.indicatif_telephone) set("indicatif_telephone", indicatifDePays(nom));
              }}
            />
          </Field>
          <Field label={t("completer.fRegion")} highlight={hl("region")}><input style={inp("region")} value={f.region ?? ""} onChange={(e) => set("region", e.target.value)} placeholder={t("completer.phRegion")} /></Field>
          <Field label={t("completer.fVille")} required champ="ville" manquant={manque("ville")} highlight={hl("ville")}><input style={inp("ville")} value={f.ville} onChange={(e) => set("ville", e.target.value)} /></Field>
          <Field label={t("completer.fCommission")} required champ="commission_id" manquant={manque("commission_id")} highlight={hl("commission_id")} info={t("completer.iCommission")}>
            <select style={inp("commission_id")} value={f.commission_id ?? ""} onChange={(e) => set("commission_id", e.target.value)}>
              <option value="">{t("completer.selectPlaceholder")}</option>
              {commissions.map((c) => <option key={c.id} value={c.id}>{uniteLabel(c)}</option>)}
            </select>
          </Field>
          <Field label={t("completer.fSousCommission")} highlight={hl("groupe")} info={t("completer.iSousCommission")}>
            <select style={inp("groupe")} value={f.groupe ?? ""} onChange={(e) => set("groupe", e.target.value)}>
              <option value="">{t("completer.selectPlaceholder")}</option>
              {groupes.map((g) => <option key={g.id} value={g.nom}>{g.nom}</option>)}
            </select>
          </Field>
          <Field label={t("completer.fRattachement")} required champ="intendance_id" manquant={manque("intendance_id") || manque("coordination_id")} highlight={hl("intendance_id") || hl("coordination_id")} info={t("completer.iRattachement")}>
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              {AXES.map((a) => {
                const actif = axe === a.value;
                return (
                  <button
                    type="button"
                    key={a.value}
                    onClick={() => choisirAxe(a.value)}
                    className="tap"
                    aria-pressed={actif}
                    style={{ flex: 1, height: 42, borderRadius: 10, border: `1.5px solid ${actif ? T.b600 : T.line}`, background: actif ? T.tintb : T.surf, color: actif ? T.b600 : T.ink, fontWeight: 600, fontSize: 12.5, fontFamily: "inherit", cursor: "pointer" }}
                  >
                    {t(a.labelKey)}
                  </button>
                );
              })}
            </div>
            {montrerIntendance && (
              <select style={inp("intendance_id")} value={f.intendance_id ?? ""} onChange={(e) => set("intendance_id", e.target.value)} aria-label={t("completer.axeIntendance")}>
                <option value="">{t("completer.selectIntendance")}</option>
                {intendances.map((i) => <option key={i.id} value={i.id}>{i.nom}</option>)}
              </select>
            )}
            {montrerCoordination && (
              <select style={{ ...inp("coordination_id"), marginTop: montrerIntendance ? 8 : 0 }} value={f.coordination_id ?? ""} onChange={(e) => set("coordination_id", e.target.value)} aria-label={t("completer.axeCoordination")}>
                <option value="">{t("completer.selectCoordination")}</option>
                {coordinations.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
              </select>
            )}
          </Field>
          <Field label={t("completer.fTribu")} required champ="tribu_id" manquant={manque("tribu_id")} highlight={hl("tribu_id")}>
            <select style={inp("tribu_id")} value={f.tribu_id ?? ""} onChange={(e) => set("tribu_id", e.target.value)}>
              <option value="">{t("completer.selectPlaceholder")}</option>
              {tribus.map((tr) => <option key={tr.id} value={tr.id}>{tr.nom}</option>)}
            </select>
          </Field>
        </>
      )}

      {step === 2 && (
        <>
          {/* The community's own member code, asked first and on its own.
              It used to sit far down this step between two other fields, and members
              read past it: it is a second identifier, issued by the community and
              distinct from the matricule this platform generates, so nobody can
              reissue it if it is lost here. Given its own block at the top, it is
              read before anything competes with it. */}
          <div style={{ border: `1px solid ${T.b600}`, background: T.tintb, borderRadius: 13, padding: "10px 13px 14px", margin: "12px 0 4px" }}>
            <p style={{ fontFamily: T.fm, fontSize: 9, letterSpacing: 0.8, color: T.b600, margin: "2px 0 0" }}>{t("completer.secCodeMembre")}</p>
            <p style={{ fontSize: 11.5, color: T.ink, lineHeight: 1.5, margin: "6px 0 2px" }}>{t("completer.noteCodeMembre")}</p>
            {/* Asked before the code itself, and answered "oui" to begin with: the
                code is issued to every member, so having one is the ordinary case
                and the exception is what deserves an explicit act. Saying "non"
                closes the field rather than leaving an empty box the member might
                read as optional. */}
            <Field label={t("completer.fACodeMembre")} champ="a_code_membre" info={t("completer.iACodeMembre")}>
              <select
                style={inp("a_code_membre")}
                value={f.a_code_membre === false ? "non" : "oui"}
                onChange={(e) => {
                  const possede = e.target.value === "oui";
                  set("a_code_membre", possede);
                  // Clearing on "non" keeps the record consistent with what was just
                  // declared, instead of storing a code beside a statement that
                  // there is none.
                  if (!possede) set("code_membre", "");
                }}
              >
                <option value="oui">{t("completer.aCodeMembreOui")}</option>
                <option value="non">{t("completer.aCodeMembreNon")}</option>
              </select>
            </Field>
            {f.a_code_membre === false ? (
              // What happens next, said now. A member who is told only "you cannot
              // fill this in" assumes the matter is closed; what they need to know
              // is that the field reopens, and on what.
              <p style={{ fontSize: 11.5, color: T.ink, background: T.warnbg, border: `1px solid ${T.warn}`, borderRadius: 11, padding: "10px 12px", lineHeight: 1.55, margin: "10px 0 2px" }}>
                {t("completer.noteSansCodeMembre")}
              </p>
            ) : (
              <Field label={t("completer.fCodeMembre")} champ="code_membre" highlight={hl("code_membre")} info={t("completer.iCodeMembre")}>
                <input
                  style={{ ...inp("code_membre"), textTransform: "uppercase", fontFamily: T.fm, letterSpacing: 1, fontSize: 15 }}
                  value={f.code_membre ?? ""}
                  onChange={(e) => set("code_membre", e.target.value.toUpperCase())}
                  placeholder={t("completer.phCodeMembre")}
                  maxLength={32}
                />
              </Field>
            )}
          </div>

          <p style={{ fontFamily: T.fm, fontSize: 9, letterSpacing: 0.8, color: T.b600, margin: "18px 2px 2px" }}>{t("completer.secEngagement")}</p>
          <Field label={t("profil.statut")} champ="type_membre" highlight={hl("type_membre")} info={t("profil.statutInfo")}>
            <select style={inp("type_membre")} value={f.type_membre ?? ""} onChange={(e) => set("type_membre", e.target.value)}>
              <option value="">{t("completer.selectPlaceholder")}</option>
              {niveaux.map((n) => <option key={n.cle} value={n.cle}>{n.libelle}</option>)}
              {f.type_membre && !niveaux.some((n) => n.cle === f.type_membre) && (
                <option value={f.type_membre}>{f.type_membre}</option>
              )}
            </select>
          </Field>
          {/* Responsibilities and titles: existing community members declare what
              they already hold. Every declaration here is a PROPOSAL reviewed and
              confirmed by the administration, never self-granted. */}
          <p style={{ fontFamily: T.fm, fontSize: 9, letterSpacing: 0.8, color: T.b600, margin: "18px 2px 2px" }}>{t("completer.secTitres")}</p>
          <p style={{ fontSize: 11, color: T.mut, lineHeight: 1.5, margin: "2px 2px 8px" }}>{t("completer.titresNote")}</p>

          {/* Block 1: consecration title (Berger/Bergere). The only current title
              is Berger, so it is asked as a yes/no; the name feeds berger_declare. */}
          <p style={{ fontWeight: 700, fontSize: 13, color: T.ink, margin: "8px 2px 4px" }}>{t("completer.blocTitre")}</p>
          {/* Nothing is preselected. Showing "non" before the member has answered is
              an answer the platform gives on their behalf: they scroll past it,
              nothing looks unanswered, and a declaration that should have been made
              never is. The empty option is the honest starting state. */}
          <Field label={t("completer.fBergerDeclare")} champ="berger_declare" highlight={hl("berger_declare")} info={t("completer.iBergerDeclare")}>
            <select
              style={inp("berger_declare")}
              value={f.berger_declare === true ? "oui" : f.berger_declare === false ? "non" : ""}
              onChange={(e) => set("berger_declare", e.target.value === "" ? null : e.target.value === "oui")}
            >
              <option value="">{t("completer.selectPlaceholder")}</option>
              <option value="non">{t("completer.bergerNon")}</option>
              <option value="oui">{t("completer.bergerOui")}</option>
            </select>
          </Field>
          {f.berger_declare && (
            <>
              {/* The consecration title is DERIVED from the gender (Berger for a man,
                  Bergere for a woman), matching the back-office and the database, so
                  the member never types it. The name field is cleaned of any
                  "Berger"/"Bergere" prefix to prevent a duplicated title. */}
              <Field label={t("completer.bergerApercuTitre")}>
                <input
                  readOnly
                  value={f.genre === "homme" ? "Berger" : f.genre === "femme" ? "Bergère" : ""}
                  placeholder={t("completer.bergerGenreManquant")}
                  style={{ ...inp("berger_declare"), background: T.tintb, color: T.b600, fontWeight: 700 }}
                />
              </Field>
              {!f.genre && <p style={{ fontSize: 11, color: T.warn, margin: "4px 2px 0" }}>{t("completer.bergerGenreManquant")}</p>}
              {/* Required from the moment the member says they are a berger. The
                  consecration name IS the declaration: "Berger" with no name names
                  nobody, and the administration cannot verify what it cannot read.
                  It only exists inside this branch, so answering "non" removes the
                  question rather than leaving an obligation nobody can meet. */}
              <Field label={t("completer.fBergerNom")} required champ="berger_nom_declare" manquant={manque("berger_nom_declare")} highlight={hl("berger_nom_declare")} info={t("completer.iBergerNom")}>
                <input
                  style={inp("berger_nom_declare")}
                  value={f.berger_nom_declare ?? ""}
                  onChange={(e) => set("berger_nom_declare", e.target.value.replace(/^\s*berg(er|ere|ère)\s+/i, ""))}
                  placeholder={t("completer.phBergerNom")}
                />
              </Field>
              {f.berger_nom_declare && f.genre && (
                <p style={{ fontSize: 12, color: T.ink, margin: "6px 2px 0", fontWeight: 600 }}>
                  {t("completer.bergerApercu").replace("{v}", `${f.genre === "homme" ? "Berger" : "Bergère"} ${f.berger_nom_declare}`)}
                </p>
              )}
              <p style={{ fontSize: 11, color: T.warn, margin: "6px 2px 0" }}>{t("completer.bergerAttente")}</p>
            </>
          )}

          {/* Block 2: special functions (multi-select, no scope). */}
          {parCategorie("fonction_speciale").length > 0 && (
            <>
              <p style={{ fontWeight: 700, fontSize: 13, color: T.ink, margin: "16px 2px 4px" }}>{t("completer.blocFonctionSpeciale")}</p>
              <BlocFonctions categorie="fonction_speciale" note={t("completer.noteFonctionSpeciale")} avecPerimetre={false} />
            </>
          )}

          {/* Block 3: ordinary functions (multi-select, with scope). */}
          {parCategorie("fonction").length > 0 && (
            <>
              <p style={{ fontWeight: 700, fontSize: 13, color: T.ink, margin: "16px 2px 4px" }}>{t("completer.blocFonction")}</p>
              <BlocFonctions categorie="fonction" note={t("completer.noteFonction")} avecPerimetre />
            </>
          )}

          {/* Block 4: particular (transversal) functions (multi-select, with scope). */}
          {parCategorie("fonction_particuliere").length > 0 && (
            <>
              <p style={{ fontWeight: 700, fontSize: 13, color: T.ink, margin: "16px 2px 4px" }}>{t("completer.blocFonctionParticuliere")}</p>
              <BlocFonctions categorie="fonction_particuliere" note={t("completer.noteFonctionParticuliere")} avecPerimetre />
            </>
          )}
          {souhaitees.length > 0 && (
            <p style={{ fontSize: 11, color: T.warn, margin: "10px 2px 0" }}>{t("completer.fonctionsAttente")}</p>
          )}
          <Field label={t("completer.fDateEntree")} required champ="date_entree" manquant={manque("date_entree")} highlight={hl("date_entree")} info={t("completer.iDateEntree")}>
            <input type="date" style={inp("date_entree")} value={f.date_entree ?? ""} onChange={(e) => set("date_entree", e.target.value)} />
          </Field>
          {/* Leadership-team SELF-DECLARATION: reviewed and confirmed by the
              administration (adding a real membership in the special-teams page). The
              declaration alone never grants anything. */}
          <Field label={t("completer.fEquipeDirigeante")} champ="equipe_dirigeante_declaree" highlight={hl("equipe_dirigeante_declaree")} info={t("completer.iEquipeDirigeante")}>
            <select
              style={inp("equipe_dirigeante_declaree")}
              value={f.equipe_dirigeante_declaree === true ? "oui" : f.equipe_dirigeante_declaree === false ? "non" : ""}
              onChange={(e) => set("equipe_dirigeante_declaree", e.target.value === "" ? null : e.target.value === "oui")}
            >
              <option value="">{t("completer.selectPlaceholder")}</option>
              <option value="non">{t("completer.equipeDirigeanteNon")}</option>
              <option value="oui">{t("completer.equipeDirigeanteOui")}</option>
            </select>
          </Field>
          {f.equipe_dirigeante_declaree && (
            <p style={{ fontSize: 11, color: T.warn, margin: "6px 2px 0" }}>{t("completer.equipeDirigeanteAttente")}</p>
          )}
          <Field label={t("completer.fPromotion")} highlight={hl("promotion")} info={t("completer.iPromotion")}>
            <input style={inp("promotion")} value={f.promotion ?? ""} onChange={(e) => set("promotion", e.target.value)} placeholder={t("completer.phPromotion")} />
          </Field>

          <p style={{ fontFamily: T.fm, fontSize: 9, letterSpacing: 0.8, color: T.b600, margin: "18px 2px 2px" }}>{t("completer.secAdresse")}</p>
          <p style={{ fontSize: 11, color: T.mut, lineHeight: 1.5, margin: "2px 2px 6px" }}>{t("completer.adresseNote")}</p>
          <Field label={t("completer.fAdresse")} highlight={hl("adresse")} info={t("completer.iAdresse")}><input style={inp("adresse")} value={f.adresse ?? ""} onChange={(e) => set("adresse", e.target.value)} placeholder={t("completer.phAdresse")} /></Field>
          <Field label={t("completer.fComplement")} highlight={hl("adresse_complement")}><input style={inp("adresse_complement")} value={f.adresse_complement ?? ""} onChange={(e) => set("adresse_complement", e.target.value)} placeholder={t("completer.phComplement")} /></Field>

          <p style={{ fontFamily: T.fm, fontSize: 9, letterSpacing: 0.8, color: T.b600, margin: "18px 2px 2px" }}>{t("completer.secVie")}</p>
          <Field label={t("completer.fSituation")} required champ="situation_matrimoniale" manquant={manque("situation_matrimoniale")} highlight={hl("situation_matrimoniale")}>
            <select
              style={inp("situation_matrimoniale")}
              value={f.situation_matrimoniale ?? ""}
              onChange={(e) => set("situation_matrimoniale", e.target.value)}
            >
              <option value="">{t("completer.selectPlaceholder")}</option>
              {SITUATIONS.map((s) => <option key={s.value} value={s.value}>{t(s.labelKey)}</option>)}
            </select>
          </Field>
          {/* Asked of everyone, whatever they answered above, and never cleared by
              that answer. It used to appear only for a single or in-couple member,
              which reads one organisation's meaning of those words into the form:
              what counts as "célibataire" differs from one community to the next, and
              this product is meant to serve more than one. The question stays
              optional, so a member it does not concern simply leaves it empty. */}
          <Field label={t("completer.fCheminement")} champ="en_cheminement" highlight={hl("en_cheminement")} info={t("completer.iCheminement")}>
            <select
              style={inp("en_cheminement")}
              value={f.en_cheminement === true ? "oui" : f.en_cheminement === false ? "non" : ""}
              onChange={(e) => set("en_cheminement", e.target.value === "" ? null : e.target.value === "oui")}
            >
              <option value="">{t("completer.selectPlaceholder")}</option>
              <option value="oui">{t("completer.cheminementOui")}</option>
              <option value="non">{t("completer.cheminementNon")}</option>
            </select>
          </Field>
          {/* The kind of marriage only makes sense once the member declares they
              are married; it is one of the fields the backend accepts at
              registration (dot / religious / both / civil). */}
          {f.situation_matrimoniale === "marie" && (
            <>
              <Field label={t("completer.fTypeMariage")} highlight={hl("type_mariage")}>
                <select style={inp("type_mariage")} value={f.type_mariage ?? ""} onChange={(e) => set("type_mariage", e.target.value)}>
                  <option value="">{t("completer.selectPlaceholder")}</option>
                  {TYPES_MARIAGE.map((m) => <option key={m.value} value={m.value}>{t(m.labelKey)}</option>)}
                </select>
              </Field>
              {/* Married name and which family name is displayed: lets a married woman
                  keep her maiden name on record and choose the shown one. */}
              <Field label={t("completer.fNomMarital")} highlight={hl("nom_marital")} info={t("completer.iNomMarital")}><input style={inp("nom_marital")} value={f.nom_marital ?? ""} onChange={(e) => set("nom_marital", nomMajuscule(e.target.value))} placeholder={t("completer.phNomMarital")} /></Field>
              <Field label={t("completer.fNomAffiche")} highlight={hl("nom_affiche")} info={t("completer.iNomAffiche")}>
                <select style={inp("nom_affiche")} value={f.nom_affiche ?? ""} onChange={(e) => set("nom_affiche", e.target.value)}>
                  <option value="">{t("completer.nomAfficheDefaut")}</option>
                  <option value="naissance">{t("completer.nomAfficheNaissance")}</option>
                  <option value="marital">{t("completer.nomAfficheMarital")}</option>
                </select>
              </Field>
            </>
          )}
          <Field label={t("completer.fProfession")} highlight={hl("profession")}><input style={inp("profession")} value={f.profession} onChange={(e) => set("profession", e.target.value)} /></Field>
          <Field label={t("completer.fNiveauEtudes")} highlight={hl("niveau_etudes")}>
            <select style={inp("niveau_etudes")} value={f.niveau_etudes} onChange={(e) => set("niveau_etudes", e.target.value)}>
              <option value="">{t("completer.selectPlaceholder")}</option>
              {NIVEAUX_ETUDES.map((n) => <option key={n.value} value={n.value}>{enLangue ? n.en : n.fr}</option>)}
            </select>
          </Field>

          {/* Sacramental life: legitimate member-declarable data for the community,
              already accepted by the registration backend. Optional checkboxes so
              they never block submission. */}
          <p style={{ fontFamily: T.fm, fontSize: 9, letterSpacing: 0.8, color: T.b600, margin: "18px 2px 2px" }}>{t("completer.secVieSpirituelle")}</p>
          <p style={{ fontSize: 11, color: T.mut, lineHeight: 1.5, margin: "2px 2px 8px" }}>{t("completer.vieSpirituelleNote")}</p>
          <SacrementCheck label={t("completer.fBaptise")} checked={!!f.baptise} onChange={(v) => set("baptise", v)} />
          <SacrementCheck label={t("completer.fPremiereCommunion")} checked={!!f.premiere_communion} onChange={(v) => set("premiere_communion", v)} />
          <SacrementCheck label={t("completer.fConfirme")} checked={!!f.confirme} onChange={(v) => set("confirme", v)} />
        </>
      )}

      {step === 3 && (
        <PiecesJustificatives
          photoProvided={photoProvided}
          pieceProvided={pieceProvided}
          photoHighlight={hl("photo")}
          pieceHighlight={hl("piece")}
          photoManquant={manque("photo")}
          pieceManquant={manque("piece")}
          photoFile={photoFile}
          pieceFile={pieceFile}
          pieceType={pieceType}
          onPhotoFile={(file) => {
            // A newly picked photo opens the round cropper first (pan/zoom); the
            // confirmed square crop becomes the uploaded photo. Clearing (null)
            // simply removes the staged photo.
            if (cropSrc) URL.revokeObjectURL(cropSrc);
            if (file) {
              oublierManquant("photo");
              setCropSrc(URL.createObjectURL(file));
            } else {
              setCropSrc(null);
              setPhotoFile(null);
              setPhotoDejaEnvoyee(false);
            }
          }}
          onPieceFile={(file) => {
            setPieceFile(file);
            setPieceDejaEnvoyee(false);
            if (file) oublierManquant("piece");
          }}
          onPieceType={setPieceType}
        />
      )}

      {cropSrc && (
        <RecadragePhoto
          imageUrl={cropSrc}
          onCancel={() => { URL.revokeObjectURL(cropSrc); setCropSrc(null); }}
          onConfirm={(file) => {
            setPhotoFile(file);
            setPhotoDejaEnvoyee(false);
            URL.revokeObjectURL(cropSrc);
            setCropSrc(null);
          }}
        />
      )}

      {step === 4 && (
        <>
          <p style={{ fontSize: 12, color: T.mut, lineHeight: 1.5, margin: "10px 2px 8px" }}>{t("completer.signatureIntro")}</p>
          <SignatureEngagement token={token} onSigned={() => setSigned(true)} />
        </>
      )}

      {step === 5 && (
        <CompleterRecap
          profile={profile}
          f={f}
          commissionNom={commissionNom}
          rattachementTxt={rattachementTxt}
          tribuNom={tribuNom}
          axeOk={axeOk}
          fonctions={fonctions}
          labelFonction={labelFonction}
          photoOk={photoOk}
          pieceOk={pieceOk}
          signed={signed}
        />
      )}

      {error && <p style={{ color: T.dng, fontSize: 12.5, marginTop: 10 }}>{error}</p>}

      {step < 5 ? (
        <WizardNav step={step} onBack={() => goTo(step - 1)} onNext={goNext} />
      ) : (
        (() => {
          const submitDisabled = busy || !requiredOk || !photoOk || !pieceOk || photoNeedsRedo || pieceNeedsRedo || !signed;
          return (
            <div style={{ marginTop: 18, padding: "12px 0 calc(8px + env(safe-area-inset-bottom, 0px))", background: T.bg, borderTop: `1px solid ${T.line}`, display: "flex", gap: 10 }}>
              <button type="button" onClick={() => goTo(4)} className="tap" style={{ flex: 1, height: 50, border: `1.5px solid ${T.line}`, borderRadius: 13, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "inherit", fontWeight: 600, fontSize: 14, background: T.surf, color: T.ink, cursor: "pointer" }}>
                {t("completer.back")}
              </button>
              <button
                type="button"
                onClick={submitDisabled ? undefined : () => void submit()}
                disabled={submitDisabled}
                aria-disabled={submitDisabled}
                className="tap"
                style={{ flex: 2, height: 50, border: "none", fontFamily: "inherit", background: submitDisabled ? T.faint : gradient, borderRadius: 13, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 600, fontSize: 15, opacity: submitDisabled ? 0.7 : 1, cursor: submitDisabled ? "not-allowed" : "pointer", boxShadow: submitDisabled ? "none" : "0 12px 24px -10px rgba(42,79,173,.7)" }}
              >
                {busy ? t("completer.submitting") : correction ? t("correction.resubmit") : t("completer.submit")}
              </button>
            </div>
          );
        })()
      )}
    </div>
  );
}
