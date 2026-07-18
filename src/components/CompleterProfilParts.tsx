import { useState } from "react";

import { type MembreProfile, type ProfilFields, telegramLien } from "../api.js";
import { useT } from "../i18n.js";
import { T } from "../proto.js";
import { InfoTip } from "./InfoTip.js";

export const lbl = { fontFamily: T.fm, fontSize: 9, color: T.mut, margin: "12px 0 5px", display: "block" } as const;
export const baseInp = { width: "100%", border: `1px solid ${T.line}`, borderRadius: 11, padding: "11px 12px", fontSize: 13.5, fontFamily: T.fu, background: T.surf, boxSizing: "border-box" } as const;

export const GENRES = [
  { value: "homme", labelKey: "completer.genreHomme" },
  { value: "femme", labelKey: "completer.genreFemme" },
];
export const SITUATIONS = [
  { value: "celibataire", labelKey: "completer.sitCelibataire" },
  { value: "en_couple", labelKey: "completer.sitEnCouple" },
  { value: "fiance", labelKey: "completer.sitFiance" },
  { value: "marie", labelKey: "completer.sitMarie" },
  { value: "veuf", labelKey: "completer.sitVeuf" },
  { value: "divorce", labelKey: "completer.sitDivorce" },
];
export const STATUTS = [
  { value: "membre_simple", key: "profil.statutSimple" },
  { value: "membre_actif", key: "profil.statutActif" },
  { value: "nouveau_engage", key: "profil.statutNouveau" },
  { value: "inspirant", key: "profil.statutInspirant" },
];
export const TYPES_MARIAGE = [
  { value: "dot", labelKey: "completer.mariageDot" },
  { value: "religieux", labelKey: "completer.mariageReligieux" },
  { value: "dot_et_religieux", labelKey: "completer.mariageDotReligieux" },
  { value: "civil", labelKey: "completer.mariageCivil" },
];
export const DOC_TYPES = ["piece_identite", "passeport", "permis", "carte_consulaire"];

/** An optional sacrament checkbox (baptism, communion, confirmation). Large tap
 * target, clear checked state, keyboard accessible. */
export function SacrementCheck({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }): JSX.Element {
  return (
    <label className="tap" style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", marginBottom: 8, border: `1px solid ${checked ? T.b600 : T.line}`, borderRadius: 11, background: checked ? T.tintb : T.surf }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} style={{ width: 18, height: 18, accentColor: T.b600 }} />
      <span style={{ fontSize: 13.5, color: T.ink, fontWeight: checked ? 600 : 400 }}>{label}</span>
    </label>
  );
}

/** Build the initial form state from the loaded profile so nothing is ever lost. */
export function initialFields(p: MembreProfile | null): ProfilFields {
  return {
    prenoms: p?.prenoms ?? "",
    nom: p?.nom ?? "",
    telephone: p?.telephone ?? "",
    indicatif_telephone: p?.indicatif_telephone ?? "",
    date_naissance: p?.date_naissance ?? "",
    naissance_annee_visible: p?.naissance_annee_visible ?? false,
    genre: p?.genre ?? "",
    pays: p?.pays ?? "",
    region: p?.region ?? "",
    ville: p?.ville ?? "",
    adresse: p?.adresse ?? "",
    adresse_complement: p?.adresse_complement ?? "",
    commission_id: p?.commission_id ?? "",
    intendance_id: p?.intendance_id ?? "",
    coordination_id: p?.coordination_id ?? "",
    tribu_id: p?.tribu_id ?? "",
    groupe: p?.groupe ?? "",
    situation_matrimoniale: p?.situation_matrimoniale ?? "",
    type_mariage: p?.type_mariage ?? "",
    code_membre: p?.code_membre ?? "",
    date_entree: p?.date_entree ?? "",
    promotion: p?.promotion ?? "",
    profession: p?.profession ?? "",
    niveau_etudes: p?.niveau_etudes ?? "",
    baptise: p?.baptise ?? false,
    premiere_communion: p?.premiere_communion ?? false,
    confirme: p?.confirme ?? false,
    type_membre: p?.type_membre ?? "",
    fonction_cle: p?.fonction_cle ?? "",
    berger_declare: p?.berger_declare ?? false,
    berger_nom_declare: p?.berger_nom_declare ?? "",
    // Prefill the declared functions from the member's already-held ones (by key),
    // so a returning member sees their selections instead of an empty set.
    fonctions_souhaitees: (p?.fonctions ?? [])
      .filter((fn) => fn.cle && fn.categorie !== "titre")
      .map((fn) => ({ cle: String(fn.cle), perimetre: fn.perimetre ?? "" })),
  };
}

/** A labelled form row. When highlight is set, a "to fix" tag is shown. */
export function Field({ label, required, info, highlight, children }: { label: string; required?: boolean; info?: string; highlight?: boolean; children: React.ReactNode }): JSX.Element {
  const t = useT();
  return (
    <div>
      <span style={lbl}>
        {label.toUpperCase()} {required && <span style={{ color: T.dng }}>*</span>}
        {info && <InfoTip text={info} />}
        {highlight && (
          <span style={{ marginLeft: 6, fontSize: 8.5, fontWeight: 700, color: T.warn, background: T.warnbg, borderRadius: 6, padding: "2px 6px" }}>
            {t("correction.fieldTag").toUpperCase()}
          </span>
        )}
      </span>
      {children}
    </div>
  );
}

