// Fundo típico das praias (fundos/tipico.json): ficheiro, validação, leitura e cartões. Sem rede.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validarFundoTipico, carregarFundoTipico } from "../js/fontes/fundo-tipico.js";
import { fundoDoCartao } from "../js/ui/inicio.js";

const ler = rel => JSON.parse(readFileSync(new URL(`../${rel}`, import.meta.url), "utf8"));
const config = ler("config.json");
const T = ler("fundos/tipico.json");
const ok = { ok: true, data: T, error: null };

test("fundo típico: o ficheiro é válido e tem todas as praias do config (e só praias)", () => {
  assert.deepEqual(validarFundoTipico(T), { ok: true, erros: [] });
  const praias = Object.entries(config.pesqueiros).filter(([, p]) => p.tipo === "praia").map(([k]) => k).sort();
  assert.deepEqual(Object.keys(T.praias).sort(), praias);
  assert.equal(T.provisorio, true);
});

test("fundo típico: fontes e valores (COSMO no Almargem; LiDAR 2011 onde o COSMO não cobre)", () => {
  const f = Object.fromEntries(Object.entries(T.praias).map(([k, p]) => [k, [p.fonte, p.cotas["100"], p.cotas["150"], p.cotas["200"]]]));
  assert.deepEqual(f, {
    praia_faro: ["lidar2011", -1.2, -1.5, -2.2],
    ancao: ["lidar2011", -1.1, -1.7, -2.7],
    almargem: ["quarteira_garrao", -2, -3.4, -4.1],
    vilamoura: ["lidar2011", -1.7, -2.6, -3.1],
    falesia: ["lidar2011", -0.4, -1.6, -2.8]
  });
  assert.equal(T.fontes.lidar2011.sha256, "7b713f3b1525e5652939834c74dc88eab5fb8e706d633641a636113423e6c755");
  assert.match(T.fontes.lidar2011.referenciaVertical, /LAT/);
  assert.equal(T.fontes.quarteira_garrao.sha256, ler("fundos/quarteira_garrao.json").fonte.sha256);
});

test("fundo típico: validação recusa erros", () => {
  const com = muda => { const d = structuredClone(T); muda(d); return validarFundoTipico(d); };
  assert.equal(validarFundoTipico(null).ok, false);
  assert.ok(com(d => { d.praias.ancao.cotas["150"] = "x"; }).erros.some(e => /150/.test(e)));
  assert.ok(com(d => { d.praias.ancao.fonte = "outra"; }).erros.some(e => /desconhecida/.test(e)));
  assert.ok(com(d => { d.fontes.lidar2011.sha256 = "1"; }).erros.some(e => /sha256/.test(e)));
  assert.ok(com(d => { d.praias.ancao = { fonte: null }; }).erros.some(e => /motivo/.test(e)));
  assert.equal(com(d => { d.praias.ancao = { fonte: null, motivo: "sem levantamento" }; }).ok, true);
});

test("fundo típico: leitura do ficheiro e falhas (HTTP, formato)", async () => {
  const resposta = (corpo, status = 200) => async () => ({ ok: status === 200, status, json: async () => corpo });
  assert.equal((await carregarFundoTipico({ fetchImpl: resposta(T) })).ok, true);
  assert.match((await carregarFundoTipico({ fetchImpl: resposta({}, 404) })).error, /HTTP 404/);
  assert.match((await carregarFundoTipico({ fetchImpl: resposta({ versao: 2 }) })).error, /versão/);
});

