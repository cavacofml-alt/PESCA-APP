import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getMarine } from "../js/fontes/open-meteo-marine.js";
import { getForecast } from "../js/fontes/open-meteo-forecast.js";
import { validarSerieUnix } from "../js/fontes/open-meteo-tempo.js";
import { getSeaForecastDay } from "../js/fontes/ipma-mar.js";
import { validateTides } from "../js/fontes/mares-locais.js";
import {
  MARINE_FIXTURE, FORECAST_FIXTURE, TIDE_FIXTURE, ipmaMarFixture
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

// ---------- IPMA estado do mar ----------

test("Estado do mar: URL correcto e só Faro (1080526)", async () => {
  const f = fakeFetch(ipmaMarFixture("2026-10-09"));
  const r = await getSeaForecastDay(1, { baseUrl: fontes.ipmaSeaForecastBase, fetchImpl: f, now: NOW });
  assert.equal(r.ok, true, r.error);
  assert.equal(f.pedidos[0],
    "https://api.ipma.pt/open-data/forecast/oceanography/daily/hp-daily-sea-forecast-day1.json");
  assert.equal(r.data.length, 1);
  assert.equal(r.data[0].globalIdLocal, 1080526);
});

test("Estado do mar: forecastDate diferente do dia pedido → desactualizado", async () => {
  // Caso observado: a 08/10 o day0 ainda tinha forecastDate 07/10.
  const r = await getSeaForecastDay(0, { baseUrl: fontes.ipmaSeaForecastBase,
    fetchImpl: fakeFetch(ipmaMarFixture("2026-10-07")), now: NOW });
  assert.equal(r.ok, false);
  assert.match(r.error, /desactualizado/);
});

test("Estado do mar: sem registo de Faro → não obtido", async () => {
  const pedir = body => getSeaForecastDay(0, { baseUrl: fontes.ipmaSeaForecastBase, fetchImpl: fakeFetch(body), now: NOW });
  const vazio = { ...ipmaMarFixture("2026-10-08"), data: [] };
  const soOutros = ipmaMarFixture("2026-10-08");
  soOutros.data = soOutros.data.filter(r => r.globalIdLocal !== 1080526);
  for (const body of [vazio, soOutros]) {
    const r = await pedir(body);
    assert.equal(r.ok, false);
    assert.match(r.error, /sem registo de Faro/);
  }
  const duplicado = ipmaMarFixture("2026-10-08");
  duplicado.data.push({ ...duplicado.data[0] });
  const r = await pedir(duplicado);
  assert.equal(r.ok, false);
  assert.match(r.error, /2 registos de Faro/);
});

test("Estado do mar: forecastDate em falta → desactualizado", async () => {
  const semData = ipmaMarFixture("2026-10-08");
  delete semData.forecastDate;
  const r = await getSeaForecastDay(0, { baseUrl: fontes.ipmaSeaForecastBase, fetchImpl: fakeFetch(semData), now: NOW });
  assert.equal(r.ok, false);
  assert.match(r.error, /em falta/);
});

test("Estado do mar: o dia pedido é o dia de Lisboa, não o UTC", async () => {
  // 23:30 UTC de 07/10 = 00:30 de 08/10 em Lisboa → day0 tem de ser 08/10.
  const r = await getSeaForecastDay(0, { baseUrl: fontes.ipmaSeaForecastBase,
    fetchImpl: fakeFetch(ipmaMarFixture("2026-10-08")), now: new Date("2026-10-07T23:30:00Z") });
  assert.equal(r.ok, true, r.error);
});

// ---------- Marés locais (mantido da Fase 2) ----------

test("Marés: fixture de teste válida", () => {
  assert.equal(validateTides(TIDE_FIXTURE).ok, true);
});
