import { useState } from "react";
import { type DocumentBibliotheque, getBibliothequeMembre, getFichierBibliotheque } from "../api.js";
import { useLang, useT } from "../i18n.js";
import { T } from "../proto.js";
import { useResource } from "../useResource.js";

const CATEGORIE_LIBELLE: Record<string, { fr: string; en: string }> = {
  statuts: { fr: "Statuts", en: "Statutes" },
  reglement: { fr: "Règlement", en: "Rules" },
  charte: { fr: "Charte", en: "Charter" },
  procedure: { fr: "Procédure", en: "Procedure" },
  note: { fr: "Note", en: "Note" },
  formulaire: { fr: "Formulaire", en: "Form" },
};

function date(iso: string | null, lang: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(lang === "en" ? "en-GB" : "fr-FR", { day: "2-digit", month: "long", year: "numeric" });
}

/**
 * The institution's documents, readable by the member and takeable away.
 *
 * A member could read a consent text at the moment they signed it and never again:
 * the text was hidden as soon as a new version replaced it, and nothing let them keep
 * a copy. What they are shown here is the published version, with the version number
 * on it, so what they read can always be matched to what they signed.
 */
export function Documents({ token }: { token: string }): JSX.Element {
  const t = useT();
  const lang = useLang();
  const res = useResource(() => getBibliothequeMembre(token), [token]);
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const documents = res.data ?? [];

  async function ouvrirFichier(d: DocumentBibliotheque): Promise<void> {
    setBusy(d.id);
    setErreur(null);
    try {
      const r = await getFichierBibliotheque(token, d.version_id);
      window.open(r.url, "_blank", "noopener");
    } catch {
      setErreur(lang === "en" ? "The file could not be opened." : "Le fichier n'a pas pu être ouvert.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="scr" style={{ padding: "6px 18px 14px" }}>
      <p style={{ fontSize: 10.5, color: T.mut, lineHeight: 1.5, margin: "0 0 12px" }}>
        {lang === "en"
          ? "The documents of the organisation, in the version currently in force. The version number lets you match what you read with what you signed."
          : "Les documents de l'organisation, dans la version en vigueur. Le numéro de version vous permet de rapprocher ce que vous lisez de ce que vous avez signé."}
      </p>

      {res.loading && <p style={{ fontSize: 11.5, color: T.mut }}>{t("common.loading")}</p>}
      {res.error && (
        <p style={{ fontSize: 11.5, color: T.warn, background: T.warnbg, border: `1px solid ${T.warn}`, borderRadius: 10, padding: 10 }}>
          {res.error}
        </p>
      )}
      {erreur && (
        <p style={{ fontSize: 11.5, color: T.warn, background: T.warnbg, border: `1px solid ${T.warn}`, borderRadius: 10, padding: 10 }}>
          {erreur}
        </p>
      )}

      {!res.loading && documents.length === 0 && (
        <p style={{ fontSize: 11.5, color: T.mut, background: T.surf, border: `1px solid ${T.line}`, borderRadius: 12, padding: 14 }}>
          {lang === "en"
            ? "No document has been published yet."
            : "Aucun document n'a encore été publié."}
        </p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {documents.map((d) => {
          const titre = (lang === "en" && d.titre_en) || d.titre;
          const contenu = (lang === "en" && d.contenu_en) || d.contenu;
          const cat = CATEGORIE_LIBELLE[d.categorie];
          const estOuvert = ouvert === d.id;
          return (
            <div
              key={d.id}
              style={{ background: T.surf, border: `1px solid ${T.line}`, borderRadius: 13, overflow: "hidden" }}
            >
              <div
                onClick={() => setOuvert(estOuvert ? null : d.id)}
                className="tap"
                style={{ padding: 13, display: "flex", alignItems: "center", gap: 11 }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600 }}>{titre}</div>
                  <div style={{ fontSize: 10.5, color: T.mut, marginTop: 2 }}>
                    {cat ? (lang === "en" ? cat.en : cat.fr) : d.categorie}
                    {" · "}
                    {lang === "en" ? `version ${d.version}` : `version ${d.version}`}
                    {d.publie_le ? ` · ${date(d.publie_le, lang)}` : ""}
                  </div>
                </div>
                <span style={{ color: T.faint, fontSize: 16 }}>{estOuvert ? "▾" : "›"}</span>
              </div>

              {estOuvert && (
                <div style={{ padding: "0 13px 13px" }}>
                  {d.description && (
                    <p style={{ fontSize: 10.5, color: T.mut, lineHeight: 1.5, margin: "0 0 8px" }}>{d.description}</p>
                  )}
                  {contenu ? (
                    <div style={{ fontSize: 12, lineHeight: 1.65, whiteSpace: "pre-wrap", color: T.ink }}>{contenu}</div>
                  ) : (
                    <p style={{ fontSize: 11.5, color: T.mut }}>
                      {lang === "en" ? "This document is provided as a file." : "Ce document est fourni sous forme de fichier."}
                    </p>
                  )}

                  <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                    {d.fichier && (
                      <button
                        type="button"
                        disabled={busy === d.id}
                        onClick={() => void ouvrirFichier(d)}
                        style={{ flex: 1, height: 40, borderRadius: 10, border: `1px solid ${T.b600}`, background: "transparent", color: T.b600, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                      >
                        {busy === d.id
                          ? lang === "en" ? "Opening" : "Ouverture"
                          : lang === "en" ? "Open the file" : "Ouvrir le fichier"}
                      </button>
                    )}
                    {contenu && (
                      <button
                        type="button"
                        onClick={() => window.print()}
                        style={{ flex: 1, height: 40, borderRadius: 10, border: `1px solid ${T.line}`, background: T.bg, color: T.ink, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                      >
                        {lang === "en" ? "Print or save as PDF" : "Imprimer ou enregistrer en PDF"}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