/** Step definitions of the registration wizard, in order. */
export const WIZARD_STEPS = [
  { key: "identite", labelKey: "completer.stepIdentite" },
  { key: "rattachement", labelKey: "completer.stepRattachement" },
  { key: "vie", labelKey: "completer.stepVie" },
  { key: "pieces", labelKey: "completer.stepPieces" },
  { key: "signature", labelKey: "completer.stepSignature" },
  { key: "recap", labelKey: "completer.stepRecap" },
] as const;

/** Progress header of the wizard: step counter, title and progress bar. */
export function Stepper({ step }: { step: number }): JSX.Element {
  const t = useT();
  const total = WIZARD_STEPS.length;
  const current = WIZARD_STEPS[step];
  return (
    <div style={{ margin: "10px 0 4px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontFamily: T.fd, fontWeight: 700, fontSize: 16 }}>{current ? t(current.labelKey) : ""}</span>
        <span style={{ fontFamily: T.fm, fontSize: 10, color: T.mut }}>{t("completer.stepCounter").replace("{n}", String(step + 1)).replace("{total}", String(total))}</span>
      </div>
      <div style={{ display: "flex", gap: 5, marginTop: 8 }}>
        {WIZARD_STEPS.map((s, i) => (
          <div key={s.key} style={{ flex: 1, height: 4, borderRadius: 3, background: i <= step ? T.b600 : T.line, transition: "background 200ms ease" }} />
        ))}
      </div>
    </div>
  );
}

/** Back / continue bar of a wizard step, rendered IN THE NORMAL FLOW after the
 * step content. It used to be position:sticky with a translucent gradient: the
 * bar then floated over the fields while scrolling (the app scrolls inside an
 * inner container), reading as two superimposed pages and hiding the last
 * fields of a step. In-flow, it can never cover anything. */
export function WizardNav({ step, busy, nextLabel, onBack, onNext }: {
  step: number;
  busy?: boolean;
  nextLabel?: string;
  onBack: () => void;
  onNext: () => void;
}): JSX.Element {
  const t = useT();
  return (
    <div style={{ marginTop: 18, padding: "12px 0 calc(8px + env(safe-area-inset-bottom, 0px))", background: T.bg, borderTop: `1px solid ${T.line}`, display: "flex", gap: 10 }}>
      {step > 0 && (
        <button type="button" onClick={onBack} className="tap" style={{ flex: 1, height: 48, border: `1.5px solid ${T.line}`, borderRadius: 13, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "inherit", fontWeight: 600, fontSize: 14, background: T.surf, color: T.ink, cursor: "pointer" }}>
          {t("completer.back")}
        </button>
      )}
      <button
        type="button"
        onClick={busy ? undefined : onNext}
        disabled={busy}
        aria-disabled={busy}
        className="tap"
        style={{ flex: 2, height: 48, borderRadius: 13, border: "none", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 600, fontSize: 14.5, background: busy ? T.faint : T.b600, opacity: busy ? 0.7 : 1, cursor: busy ? "not-allowed" : "pointer", boxShadow: busy ? "none" : "0 10px 20px -10px rgba(42,79,173,.6)" }}
      >
        {nextLabel ?? t("completer.continue")}
      </button>
    </div>
  );
}

/** Read-only summary row of the final recap step. */
export function RecapRow({ label, value, ok }: { label: string; value: string; ok?: boolean }): JSX.Element {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "10px 2px", borderBottom: `1px solid ${T.line}` }}>
      <span style={{ fontSize: 12, color: T.mut }}>{label}</span>
      <span style={{ fontSize: 12.5, fontWeight: 600, textAlign: "right", color: ok === false ? T.warn : T.ink }}>{value}</span>
    </div>
  );
}

export function TelegramInvite({ token }: { token: string }): JSX.Element {
  const t = useT();
  const [done, setDone] = useState(false);
  async function rejoindre(): Promise<void> {
    try {
      const r = await telegramLien(token);
      window.open(r.deep_link, "_blank", "noopener");
      setDone(true);
    } catch {
      // Telegram non configuré : on n'affiche pas d'erreur bloquante.
    }
  }
  return (
    <div style={{ background: T.tintb, border: `1px solid ${T.line}`, borderRadius: 13, padding: "12px 14px", margin: "10px 0 2px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ fontSize: 24 }}>✈️</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.ink, fontFamily: T.fd }}>{t("completer.tgTitle")}</div>
          <div style={{ fontSize: 11, color: T.mut, lineHeight: 1.45 }}>{t("completer.tgHint")}</div>
        </div>
      </div>
      <div
        onClick={() => void rejoindre()}
        className="tap"
        style={{ marginTop: 10, height: 40, borderRadius: 10, background: done ? T.okbg : T.b600, color: done ? T.ok : "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600, fontSize: 13 }}
      >
        {done ? t("completer.tgOpened") : t("completer.tgJoin")}
      </div>
    </div>
  );
}
