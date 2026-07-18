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

  return (
    <div style={{ padding: "8px 2px 20px", display: "flex", flexDirection: "column", gap: 18 }}>
      <p style={{ fontSize: 12.5, color: T.mut, lineHeight: 1.5, margin: "0 2px" }}>{t("hierarchie.intro")}</p>

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
          <p style={{ fontFamily: T.fm, fontSize: 9, letterSpacing: 0.8, color: T.b600, margin: "0 2px 8px" }}>
            {t("hierarchie.maTribu")}
          </p>
          <div style={{ background: T.surf, border: `1px solid ${T.line}`, borderRadius: 13, padding: "12px 14px" }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: T.ink }}>{data.tribu.nom}</div>
            <div style={{ fontSize: 12.5, color: T.mut, marginTop: 3 }}>
              {t("hierarchie.patriarche")} : {data.tribu.patriarche || t("hierarchie.aDesigner")}
            </div>
          </div>
        </section>
      )}

      <section>
        <p style={{ fontFamily: T.fm, fontSize: 9, letterSpacing: 0.8, color: T.b600, margin: "0 2px 8px" }}>
          {t("hierarchie.chaine")}
        </p>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {chaine.map((maillon, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "stretch" }}>
              <div
                style={{
                  background: i === 0 ? T.tintb : T.surf,
                  border: `1px solid ${i === 0 ? T.b600 : T.line}`,
                  borderRadius: 12, padding: "11px 14px",
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 14, color: i === 0 ? T.tintbf : T.ink }}>{maillon.fonction}</div>
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
