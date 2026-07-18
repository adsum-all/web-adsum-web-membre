import { useEffect, useState } from "react";

import { getMaHierarchie, type MaHierarchie as MaHierarchieData, type UniteHierarchie } from "../api.js";
import { useT } from "../i18n.js";
import { T } from "../proto.js";

/**
 * The connected member's own place in the organisation: their units and their
 * responsibles, their tribe and its patriarch, then the functional chain rising
 * to the founder. Read-only and privacy-safe (no member lists), derived from the
 * real data server-side.
 */
export function MaHierarchie({ token }: { token: string }): JSX.Element {
  const t = useT();
  const [data, setData] = useState<MaHierarchieData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // The full rising chain is folded by default: on a phone the member first sees
  // their direct supervisor and attachments, then reveals the line one screen at a time.
  const [chaineOuverte, setChaineOuverte] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getMaHierarchie(token)
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e instanceof Error ? e.message : "Erreur"))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [token]);

  if (loading) return <p style={{ color: T.mut, fontSize: 13, padding: "14px 2px" }}>{t("hierarchie.chargement")}</p>;
  if (error) return <p className="tap" style={{ color: T.dng, fontSize: 13, padding: "14px 2px" }}>{error}</p>;
  if (!data) return <p style={{ color: T.mut, fontSize: 13, padding: "14px 2px" }}>{t("hierarchie.vide")}</p>;

  const rattachements = [
    { label: t("hierarchie.commission"), u: data.commission },
    { label: t("hierarchie.coordination"), u: data.coordination },
    { label: t("hierarchie.intendance"), u: data.intendance },
  ].filter((x) => x.u);

  // The functional chain comes top-first (founder) from the API; shown as a rising
  // ladder so the member reads their line of responsibility up to the top.
  const chaine = data.chaine_fonctionnelle ?? [];
  // The direct supervisor (N+1) is the responsible of the most specific unit that
  // has one: commission first, then coordination, then stewardship.
  const direct = rattachements.find((x) => (x.u as UniteHierarchie)?.responsable);
  const directUnite = direct?.u as UniteHierarchie | undefined;
  // A textual path (Me -> ... -> Founder) for screen readers and quick reading.
  const cheminTexte = [t("hierarchie.moi"), ...[...chaine].reverse().map((m) => m.titulaire || m.fonction)].join(" -> ");

  return (
    <div style={{ padding: "8px 2px 20px", display: "flex", flexDirection: "column", gap: 18 }}>
      <p style={{ fontSize: 12.5, color: T.mut, lineHeight: 1.5, margin: "0 2px" }}>{t("hierarchie.intro")}</p>

      {directUnite && (
        <section>
          <p style={{ fontFamily: T.fm, fontSize: 9, letterSpacing: 0.8, color: T.b600, margin: "0 2px 8px" }}>
            {t("hierarchie.responsableDirect")}
          </p>
          <div style={{ background: `linear-gradient(180deg, ${T.tintb}, ${T.surf})`, border: `1.5px solid ${T.b600}`, borderRadius: 14, padding: "14px 16px" }}>
            <div style={{ fontWeight: 800, fontSize: 17, color: T.ink }}>{directUnite.responsable}</div>
            <div style={{ fontSize: 12.5, color: T.mut, marginTop: 3 }}>
              {directUnite.fonction} · {directUnite.nom}
            </div>
            <div style={{ fontSize: 11, color: T.faint, marginTop: 6 }}>{t("hierarchie.responsableDirectHint")}</div>
          </div>
        </section>
      )}

      {rattachements.length > 0 && (
        <section>
          <p style={{ fontFamily: T.fm, fontSize: 9, letterSpacing: 0.8, color: T.b600, margin: "0 2px 8px" }}>
            {t("hierarchie.monRattachement")}
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {rattachements.map((x, i) => (
              <UniteCarte key={i} label={x.label} unite={x.u as UniteHierarchie} />
            ))}
          </div>
        </section>
      )}

      {data.tribu && (
        <section>
          <p style={{ fontFamily: T.fm, fontSize: 9, letterSpacing: 0.8, color: T.b600, margin: "0 2px 4px" }}>
            {t("hierarchie.transversalTitre")}
          </p>
          <p style={{ fontSize: 11, color: T.faint, margin: "0 2px 8px", lineHeight: 1.45 }}>{t("hierarchie.transversalHint")}</p>
          <div style={{ background: T.surf, border: `1px dashed ${T.line}`, borderRadius: 13, padding: "12px 14px" }}>
            <div style={{ fontFamily: T.fm, fontSize: 9, letterSpacing: 0.6, color: T.faint, marginBottom: 3 }}>{t("hierarchie.maTribu")}</div>
            <div style={{ fontWeight: 700, fontSize: 15, color: T.ink }}>{data.tribu.nom}</div>
            <div style={{ fontSize: 12.5, color: T.mut, marginTop: 3 }}>
              {t("hierarchie.patriarche")} : {data.tribu.patriarche || t("hierarchie.aDesigner")}
            </div>
          </div>
        </section>
      )}

      <section>
        <button
          type="button"
          className="tap"
          onClick={() => setChaineOuverte((v) => !v)}
          aria-expanded={chaineOuverte}
          style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, height: 46, padding: "0 14px", borderRadius: 12, border: `1px solid ${T.line}`, background: T.surf, color: T.ink, fontWeight: 700, fontSize: 13.5, fontFamily: "inherit" }}
        >
          <span>{chaineOuverte ? t("hierarchie.reduireChaine") : t("hierarchie.voirChaine")}</span>
          <span aria-hidden="true">{chaineOuverte ? "▲" : "▼"}</span>
        </button>
        {chaineOuverte && (
          <>
            <p style={{ fontSize: 11, color: T.faint, margin: "10px 2px 8px", lineHeight: 1.5 }} aria-label={t("hierarchie.cheminAria")}>{cheminTexte}</p>
            <p style={{ fontFamily: T.fm, fontSize: 9, letterSpacing: 0.8, color: T.b600, margin: "0 2px 8px" }}>
              {t("hierarchie.chaine")}
            </p>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {chaine.map((maillon, i) => (
                <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "stretch" }}>
                  <div
                    style={{
                      background: i === chaine.length - 1 ? T.tintb : T.surf,
                      border: `1px solid ${i === chaine.length - 1 ? T.b600 : T.line}`,
                      borderRadius: 12, padding: "11px 14px",
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: 14, color: i === chaine.length - 1 ? T.tintbf : T.ink }}>{maillon.fonction}</div>
                    <div style={{ fontSize: 12.5, color: T.mut, marginTop: 2 }}>
                      {maillon.titulaire || t("hierarchie.vacant")}
                    </div>
                  </div>
                  {i < chaine.length - 1 && (
                    <div aria-hidden style={{ width: 2, height: 16, background: T.line, alignSelf: "center" }} />
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function UniteCarte({ label, unite }: { label: string; unite: UniteHierarchie }): JSX.Element {
  const t = useT();
  return (
    <div style={{ background: T.surf, border: `1px solid ${T.line}`, borderRadius: 13, padding: "12px 14px" }}>
      <div style={{ fontFamily: T.fm, fontSize: 9, letterSpacing: 0.6, color: T.faint, marginBottom: 3 }}>{label.toUpperCase()}</div>
      <div style={{ fontWeight: 700, fontSize: 15, color: T.ink }}>{unite.nom}</div>
      <div style={{ fontSize: 12.5, color: T.mut, marginTop: 3 }}>
        {unite.fonction} : {unite.responsable || t("hierarchie.aDesigner")}
      </div>
    </div>
  );
}
