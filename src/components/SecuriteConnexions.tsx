import { useCallback, useState } from "react";
import { type ConnexionSession, fermerAutresConnexions, getConnexions } from "../api.js";
import { useT } from "../i18n.js";
import { T } from "../proto.js";
import { useResource } from "../useResource.js";

/** Readable device name from the raw User-Agent recorded at sign-in.
 *  The full string means nothing to a member; the system and browser are what
 *  lets them recognise a session as theirs, or not. */
function appareilLisible(ua: string | null): string {
  if (!ua) return "Appareil inconnu";
  const os = /iPhone|iPad|iPod/.test(ua)
    ? "iPhone"
    : /Android/.test(ua)
      ? "Android"
      : /Windows/.test(ua)
        ? "Windows"
        : /Macintosh|Mac OS/.test(ua)
          ? "Mac"
          : /Linux/.test(ua)
            ? "Linux"
            : "Appareil";
  const nav = /Edg/.test(ua)
    ? "Edge"
    : /OPR|Opera/.test(ua)
      ? "Opera"
      : /Chrome|CriOS/.test(ua)
        ? "Chrome"
        : /Firefox|FxiOS/.test(ua)
          ? "Firefox"
          : /Safari/.test(ua)
            ? "Safari"
            : "Navigateur";
  return `${os}, ${nav}`;
}

function quand(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("fr-FR", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function Ligne({ s }: { s: ConnexionSession }): JSX.Element {
  const ouverte = s.ouverte;
  return (
    <div style={{ display: "flex", gap: 10, padding: "11px 0", borderBottom: `1px solid ${T.line}` }}>
      <span
        aria-hidden="true"
        style={{
          width: 8, height: 8, borderRadius: "50%", marginTop: 5, flexShrink: 0,
          background: s.courante ? T.ok : ouverte ? T.b600 : T.faint,
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          {appareilLisible(s.appareil)}
          {s.courante && (
            <span style={{ fontSize: 9.5, fontWeight: 700, color: T.ok, background: T.okbg, border: `1px solid ${T.ok}33`, borderRadius: 7, padding: "2px 7px" }}>
              Session actuelle
            </span>
          )}
          {!s.courante && ouverte && (
            <span style={{ fontSize: 9.5, fontWeight: 700, color: T.b600, background: `${T.b600}12`, border: `1px solid ${T.b600}33`, borderRadius: 7, padding: "2px 7px" }}>
              Ouverte
            </span>
          )}
        </div>
        <div style={{ fontSize: 10.5, color: T.mut, lineHeight: 1.5, marginTop: 2 }}>
          {quand(s.ouverte_le)}
          {s.lieu ? ` · ${s.lieu}` : ""}
          {s.adresse ? ` · ${s.adresse}` : ""}
        </div>
        {!ouverte && s.fermee_le && (
          <div style={{ fontSize: 10, color: T.faint, marginTop: 1 }}>
            {s.revoquee ? "Fermée à distance le " : "Terminée le "}
            {quand(s.fermee_le)}
          </div>
        )}
      </div>
    </div>
  );
}

/** Where the account is signed in, and how to close what is not the member's own.
 *
 *  The sessions were being recorded from the first day (address, device, city,
 *  country) and never shown; the member space claimed the tracking was not in
 *  service yet. This shows the ledger that already exists, and offers the single
 *  action that makes it actionable: closing every other session. */
export function SecuriteConnexions({ token }: { token: string }): JSX.Element {
  const t = useT();
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [rechargement, setRechargement] = useState(0);
  const charge = useCallback(() => getConnexions(token, page, 5), [token, page, rechargement]);
  const res = useResource(charge, [token, page, rechargement]);
  const data = res.data;

  async function fermerAutres(): Promise<void> {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fermerAutresConnexions(token);
      setMsg(
        r.fermees === 0
          ? "Aucune autre session n'était ouverte."
          : r.fermees === 1
            ? "1 autre session a été fermée."
            : `${r.fermees} autres sessions ont été fermées.`,
      );
      setPage(1);
      setRechargement((v) => v + 1);
    } catch {
      setMsg("La fermeture n'a pas abouti. Réessayez dans un instant.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ padding: "2px 0 4px" }}>
      <p style={{ fontSize: 10.5, color: T.mut, lineHeight: 1.5, margin: "0 0 8px" }}>
        Chaque connexion à votre compte est enregistrée avec son appareil et son lieu. Si vous ne
        reconnaissez pas une session, fermez les autres puis changez votre mot de passe.
      </p>

      {res.loading && <p style={{ fontSize: 11.5, color: T.mut }}>{t("common.loading")}</p>}
      {res.error && (
        <p style={{ fontSize: 11.5, color: T.warn, background: T.warnbg, border: `1px solid ${T.warn}`, borderRadius: 10, padding: 10 }}>
          {res.error}
        </p>
      )}

      {data && (
        <>
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            {[
              ["Sessions ouvertes", String(data.ouvertes)],
              ["Connexions enregistrées", String(data.total)],
            ].map(([label, value]) => (
              <div key={label} style={{ flex: 1, background: T.surf, border: `1px solid ${T.line}`, borderRadius: 11, padding: "9px 11px" }}>
                <div style={{ fontSize: 17, fontWeight: 700, fontFamily: T.fd }}>{value}</div>
                <div style={{ fontSize: 9.5, color: T.mut, lineHeight: 1.3 }}>{label}</div>
              </div>
            ))}
          </div>

          {data.items.map((s) => (
            <Ligne key={s.id} s={s} />
          ))}
          {data.items.length === 0 && (
            <p style={{ fontSize: 11.5, color: T.mut, padding: "10px 0" }}>Aucune connexion enregistrée.</p>
          )}

          {data.pages > 1 && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0 2px" }}>
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                style={{ border: `1px solid ${T.line}`, background: T.surf, color: page <= 1 ? T.faint : T.ink, borderRadius: 9, padding: "6px 12px", fontSize: 11.5, cursor: page <= 1 ? "default" : "pointer" }}
              >
                Précédent
              </button>
              <span style={{ fontSize: 10.5, color: T.mut }}>
                Page {data.page} sur {data.pages}
              </span>
              <button
                type="button"
                disabled={page >= data.pages}
                onClick={() => setPage((p) => Math.min(data.pages, p + 1))}
                style={{ border: `1px solid ${T.line}`, background: T.surf, color: page >= data.pages ? T.faint : T.ink, borderRadius: 9, padding: "6px 12px", fontSize: 11.5, cursor: page >= data.pages ? "default" : "pointer" }}
              >
                Suivant
              </button>
            </div>
          )}

          {data.autres_ouvertes > 0 && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void fermerAutres()}
              style={{ marginTop: 10, width: "100%", height: 42, borderRadius: 11, border: `1px solid ${T.warn}`, background: T.warnbg, color: T.warn, fontSize: 12, fontWeight: 600, cursor: busy ? "default" : "pointer", opacity: busy ? 0.7 : 1 }}
            >
              {busy
                ? "Fermeture en cours"
                : data.autres_ouvertes === 1
                  ? "Fermer l'autre session ouverte"
                  : `Fermer les ${data.autres_ouvertes} autres sessions ouvertes`}
            </button>
          )}

          {msg && (
            <p style={{ fontSize: 11, color: T.mut, margin: "8px 0 0" }}>{msg}</p>
          )}
        </>
      )}
    </div>
  );
}
