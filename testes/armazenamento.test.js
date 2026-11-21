// Armazenamento local (plano de evolução, PR 3): armazém, leituras guardadas, política de limpeza,
// quota, previsão arquivada sem rede (nunca como actual) e indisponível. Em Node, com o armazém em
// memória (mesma interface do IndexedDB, que é testado no browser: testes-browser/armazenamento.e2e.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { armazemMemoria } from "../js/armazenamento/armazem-memoria.js";
import { ESQUEMA, MIGRACOES } from "../js/armazenamento/esquema.js";
import { leituraDe, leituraValida, aApagar, guardarLeitura, ultimaLeitura, listarLeituras, POLITICA_PADRAO, politicaDe }
  from "../js/armazenamento/leituras.js";
import { origemDosDados, lerEAnalisar } from "../js/carregar.js";
import { renderInicio } from "../js/ui/inicio.js";
import { renderComparador } from "../js/ui/comparador.js";
import { quandoLido, idadeTexto } from "../js/ui/formato.js";

const ler = rel => JSON.parse(readFileSync(new URL(rel, import.meta.url), "utf8"));
const config = ler("../config.json");
globalThis.SunCalc ??= createRequire(import.meta.url)("../vendor/suncalc.js");
const H = 3600000;
const iso = ms => new Date(ms).toISOString();

// ---------- Armazém em memória ----------

test("armazém: guardar, obter, chaves por ordem, listar, apagar e limpar; cópias independentes", async () => {
  const a = armazemMemoria();
  assert.deepEqual(a.lojas, ESQUEMA.lojas.map(l => l.nome));
  const v = { id: "b", x: [1, 2] };
  await a.guardar("leituras", v);
  await a.guardar("leituras", { id: "a", x: [] });
  v.x.push(3);
  assert.deepEqual((await a.obter("leituras", "b")).x, [1, 2], "o que se guardou não muda com o objecto original");
  assert.deepEqual(await a.chaves("leituras"), ["a", "b"]);
  assert.deepEqual((await a.listar("leituras")).map(r => r.id), ["a", "b"]);
  await a.apagar("leituras", "a");
  assert.equal(await a.obter("leituras", "a"), undefined);
  await a.limpar("leituras");
  assert.deepEqual(await a.chaves("leituras"), []);
  await assert.rejects(a.guardar("leituras", { semId: 1 }), /falta a chave/);
  await assert.rejects(a.guardar("naoExiste", { id: 1 }), /loja inexistente/);
  await a.guardar("meta", { chave: "ultimaCopia", valor: "2026-11-20" });
  assert.equal((await a.obter("meta", "ultimaCopia")).valor, "2026-11-20");
});

test("armazém: sem espaço → QuotaExceededError e o que já estava fica igual", async () => {
  const a = armazemMemoria({ limiteBytes: 60 });
  await a.guardar("leituras", { id: "1", x: "a" });
  await assert.rejects(a.guardar("leituras", { id: "2", x: "b".repeat(100) }), e => e.name === "QuotaExceededError");
  await assert.rejects(a.guardar("leituras", { id: "1", x: "c".repeat(100) }), e => e.name === "QuotaExceededError");
  assert.deepEqual(await a.chaves("leituras"), ["1"]);
  assert.equal((await a.obter("leituras", "1")).x, "a");
});

test("esquema: versão = número de migrações; lojas da leitura, do diário, das condições e de controlo", () => {
  assert.equal(ESQUEMA.versao, MIGRACOES.length);
  assert.equal(ESQUEMA.versao, 1);
  assert.deepEqual(ESQUEMA.lojas.map(l => l.nome), ["leituras", "diario", "condicoes", "meta"]);
});

// ---------- Leituras ----------

const fonte = (ok, readAt, extra = {}) => (ok ? { ok: true, data: { hourly: { time: [1] } }, source: "teste", readAt, ...extra }
  : { ok: false, data: null, source: "teste", readAt, error: "HTTP 429" });
