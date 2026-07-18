import { useEffect, useState } from "react";

import { type InformationMembre, type InformationPriorite, type InformationsFeedParams, confirmerInformation, getInformation, getMesInformationsFeed } from "../api.js";
import { formatDateTime } from "../format.js";
import { useLang, useT } from "../i18n.js";
import { T } from "../proto.js";
import { useResource } from "../useResource.js";
import { AudioPlayer } from "./AudioPlayer.js";
import { EcouterTexte } from "./EcouterTexte.js";
import { InfoRichText, texteBrut } from "./InfoRichText.js";

type FiltreId = "toutes" | "non_lues" | "importantes" | "urgentes";

interface Prio {
  label: string;
  bg: string;
  fg: string;
  glyph: string;
}
function prioMeta(p: InformationPriorite): Prio {
  if (p === "urgente") return { label: "URGENT", bg: "#fdecec", fg: "#c0392b", glyph: "!" };
  if (p === "importante") return { label: "IMPORTANT", bg: T.warnbg ?? "#fff4e5", fg: T.warn ?? "#b26a00", glyph: "◆" };
  return { label: "INFO", bg: T.tintb ?? "#eef2fb", fg: T.b600 ?? "#2a4fad", glyph: "ℹ" };
}

/** Priority badge: colour AND a text label AND an icon, so it is never colour-only. */
function PrioBadge({ p }: { p: InformationPriorite }): JSX.Element {
  const m = prioMeta(p);
  return (
    <span
      style={{ display: "inline-flex", alignItems: "center", gap: 4, background: m.bg, color: m.fg, fontFamily: T.fm, fontSize: 9.5, fontWeight: 800, letterSpacing: 0.6, padding: "2px 7px", borderRadius: 7 }}
    >
      <span aria-hidden="true">{m.glyph}</span>
      {m.label}
    </span>
  );
}

function extrait(s: string, n = 120): string {
  const clean = (s || "").replace(/\s+/g, " ").trim();
  return clean.length > n ? `${clean.slice(0, n)}…` : clean;
}

/** Detail view of one Information: opening it records the read; a confirmation is
 * only recorded on the explicit "J'ai pris connaissance" button. */
