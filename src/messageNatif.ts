// Messages envoyés par la page (dépôt draze.ch, modele/src/lib/natif.ts::signalerNatif)
// via `window.ReactNativeWebView.postMessage(...)`. La page ne les émet que si
// cet objet existe : le preload de la coque le pose (src/preload.ts), et c'est
// tout ce qu'il a fallu pour recevoir les mêmes signaux que l'app iPhone sans
// toucher une ligne du serveur.
//
//   - `appel` début/fin : la machine ne doit pas s'endormir pendant un appel ;
//   - `sonnerie` début/fin : un appel entrant sonne — on prévient la model ;
//   - `badge` : nombre d'appels + vidéos en attente, posé sur l'icône ;
//   - `reglages` : ouvrir les réglages de notifications du système.
//
// Aucune dépendance Electron ici : testé tel quel par `npm test`.

export type MessageNatif =
  | { type: "appel"; etat: "debut" | "fin" }
  | { type: "sonnerie"; etat: "debut" | "fin" }
  | { type: "badge"; n: number }
  | { type: "reglages" };

/** Au-delà, la pastille ne veut plus rien dire : on plafonne plutôt que de refuser. */
const BADGE_MAX = 99;

/**
 * `null` si `brut` n'est pas très exactement l'un de ces messages (JSON
 * invalide, type inconnu, champ manquant ou hors bornes…) : la coque rejette
 * tout le reste plutôt que de deviner. Le pont est ouvert à toute page chargée
 * dans la fenêtre — mieux vaut ignorer que d'agir sur une forme inattendue.
 */
export function analyserMessage(brut: string): MessageNatif | null {
  let valeur: unknown;
  try {
    valeur = JSON.parse(brut);
  } catch {
    return null;
  }
  if (typeof valeur !== "object" || valeur === null || Array.isArray(valeur)) return null;
  const objet = valeur as Record<string, unknown>;
  switch (objet.type) {
    case "appel":
    case "sonnerie":
      if (objet.etat !== "debut" && objet.etat !== "fin") return null;
      return { type: objet.type, etat: objet.etat };
    case "badge":
      if (typeof objet.n !== "number" || !Number.isInteger(objet.n) || objet.n < 0) return null;
      return { type: "badge", n: Math.min(objet.n, BADGE_MAX) };
    case "reglages":
      return { type: "reglages" };
    default:
      return null;
  }
}
