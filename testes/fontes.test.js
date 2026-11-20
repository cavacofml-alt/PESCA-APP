import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getMarine } from "../js/fontes/open-meteo-marine.js";
import { getForecast } from "../js/fontes/open-meteo-forecast.js";
import { validarSerieUnix } from "../js/fontes/open-meteo-tempo.js";
import { validateTides } from "../js/fontes/mares-locais.js";
import {
  MARINE_FIXTURE, FORECAST_FIXTURE, TIDE_FIXTURE
} from "./dados-teste.js";

const config = JSON.parse(readFileSync(new URL("../config.json", import.meta.url), "utf8"));
const { fontes } = config;
const NOW = new Date("2026-10-08T10:00:00Z");

// fetch falso, sem rede: regista os URL pedidos e devolve a fixture.
function fakeFetch(body, { status = 200 } = {}) {
  const pedidos = [];
  const impl = async url => {
    pedidos.push(String(url));
    return { ok: status >= 200 && status < 300, status, json: async () => structuredClone(body) };
  };
  impl.pedidos = pedidos;
  return impl;
}

// ---------- Open-Meteo ----------

test("Marine: pede timeformat=unixtime e aceita a fixture de 25/10", async () => {
  const f = fakeFetch(MARINE_FIXTURE);
  const r = await getMarine({ ...config.locais.faroMar, baseUrl: fontes.marineBase, fetchImpl: f, now: NOW });
  assert.equal(r.ok, true, r.error);
  const url = new URL(f.pedidos[0]);
  assert.equal(url.origin + url.pathname, fontes.marineBase);
  assert.equal(url.searchParams.get("timeformat"), "unixtime");
});

test("Forecast: unixtime, nós e sem wind_gusts_unit", async () => {
  const f = fakeFetch(FORECAST_FIXTURE);
  const r = await getForecast({ ...config.locais.faroTerra, baseUrl: fontes.forecastBase, fetchImpl: f, now: NOW });
  assert.equal(r.ok, true, r.error);
  const url = new URL(f.pedidos[0]);
  assert.equal(url.searchParams.get("timeformat"), "unixtime");
  assert.equal(url.searchParams.get("wind_speed_unit"), "kn");
  assert.equal(url.searchParams.has("wind_gusts_unit"), false);
  assert.equal(url.searchParams.has("sunrise"), false);
  assert.doesNotMatch(url.searchParams.get("hourly"), /sunrise|sunset/);
});

test("Open-Meteo: horas locais em texto (sem unixtime) são recusadas", async () => {
  const antigo = { hourly: { time: ["2026-10-25T01:00", "2026-10-25T01:00"] } };
  const r = await getMarine({ latitude: 1, longitude: 1, baseUrl: fontes.marineBase, fetchImpl: fakeFetch(antigo), now: NOW });
  assert.equal(r.ok, false);
  assert.match(r.error, /não Unix/);
});

test("validarSerieUnix: série vazia, fora de ordem ou repetida", () => {
  assert.throws(() => validarSerieUnix({ hourly: { time: [] } }));
  assert.throws(() => validarSerieUnix({ hourly: { time: [3600, 0] } }));
  assert.throws(() => validarSerieUnix({ hourly: { time: [3600, 3600] } }));
  assert.throws(() => validarSerieUnix({}));
  assert.equal(validarSerieUnix(MARINE_FIXTURE), true);
});

test("Open-Meteo: falha HTTP não lança, devolve não obtido", async () => {
  const r = await getForecast({ latitude: 1, longitude: 1, baseUrl: fontes.forecastBase, fetchImpl: fakeFetch(null, { status: 500 }), now: NOW });
  assert.equal(r.ok, false);
  assert.match(r.error, /HTTP 500/);
});

test("HTTP 429 (limite de pedidos) aparece explicado em português", async () => {
  const r = await getForecast({ latitude: 1, longitude: 1, baseUrl: fontes.forecastBase, fetchImpl: fakeFetch(null, { status: 429 }), now: NOW });
  assert.equal(r.ok, false);
  assert.match(r.error, /Limite de pedidos da fonte atingido/);
});

test("Erros de rede e JSON aparecem em português", async () => {
  const semRede = async () => { throw new TypeError("Failed to fetch"); };
  const r = await getForecast({ latitude: 1, longitude: 1, baseUrl: fontes.forecastBase, fetchImpl: semRede, now: NOW });
  assert.equal(r.error, "Falha de rede (sem ligação ou pedido bloqueado)");
  const jsonMau = async () => ({ ok: true, status: 200, json: async () => JSON.parse("<html>") });
  const r2 = await getMarine({ latitude: 1, longitude: 1, baseUrl: fontes.marineBase, fetchImpl: jsonMau, now: NOW });
  assert.equal(r2.error, "Resposta não é JSON válido");
});

// ---------- Marés locais (mantido da Fase 2) ----------

test("Marés: fixture de teste válida", () => {
  assert.equal(validateTides(TIDE_FIXTURE).ok, true);
});
