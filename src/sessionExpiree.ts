/**
 * What happens when the server says the session is over.
 *
 * Until now, nothing. A 401 came back, the client turned it into an ApiError reading
 * "Session expirée", and whichever screen had asked showed it as a red banner. The
 * administrator was left on a page that no longer worked, with an error that looked
 * like a defect in the application rather than the ordinary end of a session. Several
 * people reported it as a bug, and they were right to: an expired session is a normal
 * event, and the normal answer to it is the sign-in screen.
 *
 * The client layer cannot navigate on its own, and the component that made the call
 * has no business deciding to sign somebody out. So the two are joined here: the
 * application registers what to do once, the client layer reports the 401, and the
 * decision stays in one place.
 */

type Abonne = (raison: RaisonFin) => void;

/** Why the session ended, so the sign-in screen can say something true. */
export type RaisonFin = "expiree" | "inactivite" | "revoquee";

const abonnes = new Set<Abonne>();

/** Set once by the application shell. Returns the unsubscribe function. */
export function surFinDeSession(abonne: Abonne): () => void {
  abonnes.add(abonne);
  return () => {
    abonnes.delete(abonne);
  };
}

let derniere = 0;

/**
 * Report that the session is over. Safe to call from every failing request.
 *
 * A page usually fires several calls at once, so a single expiry arrives as a burst
 * of 401s. Announcing each one would sign the user out several times over and could
 * replace a precise reason (inactivity) with a vaguer one. The first announcement in
 * a short window wins.
 */
export function signalerFinDeSession(raison: RaisonFin = "expiree"): void {
  const maintenant = Date.now();
  if (maintenant - derniere < 3000) return;
  derniere = maintenant;
  for (const abonne of abonnes) {
    try {
      abonne(raison);
    } catch {
      /* one subscriber failing must not stop the others from being told. */
    }
  }
}

/** Message shown on the sign-in screen, so the return is explained and not just abrupt. */
export function messageFinDeSession(raison: RaisonFin): string {
  if (raison === "inactivite") {
    return "Votre session a été fermée après une période sans activité. Reconnectez-vous pour continuer.";
  }
  if (raison === "revoquee") {
    return "Votre session a été fermée. Reconnectez-vous pour continuer.";
  }
  return "Votre session a expiré. Reconnectez-vous pour continuer.";
}
