// Fundo do mar (ecrã «Mapa»): ficheiros fundos/*.json, validação e textos dos balões. Sem rede.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { validarFundos, corIsobata, proximasMares, aguaPorCima, descricaoForma, descricaoIsobata, dataCurta }
  from "../js/fundos.js";
import { validateTides } from "../js/fontes/mares-locais.js";

const ler = rel => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");
const config = JSON.parse(ler("config.json"));
const FARO = JSON.parse(ler("fundos/praia_faro.json"));
const MARES = validateTides(JSON.parse(ler("mares/2026.json"))).events;

test("fundos: cada levantamento do config existe, é válido e pertence a um pesqueiro", () => {
  assert.ok(config.mapa.fundos.length >= 1);
  for (const f of config.mapa.fundos) {
    assert.ok(existsSync(new URL(`../${f.ficheiro}`, import.meta.url)), f.ficheiro);
    assert.match(f.ficheiro, /^fundos\/[a-z_]+\.json$/, "*.json: o service worker vai à rede primeiro");
    const d = JSON.parse(ler(f.ficheiro));
    assert.deepEqual(validarFundos(d), { ok: true, erros: [] }, f.ficheiro);
    assert.equal(d.id, f.id);
    assert.ok(config.pesqueiros[f.pesqueiro], f.pesqueiro);
  }
});

