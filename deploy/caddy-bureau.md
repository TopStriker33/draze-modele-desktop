# Servir le feed de mise à jour (`/bureau/`) — APPLIQUÉ le 30-09-2026

Posé sur le serveur, moteurs vérifiés à l'arrêt avant le `reload` (les trois
sessions d'appel en `state: ended`, une seule connexion 443 établie).
Sauvegarde du Caddyfile d'avant : `/etc/caddy/Caddyfile.avant-bureau.20260930165229`.

Preuve après reload :

```
/bureau/ping.txt       -> 200   (file_server sert bien /srv/bureau)
/bureau/latest-mac.yml -> 404   (normal : rien de publié encore)
/bureau/../../etc/caddy/Caddyfile -> 404   (pas d'évasion hors /srv/bureau)
/modele                -> 404 application/json, 35 octets, Cache-Control: no-store
                                (c'est l'app Next qui répond — le 404 « colle ton
                                lien », pas le fourre-tout)
/nimporte              -> 404 Content-Length: 0   (là, c'est le fourre-tout Caddy)
```

La distinction entre ces deux 404 est le seul contrôle qui prouve que le site
n'a pas été cassé : ils ont le même code, pas le même corps.

---

## Note d'origine (avant application)

L'app cherche ses mises à jour sur `https://modele.37-27-96-252.sslip.io/bureau/`
(`electron-builder.yml`, `publish.url`). Aujourd'hui ce chemin tombe sur le
`handle { respond 404 }` final du site : le feed n'existe pas encore.

## Pourquoi ce n'est pas appliqué tout seul

Ajouter le bloc demande `systemctl reload caddy`, et le Caddyfile le dit
lui-même : **un reload coupe brièvement les WebSocket de TOUT Caddy, y compris
un appel WhatsApp en direct.** Ça se fait quand aucun appel ne tourne, à la
main, pas au milieu d'un build.

## Le bloc à ajouter

Dans le site `modele.37-27-96-252.sslip.io`, **entre `handle @modele` et le
`handle { respond 404 }` final** — l'ordre compte : le fallback avale tout ce
qui passe après lui.

```caddyfile
	@bureau path /bureau /bureau/*
	# Installeurs et fichiers de version de l'app de bureau (dépôt
	# draze-modele-desktop). Fichiers statiques seulement : aucun accès à
	# l'app Next, aucune session, rien à journaliser de sensible — à la
	# différence de /modele, l'URL ne porte pas de jeton.
	handle @bureau {
		root * /srv/bureau
		uri strip_prefix /bureau
		file_server
	}
```

Le contenu est public : n'importe qui connaissant l'adresse peut télécharger
l'installeur. Ce n'est pas un secret — l'app sans lien d'accès n'affiche que
« colle ton lien ». Si tu préfères la fermer quand même, remplace le chemin
`/bureau` par un segment non devinable, ici et dans `electron-builder.yml`.

## Séquence (même forme que pour le bloc `modele`)

1. `cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.avant-bureau.$(date +%Y%m%d%H%M%S)`
2. `mkdir -p /srv/bureau && chown -R caddy:caddy /srv/bureau`
3. Coller le bloc au bon endroit.
4. `caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile`
5. **Vérifier qu'aucun appel n'est en cours** avant de recharger.
6. `systemctl reload caddy`
7. `curl -I https://modele.37-27-96-252.sslip.io/bureau/latest.yml` → 404 tant
   que rien n'est publié (c'est le 404 du `file_server`, pas celui du
   fallback : la différence se voit au `Server`/corps de réponse), puis 200
   après `scripts/publier.sh`.

Retour arrière : restaurer la sauvegarde, `caddy validate`, `systemctl reload caddy`.
