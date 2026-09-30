// Ce que la coque fait des signaux envoyés par la page (src/messageNatif.ts).
// Tout est réversible et sans état persistant : si la page se recharge au
// mauvais moment, un `fin` manquant est rattrapé par `reinitialiser()`.
import { app, BrowserWindow, Notification, powerSaveBlocker, shell } from "electron";
import type { MessageNatif } from "./messageNatif";
import { signalerAppel } from "./maj";

/**
 * Réglages du système où la model active les notifications. La page propose ce
 * bouton quand elles sont coupées (modele/src/components/natif/NotifsCoupees.tsx) ;
 * la coque ne pose jamais le statut qui le déclenche, donc ce cas n'arrive pas
 * aujourd'hui — on le gère quand même, le message est prévu par le protocole.
 */
const REGLAGES_NOTIFS =
  process.platform === "darwin"
    ? "x-apple.systempreferences:com.apple.preference.notifications"
    : "ms-settings:notifications";

let blocageVeille: number | null = null;
let notifSonnerie: Notification | null = null;
/** `cancelBounce` attend l'identifiant rendu par `bounce` : 0 n'annule rien. */
let rebond: number | null = null;

/** Un appel est en cours : la machine ne doit pas s'endormir ni éteindre l'écran. */
function garderEveille(oui: boolean): void {
  if (oui) {
    if (blocageVeille !== null) return;
    blocageVeille = powerSaveBlocker.start("prevent-display-sleep");
    return;
  }
  if (blocageVeille === null) return;
  // `stop` jette si l'identifiant n'est plus connu (Electron l'a déjà libéré) :
  // on n'a alors rien à faire, l'état voulu est déjà atteint.
  try {
    powerSaveBlocker.stop(blocageVeille);
  } catch {
    /* déjà relâché */
  }
  blocageVeille = null;
}

function arreterSonnerie(fenetre: BrowserWindow): void {
  notifSonnerie?.close();
  notifSonnerie = null;
  if (rebond !== null) {
    app.dock?.cancelBounce(rebond);
    rebond = null;
  }
  if (process.platform !== "darwin") fenetre.flashFrame(false);
}

/**
 * Un appel entrant sonne. La page joue déjà le son elle-même (Veille.tsx) ;
 * ce qui lui manque, c'est d'exister en dehors de sa fenêtre. On la ramène
 * donc devant : c'est volontairement intrusif, c'est un téléphone qui sonne.
 */
function sonner(fenetre: BrowserWindow): void {
  arreterSonnerie(fenetre);

  if (fenetre.isMinimized()) fenetre.restore();
  fenetre.show();
  if (process.platform === "darwin") {
    rebond = app.dock?.bounce("critical") ?? null;
    app.focus({ steal: true });
  } else {
    fenetre.flashFrame(true);
    fenetre.focus();
  }

  if (!Notification.isSupported()) return;
  notifSonnerie = new Notification({
    title: "Appel entrant",
    body: "Un fan t’appelle sur Draze.",
    urgency: "critical",
  });
  notifSonnerie.on("click", () => {
    if (fenetre.isMinimized()) fenetre.restore();
    fenetre.show();
    fenetre.focus();
  });
  notifSonnerie.show();
}

export function traiter(message: MessageNatif, fenetre: BrowserWindow): void {
  switch (message.type) {
    case "appel":
      garderEveille(message.etat === "debut");
      signalerAppel(message.etat === "debut");
      // Elle a décroché : la sonnerie n'a plus lieu d'être, même si la page
      // n'a pas eu le temps d'envoyer son `sonnerie: fin`.
      if (message.etat === "debut") arreterSonnerie(fenetre);
      return;
    case "sonnerie":
      if (message.etat === "debut") sonner(fenetre);
      else arreterSonnerie(fenetre);
      return;
    case "badge":
      app.setBadgeCount(message.n);
      return;
    case "reglages":
      void shell.openExternal(REGLAGES_NOTIFS);
      return;
  }
}

/**
 * Rechargement de page, perte de session, fermeture : on relâche tout ce qui
 * était accroché à un appel. Sans ça un `debut` sans `fin` laisserait l'écran
 * allumé et la pastille figée jusqu'au prochain lancement.
 */
export function reinitialiser(fenetre: BrowserWindow | null): void {
  garderEveille(false);
  signalerAppel(false);
  app.setBadgeCount(0);
  if (fenetre && !fenetre.isDestroyed()) {
    arreterSonnerie(fenetre);
    return;
  }
  // Plus de fenêtre : on range quand même ce qui vit au niveau de l'app.
  notifSonnerie?.close();
  notifSonnerie = null;
  if (rebond !== null) {
    app.dock?.cancelBounce(rebond);
    rebond = null;
  }
}
