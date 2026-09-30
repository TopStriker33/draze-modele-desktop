// Deux ponts, jamais dans la même page.
//
// Page distante (l'espace model) : on pose `window.ReactNativeWebView`, le seul
// objet que le site regarde pour savoir s'il tourne dans une coque (dépôt
// draze.ch, modele/src/lib/natif.ts::dansAppNatif). Il se met alors à signaler
// les appels, la sonnerie et la pastille — exactement comme à l'app iPhone,
// sans une ligne de changement côté serveur.
//
// Écrans locaux (file://) : on pose `window.draze`, dont la page distante ne
// doit rien savoir. C'est pour ça que les deux ponts s'excluent.
import { contextBridge, ipcRenderer, webFrame } from "electron";

/**
 * Le site arrête de sonder les nouveautés quand `document.hidden` est vrai
 * (modele/src/components/veille/Veille.tsx : `if (annule || document.hidden) return`).
 * Sur un téléphone c'est sain — l'app dort, les notifications push prennent le
 * relais. Ici il n'y a pas de push : une fenêtre réduite rendrait la model
 * injoignable, ce qui est précisément ce que cette app doit empêcher. On lui
 * fait donc croire qu'elle est visible en permanence.
 *
 * Posé depuis le preload (avant le chargement du document) plutôt qu'au
 * `dom-ready` : le sondage ne doit jamais voir la vraie valeur, même une fois.
 */
const TOUJOURS_VISIBLE = `(function () {
  var visible = { configurable: true, get: function () { return false; } };
  var etat = { configurable: true, get: function () { return "visible"; } };
  try { Object.defineProperty(Document.prototype, "hidden", visible); } catch (e) {}
  try { Object.defineProperty(Document.prototype, "visibilityState", etat); } catch (e) {}
  window.addEventListener("visibilitychange", function (e) { e.stopImmediatePropagation(); }, true);
})();`;

if (location.protocol === "file:") {
  contextBridge.exposeInMainWorld("draze", {
    /** Le texte collé par la model : le lien y est cherché côté coque (src/lien.ts). */
    ouvrir: (texte: string): Promise<boolean> => ipcRenderer.invoke("entree:ouvrir", texte),
    /** Contenu du presse-papiers, pour le bouton « Coller ». */
    presse: (): Promise<string> => ipcRenderer.invoke("entree:presse"),
    /** Écran de panne : retenter la connexion. */
    reessayer: (): void => ipcRenderer.send("panne:reessayer"),
  });
} else {
  contextBridge.exposeInMainWorld("ReactNativeWebView", {
    postMessage: (message: string): void => ipcRenderer.send("natif", message),
  });
  webFrame.executeJavaScript(TOUJOURS_VISIBLE).catch(() => {
    // La page est partie entre-temps : le prochain chargement repassera ici.
  });
}
