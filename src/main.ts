import path from "node:path";
import { pathToFileURL } from "node:url";
import { app, BrowserWindow, clipboard, ipcMain, session, shell, systemPreferences } from "electron";
import type { WebFrameMain } from "electron";
import { ACCUEIL, ORIGINE, estInterne, estSurOrigine, exigeUnLien, extraireLienAcces } from "./lien";
import { surveillerLesMaj } from "./maj";
import { analyserMessage } from "./messageNatif";
import { reinitialiser, traiter } from "./pont";
import { lienDeVerif, minuterie, pontDemande, verifDemandee, verifier, verifierPont } from "./verif";

const ECRAN_ENTREE = path.join(__dirname, "ui", "entree.html");
const ECRAN_PANNE = path.join(__dirname, "ui", "panne.html");
const URL_ENTREE = pathToFileURL(ECRAN_ENTREE).href;
const URL_PANNE = pathToFileURL(ECRAN_PANNE).href;

/** Navigation annulée (on a nous-mêmes chargé autre chose) : jamais une panne. */
const ERR_ABORTED = -3;

/**
 * Un renderer qui meurt en boucle ne se répare pas en le rechargeant plus fort.
 * Au-delà, on s'arrête sur l'écran de panne plutôt que de tourner sans fin.
 */
const RELANCES_MAX = 3;

/** Tout le reste part dans le navigateur — mais on ne lance pas n'importe quoi. */
const SCHEMAS_EXTERNES = new Set(["https:", "http:", "mailto:"]);

let fenetre: BrowserWindow | null = null;
let relances = 0;

/**
 * `loadURL` et `loadFile` rejettent sur la moindre coupure réseau ou navigation
 * annulée. Non rattrapé, ça affiche « A JavaScript error occurred in the main
 * process » à la model : l'écran de panne est géré par `did-fail-load`, ici on
 * absorbe simplement le rejet.
 */
function charger(fen: BrowserWindow, cible: string, fichier = false): void {
  if (fen.isDestroyed()) return;
  const p = fichier ? fen.loadFile(cible) : fen.loadURL(cible);
  void p.catch(() => undefined);
}

