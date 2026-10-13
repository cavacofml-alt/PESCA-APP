// Testes com dados reais: tabela oficial de marés do IH e respostas reais das APIs (13/10/2026).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateTides } from "../js/fontes/mares-locais.js";
import { getWarnings, SITUACAO_AVISOS } from "../js/fontes/ipma-avisos.js";
import { getForecast } from "../js/fontes/open-meteo-forecast.js";
import { amplitudeDoDia, repontosDoDia, CLASSE_MARE } from "../js/regras/mares.js";
import { segurancaDoDia, ESTADO_SEGURANCA } from "../js/regras/seguranca.js";
import { horasOpenMeteo } from "../js/regras/serie.js";

const ler = rel => JSON.parse(readFileSync(new URL(rel, import.meta.url), "utf8"));
const config = ler("../config.json");
const tabela = ler("../mares/2026.json");
const { events } = validateTides(tabela);
const ev = iso => events.find(e => e.instant === iso);

// ---------- Tabela de marés do IH (Faro-Olhão, 2026) ----------

test("tabela IH: válida, 365 dias, alternância PM/BM, horas em UTC", () => {
  const v = validateTides(tabela);
  assert.equal(v.ok, true, v.errors.slice(0, 3).join("; "));
  assert.equal(events.length, 1411);
  assert.equal(new Set(events.map(e => e.instant.slice(0, 10))).size, 365);
  assert.ok(events.every(e => e.instant.endsWith("Z")));
  assert.match(tabela.source, /Instituto Hidrográfico/);
  assert.match(tabela.heightDatum, /zero hidrográfico/);
});

test("tabela IH: valores conferidos à mão no PDF (págs. 2-121 e 2-124)", () => {
  // 1 de Janeiro: 00:14 3.1 · 06:21 0.8 · 12:43 3.1 · 18:44 0.8 (horas TU)
  assert.deepEqual([ev("2026-01-01T00:14:00Z"), ev("2026-01-01T06:21:00Z"), ev("2026-01-01T12:43:00Z"), ev("2026-01-01T18:44:00Z")]
    .map(e => [e.type, e.heightM]), [["PM", 3.1], ["BM", 0.8], ["PM", 3.1], ["BM", 0.8]]);
  // 1 de Outubro: 05:09 3.1 · 11:01 0.7 · 17:34 3.0 · 23:20 0.9
  assert.deepEqual(["05:09", "11:01", "17:34", "23:20"].map(h => ev(`2026-10-01T${h}:00Z`).heightM), [3.1, 0.7, 3.0, 0.9]);
  // 9 de Outubro: PM 01:18 3.2 · BM 07:12 0.6
  assert.equal(ev("2026-10-09T01:18:00Z").type, "PM");
  assert.equal(ev("2026-10-09T07:12:00Z").heightM, 0.6);
  // 13 de Outubro: 03:40 3.2 · 09:31 0.7 · 15:59 3.1 · 21:44 0.8
  assert.deepEqual(["03:40", "09:31", "15:59", "21:44"].map(h => ev(`2026-10-13T${h}:00Z`)?.heightM), [3.2, 0.7, 3.1, 0.8]);
});

test("amplitude real de 13/10: 2,6 m (BM 0,6 às 21:14 TU de 12/10 → PM 3,2), intermédia", () => {
  const a = amplitudeDoDia(events, "2026-10-13", config.mares);
  assert.equal(a.amplitude, 2.6);
  assert.equal(a.classe, CLASSE_MARE.INTERMEDIA);
  assert.equal(new Date(a.de).toISOString(), "2026-10-12T21:14:00.000Z");
});

test("início e fim do ano da tabela: amplitude não obtida (sem marés de 2025/2027)", () => {
  assert.equal(amplitudeDoDia(events, "2026-01-01").status, "não obtido");
  assert.equal(amplitudeDoDia(events, "2026-12-31").status, "não obtido");
  assert.equal(repontosDoDia(events, "2027-01-01"), null);
});

test("25/10 (25 horas): repontos do dia em hora de Lisboa, incluindo a hora repetida", () => {
  const r = repontosDoDia(events, "2026-10-25");
  assert.ok(r.length >= 3 && r.length <= 4);
});

// ---------- Respostas reais das APIs ----------

const fakeFetch = rel => async () => ({ ok: true, status: 200, json: async () => ler(rel) });
const NOW = new Date("2026-10-13T20:30:11Z");

test("avisos reais: FAR com Agitação Marítima verde → sem aviso amarelo, segurança livre", async () => {
  const r = await getWarnings({ url: config.fontes.ipmaWarnings, area: "FAR", tipo: "Agitação Marítima",
    fetchImpl: fakeFetch("./reais/ipma_warnings_20261013_2130.json"), now: NOW });
  assert.equal(r.ok, true);
  assert.equal(r.situacao, SITUACAO_AVISOS.COM_AVISOS);
  assert.deepEqual(r.data.map(a => [a.nivel, a.inicio, a.fim]), [["verde", "2026-10-13T10:35:00.000Z", "2026-10-16T10:00:00.000Z"]]);
  assert.equal(segurancaDoDia(r, "2026-10-13", 0).estado, ESTADO_SEGURANCA.LIVRE);
});

test("Open-Meteo Forecast real: unixtime, nós, 336 horas e 24 horas em 13/10", async () => {
  for (const f of ["faro", "quarteira"]) {
    const r = await getForecast({ latitude: 0, longitude: 0, baseUrl: config.fontes.forecastBase,
      fetchImpl: fakeFetch(`./reais/openmeteo_forecast_${f}_20261013_2130.json`), now: NOW });
    assert.equal(r.ok, true, r.error);
    assert.equal(r.data.hourly_units.time, "unixtime");
    assert.equal(r.data.hourly_units.wind_speed_10m, "kn");
    assert.equal(r.data.hourly_units.wind_gusts_10m, "kn");
    assert.equal(r.data.hourly.time.length, 336);
    assert.equal(horasOpenMeteo(r.data).filter(h => h.dia === "2026-10-13").length, 24);
  }
});

test("Open-Meteo real, Faro 13/10 21:00 (Lisboa): 2,3 kn de 318° (= 4,3 km/h NO, como na Fizk)", () => {
  const h = horasOpenMeteo(ler("./reais/openmeteo_forecast_faro_20261013_2130.json"))
    .find(x => x.instante === Date.parse("2026-10-13T20:00:00Z"));
  assert.equal(h.wind_speed_10m, 2.3);
  assert.equal(h.wind_direction_10m, 318);
  assert.equal(Math.round(h.wind_speed_10m * 1.852 * 10) / 10, 4.3);
});
