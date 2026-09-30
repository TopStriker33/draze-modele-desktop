import { test } from "node:test";
import assert from "node:assert/strict";
import { analyserMessage } from "./messageNatif.ts";

test("début et fin d'appel reconnus", () => {
  assert.deepEqual(analyserMessage('{"type":"appel","etat":"debut"}'), { type: "appel", etat: "debut" });
  assert.deepEqual(analyserMessage('{"type":"appel","etat":"fin"}'), { type: "appel", etat: "fin" });
});

test("sonnerie, pastille et réglages reconnus", () => {
  assert.deepEqual(analyserMessage('{"type":"sonnerie","etat":"debut"}'), { type: "sonnerie", etat: "debut" });
  assert.deepEqual(analyserMessage('{"type":"sonnerie","etat":"fin"}'), { type: "sonnerie", etat: "fin" });
  assert.deepEqual(analyserMessage('{"type":"badge","n":0}'), { type: "badge", n: 0 });
  assert.deepEqual(analyserMessage('{"type":"badge","n":3}'), { type: "badge", n: 3 });
  assert.deepEqual(analyserMessage('{"type":"reglages"}'), { type: "reglages" });
});

test("pastille plafonnée à 99", () => {
  assert.deepEqual(analyserMessage('{"type":"badge","n":1500}'), { type: "badge", n: 99 });
});

test("champs en plus tolérés", () => {
  assert.deepEqual(analyserMessage('{"type":"appel","etat":"debut","autre":1}'), { type: "appel", etat: "debut" });
  assert.deepEqual(analyserMessage('{"type":"reglages","url":"https://ailleurs"}'), { type: "reglages" });
});

test("refusés : JSON invalide, type inconnu, état ou nombre invalide, forme différente", () => {
  assert.equal(analyserMessage("pas du json"), null);
  assert.equal(analyserMessage('{"type":"video","etat":"debut"}'), null);
  assert.equal(analyserMessage('{"type":"appel","etat":"pause"}'), null);
  assert.equal(analyserMessage('{"type":"sonnerie"}'), null);
  assert.equal(analyserMessage('{"type":"appel"}'), null);
  assert.equal(analyserMessage('{"type":"badge"}'), null);
  assert.equal(analyserMessage('{"type":"badge","n":-1}'), null);
  assert.equal(analyserMessage('{"type":"badge","n":1.5}'), null);
  assert.equal(analyserMessage('{"type":"badge","n":"3"}'), null);
  assert.equal(analyserMessage('"appel"'), null);
  assert.equal(analyserMessage("42"), null);
  assert.equal(analyserMessage("null"), null);
  assert.equal(analyserMessage("[]"), null);
  assert.equal(analyserMessage('[{"type":"reglages"}]'), null);
  assert.equal(analyserMessage(""), null);
});
