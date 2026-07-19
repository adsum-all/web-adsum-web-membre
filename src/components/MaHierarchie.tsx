import { useEffect, useState } from "react";

import { getMaHierarchie, type HierAppui, type HierChaine, type HierFonction, type MaHierarchie as MaHierarchieData } from "../api.js";
import { useLang } from "../i18n.js";
import { T } from "../proto.js";

/**
 * The member's FUNCTION-BASED place in the organisation: their primary position, ALL
 * their active functions (multi-role), a personalised upward chain N+1..N per chain
 * with vacant posts kept as "Poste a pourvoir", then their titles and particular links
 * shown apart from the functional chain, and their unit attachments. Read-only and
 * privacy-safe, derived server-side from the real data.
 */
const CAT_LABEL: Record<string, { fr: string; en: string }> = {
  fonction_speciale: { fr: "Gouvernance", en: "Governance" },
  titre: { fr: "Titre", en: "Title" },
  fonction: { fr: "Fonction", en: "Function" },
  fonction_particuliere: { fr: "Lien particulier", en: "Particular link" },
};

function Eyebrow({ children }: Readonly<{ children: React.ReactNode }>): JSX.Element {
  return <p style={{ fontFamily: T.fm, fontSize: 9, letterSpacing: 0.8, color: T.b600, margin: "0 2px 8px", textTransform: "uppercase" }}>{children}</p>;
}