function dadosFalsos(lidoEm, { obtidos = true, boia = true } = {}) {
  return {
    lidoEm,
    pontos: { mar: { faroMar: fonte(obtidos, lidoEm), forteNovo: fonte(false, lidoEm) }, terra: { faroTerra: fonte(obtidos, lidoEm) } },
    boiaFaro: boia ? { ok: true, data: { observacoes: [] }, source: "IH", readAt: lidoEm } : { ok: false, error: "rede", readAt: lidoEm },
    mares: { ok: true }, dias: []
  };
}

test("leitura: guarda só as fontes da rede, com a hora de cada uma; resumo do que foi obtido", () => {
  const r = leituraDe(dadosFalsos("2026-11-15T10:40:00.000Z"));
  assert.equal(r.id, "2026-11-15T10:40:00.000Z");
  assert.equal(r.diaLisboa, "2026-11-15");
  assert.deepEqual(Object.keys(r.fontes), ["mar", "terra", "boiaFaro"]);
  assert.deepEqual(r.resumo, { pontosObtidos: 2, pontos: 3, boia: true });
  assert.equal(r.fontes.mar.forteNovo.data, null);
  assert.equal(r.fontes.mar.forteNovo.error, "HTTP 429");
  assert.equal(r.fontes.terra.faroTerra.readAt, "2026-11-15T10:40:00.000Z");
  assert.ok(leituraValida(r));
  for (const estragada of [null, { ...r, esquema: 99 }, { ...r, lidoEm: "ontem" }, { ...r, fontes: { mar: {} } }]) {
    assert.equal(leituraValida(estragada), false);
  }
});

test("política: todas as das últimas 48 h; das mais antigas, a última de cada dia de Lisboa; até 30 dias; no máximo 60", () => {
  const agora = Date.parse("2026-11-20T12:00:00Z");
  const chaves = [
    iso(agora - 1 * H), iso(agora - 30 * H), iso(agora - 47 * H),          // ficam (≤ 48 h)
    "2026-11-17T20:00:00.000Z", "2026-11-17T08:00:00.000Z",               // dia 17: fica a das 20 h
    "2026-10-25T00:30:00.000Z", "2026-10-24T23:30:00.000Z",               // ambas são 25/10 em Lisboa → fica a das 00:30 UTC
    "2026-10-19T10:00:00.000Z",                                           // mais de 30 dias → sai
    "estragada"
  ];
  const sai = aApagar(chaves, POLITICA_PADRAO, agora);
  assert.deepEqual(sai.sort(), ["2026-10-19T10:00:00.000Z", "2026-10-24T23:30:00.000Z", "2026-11-17T08:00:00.000Z", "estragada"].sort());
  // Máximo: saem as mais antigas.
  assert.deepEqual(aApagar(chaves.slice(0, 4), { maximo: 2 }, agora).sort(), [iso(agora - 47 * H), "2026-11-17T20:00:00.000Z"].sort());
  // A mais recente fica sempre, mesmo muito antiga.
  assert.deepEqual(aApagar(["2025-01-01T00:00:00.000Z"], POLITICA_PADRAO, agora), []);
  assert.deepEqual(aApagar([], POLITICA_PADRAO, agora), []);
});

test("política: valores do config.json (persistencia.leituras)", () => {
  const p = politicaDe(config);
  for (const k of Object.keys(POLITICA_PADRAO)) assert.equal(typeof p[k], "number", k);
  assert.deepEqual(politicaDe({}), { ...POLITICA_PADRAO });
});

test("guardar: substitui a leitura com menos de 30 min e aplica a limpeza", async () => {
  const a = armazemMemoria();
  const t0 = Date.parse("2026-11-20T08:00:00Z");
  for (const t of [t0, t0 + 10 * 60000, t0 + 50 * 60000]) {
    const r = await guardarLeitura(a, leituraDe(dadosFalsos(iso(t))), POLITICA_PADRAO, t);
    assert.equal(r.ok, true);
  }
  assert.deepEqual(await a.chaves("leituras"), [iso(t0 + 10 * 60000), iso(t0 + 50 * 60000)].sort(),
    "a das 08:00 foi substituída pela das 08:10; a das 08:50 fica (40 min depois)");
  const lista = await listarLeituras(a);
  assert.equal(lista[0].lidoEm, iso(t0 + 50 * 60000), "a mais recente primeiro");
});

