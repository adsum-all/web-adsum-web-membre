import { useEffect, useState } from "react";
import { type MarquePublique, getMarquePublique } from "./api.js";
import { appliquerCouleurMarque } from "./paletteMarque.js";

/**
 * The organisation's identity, fetched once and remembered.
 *
 * The sign-in screen and the header show a name and a palette before anybody has a
 * token, so those strings used to be written into the code. Every deployment of this
 * platform would then greet its members with somebody else's name.
 *
 * The last known identity is kept locally so the first paint carries the right name
 * instead of flashing a placeholder, and the values below are the ones the platform
 * shipped with, so an unreachable API still renders something coherent.
 */
const CLE = "adsum.marque";

const DEFAUT: MarquePublique = {
  marque: "ADSUM",
  initiale: "A",
  organisation: "Sacerdoce Royal",
  organisation_courte: "SR",
  slogan: null,
  logo_url: null,
  site: null,
  couleur: "#2a4fad",
  couleur_sombre: "#1d3470",
  mots: {},
};

/** One term in the organisation's words, with the shipped word as the fallback.
 *  Called from a screen that needs a label: mot(m, "tribu", "Pluriel"). */
export function mot(
  marque: MarquePublique,
  terme: string,
  facette: "singulier" | "pluriel" | "article" | "Singulier" | "Pluriel" | "avec_article" = "singulier",
  repli = "",
): string {
  const m = marque.mots?.[terme];
  return (m ? m[facette] : "") || repli || terme;
}

function charger(): MarquePublique {
  try {
    const brut = typeof localStorage !== "undefined" ? localStorage.getItem(CLE) : null;
    const m = brut ? { ...DEFAUT, ...(JSON.parse(brut) as Partial<MarquePublique>) } : DEFAUT;
    // Applied before the first render: the palette was fetched and then never used,
    // so an organisation saw its colour in its e-mails and nowhere in the interface.
    appliquerCouleurMarque(m.couleur, m.couleur_sombre);
    return m;
  } catch {
    return DEFAUT;
  }
}

export function useMarque(): MarquePublique {
  const [marque, setMarque] = useState<MarquePublique>(charger);

  useEffect(() => {
    let vivant = true;
    void getMarquePublique()
      .then((m) => {
        if (!vivant) return;
        appliquerCouleurMarque(m.couleur, m.couleur_sombre);
        setMarque(m);
        try {
          localStorage.setItem(CLE, JSON.stringify(m));
        } catch {
          /* private mode: the identity stays in memory for this visit. */
        }
      })
      .catch(() => undefined);
    return () => {
      vivant = false;
    };
  }, []);

  return marque;
}
