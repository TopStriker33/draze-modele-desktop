// Mise à jour de la coque elle-même. À distinguer du contenu : une correction
// du site arrive sans rien mettre à jour ici (la coque n'affiche qu'une page).
// Ce mécanisme ne sert qu'à changer le comportement de l'app — sonnerie,
// permissions, fenêtre — ce qui reste rare.
//
// Deux garanties, dans cet ordre d'importance :
//   1. Rien n'est TÉLÉCHARGÉ pendant un appel. Un installeur de 80 Mo qui
//      descend pendant une cam prend la bande passante de la caméra, et c'est
//      la model qui passe pour avoir une mauvaise connexion.
//   2. Rien n'est INSTALLÉ en cours de route : la nouvelle version se pose à
//      la fermeture de l'app, jamais au milieu d'une session de travail.
import { app } from "electron";
import { autoUpdater, CancellationToken } from "electron-updater";

const TOUTES_LES_6H = 6 * 60 * 60 * 1000;
/** Un appel vient de finir : on laisse retomber avant de tirer sur le réseau. */
const APRES_APPEL_MS = 60 * 1000;

let enAppel = false;
let differee = false;
let jeton: CancellationToken | null = null;

function telecharger(): void {
  if (enAppel) {
    differee = true;
    return;
  }
  jeton = new CancellationToken();
  autoUpdater.downloadUpdate(jeton).catch(() => {
    // Annulé par un appel qui démarre, ou réseau coupé : on retentera au
    // prochain tour. Jamais visible pour la model.
  });
}

function chercher(): void {
  if (enAppel) {
    differee = true;
    return;
  }
  autoUpdater.checkForUpdates().catch(() => {
    // Pas de réseau, pas de feed, app non signée sur macOS : jamais bloquant.
  });
}

/**
 * Appelé par le pont à chaque début et fin d'appel. Un téléchargement déjà
 * lancé est ANNULÉ — le bloquer au démarrage ne suffit pas, il peut très bien
 * avoir commencé une minute avant que le fan appelle.
 */
export function signalerAppel(actif: boolean): void {
  if (actif === enAppel) return;
  enAppel = actif;

  if (actif) {
    jeton?.cancel();
    jeton = null;
    return;
  }
  if (!differee) return;
  differee = false;
  setTimeout(chercher, APRES_APPEL_MS).unref?.();
}

export function surveillerLesMaj(): void {
  // Hors app empaquetée il n'y a pas de app-update.yml : chercher planterait.
  if (!app.isPackaged) return;

  // Le téléchargement est déclenché à la main, pour pouvoir le refuser pendant
  // un appel — `autoDownload` partirait tout seul dès la version trouvée.
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on("update-available", telecharger);
  autoUpdater.on("error", () => {
    // Un échec peut aussi survenir pendant le téléchargement : on l'absorbe au
    // lieu de laisser Electron afficher une boîte d'erreur à la model.
  });

  chercher();
  setInterval(chercher, TOUTES_LES_6H).unref?.();
}