test("fundos: Praia de Faro — produto, data e DEM conferidos (17/06/2025)", () => {
  assert.equal(FARO.fonte.produto, "LTHFA1_20250617_DEM");
  assert.equal(FARO.fonte.levantamento, "2025-06-17");
  assert.equal(FARO.fonte.url, "https://cosmo.apambiente.pt/prd/LTHFA1_20250617_DEM");
  // SHA-256 do GeoTIFF descarregado do COSMO (174 839 216 bytes); o DEM não está no repositório.
  assert.equal(FARO.fonte.sha256, "f1d57bee5c3add32341ee27a0e6dd63d532e4549f1fc4ae6fccd4e6d5a39e34c");
  assert.match(FARO.fonte.referenciaVertical, /zero hidrográfico \(2,00 m abaixo do nível médio/);
  assert.equal(FARO.tratamento.provisorio, true);
});

test("fundos: Praia de Faro — fundões e cabeços dentro da zona levantada", () => {
  const lon = FARO.cobertura.map(p => p[0]), lat = FARO.cobertura.map(p => p[1]);
  const dentro = ([x, y]) => x >= Math.min(...lon) && x <= Math.max(...lon) && y >= Math.min(...lat) && y <= Math.max(...lat);
  assert.equal(FARO.formas.filter(f => f.tipo === "fundão").length, 6);
  assert.equal(FARO.formas.filter(f => f.tipo === "cabeço").length, 6);
  for (const f of FARO.formas) {
    assert.ok(dentro(f.ponto), f.id);
    assert.ok(f.distancia <= FARO.tratamento.criterios.distanciaMaximaM, f.id);
    assert.ok(f.tipo === "fundão" ? f.cota < -1.5 : f.cota > -1.5, `${f.id}: ${f.cota}`);
  }
  // F4: o canal que atravessa o banco (conferido no DEM original de 0,3 m: −3,30 m).
  const f4 = FARO.formas.find(f => f.id === "F4");
  assert.deepEqual(f4.ponto, [-7.989496, 37.001296]);
  assert.deepEqual([f4.cota, f4.distancia], [-3.3, 190]);
});

test("fundos: isóbatas de 0,5 em 0,5 m, do nível médio (2 m ZH) para baixo", () => {
  const cotas = FARO.isobatas.map(i => i.cota);
  assert.equal(cotas[0], 2);
  cotas.forEach((c, i) => assert.equal(c, 2 - 0.5 * i));
  assert.ok(Math.min(...cotas) <= -12);
});

test("fundos: validação recusa ficheiros com erros", () => {
  const com = muda => { const d = structuredClone(FARO); muda(d); return validarFundos(d); };
  assert.equal(validarFundos(null).ok, false);
  assert.match(com(d => { d.versao = 2; }).erros[0], /versão/);
  assert.ok(com(d => { d.formas[0].ponto = [8, 37]; }).erros.some(e => /ponto inválido/.test(e)));
  assert.ok(com(d => { d.formas[0].tipo = "cabeço"; }).erros.some(e => /tipo inválido/.test(e)));
  assert.ok(com(d => { d.formas[1].id = d.formas[0].id; }).erros.some(e => /repetido/.test(e)));
  assert.ok(com(d => { d.formas[0].cota = Number.NaN; }).erros.some(e => /cota inválida/.test(e)));
  assert.ok(com(d => { d.fonte.sha256 = "x"; }).erros.some(e => /sha256/.test(e)));
  assert.ok(com(d => { d.fonte.levantamento = "17/06/2025"; }).erros.some(e => /levantamento/.test(e)));
  assert.ok(com(d => { d.isobatas[0].linhas[0] = [[-8, 37]]; }).erros.some(e => /linhas inválidas/.test(e)));
});

test("fundos: água por cima = altura da maré − cota (ambas ao zero hidrográfico)", () => {
  assert.equal(aguaPorCima(-3.3, 1.2), 4.5);
  assert.equal(aguaPorCima(0.07, 0.3), 0.2);
  assert.equal(aguaPorCima(0.4, 0.3), -0.1);
  assert.equal(aguaPorCima(null, 1), null);
  assert.equal(aguaPorCima(-1, Number.NaN), null);
});

test("fundos: próximas preia-mar e baixa-mar da tabela", () => {
  const p = proximasMares(MARES, new Date("2026-11-19T12:00:00Z"));
  assert.deepEqual([p.BM.instant, p.BM.heightM, p.PM.instant, p.PM.heightM],
    ["2026-11-19T16:24:00Z", 1.2, "2026-11-19T22:46:00Z", 2.6]);
  const fim = proximasMares(MARES, new Date("2027-01-02T00:00:00Z"));
  assert.deepEqual(fim, { BM: null, PM: null });
});

test("fundos: balão do F4 — cota, distância, água nas próximas marés (hora de Lisboa), fonte e data", () => {
  const f4 = FARO.formas.find(f => f.id === "F4");
  const html = descricaoForma(f4, FARO, MARES, new Date("2026-11-19T12:00:00Z"));
  assert.match(html, /F4 · fundão/);
  assert.match(html, /Ponto mais fundo: <b>−3,30 m<\/b> ao zero hidrográfico, a 190 m da costa/);
  assert.match(html, /<b>4,5 m<\/b> de água na próxima baixa-mar \(hoje às 16:24, 1,2 m\)/);
  assert.match(html, /<b>5,9 m<\/b> de água na próxima preia-mar \(hoje às 22:46, 2,6 m\)/);
  assert.match(html, /Coordenadas: 37\.00130, -7\.98950/);
  assert.match(html, /Programa COSMO \(APA\) de 17\/06\/2025/);
  assert.match(html, /critérios provisórios/);
  assert.match(html, /Os bancos mudam com os temporais/);
  assert.ok(!/\b(PM|BM)\b/.test(html), "marés por extenso");
  // Noutro dia: dia da semana e hora de Lisboa (em junho, Lisboa = UTC+1).
  const verao = descricaoForma(f4, FARO, [{ type: "BM", heightM: 0.5, timestamp: Date.parse("2026-06-21T05:10:00Z") },
    { type: "PM", heightM: 3.4, timestamp: Date.parse("2026-06-21T11:20:00Z") }], new Date("2026-06-20T20:00:00Z"));
  assert.match(verao, /na próxima baixa-mar \(dom 21 às 06:10, 0,5 m\)/);
  assert.match(verao, /na próxima preia-mar \(dom 21 às 12:20, 3,4 m\)/);
});

test("fundos: cabeço a descoberto, tabela em falta e fim da tabela", () => {
  const c = { ...FARO.formas.find(f => f.tipo === "cabeço"), cota: 0.4 };
  const desc = descricaoForma(c, FARO, [{ type: "BM", heightM: 0.3, timestamp: Date.parse("2026-11-19T16:00:00Z") }],
    new Date("2026-11-19T12:00:00Z"));
  assert.match(desc, /Ponto menos fundo/);
  assert.match(desc, /a descoberto na próxima baixa-mar/);
  assert.match(desc, /preia-mar: fora da tabela de marés carregada/);
  assert.match(descricaoForma(c, FARO, null), /tabela de marés não obtida/);
});

test("fundos: isóbata e cores", () => {
  assert.match(descricaoIsobata(-3, FARO), /−3,0 m ao zero hidrográfico/);
  assert.match(descricaoIsobata(-3, FARO), /5,0 m abaixo do nível médio/);
  assert.equal(corIsobata(2), "#7dd3fc");
  assert.equal(corIsobata(-12), "#0c2369");
  assert.equal(corIsobata(-30), "#0c2369");
  assert.equal(corIsobata(Number.NaN), "#7a8a94");
  assert.equal(dataCurta("2025-06-17"), "17/06/2025");
  assert.equal(dataCurta("x"), "—");
});

test("mapa: página com o Leaflet antes do módulo, ligação na barra e Leaflet conferido", () => {
  const html = ler("mapa.html");
  assert.ok(html.indexOf("vendor/leaflet/leaflet.js") < html.indexOf("js/mapa.js"));
  assert.match(html, /vendor\/leaflet\/leaflet\.css/);
  assert.match(ler("index.html"), /<a href="\.\/mapa\.html">Mapa<\/a>/);
  const sha = rel => createHash("sha256").update(readFileSync(new URL(`../${rel}`, import.meta.url))).digest("hex");
  assert.equal(sha("vendor/leaflet/leaflet.js"), "db49d009c841f5ca34a888c96511ae936fd9f5533e90d8b2c4d57596f4e5641a");
  assert.equal(sha("vendor/leaflet/leaflet.css"), "a7837102824184820dfa198d1ebcd109ff6d0ff9a2672a074b9a1b4d147d04c6");
  assert.match(ler("vendor/leaflet/LICENSE"), /BSD 2-Clause License/);
});

test("mapa: fundos de mapa no config, com atribuição; o OpenStreetMap recebe o Referer", () => {
  const b = config.mapa.fundosBase;
  assert.equal(b.osm.url, "https://tile.openstreetmap.org/{z}/{x}/{y}.png");
  assert.match(b.osm.atribuicao, /OpenStreetMap/);
  assert.equal(b.ortofoto.wms, "https://ortos.dgterritorio.gov.pt/wms/ortosat2023");
  assert.equal(b.ortofoto.camada, "ortoSat2023-CorVerdadeira");
  assert.match(b.ortofoto.atribuicao, /Direção-Geral do Território/);
  // _headers manda Referrer-Policy: same-origin; sem a opção do Leaflet o OSM recusa os mosaicos.
  assert.match(ler("js/mapa.js"), /referrerPolicy: REFERER/);
  assert.match(ler("js/mapa.js"), /const REFERER = "strict-origin-when-cross-origin"/);
});
