import { useEffect, useMemo, useState } from "react";

import { type InformationPriorite, confirmerInformation, getInformation, getMesInformations } from "../api.js";
import { formatDateTime } from "../format.js";
import { useT } from "../i18n.js";
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

      <InfoRichText texte={data.contenu} />

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

export function Informations({ token, onCountChange }: { token: string; onCountChange?: () => void }): JSX.Element {
  const t = useT();
  // A revision counter forces a refetch after a read/confirm, since useResource
  // refetches on a dependency change (it exposes no imperative reload).
  const [rev, setRev] = useState(0);
  const { data, loading, error } = useResource(() => getMesInformations(token), [token, rev]);
  const reload = (): void => setRev((r) => r + 1);
  const [filtre, setFiltre] = useState<FiltreId>("toutes");
  const [ouvert, setOuvert] = useState<string | null>(null);

  const nonLues = useMemo(() => (data ?? []).filter((i) => !i.lu).length, [data]);

  if (ouvert) {
    return (
      <Detail
        token={token}
        id={ouvert}
        onBack={() => {
          setOuvert(null);
          reload();
          onCountChange?.();
        }}
        onChanged={() => onCountChange?.()}
      />
    );
  }

  if (loading) return <div className="empty"><p>{t("info.loading")}</p></div>;
  if (error) return <div className="empty"><p>{error}</p></div>;

  const items = data ?? [];
  const now = Date.now();
  const filtres: { id: FiltreId; label: string }[] = [
    { id: "toutes", label: t("info.filterAll") },
    { id: "non_lues", label: t("info.filterUnread") },
    { id: "importantes", label: t("info.filterImportant") },
    { id: "urgentes", label: t("info.filterUrgent") },
  ];
  const visibles = items.filter((i) => {
    if (filtre === "non_lues") return !i.lu;
    if (filtre === "importantes") return i.priorite === "importante";
    if (filtre === "urgentes") return i.priorite === "urgente";
    return true;
  });

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 2px 8px" }}>
        <span className="list-sub">{nonLues > 0 ? t("info.unreadCount").replace("{n}", String(nonLues)) : t("info.allRead")}</span>
      </div>
      <div style={{ display: "flex", gap: 7, overflowX: "auto", padding: "0 2px 12px", WebkitOverflowScrolling: "touch" }}>
        {filtres.map((f) => (
          <button
            key={f.id}
            type="button"
            className="tap"
            onClick={() => setFiltre(f.id)}
            style={{ flex: "0 0 auto", padding: "7px 12px", borderRadius: 999, fontSize: 12, fontWeight: 600, border: `1px solid ${filtre === f.id ? T.b600 : T.line}`, background: filtre === f.id ? T.b600 : T.surf, color: filtre === f.id ? "#fff" : T.ink, whiteSpace: "nowrap" }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {visibles.length === 0 ? (
        <div className="empty">
          <div className="empty-glyph" aria-hidden="true">{"◎"}</div>
          <p>{t("info.empty")}</p>
        </div>
      ) : (
        <ul className="list">
          {visibles.map((i) => {
            const epingle = i.epingle_jusqu && new Date(i.epingle_jusqu).getTime() > now;
            return (
              <li key={i.id} className="list-item row-tap" onClick={() => setOuvert(i.id)} style={{ borderLeft: `3px solid ${prioMeta(i.priorite).fg}`, alignItems: "flex-start" }}>
                <div className="list-main" style={{ gap: 3 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <PrioBadge p={i.priorite} />
                    {epingle && <span style={{ fontSize: 10, color: T.mut }} aria-label={t("info.pinned")}>{"\u{1F4CC}"}</span>}
                  </div>
                  <strong style={{ fontSize: 15 }}>
                    {i.titre}
                    {i.audio_url && (
                      <span aria-label={t("info.hasAudio")} title={t("info.hasAudio")} style={{ marginLeft: 6, fontSize: 12 }}>
                        {"\u{1F50A}"}
                      </span>
                    )}
                  </strong>
                  <span className="list-sub">{extrait(texteBrut(i.contenu))}</span>
                  <span className="list-sub faint">{[i.auteur, formatDateTime(i.envoye_le ?? i.cree_le)].filter(Boolean).join(" · ")}</span>
                </div>
                {!i.lu && <span className="dot" aria-label={t("info.unreadAria")} />}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
