import { useEffect, useState } from "react";

import { type ApplicationAccessible, getMesApplications } from "../api.js";
import { useT } from "../i18n.js";
import { T } from "../proto.js";

/**
 * « Mes applications » : the applications the connected member has been granted access
 * to (LEVEL 1 visibility). Shows ONLY active grants, never a locked or greyed one, and
 * a friendly empty state otherwise. The list is the server's truth: an application the
 * member is not granted is simply absent. Opening an application still submits the member
 * to that application's own roles and perimeters.
 */
type Etat = "chargement" | "ok" | "erreur";

export function MesApplications({ token }: { token: string }): JSX.Element {
  const t = useT();
  const [etat, setEtat] = useState<Etat>("chargement");
  const [apps, setApps] = useState<ApplicationAccessible[]>([]);

  function charger(): void {
    setEtat("chargement");
    getMesApplications(token)
      .then((a) => { setApps(a); setEtat("ok"); })
      .catch(() => setEtat("erreur"));
  }
  useEffect(charger, [token]);

  return (
    <div style={{ padding: "4px 2px 24px" }}>
      <p style={{ fontSize: 13, color: T.mut, margin: "0 0 14px", lineHeight: 1.5 }}>
        {t("apps.sub")}
      </p>

      {etat === "chargement" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }} aria-busy="true" aria-live="polite">
          {[0, 1].map((i) => (
            <div key={i} style={{ height: 92, borderRadius: 14, background: T.chip, opacity: 0.7 }} />
          ))}
        </div>
      )}

      {etat === "erreur" && (
        <div style={{ background: T.surf, border: `1px solid ${T.line}`, borderRadius: 14, padding: 18, textAlign: "center" }} role="alert">
          <p style={{ fontSize: 13.5, color: T.ink, margin: "0 0 12px" }}>{t("apps.error")}</p>
          <button type="button" className="btn btn-ghost btn-inline" onClick={charger}>{t("apps.retry")}</button>
        </div>
      )}

      {etat === "ok" && apps.length === 0 && (
        <div style={{ background: T.surf, border: `1px solid ${T.line}`, borderRadius: 16, padding: "28px 20px", textAlign: "center" }}>
          <div aria-hidden="true" style={{ width: 46, height: 46, margin: "0 auto 12px", borderRadius: 12, border: `2px solid ${T.line}`, display: "flex", alignItems: "center", justifyContent: "center", color: T.faint, fontSize: 20 }}>▦</div>
          <h3 style={{ fontSize: 15.5, margin: "0 0 6px", color: T.ink }}>{t("apps.emptyTitle")}</h3>
          <p style={{ fontSize: 13, color: T.mut, margin: 0, lineHeight: 1.5, maxWidth: 340, marginInline: "auto" }}>{t("apps.emptyBody")}</p>
        </div>
      )}

      {etat === "ok" && apps.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
          {apps.map((a) => (
            <a
              key={a.code}
              href={a.url ?? "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="tap"
              style={{
                display: "flex", alignItems: "center", gap: 14, textDecoration: "none",
                background: T.surf, border: `1px solid ${T.line}`, borderRadius: 16, padding: "14px 16px",
                color: T.ink,
              }}
            >
              <span aria-hidden="true" style={{ flexShrink: 0, width: 44, height: 44, borderRadius: 12, background: T.tintb, color: T.b600, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, fontWeight: 700 }}>
                {(a.nom.replace(/^ADSUM\s+/i, "")[0] ?? "A").toUpperCase()}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 14.5, fontWeight: 600, color: T.ink }}>{a.nom}</span>
                {a.description && <span style={{ display: "block", fontSize: 12, color: T.mut, marginTop: 2, lineHeight: 1.4 }}>{a.description}</span>}
                <span style={{ display: "inline-block", marginTop: 6, fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, color: "#0f7a4d", background: "#e5f4ec", padding: "2px 8px", borderRadius: 999 }}>{t("apps.active")}</span>
              </span>
              <span aria-hidden="true" style={{ flexShrink: 0, color: T.faint, fontSize: 20 }}>›</span>
              <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>{t("apps.open")}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
