// Experiência de validação de previsões (recolha no GitHub Actions). Testes sem rede: fetch simulado
// com as capacidades reais do WMTS (excerto de 20/11/2026) e a resposta real da boia de 15/11/2026.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { quadricula, horaCerta, instantesPedidos, urlFeatureInfo, lerCapacidades, lerResposta } from "../ferramentas/validacao/wmts.mjs";
import { pedir, emParalelo } from "../ferramentas/validacao/rede.mjs";
import { recolher, BOIA } from "../ferramentas/validacao/recolha.mjs";
import { compararValores, relatorio } from "../ferramentas/validacao/ensaio.mjs";

const ler = rel => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");
const CAP = ler("testes/reais/cmems_ibi_wav_capacidades_20261120_excerto.xml");
const BOIA_JSON = ler("testes/reais/ih_boia_faro_20261115.json");
const DATASET = "cmems_mod_ibi_wav_anfc_0.027deg_PT1H-i_202611";
const AGORA = new Date("2026-11-20T16:04:00Z");
const H = 3600000;
const semEspera = async () => {};

test("validação: ponto → quadrícula e píxel (EPSG:4326, nível 8), como nos pedidos reais", () => {
  // Boia de Faro: os mesmos números que deram a célula 36,917 / −7,889 nos pedidos de 20/11/2026.
  assert.deepEqual(quadricula(36.9048, -7.8984), { z: 8, lin: 75, col: 244, i: 196, j: 131 });
  assert.throws(() => quadricula(NaN, 0), RangeError);
  assert.throws(() => quadricula(91, 0), RangeError);
});

test("validação: só horas certas (o serviço arredonda as outras sem aviso)", () => {
  const t = Date.parse("2026-11-21T12:00:00Z");
  assert.equal(horaCerta(t), true);
  assert.equal(horaCerta(t + 30 * 60000), false);
  const url = new URL(urlFeatureInfo({ dataset: DATASET, variavel: "VTM02", estilo: "cmap:tempo", lat: BOIA.lat, lon: BOIA.lon, instante: t }));
  assert.equal(url.searchParams.get("TIME"), "2026-11-21T12:00:00Z");
  assert.equal(url.searchParams.get("LAYER"), `IBI_ANALYSISFORECAST_WAV_005_005/${DATASET}/VTM02`);
  assert.equal(url.searchParams.get("INFOFORMAT"), "application/json");
  assert.deepEqual(["TILEMATRIX", "TILEROW", "TILECOL", "I", "J"].map(k => url.searchParams.get(k)), ["8", "75", "244", "196", "131"]);
  assert.throws(() => urlFeatureInfo({ dataset: DATASET, variavel: "VTM02", estilo: "x", lat: BOIA.lat, lon: BOIA.lon, instante: t + 30 * 60000 }), /Só horas certas/);
});

test("validação: instantes pedidos — hora a hora até +72 h, depois de 3 em 3 h UTC até ao fim", () => {
  const l = instantesPedidos({ agora: AGORA, fim: new Date("2026-11-28T23:00:00Z") });
  const iso = ms => new Date(ms).toISOString().slice(0, 16);
  assert.equal(l.length, 114);
  assert.equal(iso(l[0]), "2026-11-20T17:00");
  assert.equal(iso(l[71]), "2026-11-23T16:00");
  assert.equal(iso(l[72]), "2026-11-23T18:00");
  assert.equal(iso(l.at(-1)), "2026-11-28T21:00");
  assert.ok(l.every(horaCerta));
  assert.ok(l.slice(72).every(t => (t / H) % 3 === 0));
  assert.deepEqual(instantesPedidos({ agora: new Date(NaN), fim: new Date() }), []);
});

