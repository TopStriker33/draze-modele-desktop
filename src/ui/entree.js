const saisie = document.getElementById("saisie");
const refus = document.getElementById("refus");

// Le lien était bien formé mais le serveur l'a refusé (expiré, révoqué) : sans
// ce message l'écran réapparaît vide et elle croit que le bouton ne marche pas.
if (new URLSearchParams(location.search).has("refus")) {
  refus.textContent = "Ce lien n’est plus valable. Demande-en un nouveau.";
}

function direRefus() {
  // Le lien est cherché dans tout le texte collé (src/lien.ts) : si on n'en
  // trouve pas, c'est qu'il n'y en a pas — inutile de parler de format.
  refus.textContent = "Ce lien ne marche pas. Demande-en un nouveau.";
}

async function ouvrir() {
  refus.textContent = "";
  const texte = saisie.value.trim();
  if (!texte) return;
  if (!(await window.draze.ouvrir(texte))) direRefus();
}

document.getElementById("ouvrir").addEventListener("click", ouvrir);

document.getElementById("coller").addEventListener("click", async () => {
  saisie.value = await window.draze.presse();
  refus.textContent = "";
  // Elle a collé pour ouvrir, pas pour relire : on enchaîne.
  await ouvrir();
});

saisie.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    void ouvrir();
  }
});
