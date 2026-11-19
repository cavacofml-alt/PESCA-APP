// Boia de Faro do Instituto Hidrográfico (OGC API EDR): pedido, leitura da resposta real e
// indicadores de qualidade. Sem rede.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getBoia, lerCoberturaBoia, resumoBoia } from "../js/fontes/ih-boias.js";

const config = JSON.parse(readFileSync(new URL("../config.json", import.meta.url), "utf8"));
// Resposta real de 17/11/2026 (testes/reais/README.md): 20 medições de 15/11, 00:56–10:26 UTC.
const REAL = JSON.parse(readFileSync(new URL("./reais/ih_boia_faro_20261115.json", import.meta.url), "utf8"));
const b = config.boias.faro;

function fakeFetch(body, { status = 200 } = {}) {
  const pedidos = [];
  const impl = async url => {
    pedidos.push(String(url));
    return { ok: status >= 200 && status < 300, status, json: async () => structuredClone(body) };
  };
  impl.pedidos = pedidos;
  return impl;
}

test("boia: pede a estação do config, as últimas 24 h em UTC e JSON", async () => {
  const f = fakeFetch(REAL);
  const now = new Date("2026-11-15T10:40:00Z");
  const r = await getBoia({ baseUrl: config.fontes.boiasIhBase, idEstacao: b.idEstacao, horas: b.horas, fetchImpl: f, now });
  assert.equal(r.ok, true, r.error);
  const url = new URL(f.pedidos[0]);
  assert.equal(url.origin + url.pathname, `${config.fontes.boiasIhBase}20`);
  assert.equal(url.searchParams.get("datetime"), "2026-11-14T10:40:00Z/2026-11-15T10:40:00Z");
  assert.equal(url.searchParams.get("f"), "json");
  assert.equal(r.readAt, now.toISOString());
});

test("boia: lê a resposta real — instantes em UTC, coordenadas e valores", () => {
  const d = lerCoberturaBoia(REAL);
  assert.equal(d.observacoes.length, 20);
  assert.equal(d.latitude.toFixed(4), "36.9048");
  assert.equal(d.longitude.toFixed(4), "-7.8984");
  const p = d.observacoes[0];
  assert.equal(new Date(p.instante).toISOString(), "2026-11-15T00:56:36.000Z");
  assert.deepEqual([p.hm0.valor, p.hmax.valor, p.tp.valor, p.tm02.valor, p.direcao.valor], [1.16, 1.89, 10.5, 6, 248]);
});

test("boia: indicadores de qualidade — 2 aceite, 9 em falta (sentinela 99,99), 4 inválido", () => {
  const o = lerCoberturaBoia(REAL).observacoes;
  const em = iso => o.find(x => new Date(x.instante).toISOString() === iso);
  // Água com QC 2 (provavelmente bom): aceite.
  assert.deepEqual(em("2026-11-15T00:56:36.000Z").agua, { valor: 19.1, qc: 2, estado: "obtido" });
  // Registo em falta: valores 99.99/99.9/999 com QC 9 → não obtido, sem valor.
  const falta = em("2026-11-15T09:26:38.000Z");
  for (const k of ["hm0", "hmax", "tp", "tm02", "direcao", "agua"]) {
    assert.deepEqual(falta[k], { valor: null, qc: 9, estado: "não obtido" }, k);
  }
  // Onda máxima com QC 4 (mau), valor 99.99 → inválido; o resto do registo vale.
  const mau = em("2026-11-15T09:56:38.000Z");
  assert.deepEqual(mau.hmax, { valor: null, qc: 4, estado: "inválido" });
  assert.equal(mau.hm0.valor, 0.89);
});

test("boia: valor fora dos limites físicos é inválido mesmo com QC 1 (resposta alterada no teste)", () => {
  const j = structuredClone(REAL);
  j.coverages[0].ranges.wave_hm0.values[0] = 99.99;
  assert.equal(lerCoberturaBoia(j).observacoes[0].hm0.estado, "inválido");
});

test("boia: formato inesperado, parâmetro em falta ou série fora de ordem → não obtido", async () => {
  const pedir = body => getBoia({ baseUrl: config.fontes.boiasIhBase, idEstacao: 20, fetchImpl: fakeFetch(body) });
  assert.match((await pedir({ type: "FeatureCollection" })).error, /CoverageJSON/);
  const semAgua = structuredClone(REAL);
  delete semAgua.coverages[0].ranges.sea_water_temperature_qc;
  assert.match((await pedir(semAgua)).error, /sea_water_temperature_qc/);
  const desordem = structuredClone(REAL);
  desordem.coverages[0].domain.axes.t.values.reverse();
  assert.match((await pedir(desordem)).error, /fora de ordem/);
  const http = await getBoia({ baseUrl: config.fontes.boiasIhBase, idEstacao: 20, fetchImpl: fakeFetch({}, { status: 503 }) });
  assert.equal(http.ok, false);
  assert.match(http.error, /HTTP 503/);
});

test("boia: resumo — última medição válida, 3 h antes, mínimo e máximo, idade", () => {
  const s = resumoBoia(lerCoberturaBoia(REAL), { agora: new Date("2026-11-15T10:40:00Z"), maxIdadeHoras: 3 });
  assert.equal(new Date(s.ultima.instante).toISOString(), "2026-11-15T10:26:38.000Z");
  assert.equal(s.ultima.hm0.valor, 0.84);
  assert.equal(new Date(s.tresHorasAntes.instante).toISOString(), "2026-11-15T07:26:36.000Z");
  assert.equal(s.tresHorasAntes.hm0.valor, 0.96);
  assert.deepEqual([s.minimo, s.maximo], [0.84, 1.22]);
  assert.equal(s.idadeMin, 13);
  assert.equal(s.desactualizada, false);
});

test("boia: medição com mais de maxIdadeHoras fica desactualizada; sem medições válidas → null", () => {
  const d = lerCoberturaBoia(REAL);
  assert.equal(resumoBoia(d, { agora: new Date("2026-11-15T13:27:00Z"), maxIdadeHoras: 3 }).desactualizada, true);
  assert.equal(resumoBoia(d, { agora: new Date("2026-11-15T13:26:00Z"), maxIdadeHoras: 3 }).desactualizada, false);
  assert.equal(resumoBoia({ observacoes: [] }, { agora: new Date() }), null);
  const so9 = structuredClone(REAL);
  so9.coverages[0].ranges.wave_hm0_qc.values.fill(9);
  assert.equal(resumoBoia(lerCoberturaBoia(so9), { agora: new Date() }), null);
});