test("validação: capacidades reais → versão mais recente com as três variáveis, estilo, unidade, tempo e actualização", () => {
  const c = lerCapacidades(CAP);
  assert.equal(c.dataset, DATASET);
  assert.deepEqual(c.outrasVersoes, ["cmems_mod_ibi_wav_anfc_0.027deg_PT1H-i_202411"]);
  assert.equal(c.camadas.VTM02.estilo, "cmap:tempo");
  assert.equal(c.camadas.VTM02.unidade, "s");
  assert.equal(c.camadas.VHM0.unidade, "m");
  assert.deepEqual(c.camadas.VTM10.tempo, { inicio: "2024-11-25T00:00:00Z", fim: "2026-11-28T23:00:00Z", passo: "PT1H" });
  assert.equal(c.camadas.VTM02.admpUpdatedData, "2026-11-20T13:34:18.132Z");
  assert.ok(!("VTPK" in c.camadas), "só as variáveis pedidas");
  assert.throws(() => lerCapacidades("<html></html>"), /não é um documento WMTS/);
  // Unidade inesperada na versão escolhida → erro, nunca valores com outra unidade.
  const mau = CAP.replace(/(PT1H-i_202611\/VTM10<\/ows:Identifier>[\s\S]*?)<Unit>s<\/Unit>/, "$1<Unit>min</Unit>");
  assert.throws(() => lerCapacidades(mau), /VTM10 em «min»/);
});

const resposta = (variavel, value, extra = {}) => ({ type: "FeatureCollection", features: [{ type: "Feature",
  geometry: { type: "Point", coordinates: [36.917001, -7.888548] },
  properties: { lat: 36.917001, lon: -7.888548, variableId: variavel, datasetId: `IBI_ANALYSISFORECAST_WAV_005_005/${DATASET}`,
    value, units: variavel === "VHM0" ? "m" : "s", ...extra } }] });

test("validação: resposta do GetFeatureInfo → obtido, sem dados ou inválido (nunca confundidos)", () => {
  const ok = lerResposta(resposta("VTM10", 6.809999942779541), { dataset: DATASET, variavel: "VTM10" });
  assert.deepEqual(ok, { estado: "obtido", valor: 6.809999942779541, lat: 36.917001, lon: -7.888548 });
  assert.equal(lerResposta(resposta("VTM02", null), { dataset: DATASET, variavel: "VTM02" }).estado, "sem dados");
  assert.match(lerResposta(resposta("VTM02", 5), { dataset: DATASET, variavel: "VTM10" }).motivo, /variável VTM02/);
  assert.match(lerResposta(resposta("VTM02", 5, { units: "min" }), { dataset: DATASET, variavel: "VTM02" }).motivo, /unidade/);
  assert.match(lerResposta(resposta("VTM02", 5, { datasetId: "outro" }), { dataset: DATASET, variavel: "VTM02" }).motivo, /conjunto/);
  assert.equal(lerResposta(resposta("VHM0", 99), { dataset: DATASET, variavel: "VHM0" }).estado, "inválido");
  assert.equal(lerResposta({ features: [] }, { dataset: DATASET, variavel: "VHM0" }).estado, "inválido");
});

const resp = (status, corpo) => ({ ok: status >= 200 && status < 300, status, text: async () => typeof corpo === "string" ? corpo : JSON.stringify(corpo) });

test("validação: pedidos repetem-se com espera progressiva só em falhas passageiras", async () => {
  const esperas = [];
  const dormir = async ms => { esperas.push(ms); };
  let n = 0;
  let r = await pedir("u", { dormir, fetchImpl: async () => (++n < 3 ? resp(503, "") : resp(200, { a: 1 })) });
  assert.deepEqual([r.ok, r.tentativas, r.corpo, esperas], [true, 3, { a: 1 }, [1000, 2000]]);
  esperas.length = 0;
  r = await pedir("u", { dormir, fetchImpl: async () => resp(400, "") });
  assert.deepEqual([r.ok, r.tentativas, r.erro, esperas], [false, 1, "HTTP 400", []]);
  r = await pedir("u", { dormir, fetchImpl: async () => { throw new TypeError("fetch failed"); } });
  assert.deepEqual([r.ok, r.tentativas, esperas], [false, 4, [1000, 2000, 4000]]);
  assert.match(r.erro, /falha de rede/);
  n = 0;
  r = await pedir("u", { dormir, fetchImpl: async () => (++n === 1 ? resp(200, "<html>") : resp(200, { b: 2 })) });
  assert.deepEqual([r.ok, r.tentativas], [true, 2]);
  r = await pedir("u", { dormir, tentativas: 1, fetchImpl: async () => { const e = new Error("t"); e.name = "TimeoutError"; throw e; } });
  assert.match(r.erro, /tempo limite excedido/);
  n = 0;
  r = await pedir("u", { dormir, fetchImpl: async () => (++n === 1 ? resp(429, "") : resp(200, {})) });
  assert.equal(r.ok, true);
});

