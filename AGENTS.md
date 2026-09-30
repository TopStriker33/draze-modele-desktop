# draze-modele-desktop

Coque de bureau (Electron) autour de l'espace model `https://modele.37-27-96-252.sslip.io/modele`.
Équivalent de l'app iPhone `draze-modele-ios`, dont elle reprend `lien.ts` et le protocole natif.

## Le principe

Le site parle déjà à une coque : quand `window.ReactNativeWebView` existe, il émet
`appel`, `sonnerie`, `badge` et `reglages` (dépôt draze.ch, `modele/src/lib/natif.ts`).
Le preload pose cet objet — **le serveur n'a pas été modifié d'une ligne**.

Deux choses que le navigateur ne sait pas faire et qui justifient cette app :

1. La page arrête de sonder les appels quand `document.hidden` est vrai. Le preload
   lui fait croire qu'elle est visible en permanence : fenêtre réduite, la model
   reste joignable.
2. Caméra et micro accordés d'avance pour cette origine seule, sans invite au
   moment où un fan attend en ligne.

## Commandes

| commande | ce qu'elle prouve |
|---|---|
| `npm test` | les parties pures (lien d'accès, protocole natif) |
| `npm run typecheck` | le TypeScript tient |
| `npm run verif:lancement` | l'app s'ouvre vraiment, et sur quel écran (image PNG) |
| `npx electron . --pont` | le pont page → coque marche, même fenêtre réduite |
| `npm run verify` | tout ce qui précède, d'un coup |

`npx electron . --verif --image "<chemin.png>" --lien "<lien d'accès>"` ouvre une
vraie session et capture l'espace : c'est la seule vérification qui traverse le
site pour de bon. `--image` avant `--lien` — un chemin en dernier argument se
fait avaler par Chromium.

## Ce qui n'est pas dans ce dépôt

Le serveur qui heberge le site, et l'app iPhone soeur. Cette coque n'affiche
que le site ; une correction du site arrive sans rebuild.
