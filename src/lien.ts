// Tout ce que la coque sait de l'espace model : son adresse publique, la forme
// d'un lien d'accès, et ce qui reste dans l'app plutôt que de partir dans le
// navigateur du système. Repris tel quel de l'app iPhone (draze-modele-ios,
// src/lien.ts) avec ses tests : même serveur, mêmes règles, mêmes pièges.

export const ORIGINE = "https://modele.37-27-96-252.sslip.io";
export const ACCUEIL = `${ORIGINE}/modele`;

// Même borne que le serveur (route acces/[jeton]) : 43 caractères en pratique,
// 200 au plus. base64url uniquement.
const LIEN_ACCES = /https:\/\/modele\.37-27-96-252\.sslip\.io\/modele\/acces\/([A-Za-z0-9_-]{1,200})(?![A-Za-z0-9_-])/i;

/**
 * Retrouve le lien d'accès dans ce que la model a collé. Elle colle souvent
 * le message WhatsApp entier (« Voici ton lien : https://… »), pas seulement
 * l'URL : on cherche le lien dedans au lieu d'exiger une saisie exacte.
 */
export function extraireLienAcces(texte: string): string | null {
  const m = LIEN_ACCES.exec(texte);
  return m ? `${ACCUEIL}/acces/${m[1]}` : null;
}

// Comparaison de texte stricte plutôt que `new URL()` : l'origine exacte, puis
// un chemin qui commence par /modele. « …sslip.io@ailleurs » (identifiants dans
// l'URL) et « …sslip.io.ailleurs » (sous-domaine pirate) ne passent pas — deux
// formes qu'un `startsWith` naïf laisserait entrer.
function chemin(url: string): string | null {
  if (url.slice(0, ORIGINE.length).toLowerCase() !== ORIGINE) return null;
  const reste = url.slice(ORIGINE.length);
  return /^\/modele(?=[/?#]|$)/.test(reste) ? reste : null;
}

/**
 * L'URL est-elle sur l'origine de l'espace model — et pas sur un domaine qui
 * lui ressemble ? Un simple préfixe laisserait passer « …sslip.io.ailleurs »
 * et « …sslip.io@ailleurs » : le caractère qui suit l'origine doit être un
 * séparateur, sinon le nom d'hôte continue et c'est un autre site.
 *
 * Sert là où il n'y a pas de chemin à vérifier : accorder la caméra, filtrer
 * une redirection, reconnaître l'expéditeur d'un message.
 */
export function estSurOrigine(url: string): boolean {
  if (url.slice(0, ORIGINE.length).toLowerCase() !== ORIGINE) return false;
  const suite = url.charAt(ORIGINE.length);
  return suite === "" || suite === "/" || suite === "?" || suite === "#";
}

/** Page de l'espace model : elle s'ouvre dans l'app. Tout le reste part dans le navigateur du système. */
export function estInterne(url: string): boolean {
  return chemin(url) !== null;
}

export function estLienAcces(url: string): boolean {
  return chemin(url)?.startsWith("/modele/acces/") ?? false;
}

/**
 * Sans session valide, le serveur répond 404 générique sur toute page de
 * l'espace (il ne révèle pas que l'espace existe). Pour la coque, ce 404
 * veut dire : « il faut (re)coller un lien ». Un 401/403 aussi (POST refusé).
 */
export function exigeUnLien(statut: number): boolean {
  return statut === 401 || statut === 403 || statut === 404;
}