export function MaHierarchie({ token, onOrganigramme }: Readonly<{ token: string; onOrganigramme?: () => void }>): JSX.Element {
  const en = useLang() === "en";
  const L = (fr: string, e: string): string => (en ? e : fr);
  const [data, setData] = useState<MaHierarchieData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [ouvertes, setOuvertes] = useState<Record<number, boolean>>({ 0: true });

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getMaHierarchie(token)
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e instanceof Error ? e.message : "Erreur"))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [token]);

  if (loading) return <p style={{ color: T.mut, fontSize: 13, padding: "14px 2px" }}>{L("Chargement…", "Loading…")}</p>;
  if (error) return <p style={{ color: T.dng, fontSize: 13, padding: "14px 2px" }}>{error}</p>;
  if (!data) return <p style={{ color: T.mut, fontSize: 13, padding: "14px 2px" }}>{L("Aucune donnée.", "No data.")}</p>;

  const pp = data.position_principale;
  const secondaires = data.fonctions.filter((f) => f !== pp);

  return (
    <div style={{ padding: "8px 2px 24px", display: "flex", flexDirection: "column", gap: 20 }}>
      <p style={{ fontSize: 12.5, color: T.mut, lineHeight: 1.5, margin: "0 2px" }}>
        {L("Retrouvez vos fonctions, vos rattachements et les chaînes de responsabilité qui vous concernent.",
          "Find your functions, your attachments and the chains of responsibility that concern you.")}
      </p>

      {/* 1. Position principale */}
      {pp && (
        <section>
          <Eyebrow>{L("Ma position principale", "My primary position")}</Eyebrow>
          <div style={{ background: `linear-gradient(180deg, ${T.tintb}, ${T.surf})`, border: `1.5px solid ${T.b600}`, borderRadius: 14, padding: "14px 16px" }}>
            <div style={{ fontWeight: 800, fontSize: 17, color: T.ink }}>{pp.fonction}</div>
            {pp.perimetre && <div style={{ fontSize: 13, color: T.ink, marginTop: 3 }}>{pp.perimetre}</div>}
            <div style={{ fontSize: 11.5, color: T.faint, marginTop: 6, lineHeight: 1.45 }}>
              {L("Affichée comme principale car c'est votre fonction active de niveau le plus élevé.",
                "Shown as primary because it is your highest-level active function.")}
            </div>
          </div>
        </section>
      )}

      {/* 2. Mes fonctions */}
      {data.fonctions.length > 0 && (
        <section>
          <Eyebrow>{L("Mes fonctions", "My functions")}</Eyebrow>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {data.fonctions.map((f, i) => <FonctionCarte key={i} f={f} principale={f === pp} en={en} />)}
          </div>
          {secondaires.length === 0 && pp && (
            <p style={{ fontSize: 11, color: T.faint, margin: "8px 2px 0" }}>{L("Vous exercez une seule fonction active.", "You hold a single active function.")}</p>
          )}
        </section>
      )}

      {/* 3. Mes chaines hierarchiques */}
      {data.chaines.length > 0 && (
        <section>
          <Eyebrow>{L("Mes chaînes hiérarchiques", "My chains of command")}</Eyebrow>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {data.chaines.map((ch, i) => (
              <ChaineCarte key={i} ch={ch} ouverte={ouvertes[i] ?? false} onToggle={() => setOuvertes((o) => ({ ...o, [i]: !o[i] }))} en={en} />
            ))}
          </div>
        </section>
      )}

      {/* 3b. Appui et suppleance */}
      {data.appui_suppleance && data.appui_suppleance.length > 0 && (
        <section>
          <Eyebrow>{L("Appui et suppléance", "Support and relief")}</Eyebrow>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {data.appui_suppleance.map((a, i) => <AppuiCarte key={i} a={a} en={en} />)}
          </div>
          <p style={{ fontSize: 11, color: T.faint, margin: "8px 2px 0", lineHeight: 1.5 }}>
            {L("Vos vice-fonctions et les intérims que vous assurez. Un intérim est une suppléance datée : il prend fin à sa date de clôture.",
              "Your vice-functions and the interims you cover. An interim is a dated relief: it ends on its closing date.")}
          </p>
        </section>
      )}

      {/* 4. Mes titres et liens particuliers */}
      {(data.titres.length > 0 || data.liens_particuliers.length > 0) && (
        <section>
          <Eyebrow>{L("Mes titres et liens particuliers", "My titles and particular links")}</Eyebrow>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {data.titres.map((x, i) => (
              <div key={`t${i}`} style={{ background: T.surf, border: `1px solid ${T.line}`, borderRadius: 13, padding: "12px 14px" }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: T.ink }}>{x.libelle}</div>
                {x.detail && <div style={{ fontSize: 12.5, color: T.mut, marginTop: 3 }}>{x.detail}</div>}
              </div>
            ))}
            {data.liens_particuliers.map((x, i) => (
              <div key={`l${i}`} style={{ background: T.surf, border: `1px dashed ${T.line}`, borderRadius: 13, padding: "12px 14px" }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: T.ink }}>{x.libelle}</div>
                {x.detail && <div style={{ fontSize: 12.5, color: T.mut, marginTop: 3 }}>{x.detail}</div>}
              </div>
            ))}
          </div>
          <p style={{ fontSize: 11, color: T.faint, margin: "8px 2px 0", lineHeight: 1.5 }}>
            {L("Ce sont des liens de titre, de suivi, d'accompagnement ou de responsabilité particulière. Ils ne remplacent pas votre chaîne hiérarchique fonctionnelle.",
              "These are title, follow-up, accompaniment or particular-responsibility links. They do not replace your functional chain of command.")}
          </p>
        </section>
      )}

      {/* 5. Mes rattachements */}
      {data.rattachements.length > 0 && (
        <section>
          <Eyebrow>{L("Mes rattachements", "My attachments")}</Eyebrow>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {data.rattachements.map((r, i) => (
              <div key={i} style={{ background: T.surf, border: `1px solid ${T.line}`, borderRadius: 13, padding: "12px 14px" }}>
                <div style={{ fontFamily: T.fm, fontSize: 9, letterSpacing: 0.6, color: T.faint, marginBottom: 3 }}>
                  {r.type.toUpperCase()}{r.principal ? ` · ${L("principal", "primary")}` : ""}
                </div>
                <div style={{ fontWeight: 700, fontSize: 15, color: T.ink }}>{r.nom || "-"}</div>
                <div style={{ fontSize: 12.5, color: T.mut, marginTop: 3 }}>{L("Mon rôle", "My role")} : {r.mon_role}</div>
                {r.titulaire && <div style={{ fontSize: 12, color: T.faint, marginTop: 2 }}>{r.titulaire}</div>}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 6. Voir l'organigramme global */}
      {onOrganigramme && (
        <button type="button" className="tap" onClick={onOrganigramme}
          style={{ width: "100%", height: 48, borderRadius: 12, border: `1px solid ${T.b600}`, background: T.tintb, color: T.tintbf, fontWeight: 700, fontSize: 14, fontFamily: "inherit", cursor: "pointer" }}>
          {L("Voir l'organigramme global", "View the full org chart")} →
        </button>
      )}
    </div>
  );
}

function FonctionCarte({ f, principale, en }: Readonly<{ f: HierFonction; principale: boolean; en: boolean }>): JSX.Element {
  const cat = CAT_LABEL[f.categorie]?.[en ? "en" : "fr"] ?? f.categorie;
  return (
    <div style={{ background: T.surf, border: `1px solid ${principale ? T.b600 : T.line}`, borderRadius: 13, padding: "12px 14px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontWeight: 800, fontSize: 15, color: T.ink }}>{f.fonction}</span>
        <span style={{ fontFamily: T.fm, fontSize: 9, letterSpacing: 0.4, color: T.faint, border: `1px solid ${T.line}`, borderRadius: 999, padding: "1px 7px" }}>{cat.toUpperCase()}</span>
        {principale
          ? <span style={{ fontSize: 10, fontWeight: 700, color: T.tintbf, background: T.tintb, borderRadius: 999, padding: "1px 8px" }}>{en ? "primary" : "principale"}</span>
          : <span style={{ fontSize: 10, color: T.faint }}>{en ? "active" : "active"}</span>}
      </div>
      {f.perimetre && <div style={{ fontSize: 12.5, color: T.mut, marginTop: 4 }}>{f.perimetre}</div>}
    </div>
  );
}

function AppuiCarte({ a, en }: Readonly<{ a: HierAppui; en: boolean }>): JSX.Element {
  const L = (fr: string, e: string): string => (en ? e : fr);
  const estInterim = a.type === "interim";
  const badge = estInterim ? L("Intérim", "Interim") : L("Vice-fonction", "Vice-function");
  const couleur = estInterim ? "#8a5a12" : T.b600;
  const fond = estInterim ? "#fbeccb" : T.tintb;
  return (
    <div style={{ background: T.surf, border: `1px solid ${T.line}`, borderLeft: `3px solid ${couleur}`, borderRadius: 13, padding: "12px 14px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontWeight: 800, fontSize: 15, color: T.ink }}>{a.fonction}</span>
        <span style={{ fontSize: 10, fontWeight: 700, color: couleur, background: fond, borderRadius: 999, padding: "1px 8px" }}>{badge}</span>
      </div>
      {a.perimetre && <div style={{ fontSize: 12.5, color: T.mut, marginTop: 4 }}>{a.perimetre}</div>}
      {a.detail && <div style={{ fontSize: 12, color: T.mut, marginTop: 3 }}>{a.detail}</div>}
      {estInterim && (a.depuis || a.jusqu_au) && (
        <div style={{ fontSize: 11, color: T.faint, marginTop: 4 }}>
          {a.depuis ? `${L("depuis le", "since")} ${a.depuis}` : ""}
          {a.jusqu_au ? ` · ${L("jusqu'au", "until")} ${a.jusqu_au}` : ` · ${L("sans échéance", "open-ended")}`}
        </div>
      )}
    </div>
  );
}

function ChaineCarte({ ch, ouverte, onToggle, en }: Readonly<{ ch: HierChaine; ouverte: boolean; onToggle: () => void; en: boolean }>): JSX.Element {
  const L = (fr: string, e: string): string => (en ? e : fr);
  return (
    <div style={{ border: `1px solid ${T.line}`, borderRadius: 13, overflow: "hidden" }}>
      <button type="button" className="tap" onClick={onToggle} aria-expanded={ouverte}
        style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, height: 46, padding: "0 14px", border: "none", background: T.surf, color: T.ink, fontWeight: 700, fontSize: 13.5, fontFamily: "inherit", cursor: "pointer" }}>
        <span>{L("Chaîne", "Chain")} · {ch.titre}</span>
        <span aria-hidden="true">{ouverte ? "▲" : "▼"}</span>
      </button>
      {ouverte && (
        <div style={{ padding: "6px 12px 12px", display: "flex", flexDirection: "column" }}>
          {ch.niveaux.map((n, i) => {
            const multi = n.occupants.length > 1;
            return (
              <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "stretch" }}>
                <div style={{ background: T.surf, border: `1px solid ${n.vacant ? "#b6791b" : T.line}`, borderRadius: 12, padding: "10px 13px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontFamily: T.fm, fontSize: 10, fontWeight: 800, color: T.b600, background: T.tintb, borderRadius: 7, padding: "1px 7px" }}>{n.rang}</span>
                    <span style={{ fontWeight: 800, fontSize: 14, color: T.ink }}>{n.fonction}</span>
                  </div>
                  {n.unite && <div style={{ fontSize: 12, color: T.mut, marginTop: 3 }}>{n.unite}</div>}
                  {n.vacant ? (
                    <div style={{ fontSize: 12.5, color: "#b6791b", fontWeight: 600, marginTop: 3 }}>{L("Poste à pourvoir", "Vacant post")}</div>
                  ) : (
                    <>
                      {multi && <div style={{ fontSize: 10.5, color: T.faint, marginTop: 3 }}>{L("Mes responsables", "My leads")}</div>}
                      {n.occupants.map((o, j) => (
                        <div key={j} style={{ fontSize: 12.5, color: T.mut, marginTop: j === 0 ? 2 : 1, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                          <span>{o.nom}</span>
                          {o.interim && (
                            <span style={{ fontSize: 9.5, fontWeight: 700, color: "#8a5a12", background: "#fbeccb", borderRadius: 999, padding: "1px 7px" }}>
                              {L("par intérim", "acting")}
                            </span>
                          )}
                        </div>
                      ))}
                      {n.interim && n.titulaire && (
                        <div style={{ fontSize: 11, color: T.faint, marginTop: 3 }}>{L("Titulaire habituel", "Usual holder")} : {n.titulaire}</div>
                      )}
                    </>
                  )}
                </div>
                {i < ch.niveaux.length - 1 && <div aria-hidden style={{ width: 2, height: 14, background: T.line, alignSelf: "center" }} />}
              </div>
            );
          })}
          {ch.niveaux.length === 0 && (
            <p style={{ fontSize: 12, color: T.faint, padding: "6px 2px" }}>{L("Aucun niveau supérieur à afficher.", "No upper level to show.")}</p>
          )}
        </div>
      )}
    </div>
  );
}