test("validação: no máximo N pedidos em simultâneo, resultados pela ordem", async () => {
  let activos = 0, maximo = 0;
  const r = await emParalelo([5, 1, 4, 2, 3, 6, 7], 3, async x => {
    activos++; maximo = Math.max(maximo, activos);
    await new Promise(res => setTimeout(res, x));
    activos--;
    return x * 10;
  });
  assert.deepEqual(r, [50, 10, 40, 20, 30, 60, 70]);
  assert.ok(maximo <= 3 && maximo > 1);
});

// fetch simulado: capacidades reais, valores do WMTS calculados a partir da variável e da hora,
// Open-Meteo sintético e a boia real. `falhar(variavel, iso, tentativa)` devolve um estado HTTP a forçar.
function servidor({ falhar = () => null, omUnidades = { time: "unixtime", wave_height: "m", wave_period: "s" }, capStatus = 200 } = {}) {
  const tentativas = new Map();
  const pedidos = [];
  const f = async url => {
    pedidos.push(url);
    if (url.includes("REQUEST=GetCapabilities")) return resp(capStatus, CAP);
    if (url.includes("REQUEST=GetFeatureInfo")) {
      const u = new URL(url);
      const v = u.searchParams.get("LAYER").split("/").at(-1);
      const t = u.searchParams.get("TIME");
      const k = `${v}|${t}`;
      tentativas.set(k, (tentativas.get(k) ?? 0) + 1);
      const st = falhar(v, t, tentativas.get(k));
      if (st) return resp(st, "");
      const hora = Date.parse(t) / H;
      return resp(200, resposta(v, v === "VHM0" ? 1 + (hora % 10) / 10 : v === "VTM02" ? 6 + (hora % 5) / 10 : 8 + (hora % 5) / 10));
    }
    if (url.startsWith("https://marine-api.open-meteo.com/")) {
      const t0 = Date.parse("2026-11-20T00:00:00Z") / 1000;
      const time = Array.from({ length: 192 }, (_, i) => t0 + i * 3600);
      return resp(200, { latitude: 36.875, longitude: -7.8749847, hourly_units: omUnidades,
        hourly: { time, wave_height: time.map((_, i) => 1 + i / 1000), wave_period: time.map(() => 8.5) } });
    }
    if (url.startsWith("https://ogcapi.hidrografico.pt/")) return resp(200, BOIA_JSON);
    return resp(404, "");
  };
  return { f, pedidos };
}
const relogioFixo = () => { let t = AGORA.getTime(); return () => (t += 10); };