function Detail({ token, id, onBack, onChanged }: { token: string; id: string; onBack: () => void; onChanged: () => void }): JSX.Element {
  const t = useT();
  const { data, loading, error } = useResource(() => getInformation(token, id), [token, id]);
  const [confirme, setConfirme] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (data) onChanged();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.id]);

  if (loading) return <div className="empty"><p>{t("info.loading")}</p></div>;
  if (error || !data) return <div className="empty"><p>{error ?? t("info.unavailable")}</p></div>;

  const dejaConfirme = data.confirme || confirme;
  const lienAction = data.action_url && data.action_label;

  return (
    <div style={{ paddingBottom: 12 }}>
      <button type="button" className="login-link" onClick={onBack} style={{ marginBottom: 10 }}>
        {"← "}{t("info.back")}
      </button>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <PrioBadge p={data.priorite} />
        {data.requiert_accuse && !dejaConfirme && (
          <span style={{ fontSize: 10, color: T.mut, fontFamily: T.fm }}>{t("info.ackNeeded")}</span>
        )}
      </div>
      <h2 style={{ fontFamily: T.fd, fontSize: 20, fontWeight: 800, color: T.ink, margin: "0 0 2px", lineHeight: 1.25 }}>{data.titre}</h2>
      {data.sous_titre && <p style={{ fontSize: 14, color: T.mut, margin: "0 0 6px" }}>{data.sous_titre}</p>}
      <p style={{ fontSize: 11.5, color: T.mut, margin: "0 0 10px", fontFamily: T.fm }}>
        {[data.auteur, formatDateTime(data.envoye_le ?? data.cree_le)].filter(Boolean).join(" · ")}
      </p>

      {data.image_url && (
        <img src={data.image_url} alt="" style={{ width: "100%", maxHeight: 220, objectFit: "cover", borderRadius: 13, border: `1px solid ${T.line}`, margin: "4px 0 8px" }} />
      )}

      {data.lecture_vocale_auto && <EcouterTexte token={token} texte={`${data.titre}. ${data.sous_titre ?? ""}. ${texteBrut(data.contenu)}`} />}

      {data.audio_url && (
        <>
          <p style={{ fontFamily: T.fm, fontSize: 9, letterSpacing: 0.8, color: T.b600, margin: "10px 2px 2px" }}>{t("info.voiceNote").toUpperCase()}</p>
          <AudioPlayer src={data.audio_url} />
        </>
      )}

      {/* The content itself lives in a clearly framed card, visually distinct from
          the surrounding metadata, so the member instantly identifies the message. */}
      <div style={{ background: T.surf, border: `1.5px solid ${T.line}`, borderLeft: `4px solid ${T.b600}`, borderRadius: 14, padding: "14px 16px", margin: "12px 0", boxShadow: "0 6px 18px -12px rgba(20,30,60,.25)" }}>
        <InfoRichText texte={data.contenu} />
        {(data.signature || data.signature_url) && (
          <div style={{ marginTop: 14, paddingTop: 10, borderTop: `1px dashed ${T.line}`, textAlign: "right" }}>
            {data.signature && <div style={{ fontFamily: T.fd, fontWeight: 700, fontSize: 14.5, color: T.ink }}>{data.signature}</div>}
            {data.signature_url && (
              <a href={data.signature_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: T.b600, textDecoration: "none", fontWeight: 600 }}>
                {data.signature_url.replace(/^https?:\/\//, "")}
              </a>
            )}
          </div>
        )}
      </div>

      {data.document_url && (
        <a href={data.document_url} download={t("info.documentName")} className="tap" style={btnGhost}>
          {t("info.openDocument")}
        </a>
      )}
      {data.lien_url && (
        <a href={data.lien_url} target="_blank" rel="noopener noreferrer" className="tap" style={btnGhost}>
          {t("info.openLink")}
        </a>
      )}
      {lienAction && (
        <a href={data.action_url ?? "#"} target="_blank" rel="noopener noreferrer" className="tap" style={btnPrimary}>
          {data.action_label}
        </a>
      )}

      {data.requiert_accuse && (
        <button
          type="button"
          className="tap"
          disabled={busy || dejaConfirme}
          onClick={() => {
            setBusy(true);
            void confirmerInformation(token, id)
              .then(() => {
                setConfirme(true);
                onChanged();
              })
              .finally(() => setBusy(false));
          }}
          style={{ ...btnPrimary, background: dejaConfirme ? (T.okbg ?? "#e7f6ec") : btnPrimary.background, color: dejaConfirme ? (T.ok ?? "#1a7a3a") : "#fff", cursor: dejaConfirme ? "default" : "pointer" }}
        >
          {dejaConfirme ? t("info.confirmed") : busy ? "…" : t("info.confirm")}
        </button>
      )}
    </div>
  );
}

const btnGhost = { display: "block", width: "100%", textAlign: "center" as const, height: 44, lineHeight: "44px", borderRadius: 12, border: `1px solid ${T.line}`, background: T.surf, color: T.ink, fontWeight: 600, fontSize: 13.5, textDecoration: "none", margin: "6px 0" };
const btnPrimary = { display: "block", width: "100%", textAlign: "center" as const, height: 46, lineHeight: "46px", borderRadius: 12, border: "none", background: `linear-gradient(180deg,${T.b500},${T.b600})`, color: "#fff", fontWeight: 700, fontSize: 14, textDecoration: "none", margin: "8px 0" };

const MOIS_INFO = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const MOIS_INFO_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const LIMIT_INFO = 12;

function moisAnneeInfo(iso: string | null, en: boolean): string {
  if (!iso) return en ? "Undated" : "Sans date";
  const d = new Date(iso);
  return `${((en ? MOIS_INFO_EN : MOIS_INFO)[d.getMonth()] ?? "").toUpperCase()} ${d.getFullYear()}`;
}

/** Active = pinned still valid, or an urgent priority. These sit at the top under
 * a dedicated "active" heading, never mixed into the archived months. */
function estActive(i: InformationMembre, now: number): boolean {
  const epingle = i.epingle_jusqu ? new Date(i.epingle_jusqu).getTime() > now : false;
  return epingle || i.priorite === "urgente";
}