test("guardar: sem espaço apaga as anteriores e tenta outra vez; se nem assim couber, devolve o erro sem lançar", async () => {
  const unica = JSON.stringify(leituraDe(dadosFalsos("2026-11-20T08:00:00.000Z"))).length;
  const a = armazemMemoria({ limiteBytes: Math.floor(unica * 1.5) });
  const t = Date.parse("2026-11-20T08:00:00Z");
  assert.equal((await guardarLeitura(a, leituraDe(dadosFalsos(iso(t))), POLITICA_PADRAO, t)).ok, true);
  const r = await guardarLeitura(a, leituraDe(dadosFalsos(iso(t + 2 * H))), POLITICA_PADRAO, t + 2 * H);
  assert.equal(r.ok, true);
  assert.match(r.aviso, /faltava espaço/);
  assert.deepEqual(await a.chaves("leituras"), [iso(t + 2 * H)]);
  const minusculo = armazemMemoria({ limiteBytes: 10 });
  const r2 = await guardarLeitura(minusculo, leituraDe(dadosFalsos(iso(t))), POLITICA_PADRAO, t);
  assert.deepEqual([r2.ok, r2.erro], [false, "sem espaço no aparelho"]);
});

test("guardar e ler: uma base que falha nunca lança", async () => {
  const avariado = { chaves: async () => { throw new Error("base fechada"); }, guardar: async () => { throw new Error("x"); }, obter: async () => { throw new Error("x"); } };
  const r = await guardarLeitura(avariado, leituraDe(dadosFalsos("2026-11-20T08:00:00.000Z")));
  assert.deepEqual([r.ok, r.erro], [false, "base fechada"]);
  assert.equal(await ultimaLeitura(avariado), null);
  assert.deepEqual(await listarLeituras(avariado), []);
});

test("última leitura: a válida mais recente (uma estragada é ignorada, nunca usada em parte)", async () => {
  const a = armazemMemoria();
  await a.guardar("leituras", leituraDe(dadosFalsos("2026-11-20T08:00:00.000Z")));
  await a.guardar("leituras", { ...leituraDe(dadosFalsos("2026-11-20T09:00:00.000Z")), esquema: 99 });
  assert.equal((await ultimaLeitura(a)).lidoEm, "2026-11-20T08:00:00.000Z");
  assert.equal(await ultimaLeitura(armazemMemoria()), null);
});

// ---------- De onde vêm os dados ----------

const abrirCom = armazem => async () => ({ ok: true, armazem });

test("origem: com rede guarda a leitura e os dados são os actuais", async () => {
  const a = armazemMemoria();
  const d = dadosFalsos("2026-11-20T08:00:00.000Z");
  const { dados, origem } = await origemDosDados(d, config, { abrir: abrirCom(a) });
  assert.equal(origem.tipo, "actual");
  assert.equal(origem.guardado.ok, true);
  assert.equal(dados, d);
  assert.deepEqual(await a.chaves("leituras"), ["2026-11-20T08:00:00.000Z"]);
});

test("origem: sem rede usa a última leitura guardada, como previsão arquivada, com a hora dessa leitura", async () => {
  const a = armazemMemoria();
  await origemDosDados(dadosFalsos("2026-11-20T08:00:00.000Z"), config, { abrir: abrirCom(a) });
  const agora = "2026-11-20T11:30:00.000Z";
  const semRede = dadosFalsos(agora, { obtidos: false, boia: false });
  const { dados, origem } = await origemDosDados(semRede, config, { abrir: abrirCom(a) });
  assert.equal(origem.tipo, "arquivo");
  assert.equal(origem.lidoEm, "2026-11-20T08:00:00.000Z");
  assert.equal(origem.idadeHoras, 3.5);
  assert.equal(dados.pontos.mar.faroMar.ok, true);
  assert.equal(dados.pontos.mar.faroMar.readAt, "2026-11-20T08:00:00.000Z", "cada fonte mantém a hora da sua leitura");
  assert.equal(dados.boiaFaro.readAt, "2026-11-20T08:00:00.000Z", "a boia guardada, porque a de agora falhou");
  assert.equal(dados.lidoEm, agora, "a hora desta abertura não muda");
  // A boia de agora, se respondeu, ganha à guardada.
  const comBoia = dadosFalsos(agora, { obtidos: false, boia: true });
  assert.equal((await origemDosDados(comBoia, config, { abrir: abrirCom(a) })).dados.boiaFaro.readAt, agora);
});