/** Les deux seules pages locales de l'app (la query `?refus=1` est permise). */
function estEcranLocal(url: string): boolean {
  const sansQuery = url.split(/[?#]/)[0] ?? "";
  return sansQuery === URL_ENTREE || sansQuery === URL_PANNE;
}

function ouvrirDehors(url: string): void {
  let schema: string;
  try {
    schema = new URL(url).protocol;
  } catch {
    return; // URL illisible : on ne lance rien.
  }
  // Sans ce filtre, une page piégée ferait ouvrir « file:///…/quelque-chose.exe »
  // ou un schéma d'application, par le système et hors de tout contrôle.
  if (SCHEMAS_EXTERNES.has(schema)) void shell.openExternal(url);
}

/**
 * Caméra et micro sans redemander à chaque appel, mais pour ce seul site.
 * La comparaison passe par `estSurOrigine` et non par un préfixe : sinon
 * « …sslip.io.ailleurs.example » obtiendrait la caméra de la model.
 */
function autoriserMedia(): void {
  const permises = new Set(["media", "camera", "microphone", "fullscreen", "notifications"]);

  session.defaultSession.setPermissionRequestHandler((_contenu, permission, repondre, details) => {
    // `requestingUrl` est l'URL qui demande, pas celle du haut de la page :
    // une iframe tierce ne doit pas hériter de la permission du site.
    const demandeur = details?.requestingUrl ?? "";
    repondre(permises.has(permission) && details?.isMainFrame === true && estSurOrigine(demandeur));
  });

  // Vérifications synchrones (getUserMedia sans invite) : sans ce second
  // gardien, Chromium refuse avant même de poser la question ci-dessus.
  session.defaultSession.setPermissionCheckHandler((_contenu, permission, origine) => {
    if (!permises.has(permission)) return false;
    // Ici c'est une origine seule, parfois avec une barre oblique finale.
    return origine.replace(/\/$/, "").toLowerCase() === ORIGINE;
  });
}

/** Un lien hors de l'espace model s'ouvre dans le navigateur, jamais ici. */
function garderLesLiensDehors(fen: BrowserWindow): void {
  fen.webContents.setWindowOpenHandler(({ url }) => {
    if (estInterne(url)) {
      // Une seconde fenêtre de l'espace n'a pas de sens : on reste dans
      // celle-ci pour que la model ne perde jamais sa session ni son appel.
      charger(fen, url);
    } else {
      ouvrirDehors(url);
    }
    return { action: "deny" };
  });

  const filtrer = (evenement: { preventDefault(): void }, url: string): void => {
    if (estInterne(url) || estEcranLocal(url)) return;
    evenement.preventDefault();
    ouvrirDehors(url);
  };

  fen.webContents.on("will-navigate", filtrer);
  // `will-navigate` ne voit pas les redirections décidées par le serveur : sans
  // ce second filtre, une redirection amènerait une page tierce dans la
  // fenêtre, où le preload lui donnerait le pont natif (sonnerie, badge…).
  fen.webContents.on("will-redirect", filtrer);
}

function creerFenetre(): BrowserWindow {
  const fen = new BrowserWindow({
    width: 1120,
    height: 780,
    minWidth: 900,
    minHeight: 640,
    backgroundColor: "#0b0b0c",
    title: "Draze",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      // La fenêtre réduite doit continuer à sonder les appels : sans ça
      // Chromium ralentit ses minuteries à une par minute (voir preload.ts).
      backgroundThrottling: false,
      // La page sonne toute seule quand un appel arrive, sans que la model ait
      // touché quoi que ce soit : la règle « un geste d'abord » l'en empêcherait.
      autoplayPolicy: "no-user-gesture-required",
    },
  });

  fen.once("ready-to-show", () => fen.show());
  garderLesLiensDehors(fen);

  // Le serveur répond 404 sur tout l'espace sans session valide (il ne révèle
  // pas qu'il existe) : pour la coque, ça veut dire « il faut coller un lien ».
  // `?refus=1` quand elle venait justement d'en coller un : sans ça l'écran
  // réapparaît vide et elle croit que le bouton ne marche pas.
  fen.webContents.on("did-navigate", (_e, url, code) => {
    if (!exigeUnLien(code) || pontDemande()) return;
    const refuse = url.includes("/modele/acces/");
    void fen.loadFile(ECRAN_ENTREE, refuse ? { search: "refus=1" } : {}).catch(() => undefined);
  });

  fen.webContents.on("did-fail-load", (_e, code, _desc, url, principal) => {
    if (!principal || code === ERR_ABORTED || url.startsWith("file://")) return;
    charger(fen, ECRAN_PANNE, true);
  });

  // Rechargement, retour à l'écran d'entrée, session perdue : rien ne doit
  // rester accroché à l'appel précédent. `dansLaPage` écarte les navigations
  // du routeur du site (pushState), qui arrivent EN PLEIN APPEL et
  // relâcheraient la veille au milieu d'une conversation.
  fen.webContents.on("did-start-navigation", (_e, _url, dansLaPage, principal) => {
    if (principal && !dansLaPage) reinitialiser(fen);
  });

  // Le renderer est mort : sans ça la fenêtre reste blanche, la veille reste
  // bloquée, et la model est injoignable jusqu'à ce qu'elle relance l'app.
  fen.webContents.on("render-process-gone", () => {
    reinitialiser(fen);
    relances += 1;
    if (relances > RELANCES_MAX) charger(fen, ECRAN_PANNE, true);
    else charger(fen, ACCUEIL);
  });

  fen.webContents.on("did-finish-load", () => {
    relances = 0;
  });

  fen.on("closed", () => {
    reinitialiser(null);
    fenetre = null;
  });

  return fen;
}

/** Le message vient-il bien d'une page à nous ? */
function expediteurSur(frame: WebFrameMain | null, local: boolean): boolean {
  const url = frame?.url ?? "";
  return local ? estEcranLocal(url) : estSurOrigine(url);
}

function brancherPont(): void {
  ipcMain.on("natif", (evenement, brut: unknown) => {
    if (typeof brut !== "string" || !expediteurSur(evenement.senderFrame, false)) return;
    const message = analyserMessage(brut);
    const fen = BrowserWindow.fromWebContents(evenement.sender);
    if (message && fen && !fen.isDestroyed()) traiter(message, fen);
  });

  // Lecture du presse-papiers et chargement d'URL : réservés aux écrans locaux,
  // jamais accessibles à une page distante.
  ipcMain.handle("entree:presse", (evenement) =>
    expediteurSur(evenement.senderFrame, true) ? clipboard.readText() : "",
  );

  ipcMain.handle("entree:ouvrir", (evenement, texte: unknown) => {
    if (typeof texte !== "string" || !expediteurSur(evenement.senderFrame, true)) return false;
    const lien = extraireLienAcces(texte);
    if (!lien) return false;
    const fen = BrowserWindow.fromWebContents(evenement.sender);
    if (fen) charger(fen, lien);
    return true;
  });

  ipcMain.on("panne:reessayer", (evenement) => {
    if (!expediteurSur(evenement.senderFrame, true)) return;
    const fen = BrowserWindow.fromWebContents(evenement.sender);
    if (fen) charger(fen, ACCUEIL);
  });
}

// Deux fenêtres, ce serait deux sondages et deux sonneries pour un seul appel.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  // Sans ça, les notifications Windows s'affichent sous un mauvais nom, ou pas
  // du tout — et c'est justement ce qui prévient d'un appel entrant.
  app.setAppUserModelId("ch.draze.modele.bureau");

  // Filet : une promesse rejetée nulle part ailleurs ne doit pas se transformer
  // en boîte d'erreur devant la model.
  process.on("unhandledRejection", () => undefined);

  app.on("second-instance", () => {
    if (!fenetre) return;
    if (fenetre.isMinimized()) fenetre.restore();
    fenetre.show();
    fenetre.focus();
  });

  void app.whenReady().then(async () => {
    autoriserMedia();
    brancherPont();
    surveillerLesMaj();
    if (process.platform === "darwin") {
      // macOS n'invite qu'une fois par app : mieux vaut que ce soit au premier
      // lancement, au calme, qu'au moment où un fan attend en ligne.
      await Promise.all([
        systemPreferences.askForMediaAccess("camera"),
        systemPreferences.askForMediaAccess("microphone"),
      ]).catch(() => undefined);
    }
    fenetre = creerFenetre();
    if (verifDemandee()) minuterie();
    await fenetre.loadURL(lienDeVerif() ?? ACCUEIL).catch(() => undefined);
    if (pontDemande()) await verifierPont(fenetre);
    else if (verifDemandee()) await verifier(fenetre);
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length > 0) return;
    fenetre = creerFenetre();
    charger(fenetre, ACCUEIL);
  });

  // Sur Mac, fermer la fenêtre ne quitte pas l'app : elle reste dans le Dock,
  // prête à rouvrir. Ailleurs, fermer veut dire quitter.
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