export function Informations({ token, onCountChange }: { token: string; onCountChange?: () => void }): JSX.Element {
  const t = useT();
  const en = useLang() === "en";
  const [rev, setRev] = useState(0);
  const [filtre, setFiltre] = useState<FiltreId>("toutes");
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [panneau, setPanneau] = useState(false);
  const [mois, setMois] = useState(0);
  const [annee, setAnnee] = useState(0);
  const [typeContenu, setTypeContenu] = useState("");

  const prioParam = filtre === "importantes" ? "importante" : filtre === "urgentes" ? "urgente" : undefined;
  const lectureParam = filtre === "non_lues" ? "non_lu" : undefined;
  const offset = (page - 1) * LIMIT_INFO;
  const { data, loading, error } = useResource(
    () => getMesInformationsFeed(token, {
      priorite: prioParam, lecture: lectureParam, q: q || undefined,
      mois: mois || undefined, annee: annee || undefined,
      type_contenu: (typeContenu || undefined) as InformationsFeedParams["type_contenu"],
      limit: LIMIT_INFO, offset,
    }),
    [token, filtre, q, mois, annee, typeContenu, offset, rev],
  );
  const reload = (): void => setRev((r) => r + 1);

  if (ouvert) {
    return (
      <Detail token={token} id={ouvert} onBack={() => { setOuvert(null); reload(); onCountChange?.(); }} onChanged={() => onCountChange?.()} />
    );
  }

  const now = Date.now();
  const filtres: { id: FiltreId; label: string }[] = [
    { id: "toutes", label: t("info.filterAll") },
    { id: "non_lues", label: t("info.filterUnread") },
    { id: "importantes", label: t("info.filterImportant") },
    { id: "urgentes", label: t("info.filterUrgent") },
  ];
  const items = data?.items ?? [];
  const actives = items.filter((i) => estActive(i, now));
  const reste = items.filter((i) => !estActive(i, now));
  const groupesMois: [string, InformationMembre[]][] = [];
  for (const i of reste) {
    const cle = moisAnneeInfo(i.envoye_le ?? i.cree_le, en);
    const g = groupesMois.find((x) => x[0] === cle);
    if (g) g[1].push(i); else groupesMois.push([cle, [i]]);
  }
  const anneeActuelle = new Date().getFullYear();
  const annees = [anneeActuelle, anneeActuelle - 1, anneeActuelle - 2, anneeActuelle - 3];

  const petitSelect = { height: 34, borderRadius: 8, border: `1px solid ${T.line}`, background: T.surf, color: T.ink, fontSize: 12.5, padding: "0 8px" } as const;

  return (
    <>
      <div style={{ display: "flex", gap: 7, overflowX: "auto", padding: "0 2px 10px", WebkitOverflowScrolling: "touch" }}>
        {filtres.map((f) => (
          <button key={f.id} type="button" className="tap" onClick={() => { setFiltre(f.id); setPage(1); }}
            style={{ flex: "0 0 auto", padding: "7px 12px", borderRadius: 999, fontSize: 12, fontWeight: 600, border: `1px solid ${filtre === f.id ? T.b600 : T.line}`, background: filtre === f.id ? T.b600 : T.surf, color: filtre === f.id ? "#fff" : T.ink, whiteSpace: "nowrap" }}>
            {f.label}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "0 2px 10px" }}>
        <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder={en ? "Search (title, content, author)" : "Rechercher (titre, contenu, auteur)"}
          style={{ flex: 1, height: 36, borderRadius: 9, border: `1px solid ${T.line}`, background: T.surf, color: T.ink, fontSize: 13, padding: "0 11px" }} />
        <button type="button" className="tap" onClick={() => setPanneau((v) => !v)} aria-expanded={panneau}
          style={{ height: 36, padding: "0 12px", borderRadius: 9, border: `1px solid ${panneau ? T.b600 : T.line}`, background: panneau ? T.tintb : T.surf, color: panneau ? T.b600 : T.ink, fontSize: 12.5, fontWeight: 700, whiteSpace: "nowrap" }}>
          {en ? "Filter" : "Filtrer"}
        </button>
      </div>

      {panneau && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: "0 2px 12px" }}>
          <select value={mois} onChange={(e) => { setMois(Number(e.target.value)); setPage(1); }} aria-label={en ? "Month" : "Mois"} style={petitSelect}>
            <option value={0}>{en ? "Any month" : "Tous les mois"}</option>
            {MOIS_INFO.map((m, idx) => <option key={m} value={idx + 1}>{(en ? MOIS_INFO_EN : MOIS_INFO)[idx]}</option>)}
          </select>
          <select value={annee} onChange={(e) => { setAnnee(Number(e.target.value)); setPage(1); }} aria-label={en ? "Year" : "Année"} style={petitSelect}>
            <option value={0}>{en ? "Any year" : "Toutes les années"}</option>
            {annees.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <select value={typeContenu} onChange={(e) => { setTypeContenu(e.target.value); setPage(1); }} aria-label={en ? "Content type" : "Type de contenu"} style={petitSelect}>
            <option value="">{en ? "Any content" : "Tout contenu"}</option>
            <option value="texte">{en ? "Text" : "Texte"}</option>
            <option value="audio">{en ? "Audio" : "Audio"}</option>
            <option value="document">{en ? "Document" : "Document"}</option>
            <option value="lien">{en ? "Link" : "Lien"}</option>
          </select>
        </div>
      )}

      {loading ? (
        <div className="empty"><p>{t("info.loading")}</p></div>
      ) : error ? (
        <div className="empty"><p>{error}</p></div>
      ) : items.length === 0 ? (
        <div className="empty"><div className="empty-glyph" aria-hidden="true">{"◎"}</div><p>{t("info.empty")}</p></div>
      ) : (
        <>
          {actives.length > 0 && (
            <section style={{ marginBottom: 10 }}>
              <h4 style={{ fontSize: 11, fontWeight: 800, color: T.b600, letterSpacing: 0.5, margin: "4px 2px", fontFamily: T.fm }}>{en ? "ACTIVE INFORMATION" : "INFORMATIONS ACTIVES"}</h4>
              <ul className="list" style={{ margin: 0 }}>{actives.map((i) => <InfoRow key={i.id} i={i} now={now} onOpen={() => setOuvert(i.id)} t={t} />)}</ul>
            </section>
          )}
          {groupesMois.map(([mois2, arr]) => (
            <section key={mois2} style={{ marginBottom: 10 }}>
              <h4 style={{ fontSize: 11, fontWeight: 800, color: T.faint, letterSpacing: 0.5, margin: "4px 2px", fontFamily: T.fm }}>{mois2}</h4>
              <ul className="list" style={{ margin: 0 }}>{arr.map((i) => <InfoRow key={i.id} i={i} now={now} onOpen={() => setOuvert(i.id)} t={t} />)}</ul>
            </section>
          ))}
          {(data?.pages ?? 1) > 1 && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 12 }}>
              <button type="button" className="tap" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} style={{ height: 36, padding: "0 12px", borderRadius: 9, border: `1px solid ${T.line}`, background: T.surf, color: page <= 1 ? T.faint : T.ink, fontSize: 12.5, fontWeight: 600 }}>{en ? "Previous" : "Précédent"}</button>
              <span style={{ fontSize: 11.5, color: T.mut, fontFamily: T.fm }}>{en ? `Page ${data?.page} of ${data?.pages}` : `Page ${data?.page} sur ${data?.pages}`} · {data?.total}</span>
              <button type="button" className="tap" disabled={page >= (data?.pages ?? 1)} onClick={() => setPage((p) => p + 1)} style={{ height: 36, padding: "0 12px", borderRadius: 9, border: `1px solid ${T.line}`, background: T.surf, color: page >= (data?.pages ?? 1) ? T.faint : T.ink, fontSize: 12.5, fontWeight: 600 }}>{en ? "Next" : "Suivant"}</button>
            </div>
          )}
        </>
      )}
    </>
  );
}