test("origem: sem rede e leitura guardada antiga demais (ou nenhuma) → indisponível", async () => {
  const a = armazemMemoria();
  await origemDosDados(dadosFalsos("2026-11-10T08:00:00.000Z"), config, { abrir: abrirCom(a) });
  const semRede = dadosFalsos("2026-11-20T08:00:00.000Z", { obtidos: false });
  const r = await origemDosDados(semRede, config, { abrir: abrirCom(a) });
  assert.deepEqual(r.origem, { tipo: "indisponivel", ultimaLidaEm: "2026-11-10T08:00:00.000Z", semArmazem: null });
  assert.equal(r.dados, semRede, "nunca se usam dados antigos demais");
  assert.equal((await origemDosDados(semRede, config, { abrir: abrirCom(armazemMemoria()) })).origem.ultimaLidaEm, null);
});

test("origem: aparelho que não deixa guardar → a app continua (actual sem guardar; sem rede, indisponível)", async () => {
  const falha = async () => ({ ok: false, erro: "este navegador não tem IndexedDB" });
  const lanca = async () => { throw new Error("rebentou"); };
  const comRede = await origemDosDados(dadosFalsos("2026-11-20T08:00:00.000Z"), config, { abrir: falha });
  assert.deepEqual(comRede.origem, { tipo: "actual", guardado: { ok: false, erro: "este navegador não tem IndexedDB" } });
  assert.equal((await origemDosDados(dadosFalsos("2026-11-20T08:00:00.000Z"), config, { abrir: lanca })).origem.guardado.erro, "rebentou");
  const semRede = await origemDosDados(dadosFalsos("2026-11-20T08:00:00.000Z", { obtidos: false }), config, { abrir: falha });
  assert.equal(semRede.origem.tipo, "indisponivel");
  assert.equal(semRede.origem.semArmazem, "este navegador não tem IndexedDB");
});

// ---------- Ponta a ponta: lerEAnalisar com um fetch falso ----------

