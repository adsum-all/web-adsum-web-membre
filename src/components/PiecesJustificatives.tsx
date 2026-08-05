import { useRef, useState } from "react";

import { useT } from "../i18n.js";
import { T } from "../proto.js";

const inp = { width: "100%", border: `1px solid ${T.line}`, borderRadius: 11, padding: "11px 12px", fontSize: 13.5, fontFamily: T.fu, background: T.surf, boxSizing: "border-box" } as const;
const lbl = { fontFamily: T.fm, fontSize: 9, color: T.mut, margin: "12px 0 5px", display: "block" } as const;

const PIECE_TYPES = [
  { value: "piece_identite", labelKey: "pieces.typeCni" },
  { value: "passeport", labelKey: "pieces.typePassport" },
  { value: "permis", labelKey: "pieces.typePermis" },
  { value: "carte_consulaire", labelKey: "pieces.typeConsulaire" },
];

/**
 * Border colour of a document field.
 *
 * A required document still missing wins over a correction request: the member
 * cannot move on until it is provided, so that is the more urgent of the two.
 */
function fieldBorder(highlight: boolean, manquant: boolean): string {
  if (manquant) return T.dng;
  return highlight ? T.warn : T.line;
}

function LabelRow({ label, required, highlight, manquant }: { label: string; required?: boolean; highlight: boolean; manquant?: boolean }): JSX.Element {
  const t = useT();
  return (
    <span style={lbl}>
      {label.toUpperCase()} {required && <span style={{ color: T.dng }}>*</span>}
      {highlight && (
        <span style={{ marginLeft: 6, fontSize: 8.5, fontWeight: 700, color: T.warn, background: T.warnbg, borderRadius: 6, padding: "2px 6px" }}>
          {t("correction.fieldTag").toUpperCase()}
        </span>
      )}
      {manquant && !highlight && (
        <span style={{ marginLeft: 6, fontSize: 8.5, fontWeight: 700, color: T.dng, background: T.tintr, borderRadius: 6, padding: "2px 6px" }}>
          {t("completer.tagManquant").toUpperCase()}
        </span>
      )}
    </span>
  );
}

/**
 * A file picker that respects an already-provided document. When a document of
 * this type already exists on the server, the member is not forced to re-upload:
 * a "Document deja fourni" state with an optional "Remplacer" action is shown.
 * A fresh upload is only required when the type is listed in champs_a_corriger.
 */
export function DocumentPicker({
  label,
  accept,
  alreadyProvided,
  highlight,
  manquant = false,
  champ,
  file,
  onFile,
}: {
  label: string;
  accept: string;
  alreadyProvided: boolean;
  highlight: boolean;
  /** Required and still missing when the member tried to move on. */
  manquant?: boolean;
  /** Names the field so the step can scroll to it. */
  champ?: string;
  file: File | null;
  onFile: (f: File | null) => void;
}): JSX.Element {
  const t = useT();
  const ref = useRef<HTMLInputElement>(null);
  const showExisting = alreadyProvided && !file;

  return (
    <div data-champ={champ}>
      <LabelRow label={label} required={!alreadyProvided} highlight={highlight} manquant={manquant} />
      <input ref={ref} type="file" accept={accept} hidden onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
      {showExisting ? (
        <div style={{ border: `1px solid ${T.ok}`, borderRadius: 11, padding: "10px 12px", background: T.okbg, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: T.ok }}>{t("doc.alreadyProvided")} ✓</div>
            <div style={{ fontSize: 10.5, color: T.mut }}>{t("doc.keepExisting")}</div>
          </div>
          <span onClick={() => ref.current?.click()} className="tap" style={{ flexShrink: 0, fontSize: 12, fontWeight: 600, color: T.b600, textDecoration: "underline" }}>
            {t("doc.replace")}
          </span>
        </div>
      ) : (
        <div
          onClick={() => ref.current?.click()}
          className="tap"
          style={{ ...inp, border: `1.5px solid ${fieldBorder(highlight, manquant)}`, background: manquant ? T.tintr : T.surf, color: file ? T.ink : T.mut, display: "flex", alignItems: "center", justifyContent: "space-between" }}
        >
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file ? file.name : t("pieces.chooseFile")}</span>
          <span style={{ color: file ? T.ok : T.b600 }}>{file ? "✓" : "⤴"}</span>
        </div>
      )}
    </div>
  );
}

/**
 * The "pieces justificatives" section: identity photo plus one identity
 * document. Both may already exist server-side; when so, re-upload is optional.
 */
export function PiecesJustificatives({
  photoProvided,
  pieceProvided,
  photoHighlight,
  pieceHighlight,
  photoManquant = false,
  pieceManquant = false,
  photoFile,
  pieceFile,
  pieceType,
  onPhotoFile,
  onPieceFile,
  onPieceType,
}: {
  photoProvided: boolean;
  pieceProvided: boolean;
  photoHighlight: boolean;
  pieceHighlight: boolean;
  /** Required and still missing when the member tried to move on. */
  photoManquant?: boolean;
  pieceManquant?: boolean;
  photoFile: File | null;
  pieceFile: File | null;
  pieceType: string;
  onPhotoFile: (f: File | null) => void;
  onPieceFile: (f: File | null) => void;
  onPieceType: (t: string) => void;
}): JSX.Element {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  return (
    <>
      <p style={{ fontFamily: T.fm, fontSize: 9, letterSpacing: 0.8, color: T.b600, margin: "18px 2px 2px" }}>{t("pieces.section")}</p>
      <DocumentPicker
        label={t("pieces.photoLabel")}
        accept="image/*"
        alreadyProvided={photoProvided}
        highlight={photoHighlight}
        manquant={photoManquant}
        champ="photo"
        file={photoFile}
        onFile={onPhotoFile}
      />
      <div>
        <span style={lbl}>{t("pieces.typeLabel")} {!pieceProvided && <span style={{ color: T.dng }}>*</span>}</span>
        <select
          style={inp}
          value={pieceType}
          disabled={pieceProvided && !pieceFile && !expanded}
          onChange={(e) => onPieceType(e.target.value)}
          onFocus={() => setExpanded(true)}
        >
          {PIECE_TYPES.map((p) => (
            <option key={p.value} value={p.value}>
              {t(p.labelKey)}
            </option>
          ))}
        </select>
      </div>
      <DocumentPicker
        label={t("pieces.docLabel")}
        accept="image/*,application/pdf"
        alreadyProvided={pieceProvided}
        highlight={pieceHighlight}
        manquant={pieceManquant}
        champ="piece"
        file={pieceFile}
        onFile={onPieceFile}
      />
    </>
  );
}
