import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sectorDaDirecao, normalizarGraus } from "../js/regras/sectores.js";

const config = JSON.parse(readFileSync(new URL("../config.json", import.meta.url), "utf8"));
const S = config.mar.sectoresGraus;

test("limites semi-abertos: o início pertence ao sector, o fim não", () => {
  const casos = [
    [67.4999, "norteNoroeste"], [67.5, "levanteSudeste"],
    [157.4999, "levanteSudeste"], [157.5, "sulSudoesteOeste"],
    [292.4999, "sulSudoesteOeste"], [292.5, "norteNoroeste"]
  ];
  for (const [graus, esperado] of casos) assert.equal(sectorDaDirecao(graus, S), esperado, String(graus));
});

test("travessia de 0°/360°", () => {
  for (const graus of [0, 360, 359.99, 720, -0, 30, -22.5]) {
    assert.equal(sectorDaDirecao(graus, S), "norteNoroeste", String(graus));
  }
  assert.equal(sectorDaDirecao(-292.5, S), "levanteSudeste"); // -292,5 = 67,5
});

test("direcções inválidas → null", () => {
  for (const v of [null, undefined, NaN, Infinity, "90"]) assert.equal(sectorDaDirecao(v, S), null, String(v));
});

test("normalizarGraus", () => {
  assert.equal(normalizarGraus(360), 0);
  assert.equal(normalizarGraus(-90), 270);
  assert.ok(Object.is(normalizarGraus(-0), 0));
});

test("os três sectores cobrem os 360° sem sobreposição", () => {
  for (let g = 0; g < 360; g += 0.5) {
    const n = Object.values(S).filter(([a, b]) => (a < b ? g >= a && g < b : g >= a || g < b)).length;
    assert.equal(n, 1, `${g}°`);
  }
});
