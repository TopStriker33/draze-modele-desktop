# Certificat Apple pour signer l'app macOS — sans Mac

Une app macOS non signée, c'est deux problèmes, et le second est le vrai :

1. macOS la bloque au premier lancement (contournable une fois : clic droit → Ouvrir).
2. **La permission caméra est attachée à la signature.** Sans signature stable,
   macOS peut redemander — ou refuser en silence — après chaque mise à jour.
   Pour une model qui fait des cams, c'est exactement ce qui casse en plein appel.
   Et l'auto-update ne fonctionne pas du tout sur macOS non signé.

Le certificat s'obtient depuis Windows. Seule la **construction** exige un Mac,
et c'est GitHub qui en loue un (`.github/workflows/mac.yml`).

Compte concerné : le même que celui de l'app iPhone (dépôt `draze-modele-ios`).
L'Apple ID et l'identifiant d'équipe se lisent sur developer.apple.com ; ils
ne sont pas notés ici, ce dépôt est public.

## 1. Générer la demande — FAIT le 30-09

`draze-developerid.key` et `draze-developerid.csr` sont à la racine du dépôt,
ignorés par git. **Ne perds pas le `.key`** : sans lui, le certificat téléchargé
ne sert à rien et il faut tout recommencer.

Pour refaire la manipulation un jour (Git Bash) — `MSYS_NO_PATHCONV=1` est
indispensable, sinon Git Bash prend le `-subj` pour un chemin de fichier et
openssl échoue sans message utile :

```bash
cd ~/Desktop/claude/draze-modele-desktop
openssl genrsa -out draze-developerid.key 2048
MSYS_NO_PATHCONV=1 openssl req -new -key draze-developerid.key \
  -out draze-developerid.csr -subj "/emailAddress=TON_APPLE_ID/CN=Draze/C=CH"
```

## 2. Créer le certificat (developer.apple.com)

Certificates, Identifiers & Profiles → Certificates → **+** →
**Developer ID Application** → envoyer `draze-developerid.csr` → télécharger
`developerID_application.cer`.

⚠️ Choisir **Developer ID Application**, pas « Apple Distribution » (App Store)
ni « Development ». C'est le seul type qui autorise une distribution hors App
Store, ce qui est le cas ici.

## 3. Fabriquer le `.p12`

Il faut y mettre l'intermédiaire d'Apple, sinon la chaîne est incomplète et la
signature est rejetée au moment de la notarisation.

```bash
curl -O https://www.apple.com/certificateauthority/DeveloperIDG2CA.cer
openssl x509 -inform DER -in DeveloperIDG2CA.cer -out intermediaire.pem
openssl x509 -inform DER -in developerID_application.cer -out certificat.pem

openssl pkcs12 -export -legacy \
  -inkey draze-developerid.key \
  -in certificat.pem \
  -certfile intermediaire.pem \
  -out draze-developerid.p12 \
  -passout pass:CHOISIS_UN_MOT_DE_PASSE

base64 -w0 draze-developerid.p12 > draze-developerid.p12.base64
```

**`-legacy` n'est pas optionnel.** Sans lui, OpenSSL 3 produit un `.p12`
chiffre en AES-256 avec un MAC SHA-256. `openssl` le relit parfaitement, mais
le trousseau macOS ne sait pas l'ouvrir et repond :

```
security: SecKeychainItemImport: MAC verification failed during PKCS12 import (wrong password?)
```

Le message accuse le mot de passe alors que le mot de passe est bon : c'est le
format qui est en cause, pas le secret. `-legacy` redescend en 3DES + MAC
SHA-1, le seul format que `security import` accepte. Controle avant de poser
le secret GitHub :

```bash
openssl pkcs12 -legacy -in draze-developerid.p12 -passin pass:LE_MDP -nokeys -noout -info
# doit afficher « MAC: sha1 », jamais « MAC: sha256 »
```

## 4. Mot de passe d'application (pour la notarisation)

appleid.apple.com → Connexion et sécurité → Mots de passe pour application →
en créer un, le noter. **Ce n'est pas le mot de passe du compte Apple**, et la
notarisation échoue avec celui-ci.

## 5. Poser les secrets GitHub

Settings → Secrets and variables → Actions → New repository secret :

| secret | valeur |
|---|---|
| `MAC_CERT_P12` | le contenu de `draze-developerid.p12.base64` |
| `MAC_CERT_PASSWORD` | le mot de passe choisi à l'étape 3 |
| `APPLE_ID` | `TON_APPLE_ID` |
| `APPLE_APP_PASSWORD` | le mot de passe d'application de l'étape 4 |
| `APPLE_TEAM_ID` | l'identifiant d'équipe (developer.apple.com → Membership) |

Puis Actions → « App Mac » → Run workflow. Le job échoue si la notarisation
n'a pas pris (`stapler validate`), donc un job vert = une app qui s'ouvrira
chez la model.

## 6. Après le build

Télécharger l'artéfact `draze-mac`, poser les fichiers dans `release/`, puis
`scripts/publier.sh`.

## À ne pas laisser traîner

`.key`, `.p12`, `.cer`, `.csr` et le `.base64` sont ignorés par git, mais ils
restent sur le disque. Une fois les secrets GitHub posés, garde le `.key` et le
`.p12` en lieu sûr (ils valent pour 5 ans) et supprime le reste.