test("validação: recolha completa — todos os pedidos com valor, uma célula, metadados e notas", async () => {
  const { f } = servidor();
  const d = await recolher({ agora: AGORA, fetchImpl: f, dormir: semEspera, relogio: relogioFixo(), env: { GITHUB_RUN_ID: "42" } });
  assert.equal(d.recolha.completa, true);
  assert.equal(d.ibi.estado, "completa");
  assert.deepEqual({ ...d.ibi.pedidos }, { total: 342, obtidos: 342, semDados: 0, invalidos: 0, erros: 0, naoPedidos: 0, comRepeticao: 0, segundaPassagem: 0 });
  assert.deepEqual(d.ibi.celulas, [{ lat: 36.917001, lon: -7.888548 }]);
  assert.equal(d.ibi.dataset, DATASET);
  assert.equal(d.ibi.actualizacaoConjunto.VTM02, "2026-11-20T13:34:18.132Z");
  assert.equal(d.ibi.valores.length, 114);
  assert.deepEqual(d.ibi.valores[0], { validAt: "2026-11-20T17:00:00Z", antecedenciaH: 0.93, VHM0: 1.5, VTM02: 6, VTM10: 8 });
  assert.match(d.ibi.hashConteudo, /^[0-9a-f]{64}$/);
  assert.ok(d.notas.some(n => /NÃO a hora da corrida/.test(n)));
  assert.ok(d.notas.some(n => /limite inferior/.test(n)));
  // Open-Meteo: só as horas futuras; célula e modelo registados.
  assert.equal(d.openMeteo.estado, "obtido");
  assert.equal(d.openMeteo.valores[0].validAt, "2026-11-20T17:00:00Z");
  assert.equal(d.openMeteo.valores.length, 192 - 17);
  assert.match(d.openMeteo.modelo, /não identificado/);
  // Boia: a resposta real de 15/11, com o QC de cada valor; o registo com QC 9 fica com valor null.
  assert.equal(d.boia.estado, "obtido");
  const q9 = d.boia.observacoes.find(o => o.hm0_qc === 9);
  assert.ok(q9 && q9.hm0 === null);
  assert.deepEqual(d.falhas, []);
  assert.equal(d.recolha.github.runId, "42");
});

test("validação: um pedido que falha sempre → recolha INCOMPLETA, com a falha registada e o valor null", async () => {
  const { f } = servidor({ falhar: (v, t) => (v === "VTM10" && t === "2026-11-22T00:00:00Z" ? 503 : null) });
  const d = await recolher({ agora: AGORA, fetchImpl: f, dormir: semEspera, relogio: relogioFixo() });
  assert.equal(d.recolha.completa, false);
  assert.equal(d.ibi.estado, "incompleta");
  assert.equal(d.ibi.pedidos.obtidos, 341);
  assert.equal(d.ibi.pedidos.erros, 1);
  assert.equal(d.ibi.pedidos.segundaPassagem, 1);
  assert.deepEqual(d.falhas, [{ fonte: "ibi", validAt: "2026-11-22T00:00:00Z", variavel: "VTM10", estado: "erro", erro: "HTTP 503", status: 503, tentativas: 8 }]);
  assert.equal(d.ibi.valores.find(l => l.validAt === "2026-11-22T00:00:00Z").VTM10, null);
});

test("validação: falha passageira recuperada na segunda passagem → completa, com a repetição contada", async () => {
  const { f } = servidor({ falhar: (v, t, n) => (v === "VHM0" && t === "2026-11-21T05:00:00Z" && n <= 4 ? 502 : null) });
  const d = await recolher({ agora: AGORA, fetchImpl: f, dormir: semEspera, relogio: relogioFixo() });
  assert.equal(d.recolha.completa, true);
  assert.equal(d.ibi.pedidos.comRepeticao, 1);
  assert.equal(d.ibi.pedidos.segundaPassagem, 1);
});

test("validação: prazo esgotado → pedidos «não pedido», recolha incompleta, nunca parece completa", async () => {
  const { f } = servidor();
  let t = AGORA.getTime();
  const d = await recolher({ agora: AGORA, fetchImpl: f, dormir: semEspera, relogio: () => (t += 1000), prazoMs: 100000 });
  assert.equal(d.recolha.completa, false);
  assert.ok(d.ibi.pedidos.naoPedidos > 0);
  assert.equal(d.ibi.pedidos.obtidos + d.ibi.pedidos.naoPedidos, 342);
  assert.ok(d.falhas.every(x => x.estado === "não pedido" && /prazo/.test(x.erro)));
});

