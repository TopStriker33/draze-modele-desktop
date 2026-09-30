#!/usr/bin/env bash
# Publie une version de la coque : envoie les installeurs et les fichiers de
# version dans /srv/bureau sur le serveur, d'où l'app les lit (voir
# deploy/caddy-bureau.md). Les anciennes versions restent : une app qui
# télécharge au moment où on publie ne doit pas voir son fichier disparaître.
set -euo pipefail

# Adresse et cle viennent de l'environnement : ce depot est public, il n'a pas
# a nommer la machine de prod ni le fichier de cle.
#   SERVEUR=utilisateur@hote CLE=~/.ssh/ma_cle scripts/publier.sh
: "${SERVEUR:?definis SERVEUR=utilisateur@hote}"
: "${CLE:?definis CLE=chemin/vers/la/cle}"
RELEASE="$(cd "$(dirname "$0")/.." && pwd)/release"

if [ ! -d "$RELEASE" ]; then
  echo "rien à publier : $RELEASE n'existe pas (lance npm run pack:mac ou pack:win)" >&2
  exit 1
fi

# Seulement ce que l'app lit. Le reste du dossier release (dossiers de
# décompression, builder-debug.yml…) n'a rien à faire en ligne.
mapfile -t FICHIERS < <(find "$RELEASE" -maxdepth 1 -type f \
  \( -name '*.yml' -o -name '*.exe' -o -name '*.dmg' -o -name '*.zip' -o -name '*.blockmap' \))

if [ "${#FICHIERS[@]}" -eq 0 ]; then
  echo "rien à publier : aucun installeur dans $RELEASE" >&2
  exit 1
fi

printf 'à publier :\n'; printf '  %s\n' "${FICHIERS[@]##*/}"
scp -i "$CLE" "${FICHIERS[@]}" "$SERVEUR:/srv/bureau/"
ssh -i "$CLE" "$SERVEUR" 'chown -R caddy:caddy /srv/bureau && ls -la /srv/bureau'
