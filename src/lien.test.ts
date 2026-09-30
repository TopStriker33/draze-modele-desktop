import { test } from "node:test";
import assert from "node:assert/strict";
import { ACCUEIL, ORIGINE, estInterne, estLienAcces, estSurOrigine, exigeUnLien, extraireLienAcces } from "./lien.ts";

const JETON = "q3Zp0-Xw_9aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456"; // 43 caractères, base64url

test("lien collé seul", () => {
  assert.equal(extraireLienAcces(`https://modele.37-27-96-252.sslip.io/modele/acces/${JETON}`), `${ACCUEIL}/acces/${JETON}`);
});

test("lien noyé dans le message WhatsApp, avec espaces et retour à la ligne", () => {
  const msg = `Coucou ! Voici ton accès 👇\n  https://modele.37-27-96-252.sslip.io/modele/acces/${JETON} \nNe le partage pas`;
  assert.equal(extraireLienAcces(msg), `${ACCUEIL}/acces/${JETON}`);
});

test("hôte en majuscules (correcteur du clavier) : on retombe sur l'adresse canonique", () => {
  assert.equal(extraireLienAcces(`HTTPS://Modele.37-27-96-252.sslip.io/modele/acces/${JETON}`), `${ACCUEIL}/acces/${JETON}`);
});

test("refusés : autre site, http, lien sans jeton, jeton trop long, texte quelconque", () => {
  assert.equal(extraireLienAcces(`https://ailleurs.example/modele/acces/${JETON}`), null);
  assert.equal(extraireLienAcces(`http://modele.37-27-96-252.sslip.io/modele/acces/${JETON}`), null);
  assert.equal(extraireLienAcces("https://modele.37-27-96-252.sslip.io/modele/acces/"), null);
  assert.equal(extraireLienAcces(`https://modele.37-27-96-252.sslip.io/modele/acces/${"a".repeat(201)}`), null);
  assert.equal(extraireLienAcces("bonjour"), null);
});

test("sous-domaine piégé : l'hôte doit être exactement le nôtre", () => {
  assert.equal(extraireLienAcces(`https://modele.37-27-96-252.sslip.io.ailleurs.example/modele/acces/${JETON}`), null);
});

test("pages de l'espace : restent dans l'app", () => {
  assert.equal(estInterne(ACCUEIL), true);
  assert.equal(estInterne(`${ACCUEIL}/todo`), true);
  assert.equal(estInterne(`${ACCUEIL}?onglet=gains`), true);
  assert.equal(estInterne(`${ACCUEIL}/acces/${JETON}`), true);
});

test("tout le reste part dans le navigateur du système", () => {
  assert.equal(estInterne("https://wa.me/41000000000"), false);
  assert.equal(estInterne("https://modele.37-27-96-252.sslip.io/"), false);
  assert.equal(estInterne("https://modele.37-27-96-252.sslip.io/modeles"), false);
  assert.equal(estInterne("https://modele.37-27-96-252.sslip.io@ailleurs.example/modele"), false);
  assert.equal(estInterne("https://modele.37-27-96-252.sslip.io.ailleurs.example/modele"), false);
  assert.equal(estInterne("https://modele.37-27-96-252.sslip.io:8443/modele"), false);
  assert.equal(estInterne("http://modele.37-27-96-252.sslip.io/modele"), false);
  assert.equal(estInterne("about:blank"), false);
  assert.equal(estInterne(""), false);
});

test("lien d'accès reconnu comme tel", () => {
  assert.equal(estLienAcces(`${ACCUEIL}/acces/${JETON}`), true);
  assert.equal(estLienAcces(ACCUEIL), false);
  assert.equal(estLienAcces(`https://ailleurs.example/modele/acces/${JETON}`), false);
});

test("statuts qui renvoient à l'écran « colle ton lien »", () => {
  for (const s of [401, 403, 404]) assert.equal(exigeUnLien(s), true);
  for (const s of [200, 303, 500, 502, 503]) assert.equal(exigeUnLien(s), false);
});

test("l'origine, et pas un domaine qui lui ressemble", () => {
  assert.equal(estSurOrigine(ORIGINE), true);
  assert.equal(estSurOrigine(`${ORIGINE}/`), true);
  assert.equal(estSurOrigine(`${ORIGINE}/modele/appels?x=1`), true);
  // Les deux pièges qui accorderaient la caméra à un site tiers.
  assert.equal(estSurOrigine("https://modele.37-27-96-252.sslip.io.ailleurs.example/"), false);
  assert.equal(estSurOrigine("https://modele.37-27-96-252.sslip.io@ailleurs.example/"), false);
  assert.equal(estSurOrigine("http://modele.37-27-96-252.sslip.io/"), false);
  assert.equal(estSurOrigine("https://modele.37-27-96-252.sslip.io:8443/"), false);
  assert.equal(estSurOrigine("https://ailleurs.example/"), false);
});