const resposta = (json, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => structuredClone(json) });
function fetchFalso({ rede = true } = {}) {
  const marine = { faro: ler("./reais/openmeteo_marine_faro_20261014_0946.json"), quarteira: ler("./reais/openmeteo_marine_quarteira_20261014_0946.json") };
  const forecast = { faro: ler("./reais/openmeteo_forecast_faro_20261014_0946.json"), quarteira: ler("./reais/openmeteo_forecast_quarteira_20261014_0946.json") };
  return async url => {
    const u = new URL(url, "https://app.local/");
    if (u.host === "app.local") {
      const caminho = u.pathname.replace(/^\//, "");
      try { return resposta(ler(`../${caminho}`)); } catch { return resposta(null, 404); }
    }
    if (!rede) throw new TypeError("Failed to fetch");
    const zona = Number(u.searchParams.get("longitude")) > -8.05 ? "faro" : "quarteira";
    if (u.host === "marine-api.open-meteo.com") return resposta(marine[zona]);
    if (u.host === "api.open-meteo.com") return resposta(forecast[zona]);
    if (u.host === "ogcapi.hidrografico.pt") return resposta(ler("./reais/ih_boia_faro_20261115.json"));
    return resposta(null, 404);
  };
}

test("ponta a ponta: com rede guarda; sem rede mostra a previsão arquivada com as mesmas notas, marcada como arquivada", async () => {
  const a = armazemMemoria();
  const abrir = abrirCom(a);
  const lido = new Date("2026-10-14T08:46:00Z");
  const online = await lerEAnalisar({ fetchImpl: fetchFalso(), agora: lido, abrir });
  assert.equal(online.origem.tipo, "actual");
  assert.equal(online.origem.guardado.ok, true);
  assert.equal(online.lidoEm, lido.toISOString());
  // Sem rede, à mesma hora: as notas da leitura arquivada são as mesmas (o motor é determinístico).
  const offline = await lerEAnalisar({ fetchImpl: fetchFalso({ rede: false }), agora: lido, abrir });
  assert.equal(offline.origem.tipo, "arquivo");
  assert.deepEqual(JSON.parse(JSON.stringify(offline.analise)), JSON.parse(JSON.stringify(online.analise)));
  // Três horas depois, sem rede: a leitura mostrada é a das 08:46; «agora» é a hora real.
  const depois = await lerEAnalisar({ fetchImpl: fetchFalso({ rede: false }), agora: new Date(lido.getTime() + 3 * H), abrir });
  assert.equal(depois.origem.tipo, "arquivo");
  assert.equal(depois.lidoEm, lido.toISOString());
  assert.equal(depois.agora, new Date(lido.getTime() + 3 * H).toISOString());
  assert.equal(Object.keys(depois.analise.dias[0].pesqueiros).length, 8, "os oito pesqueiros");
  const html = renderInicio({ ...depois, indice: 0, especie: "robalo" });
  assert.match(html, /Previsão arquivada — não é a previsão actual/);
  assert.match(html, /Previsão arquivada, lida às 09:46 \(há 3 h\)/);
  assert.match(html, /previsto[^<]*· arquivada \(sem rede\) · lido às 09:46/);
  assert.doesNotMatch(html, /Dados lidos às/);
  assert.match(renderComparador({ ...depois }), /Previsão arquivada — não é a previsão actual/);
  // Sem rede e sem nada guardado: indisponível, sem notas.
  const vazio = await lerEAnalisar({ fetchImpl: fetchFalso({ rede: false }), agora: lido, abrir: abrirCom(armazemMemoria()) });
  assert.equal(vazio.origem.tipo, "indisponivel");
  // Só a marés (ficheiro local) não chegam para uma nota completa: as notas ou faltam ou ficam incompletas.
  const notas = vazio.analise.dias.flatMap(d => Object.values(d.pesqueiros).flatMap(p => Object.values(p.notas)));
  assert.ok(notas.every(n => n.estado !== "ok" || n.completa === false), "nenhuma nota completa sem previsão");
  assert.ok(notas.some(n => n.estado !== "ok"), "as notas que dependem da previsão ficam sem nota");
  assert.match(renderInicio({ ...vazio, indice: 0 }), /Previsão indisponível\.[\s\S]*Não há nenhuma previsão guardada neste aparelho/);
});

test("interface: com dados actuais não há aviso; se não ficaram guardados, diz-se", async () => {
  const online = await lerEAnalisar({ fetchImpl: fetchFalso(), agora: new Date("2026-10-14T08:46:00Z"), abrir: abrirCom(armazemMemoria()) });
  const html = renderInicio({ ...online, indice: 0 });
  assert.doesNotMatch(html, /aviso-origem/);
  assert.match(html, /Dados lidos às 09:46/);
  const semGuardar = { ...online, origem: { tipo: "actual", guardado: { ok: false, erro: "sem espaço no aparelho" } } };
  assert.match(renderInicio({ ...semGuardar, indice: 0 }), /não ficaram guardados para usar sem rede \(sem espaço no aparelho\)/);
});

test("formato: hora da leitura com a data quando não é de hoje, e idade (hora de Lisboa, qualquer fuso)", () => {
  assert.equal(quandoLido("2026-11-20T08:00:00Z", "2026-11-20T23:30:00Z"), "às 08:00");
  assert.equal(quandoLido("2026-11-19T23:30:00Z", "2026-11-20T08:00:00Z"), "a 19/11 às 23:30");
  // 14/10 às 23:30 UTC já é 15/10 em Lisboa (UTC+1).
  assert.equal(quandoLido("2026-10-14T23:30:00Z", "2026-10-15T08:00:00Z"), "às 00:30");
  assert.equal(quandoLido("x"), "—");
  assert.equal(idadeTexto(25 * 60000), "há 25 min");
  assert.equal(idadeTexto(190 * 60000), "há 3 h 10 min");
  assert.equal(idadeTexto(3 * H), "há 3 h");
  assert.equal(idadeTexto(50 * H), "há 2 dias");
  assert.equal(idadeTexto(-5000), "há 0 min");
  assert.equal(idadeTexto(NaN), "—");
});
