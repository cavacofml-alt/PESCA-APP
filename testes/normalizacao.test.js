import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  leitura, parseUtc, parseUnixSeconds, utcToLisbon, lisbonDate, lisbonOffsetLabel, ESTADO
} from "../js/normalizacao.js";
import { HORAS_25_OUT } from "./dados-teste.js";

const base = { source: "teste", tipo: "previsto", readAt: "2026-10-13T00:00:00.000Z" };

test("leitura: número finito fica obtido", () => {
  const r = leitura(1.2, base);
  assert.equal(r.value, 1.2);
  assert.equal(r.status, ESTADO.OBTIDO);
});

test("leitura: zero é um valor válido", () => {
  assert.equal(leitura(0, base).status, ESTADO.OBTIDO);
  assert.equal(leitura(0, base).value, 0);
});

test("leitura: null e undefined ficam não obtido", () => {
  for (const v of [null, undefined]) {
    const r = leitura(v, base);
    assert.equal(r.value, null);
    assert.equal(r.status, ESTADO.NAO_OBTIDO);
  }
});

test("leitura: NaN e ±Infinity ficam inválido com value=null", () => {
  for (const v of [NaN, Infinity, -Infinity]) {
    const r = leitura(v, base);
    assert.equal(r.value, null);
    assert.equal(r.status, ESTADO.INVALIDO);
  }
});

test("leitura: tipo desconhecido é recusado", () => {
  assert.throws(() => leitura(1, { ...base, tipo: "estimado" }), TypeError);
});

test("parseUtc: cadeia sem fuso é lida como UTC", () => {
  assert.equal(parseUtc("2026-10-04T08:43:00").toISOString(), "2026-10-04T08:43:00.000Z");
  assert.equal(parseUtc("2026-10-04T08:43").toISOString(), "2026-10-04T08:43:00.000Z");
});

test("parseUtc: respeita fuso explícito", () => {
  assert.equal(parseUtc("2026-10-04T09:43:00+01:00").toISOString(), "2026-10-04T08:43:00.000Z");
  assert.equal(parseUtc("2026-10-04T08:43:00Z").toISOString(), "2026-10-04T08:43:00.000Z");
});

test("parseUtc: rejeita valores inválidos", () => {
  for (const v of [null, undefined, 123, "", "2026-10-04", "ontem", "2026-02-31T10:00:00",
    "2026-13-01T10:00:00", "2026-10-04T24:00:00"]) {
    assert.equal(parseUtc(v), null, String(v));
  }
});

test("utcToLisbon: aviso IPMA 08:43 UTC é 09:43 em Lisboa (Verão)", () => {
  assert.equal(utcToLisbon("2026-10-04T08:43:00"), "2026-10-04T09:43:00");
});

test("utcToLisbon: no Inverno UTC e Lisboa coincidem", () => {
  assert.equal(utcToLisbon("2026-12-01T08:43:00"), "2026-12-01T08:43:00");
});

test("parseUnixSeconds: segundos Unix e valores inválidos", () => {
  assert.equal(parseUnixSeconds(1792886400).toISOString(), "2026-10-25T00:00:00.000Z");
  assert.equal(parseUnixSeconds(NaN), null);
  assert.equal(parseUnixSeconds("1792886400"), null);
});

test("25/10/2026: a hora 01:00 repete-se mas os instantes são distintos", () => {
  const locais = HORAS_25_OUT.map(t => utcToLisbon(parseUnixSeconds(t)));
  assert.deepEqual(locais, [
    "2026-10-25T00:00:00", "2026-10-25T01:00:00", "2026-10-25T01:00:00", "2026-10-25T02:00:00"
  ]);
  const etiquetas = HORAS_25_OUT.map(t => lisbonOffsetLabel(parseUnixSeconds(t)));
  assert.notEqual(etiquetas[1], etiquetas[2], "as duas 01:00 têm de ser distinguíveis pelo fuso");
});

test("lisbonDate: data civil de Lisboa, com deslocamento de dias", () => {
  // 23:30 UTC de 07/10 já é 08/10 em Lisboa (UTC+1).
  const d = new Date("2026-10-07T23:30:00Z");
  assert.equal(lisbonDate(d), "2026-10-08");
  assert.equal(lisbonDate(d, 2), "2026-10-10");
  assert.equal(lisbonDate(new Date("2026-12-31T12:00:00Z"), 1), "2027-01-01");
  assert.equal(lisbonDate(new Date(NaN)), null);
});

// O erro original dependia do fuso do aparelho: confirmar o resultado com vários TZ.
test("utcToLisbon dá o mesmo resultado em qualquer fuso do aparelho", () => {
  const modulo = fileURLToPath(new URL("../js/normalizacao.js", import.meta.url));
  const script = `import(${JSON.stringify("file://" + modulo)}).then(m => console.log(JSON.stringify([
    m.utcToLisbon("2026-10-04T08:43:00"), m.utcToLisbon("2026-12-01T08:43:00"),
    m.lisbonDate(new Date("2026-10-07T23:30:00Z"))])));`;
  for (const tz of ["UTC", "Europe/Lisbon", "America/New_York", "Asia/Tokyo", "Pacific/Kiritimati"]) {
    const out = execFileSync(process.execPath, ["--input-type=module", "-e", script],
      { env: { ...process.env, TZ: tz }, encoding: "utf8" });
    assert.deepEqual(JSON.parse(out), ["2026-10-04T09:43:00", "2026-12-01T08:43:00", "2026-10-08"], tz);
  }
});