function InfoRow({ i, now, onOpen, t }: Readonly<{ i: InformationMembre; now: number; onOpen: () => void; t: (k: string) => string }>): JSX.Element {
  const epingle = i.epingle_jusqu && new Date(i.epingle_jusqu).getTime() > now;
  return (
    <li className="list-item row-tap" onClick={onOpen} style={{ borderLeft: `3px solid ${prioMeta(i.priorite).fg}`, alignItems: "flex-start" }}>
      <div className="list-main" style={{ gap: 3 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <PrioBadge p={i.priorite} />
          {epingle && <span style={{ fontSize: 10, color: T.mut }} aria-label={t("info.pinned")}>{"\u{1F4CC}"}</span>}
        </div>
        <strong style={{ fontSize: 15 }}>
          {i.titre}
          {i.audio_url && <span aria-label={t("info.hasAudio")} title={t("info.hasAudio")} style={{ marginLeft: 6, fontSize: 12 }}>{"\u{1F50A}"}</span>}
        </strong>
        <span className="list-sub">{extrait(texteBrut(i.contenu))}</span>
        <span className="list-sub faint">{[i.auteur, formatDateTime(i.envoye_le ?? i.cree_le)].filter(Boolean).join(" · ")}</span>
      </div>
      {!i.lu && <span className="dot" aria-label={t("info.unreadAria")} />}
    </li>
  );
}
