// Fundo do mar (ecrã «Mapa»): ficheiros fundos/*.json, validação e textos dos balões. Sem rede.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { validarFundos, corIsobata, proximasMares, aguaPorCima, descricaoForma, descricaoIsobata, dataCurta,
  periodoLevantamento, idadeLevantamento, mesAno, intervaloLat } from "../js/fundos.js";
import { validateTides } from "../js/fontes/mares-locais.js";

const ler = rel => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");
const config = JSON.parse(ler("config.json"));
const FARO = JSON.parse(ler("fundos/praia_faro.json"));
const MARES = validateTides(JSON.parse(ler("mares/2026.json"))).events;

test("fundos: cada levantamento do config existe, é válido e tem o nome do ficheiro", () => {
  assert.ok(config.mapa.fundos.length >= 1);
  for (const f of config.mapa.fundos) {
    assert.ok(existsSync(new URL(`../${f.ficheiro}`, import.meta.url)), f.ficheiro);
    assert.match(f.ficheiro, /^fundos\/[a-z0-9_]+\.json$/, "*.json: o service worker vai à rede primeiro");
    const d = JSON.parse(ler(f.ficheiro));
    assert.deepEqual(validarFundos(d), { ok: true, erros: [] }, f.ficheiro);
    assert.equal(d.id, f.id);
    assert.equal(d.nome, f.nome);
    // os limites do config (usados para só pedir o ficheiro quando a zona aparece) contêm a zona levantada
    const [[s, w], [n, e]] = f.limites;
    for (const [lon, lat] of d.cobertura) assert.ok(lat >= s && lat <= n && lon >= w && lon <= e, `${f.id}: ${lat}, ${lon}`);
    if (f.aviso !== undefined) assert.ok(typeof f.aviso === "string" && f.aviso.length > 20, f.id);
  }
});

test("fundos: os quatro levantamentos COSMO, a estimativa por satélite e o LiDAR 2011, com produto, datas e SHA-256", () => {
  const esperado = {
    quarteira_garrao: ["LTHQUGA1_20250612_20250616_DEM", "2025-06-12", "2025-06-16", "9e613e346a1573ae8bd34decbd5ea53c7337acc609189d865f9a38c64b251d72"],
    praia_faro: ["LTHFA1_20250617_DEM", "2025-06-17", undefined, "f1d57bee5c3add32341ee27a0e6dd63d532e4549f1fc4ae6fccd4e6d5a39e34c"],
    barreta_farol: ["LTHBAIF1_20201023_20201029_DEM", "2020-10-23", "2020-10-29", "1669be074174ccbfd86dd769b951467281ed738189cc6453250f63b378242185"],
    culatra_armona: ["LTHCUAR2_20201015_20201125_DEM", "2020-10-15", "2020-11-25", "a74ee71faaae70ab14f44eab844880a8d1f5b3a56d8fa94ee14a8da03315e26b"],
    // SHA-256 dos recortes das bandas usados (B02, B03, B04, B08, SCL)
    satelite: ["S2C_29SNB_20261104_0_L2A", "2026-11-04", undefined, "13920dd14a2d23241fd01e1a198bb4460afb10be18d57f5dce384200cb0e1f81"],
    // SHA-256 do 590_HR_Lidar_Algarve.emo.zip descarregado do EMODnet; só se sabe o ano
    ria_lidar2011: ["590_HR_Lidar_Algarve", "2011", undefined, "7b713f3b1525e5652939834c74dc88eab5fb8e706d633641a636113423e6c755"],
    falesia_lidar2011: ["590_HR_Lidar_Algarve", "2011", undefined, "7b713f3b1525e5652939834c74dc88eab5fb8e706d633641a636113423e6c755"]
  };
  assert.deepEqual(config.mapa.fundos.map(f => f.id).sort(), Object.keys(esperado).sort());
  for (const f of config.mapa.fundos) {
    const d = JSON.parse(ler(f.ficheiro)).fonte;
    assert.deepEqual([d.produto, d.levantamento, d.levantamentoFim, d.sha256], esperado[f.id], f.id);
    assert.equal(d.url, d.tipo === "estimado"
      ? `https://earth-search.aws.element84.com/v1/collections/sentinel-2-l2a/items/${d.produto}`
      : d.produto === "590_HR_Lidar_Algarve"
      ? "https://emodnet.ec.europa.eu/geonetwork/srv/api/records/SDN_CPRD_590_HR_Lidar_Algarve"
      : `https://cosmo.apambiente.pt/prd/${d.produto}`);
  }
});

