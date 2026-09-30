// `npm run verif:lancement` : lance l'app pour de vrai, dit sur quel écran
// elle atterrit et en garde une image, puis quitte. C'est le seul moyen
// honnête d'affirmer « l'app s'ouvre » — un build qui compile ne le prouve pas.
//
// Sans lien d'accès, le serveur répond 404 et on doit atterrir sur l'écran
// « colle ton lien ». Avec `--lien <url>`, on ouvre ce lien et on doit
// atterrir sur l'espace lui-même.
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { app, type BrowserWindow } from "electron";
import { estInterne } from "./lien";

const DELAI_MS = 30000;

let garde: NodeJS.Timeout | null = null;

function valeurArg(nom: string): string | null {
  const i = process.argv.indexOf(nom);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

/**
 * Filtré par `estInterne` : sans ça, `--lien` serait un moyen de charger
 * n'importe quelle page dans une fenêtre qui accorde la caméra.
 */
export function lienDeVerif(): string | null {
  const lien = valeurArg("--lien");
  return lien !== null && estInterne(lien) ? lien : null;
}

export function verifDemandee(): boolean {
  return process.argv.includes("--verif") || pontDemande();
}

/**
 * Mode « pont » : on reste sur la page du serveur même quand elle répond 404
 * (sans session), parce que ce qu'on vérifie n'est pas son contenu mais le
 * preload qui s'y exécute — c'est la même origine, donc le même pont.
 */
export function pontDemande(): boolean {
  return process.argv.includes("--pont");
}

/** Ce que la page voit et ce que la coque en fait : le trajet complet. */
export async function verifierPont(fenetre: BrowserWindow): Promise<void> {
  const { app: electronApp } = await import("electron");
  desarmer();
  let code = 1;
  try {
    const vu = await fenetre.webContents.executeJavaScript(
      `({ pont: typeof window.ReactNativeWebView?.postMessage, hidden: document.hidden, etat: document.visibilityState })`,
    );
    console.log(`pont=${vu.pont}`);
    console.log(`hidden=${vu.hidden} etat=${vu.etat}`);

    // Fenêtre réduite : c'est le cas qui rendait la model injoignable.
    fenetre.minimize();
    await new Promise((r) => setTimeout(r, 1500));
    const reduite = await fenetre.webContents.executeJavaScript(
      `({ hidden: document.hidden, etat: document.visibilityState })`,
    );
    console.log(`reduite.hidden=${reduite.hidden} reduite.etat=${reduite.etat}`);
    fenetre.restore();

    // Trajet complet : la page poste, la coque analyse, la pastille bouge.
    electronApp.setBadgeCount(0);
    await fenetre.webContents.executeJavaScript(
      `window.ReactNativeWebView.postMessage(JSON.stringify({ type: "badge", n: 3 })), 0`,
    );
    await new Promise((r) => setTimeout(r, 500));
    console.log(`badge=${electronApp.getBadgeCount()}`);

    // Un message inconnu ne doit rien changer.
    await fenetre.webContents.executeJavaScript(
      `window.ReactNativeWebView.postMessage("{\\"type\\":\\"n_importe_quoi\\"}"), 0`,
    );
    await new Promise((r) => setTimeout(r, 300));
    console.log(`badge_apres_message_inconnu=${electronApp.getBadgeCount()}`);

    const ok =
      vu.pont === "function" && vu.hidden === false && reduite.hidden === false && electronApp.getBadgeCount() === 3;
    console.log(ok ? "PONT OK" : "PONT KO");
    code = ok ? 0 : 1;
  } catch (e) {
    console.error("verif pont échouée :", e);
  } finally {
    electronApp.exit(code);
  }
}

export async function verifier(fenetre: BrowserWindow): Promise<void> {
  const sortie = valeurArg("--image") ?? path.join(app.getPath("temp"), "draze-verif.png");
  desarmer();
  let code = 1;
  try {
    // Laisser la page finir de s'installer (redirections, React, sondage).
    await new Promise((r) => setTimeout(r, 3000));
    if (fenetre.isDestroyed()) throw new Error("fenêtre fermée avant la capture");
    const url = fenetre.webContents.getURL();
    const titre = fenetre.webContents.getTitle();
    // La query compte : « entree.html?refus=1 » et « entree.html » ne disent
    // pas la même chose à la model.
    const ecran = url.startsWith("file:")
      ? path.basename(new URL(url).pathname) + new URL(url).search
      : url;
    const image = await fenetre.webContents.capturePage();
    await writeFile(sortie, image.toPNG());
    console.log(`ecran=${ecran}`);
    console.log(`titre=${titre}`);
    console.log(`visible=${fenetre.isVisible()}`);
    console.log(`image=${sortie}`);
    code = 0;
  } catch (e) {
    console.error("verif échouée :", e);
  } finally {
    app.exit(code);
  }
}

/** Filet : si rien n'aboutit, on ne laisse pas une fenêtre ouverte pour toujours. */
export function minuterie(): void {
  garde = setTimeout(() => {
    console.error(`verif : rien après ${DELAI_MS} ms`);
    app.exit(2);
  }, DELAI_MS);
  garde.unref?.();
}

/**
 * La vérification a commencé : le filet doit lâcher prise, sinon il détruit la
 * fenêtre au milieu d'une capture et fait échouer une vérification qui se
 * passait bien.
 */
function desarmer(): void {
  if (garde) clearTimeout(garde);
  garde = null;
}