test("fundo típico no cartão: cotas, água na baixa-mar e na preia-mar do dia, fonte", () => {
  const d = { repontos: [
    { tipo: "BM", instante: Date.parse("2026-11-19T03:42:00Z"), alturaM: 1.4 },
    { tipo: "PM", instante: Date.parse("2026-11-19T10:08:00Z"), alturaM: 2.7 },
    { tipo: "BM", instante: Date.parse("2026-11-19T16:24:00Z"), alturaM: 1.2 },
    { tipo: "PM", instante: Date.parse("2026-11-19T22:46:00Z"), alturaM: 2.6 }] };
  const f = fundoDoCartao("ancao", d, { config, fundoTipico: ok });
  assert.equal(f.curto, "−1,1 / −1,7 / −2,7 m (LiDAR 2011, à LAT)");
  // LiDAR à LAT, que fica 0 a 0,34 m acima do ZH da tabela: água = maré − cota − (0 a 0,34).
  // Baixa-mar mais baixa (16:24, 1,2 m): 1,2 − (−1,1) = 2,3 e 2,3 − 0,34 = 1,96 → «2,0–2,3» …
  assert.match(f.longo, /a LAT fica 0,00 a 0,34 m acima do zero hidrográfico da tabela de marés/);
  assert.match(f.longo, /água na baixa-mar mais baixa do dia \(16:24, 1,2 m\): 2,0–2,3 \/ 2,6–2,9 \/ 3,6–3,9 m/);
  assert.match(f.longo, /na preia-mar mais alta \(10:08, 2,7 m\): 3,5–3,8 \/ 4,1–4,4 \/ 5,1–5,4 m/);
  assert.match(f.fonte, /Instituto Hidrográfico — LiDAR 2011.*\(2011\) · medido e tratado.*cotas: baixa-mar astronómica/);
  assert.ok(!/\b(PM|BM)\b/.test(f.longo), "marés por extenso");
  const alm = fundoDoCartao("almargem", d, { config, fundoTipico: ok });
  assert.equal(alm.curto, "−2,0 / −3,4 / −4,1 m (COSMO 06/2025)");
  assert.match(alm.fonte, /LTHQUGA1_20250612_20250616_DEM \(12\/06\/2025 a 16\/06\/2025\).*zero hidrográfico/);
  // COSMO ao ZH: valor único, sem intervalo.
  assert.match(alm.longo, /\(16:24, 1,2 m\): 3,2 \/ 4,6 \/ 5,3 m/);
  assert.doesNotMatch(alm.longo, /LAT/);
});

test("fundo típico no cartão: a descoberto, molhes e Ria sem linha, falha de leitura", () => {
  const d = { repontos: [{ tipo: "BM", instante: Date.parse("2026-11-19T16:24:00Z"), alturaM: 0.3 }] };
  assert.match(fundoDoCartao("falesia", d, { config, fundoTipico: ok }).longo, /\(16:24, 0,3 m\): 0,4–0,7 \/ 1,6–1,9 \/ 2,8–3,1 m/);
  const seco = structuredClone(T); seco.praias.falesia.cotas["100"] = 0.5;
  assert.match(fundoDoCartao("falesia", d, { config, fundoTipico: { ok: true, data: seco } }).longo, /: a descoberto \/ 1,6–1,9 \/ 2,8–3,1 m/);
  // Só o limite de cima acima de zero: pode estar a descoberto.
  const raso = structuredClone(T); raso.praias.falesia.cotas["100"] = 0.1;
  assert.match(fundoDoCartao("falesia", d, { config, fundoTipico: { ok: true, data: raso } }).longo, /: 0–0,2 \/ 1,6–1,9 \/ 2,8–3,1 m/);
  assert.equal(fundoDoCartao("molhe_quarteira", d, { config, fundoTipico: ok }), null);
  assert.equal(fundoDoCartao("ria", d, { config, fundoTipico: ok }), null);
  assert.equal(fundoDoCartao("ancao", d, { config }), null);
  assert.deepEqual(fundoDoCartao("ancao", d, { config, fundoTipico: { ok: false, error: "HTTP 500" } }), { erro: "não obtido (HTTP 500)" });
});

test("fundo típico: datum de cada fonte (LiDAR à LAT com limite, COSMO ao ZH) e validação", () => {
  assert.equal(T.fontes.lidar2011.datum, "LAT");
  assert.deepEqual(T.fontes.lidar2011.latAcimaZhM, [0, 0.34]);
  assert.equal(T.fontes.quarteira_garrao.datum, "ZH");
  const mau = structuredClone(T); mau.fontes.lidar2011.latAcimaZhM = [0.5];
  assert.ok(validarFundoTipico(mau).erros.some(e => /fontes\.lidar2011\.latAcimaZhM/.test(e)));
});