test("fundos: o aviso da zona (config) aparece no rodapé dos balões", () => {
  const d = { ...FARO, aviso: "Zona com esporões: teste." };
  assert.match(descricaoIsobata(-1, d), /<b>Zona com esporões: teste\.<\/b>/);
  assert.doesNotMatch(descricaoIsobata(-1, FARO), /<b>/);
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

test("fundos: isóbatas do nível médio (2 m ZH) para baixo: 0,5 m até −10, 1 m até −20, 5 m daí para baixo", () => {
  for (const f of config.mapa.fundos.filter(x => !x.id.endsWith("_lidar2011"))) {  // o LiDAR tem níveis próprios
    const cotas = JSON.parse(ler(f.ficheiro)).isobatas.map(i => i.cota);
    if (f.id === "satelite") { assert.equal(cotas.length, 0, "a estimativa por satélite não tem isóbatas"); continue; }
    assert.equal(cotas[0], 2, f.id);
    for (let i = 1; i < cotas.length; i++) {
      const passo = cotas[i - 1] - cotas[i];
      const esperado = cotas[i] >= -10 ? 0.5 : cotas[i] >= -20 ? 1 : 5;
      // pode faltar um nível sem linha (cota que o DEM não atravessa): o passo é então múltiplo
      assert.ok(passo > 0 && Math.abs(passo / esperado - Math.round(passo / esperado)) < 1e-9, `${f.id}: ${cotas[i - 1]} → ${cotas[i]}`);
    }
  }
  const faro = FARO.isobatas.map(i => i.cota);
  assert.deepEqual(faro.filter(c => c <= -9), [-9, -9.5, -10, -11, -12]); // DEM até −12,6 m ZH
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

test("fundos: período e idade do levantamento", () => {
  assert.equal(periodoLevantamento({ levantamento: "2025-06-17" }), "17/06/2025");
  assert.equal(mesAno({ levantamento: "2020-10-15", levantamentoFim: "2020-11-25" }), "11/2020");
  assert.equal(mesAno({}), "—");
  assert.equal(periodoLevantamento({ levantamento: "2025-06-12", levantamentoFim: "2025-06-16" }), "12/06/2025 a 16/06/2025");
  const agora = new Date("2026-11-19T12:00:00Z");
  assert.equal(idadeLevantamento({ levantamento: "2025-06-17" }, agora), "há 17 meses");
  assert.equal(idadeLevantamento({ levantamento: "2020-10-15", levantamentoFim: "2020-11-25" }, agora), "há 5 anos");
  assert.equal(idadeLevantamento({ levantamento: "2026-11-01" }, agora), "há menos de um mês");
  assert.equal(idadeLevantamento({ levantamento: "2026-10-19" }, agora), "há 1 mês");
  assert.equal(idadeLevantamento({ levantamento: "2027-01-01" }, agora), null);
  assert.match(descricaoIsobata(-3, FARO, agora), /de 17\/06\/2025 \(há 17 meses\)/);
  const d = structuredClone(FARO);
  d.fonte.levantamentoFim = "2025-06-01";
  assert.ok(validarFundos(d).erros.some(e => /levantamentoFim/.test(e)));
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

test("LiDAR 2011: só linhas de fundo, níveis de 1 m a partir de +1, nenhuma dentro de um levantamento COSMO", () => {
  for (const id of ["ria_lidar2011", "falesia_lidar2011"]) {
  const D = JSON.parse(ler(`fundos/${id}.json`));
  assert.deepEqual(validarFundos(D), { ok: true, erros: [] }, id);
  assert.equal(D.formas.length, 0, id);
  assert.deepEqual(D.isobatas.map(i => i.cota), [1, 0, -1, -2, -3, -4, -5, -6, -8], id);
  // ponto dentro de polígono (raio): nenhum vértice das linhas fica dentro de uma zona COSMO
  const dentro = ([x, y], pol) => {
    let c = false;
    for (let i = 0, j = pol.length - 1; i < pol.length; j = i++) {
      const [xi, yi] = pol[i], [xj, yj] = pol[j];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
    }
    return c;
  };
  const cosmo = ["praia_faro", "quarteira_garrao", "barreta_farol", "culatra_armona"].map(k => JSON.parse(ler(`fundos/${k}.json`)).cobertura);
  // distância (m, aproximada) de um ponto ao contorno de um polígono
  const kx = 111320 * Math.cos(37 * Math.PI / 180), ky = 110540;
  const aoContorno = ([x, y], pol) => Math.min(...pol.slice(1).map(([x2, y2], i) => {
    const [x1, y1] = pol[i]; const ax = (x - x1) * kx, ay = (y - y1) * ky, bx = (x2 - x1) * kx, by = (y2 - y1) * ky;
    const u = Math.max(0, Math.min(1, (ax * bx + ay * by) / ((bx * bx + by * by) || 1)));
    return Math.hypot(ax - u * bx, ay - u * by);
  }));
  // os pontos de corte ficam em cima do contorno (arredondados a 6 casas: centímetros para dentro)
  let fundo = 0;
  for (const i of D.isobatas) for (const l of i.linhas) for (const p of l) {
    if (cosmo.some(c => dentro(p, c) && aoContorno(p, c) > 1)) fundo++;
  }
  assert.equal(fundo, 0, `${id}: nenhum vértice a mais de 1 m para dentro de uma zona COSMO`);
  }
});

test("LiDAR 2011: linhas de 0, −1, −2 e −3 m a menos de 300 m dos pesqueiros do Ancão, de Vilamoura e da Falésia", () => {
  const kx = 111320 * Math.cos(37 * Math.PI / 180), ky = 110540;
  const casos = { ancao: "ria_lidar2011", vilamoura: "falesia_lidar2011", falesia: "falesia_lidar2011" };
  for (const [pq, id] of Object.entries(casos)) {
    const p = config.locais[config.pesqueiros[pq].terra];
    const D = JSON.parse(ler(`fundos/${id}.json`));
    for (const cota of [0, -1, -2, -3]) {
      const linhas = D.isobatas.find(i => i.cota === cota)?.linhas ?? [];
      const m = Math.min(...linhas.flat().map(([lon, lat]) => Math.hypot((lon - p.longitude) * kx, (lat - p.latitude) * ky)));
      assert.ok(m < 300, `${pq} (${id}), ${cota} m: linha mais próxima a ${Math.round(m)} m`);
    }
  }
});

test("LiDAR 2011: data só com o ano, idade, fonte e aviso nos balões", () => {
  const D = { ...JSON.parse(ler("fundos/ria_lidar2011.json")), aviso: config.mapa.fundos.find(f => f.id === "ria_lidar2011").aviso };
  const agora = new Date("2026-11-19T12:00:00Z");
  assert.equal(dataCurta("2011"), "2011");
  assert.equal(periodoLevantamento(D.fonte), "2011");
  assert.equal(idadeLevantamento(D.fonte, agora), "há cerca de 15 anos");
  const html = descricaoIsobata(-2, D, agora);
  assert.match(html, /Medido: Instituto Hidrográfico — LiDAR 2011 \(projecto DGT\/APA\), publicado no EMODnet Bathymetry, levantamento de 2011 \(há cerca de 15 anos\)/);
  assert.match(html, /<b>LiDAR de 2011 \(há 15 anos\)/);
  assert.doesNotMatch(html, /Programa COSMO/);
  const outro = structuredClone(D); outro.fonte.levantamento = "11";
  assert.ok(validarFundos(outro).erros.some(e => /levantamento/.test(e)));
});

test("satélite: estimativa marcada como tal, confirmada a 15/09/2026, calibração registada", () => {
  const S = JSON.parse(ler("fundos/satelite.json"));
  assert.deepEqual(validarFundos(S), { ok: true, erros: [] });
  assert.equal(S.fonte.tipo, "estimado");
  assert.deepEqual([S.fonte.confirmadoCom, S.fonte.confirmadoEm], ["S2C_29SNB_20260915_0_L2A", "2026-09-15"]);
  assert.equal(S.formas.length, 72);
  assert.deepEqual([S.tratamento.calibracao.eqmM, S.tratamento.calibracao.r2], [0.59, 0.88]);
  assert.deepEqual(S.tratamento.validacao.sinalCerto, [0.91, 0.98]);
  assert.match(S.fonte.utilizacao, /Copernicus Sentinel/);
  for (const f of S.formas) assert.ok(f.cota >= -6.5 && f.cota <= 0.5, `${f.id}: ${f.cota}`);
});

test("satélite: balões dizem «estimado», a data da imagem, a confirmação, o erro e a menção Copernicus", () => {
  const S = JSON.parse(ler("fundos/satelite.json"));
  const agora = new Date("2026-11-19T12:00:00Z");
  const html = descricaoForma(S.formas[0], S, MARES, agora);
  assert.match(html, /<h3>[FC]\d+ · (fundão|cabeço) \(estimado por satélite\)<\/h3>/);
  assert.match(html, /Ponto (mais|menos) fundo \(estimado\): <b>−?\d+,\d m<\/b>/, "uma casa decimal numa estimativa");
  assert.match(html, /Estimado por satélite, não medido: imagem Copernicus Sentinel-2 de 04\/11\/2026 \(há menos de um mês\), forma também vista na imagem de 15\/09\/2026/);
  assert.match(html, /erro típico 0,6 m/);
  assert.match(html, /Contém dados Copernicus Sentinel modificados/);
  assert.doesNotMatch(html, /Medido: levantamento/);
  const outro = structuredClone(S); outro.fonte.tipo = "outro";
  assert.ok(validarFundos(outro).erros.some(e => /fonte.tipo/.test(e)));
});

test("referência vertical (revisão de 19/11/2026): LiDAR à LAT com o limite do IH, COSMO ao ZH", () => {
  for (const id of ["ria_lidar2011", "falesia_lidar2011"]) {
    const D = JSON.parse(ler(`fundos/${id}.json`));
    assert.equal(D.fonte.datum, "LAT", id);
    assert.deepEqual(intervaloLat(D.fonte), [0, 0.22], id);
    assert.match(D.fonte.referenciaVertical, /0 a 0,22 m acima do zero hidrográfico \(IH, Tabelas de Marés 2026 e 2027/);
  }
  for (const id of ["praia_faro", "quarteira_garrao", "barreta_farol", "culatra_armona", "satelite"]) {
    assert.equal(intervaloLat(JSON.parse(ler(`fundos/${id}.json`)).fonte), null, id);
  }
  // Validação: datum desconhecido ou limite incoerente.
  const D = JSON.parse(ler("fundos/ria_lidar2011.json"));
  for (const [campo, valor, erro] of [["datum", "NMM", /datum desconhecido/], ["latAcimaZhM", [0.34, 0], /latAcimaZhM/],
    ["latAcimaZhM", [0, 5], /latAcimaZhM/], ["latAcimaZhM", null, /latAcimaZhM/]]) {
    const x = structuredClone(D); x.fonte[campo] = valor;
    assert.ok(validarFundos(x).erros.some(e => erro.test(e)), `${campo}=${JSON.stringify(valor)}`);
  }
});

test("balão de uma linha LiDAR: «à LAT» e o intervalo ao zero hidrográfico; COSMO igual", () => {
  const D = JSON.parse(ler("fundos/ria_lidar2011.json"));
  const html = descricaoIsobata(-2, D, new Date("2026-11-19T12:00:00Z"));
  assert.match(html, /<h3>−2,0 m à LAT<\/h3>/);
  assert.match(html, /Ao zero hidrográfico da tabela de marés fica entre −2,0 e −1,8 m/);
  assert.doesNotMatch(html, /ao zero hidrográfico<\/h3>/);
  assert.doesNotMatch(html, /Costa = linha de 2 m ZH/, "o LiDAR não usa a linha de costa");
  assert.match(descricaoIsobata(-3, FARO), /<h3>−3,0 m ao zero hidrográfico<\/h3>/);
  assert.match(descricaoIsobata(-3, FARO), /Costa = linha de 2 m ZH/);
});

test("mapa: o aviso das camadas LiDAR diz o mesmo intervalo LAT/ZH que os ficheiros (0 a 0,22 m)", () => {
  // Antes dizia «0,1 a 0,25 m acima do zero hidrográfico», que é a diferença LiDAR–COSMO, não a LAT.
  const camadas = config.mapa.fundos.filter(f => f.id.endsWith("lidar2011"));
  assert.equal(camadas.length, 2);
  for (const c of camadas) {
    const d = JSON.parse(ler(c.ficheiro));
    const [a, b] = d.fonte.latAcimaZhM;
    const txt = v => String(v).replace(".", ",");
    assert.ok(c.aviso.includes(`(LAT), ${txt(a)} a ${txt(b)} m acima do zero hidrográfico`), c.id);
    assert.doesNotMatch(c.aviso, /0,1 a 0,25 m acima do zero/, c.id);
  }
});