test("validação: uma fonte em falha não impede as outras", async () => {
  const { f } = servidor({ capStatus: 500 });
  const d = await recolher({ agora: AGORA, fetchImpl: f, dormir: semEspera, relogio: relogioFixo() });
  assert.equal(d.ibi.estado, "erro");
  assert.match(d.ibi.motivo, /capacidades não obtidas: HTTP 500/);
  assert.equal(d.openMeteo.estado, "obtido");
  assert.equal(d.boia.estado, "obtido");
  assert.equal(d.recolha.completa, false);
  // Unidades inesperadas no Open-Meteo → inválido, sem valores.
  const s2 = servidor({ omUnidades: { time: "unixtime", wave_height: "ft", wave_period: "s" } });
  const d2 = await recolher({ agora: AGORA, fetchImpl: s2.f, dormir: semEspera, relogio: relogioFixo() });
  assert.equal(d2.openMeteo.estado, "inválido");
  assert.equal(d2.openMeteo.valores, undefined);
  assert.equal(d2.recolha.completa, false);
});

test("validação: relatório do ensaio — mudanças entre recolhas e coerência do admp_updated_data", () => {
  const base = (ret, act, v, completa = true) => ({ retrievedAt: ret, _bytes: 46000, recolha: { completa, duracaoS: 50 },
    ibi: { actualizacaoConjunto: { VTM02: act }, pedidos: { obtidos: 3, total: 3, comRepeticao: 0 }, celulas: [{ lat: 36.917, lon: -7.889 }],
      valores: [{ validAt: "2026-11-21T00:00:00Z", VHM0: v, VTM02: 6, VTM10: 8 }] },
    openMeteo: { valores: [] }, boia: { observacoes: [] }, falhas: [] });
  assert.deepEqual(compararValores(base(0, 0, 1).ibi.valores, base(0, 0, 1.2).ibi.valores, ["VHM0", "VTM02", "VTM10"]), { comuns: 3, mudaram: 1, maxDif: 0.19999999999999996 });
  const r = relatorio([
    base("2026-11-21T01:17:00Z", "A", 1),
    base("2026-11-21T07:17:00Z", "A", 1.2),          // mudou sem actualizar
    base("2026-11-21T13:17:00Z", "B", 1.3, false)     // actualizou e mudou; incompleta
  ]);
  assert.match(r, /mudaram sem actualizar 1\*\*/);
  assert.match(r, /actualizou e os valores mudaram 1;/);
  assert.match(r, /\| 2026-11-21T13:17:00Z \| \*\*não\*\* \|/);
});

test("validação: workflows — agendado fora do minuto zero, sem duas recolhas ao mesmo tempo, data de fim, só leitura", () => {
  const w = ler(".github/workflows/recolha-validacao.yml");
  const cron = /cron: "([^"]+)"/.exec(w)[1];
  assert.notEqual(cron.split(" ")[0], "0");
  assert.match(w, /workflow_dispatch:/);
  assert.match(w, /concurrency:\s*\n\s*group: recolha-validacao\s*\n\s*cancel-in-progress: false/);
  assert.match(w, /RECOLHA_ATE: "\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z"/);
  assert.match(w, /actions\/upload-artifact@v4\s*\n\s*if: always\(\)/);
  assert.match(w, /permissions:\s*\n\s*contents: read/);
  assert.doesNotMatch(w, /contents: write/);
  const a = ler(".github/workflows/analise-validacao.yml");
  assert.doesNotMatch(a, /schedule:/, "a análise só corre a pedido");
  assert.doesNotMatch(a, /contents: write/);
});

test("validação: sem data de fim autorizada não recolhe; depois da data também não (sem rede)", () => {
  const script = new URL("../ferramentas/validacao/recolha.mjs", import.meta.url).pathname;
  const semData = spawnSync(process.execPath, [script], { env: { PATH: process.env.PATH }, encoding: "utf8" });
  assert.equal(semData.status, 1);
  assert.match(semData.stderr, /RECOLHA_ATE em falta/);
  const passada = spawnSync(process.execPath, [script], { env: { PATH: process.env.PATH, RECOLHA_ATE: "2020-01-01T00:00:00Z" }, encoding: "utf8" });
  assert.equal(passada.status, 0);
  assert.match(passada.stdout, /já passou\. Nada a fazer/);
});
