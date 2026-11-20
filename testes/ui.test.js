// Ecrã inicial (Fase 4): desenho a partir do motor, sem rede. Usa respostas reais guardadas.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { analisarDias } from "../js/regras/analise.js";
import { aguaTurvaDoDia } from "../js/regras/chuva.js";
import { validateTides } from "../js/fontes/mares-locais.js";
import { pontosNecessarios } from "../js/pontos.js";
import { diasDoHorizonte, solDoDia } from "../js/dados.js";
import { renderInicio, fontesDoCartao } from "../js/ui/inicio.js";
import { num, hora, dataHora, rotuloDia, classeNota, textoNota, esc } from "../js/ui/formato.js";

const raiz = new URL("..", import.meta.url);
const lerJson = f => JSON.parse(readFileSync(new URL(f, raiz), "utf8"));
const config = lerJson("config.json");
const SunCalc = createRequire(import.meta.url)("../vendor/suncalc.js");
const marine = lerJson("testes/reais/openmeteo_marine_faro_20261014_0946.json");
const forecast = lerJson("testes/reais/openmeteo_forecast_faro_20261014_0946.json");
const mares = validateTides(lerJson("mares/2026.json")).events;
const LIDO = "2026-10-14T09:46:00.000Z";

function contexto({ falha = [], cfg = config, indice = 0 } = {}) {
  const pts = pontosNecessarios(cfg);
  const ok = data => ({ ok: true, data, source: "teste", readAt: LIDO, error: null });
  const falhou = { ok: false, data: null, source: "teste", readAt: LIDO, error: "HTTP 500" };
  const pontos = {
    mar: Object.fromEntries(pts.mar.map(k => [k, falha.includes(k) ? falhou : ok(marine)])),
    terra: Object.fromEntries(pts.terra.map(k => [k, falha.includes(k) ? falhou : ok(forecast)]))
  };
  const sol = solDoDia(SunCalc, cfg);
  const dias = diasDoHorizonte(new Date(LIDO), 7);
  const analise = analisarDias({ dias, pontos, mares, sol, config: cfg });
  return { analise, config: cfg, pontos, mares: { ok: true }, sol, lidoEm: LIDO, indice };
}

test("ecrã: um cartão por pesqueiro, com nota, períodos, fontes e créditos da foto", () => {
  const html = renderInicio(contexto());
  for (const pq of Object.values(config.pesqueiros)) assert.ok(html.includes(esc(pq.nomeCurto)), pq.nomeCurto);
  assert.equal((html.match(/<article class="cartao"/g) ?? []).length, Object.keys(config.pesqueiros).length);
  assert.match(html, /Dados lidos às 10:46 \(hora de Portugal continental\)/);
  assert.equal((html.match(/<h4>Fontes<\/h4>/g) ?? []).length, Object.keys(config.pesqueiros).length);
  assert.match(html, /Open-Meteo Marine \(37\.0133, -8\.00567\) · previsto \(os 7 dias anteriores, usados na comparação da água, são previsões arquivadas, não medições\) · lido às 10:46/);
  assert.ok(!/Wikimedia Commons/.test(html), "créditos das fotos fora dos cartões (página Fontes)");
  assert.match(html, /Créditos das fotografias na página <a href="\.\/fontes\.html">Fontes<\/a>/);
  assert.match(html, /Vento agora \(Windguru\): <a href="https:\/\/www\.windguru\.cz\/station\/3324"/);
  assert.match(html, /notas provisórias/);
});

test("ecrã: fonte em falta aparece no cartão afectado e só nele", () => {
  const html = renderInicio(contexto({ falha: ["ancaoPraia"] }));
  const cartoes = html.split('<article class="cartao"').slice(1);
  const ancao = cartoes.find(c => c.includes('id="pq-ancao"'));
  assert.match(ancao, /Ondulação e potência \(Open-Meteo Marine\) não obtidos — HTTP 500/);
  assert.match(ancao, /Sem nota: potência não obtida/);
  assert.ok(cartoes.filter(c => c.includes("não obtidos — HTTP 500")).length === 1);
});

test("ecrã: nota incompleta mostra o intervalo e o que falta; n.d. e «por confirmar» nunca aparecem como nota", () => {
  const c = { ...contexto(), especie: "dourada" };
  const p = c.analise.dias[0].pesqueiros.ria;
  p.notas.dourada = { ...p.notas.dourada, estado: "ok", nota: 5, completa: false, intervalo: { min: 4, max: 5 },
    periodosSemNota: [], naoAvaliadas: ["descida de pressão ≥ 5 hPa/24 h"] };
  let html = renderInicio(c);
  assert.match(html, /Nota incompleta — pode ser 4 a 5; por avaliar: descida de pressão/);
  assert.match(html, /class="selo n5 inc"/);
  p.notas.dourada = { estado: "por confirmar", nota: null, motivo: "mar de Sul", parcelas: [], periodo: "manhã" };
  html = renderInicio(c);
  assert.match(html, /Por confirmar: mar de Sul/);
  assert.match(html, /<span class="nota pc">\?<\/span>/);
  assert.equal(classeNota({ estado: "n.d." }), "nd");
  assert.equal(textoNota({ estado: "n.d." }), "n.d.");
});

test("ecrã: texto vindo da configuração é escapado", () => {
  const cfg = structuredClone(config);
  cfg.pesqueiros.ria.nomeCurto = "<img src=x onerror=alert(1)>";
  const html = renderInicio(contexto({ cfg }));
  assert.ok(!html.includes("<img src=x"));
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
});

test("ecrã: escolher outro dia muda a faixa e «Onde e quando»", () => {
  const html = renderInicio(contexto({ indice: 2 }));
  assert.match(html, /class="dia sel" data-dia="2"/);
  assert.match(html, /<h2>Onde e quando <small>· sex 16 · Robalo<\/small><\/h2>/);
});

test("formato: horas de Lisboa, vírgula decimal e sinal de menos", () => {
  assert.equal(num(-0.3, 1), "−0,3");
  assert.equal(num(3.257, 2), "3,26");
  assert.equal(num(null), "—");
  assert.equal(hora(Date.parse("2026-10-14T22:00:00Z")), "23:00");
  assert.equal(hora(Date.parse("2026-10-25T01:30:00Z")), "01:30", "depois da mudança de hora");
  assert.equal(rotuloDia("2026-10-17", 3), "sáb 17");
});

test("dias do horizonte: começam no dia de Lisboa e atravessam a mudança de hora", () => {
  assert.deepEqual(diasDoHorizonte(new Date("2026-10-24T23:30:00Z"), 3), ["2026-10-25", "2026-10-26", "2026-10-27"]);
  assert.deepEqual(diasDoHorizonte(new Date("2026-10-24T22:30:00Z"), 2), ["2026-10-24", "2026-10-25"]);
});

test("chuva: as 48 h todas em falta → «não obtida», sem 0 mm", () => {
  const r = aguaTurvaDoDia([], "2026-10-20", config.chuva);
  assert.equal(r.turva, null);
  assert.equal(r.chuva48hMm, null);
  assert.equal(r.motivo, "chuva das 48 h anteriores não obtida");
});

test("ecrã: marés por extenso (preia-mar / baixa-mar), sem PM nem BM", () => {
  const html = renderInicio(contexto());
  assert.match(html, /preia-mar \d\d:\d\d( e \d\d:\d\d)? · baixa-mar \d\d:\d\d/);
  assert.ok(!/\b(PM|BM) \d\d:\d\d/.test(html));
});

// ---------- Boia de Faro (observado) ----------
import { lerCoberturaBoia } from "../js/fontes/ih-boias.js";
const BOIA = lerCoberturaBoia(lerJson("testes/reais/ih_boia_faro_20261115.json"));
const boiaOk = readAt => ({ ok: true, data: BOIA, source: "Instituto Hidrográfico — boia ondógrafo", readAt, error: null });

test("ecrã: «Mar agora» com a última medição da boia, fonte, tipo, licença e aviso de que não entra nas notas", () => {
  const c = { ...contexto(), lidoEm: "2026-11-15T10:40:00.000Z", boiaFaro: boiaOk("2026-11-15T10:40:00.000Z") };
  const html = renderInicio(c);
  const bloco = html.split('<section class="mar-agora"')[1].split("</section>")[0];
  // Fase 1 (20/11/2026): uma linha sempre visível, com fonte, tipo e hora; o resto ao tocar.
  assert.match(bloco, /<details><summary><span class="mar-titulo">Mar agora<\/span> <small>· Boia de Faro · observado<\/small>/);
  assert.match(bloco, /<span class="mar-curto">onda 0,84 m de O · período médio 6,1 s · água 19,4 °C · medido a 15\/11 às 10:26 \(há 13 min\)<\/span><\/summary>/);
  assert.ok(bloco.indexOf("<dd>") > bloco.indexOf("</summary>"), "os pormenores ficam dentro do details");
  assert.match(bloco, /<dd>0,84 m \(máx\. 1,11 m\) · de O \(259°\)<\/dd>/);
  assert.match(bloco, /<dd>médio 6,1 s · de pico 10,5 s<\/dd>/);
  assert.match(bloco, /<dd>19,4 °C<\/dd>/);
  assert.match(bloco, /3 h antes 0,96 m · últimas 24 h: 0,84–1,22 m/);
  assert.match(bloco, /Medido a 15\/11 às 10:26 \(há 13 min\) ao largo, a 90 m de fundo/);
  // Revisão de 20/11/2026: data e fuso, para não haver dúvida sobre o instante.
  assert.match(bloco, /Não entra nas notas\. Horas de Portugal continental\./);
  assert.match(bloco, /Não entra nas notas/);
  assert.match(bloco, /Instituto Hidrográfico, boia CSA82\/D \(36\.9048, -7\.8984\) · observado · lido às 10:40/);
  assert.match(bloco, /href="https:\/\/creativecommons\.org\/licenses\/by-nc\/4\.0\/"[^>]*>CC BY-NC 4\.0<\/a>/);
  assert.ok(!/desactualizada/.test(bloco));
  assert.ok(!/Previsão/.test(bloco), "sem previsão para a hora da medição, a linha não aparece");
});

test("ecrã: «Mar agora» mostra a previsão do Open-Meteo para a mesma hora (série sintética do teste)", () => {
  const c = { ...contexto(), lidoEm: "2026-11-15T10:40:00.000Z", boiaFaro: boiaOk("2026-11-15T10:40:00.000Z") };
  const t = Date.parse("2026-11-15T10:00:00Z") / 1000;
  c.pontos = { ...c.pontos, mar: { ...c.pontos.mar, faroMarPoente: { ok: true, data: { latitude: 36.958336, longitude: -8.0416565, hourly: {
    time: [t - 3600, t, t + 3600], wave_height: [0.8, 0.9, 1], wave_period: [8.1, 8.2, 8.3] } } } } };
  // Revisão de 20/11/2026: diz de que célula vem a previsão e a que distância da boia, e o «wave_period»
  // não aparece como «período médio» ao lado do Tm02.
  const html = renderInicio(c);
  assert.match(html, /<dd>Open-Meteo para 15\/11 às 10:00, célula 36,958, −8,042 \(Praia de Faro\), a 14 km da boia: Hs 0,90 m · «wave_period» 8,2 s \(não é o Tm02 da boia\)<\/dd>/);
  assert.doesNotMatch(html, /período 8,2 s/);
  // Sem as coordenadas da célula na resposta, fica só o nome do ponto.
  delete c.pontos.mar.faroMarPoente.data.latitude;
  assert.match(renderInicio(c), /<dd>Open-Meteo para 15\/11 às 10:00, Praia de Faro: Hs 0,90 m/);
});

test("ecrã: boia desactualizada, sem medições válidas ou não obtida — sempre dito, nunca um número", () => {
  let html = renderInicio({ ...contexto(), lidoEm: "2026-11-15T14:00:00.000Z", boiaFaro: boiaOk("2026-11-15T14:00:00.000Z") });
  assert.match(html, /Última medição há 3 h 33 min: desactualizada/);
  html = renderInicio({ ...contexto(), boiaFaro: { ok: true, data: { observacoes: [] }, readAt: LIDO } });
  assert.match(html, /Sem medições válidas nas últimas 24 h/);
  html = renderInicio({ ...contexto(), boiaFaro: { ok: false, data: null, readAt: LIDO, error: "HTTP 503" } });
  assert.match(html, /<section class="mar-agora"[^>]*><h3>Mar agora[^<]*<small>[^<]*<\/small><\/h3><p class="falha">Não obtido — HTTP 503<\/p>/);
  assert.ok(!/mar-agora/.test(renderInicio(contexto())), "sem leitura da boia, sem secção");
});

test("ecrã: cartões das praias com o fundo típico (molhes sem ele); fonte nas fontes do cartão", () => {
  const c = { ...contexto(), fundoTipico: { ok: true, data: lerJson("fundos/tipico.json"), error: null } };
  const html = renderInicio(c);
  const cartaoDe = id => html.slice(html.indexOf(`id="pq-${id}"`), html.indexOf("</article>", html.indexOf(`id="pq-${id}"`)));
  assert.match(cartaoDe("ancao"), /<dt>Fundo a 100\/150\/200 m<\/dt><dd>−1,1 \/ −1,7 \/ −2,7 m \(LiDAR 2011, à LAT\)<\/dd>/);
  assert.match(cartaoDe("ancao"), /<dt>Fundo típico<\/dt><dd>cota mediana a 100 \/ 150 \/ 200 m/);
  assert.match(cartaoDe("ancao"), /<li>Fundo: Instituto Hidrográfico — LiDAR 2011/);
  assert.match(cartaoDe("almargem"), /−2,0 \/ −3,4 \/ −4,1 m \(COSMO 06\/2025\)/);
  assert.doesNotMatch(cartaoDe("molhe_quarteira"), /Fundo a 100/);
  const falhou = renderInicio({ ...contexto(), fundoTipico: { ok: false, data: null, error: "HTTP 500" } });
  assert.match(falhou, /<dt>Fundo a 100\/150\/200 m<\/dt><dd>não obtido \(HTTP 500\)<\/dd>/);
});

test("fontes do cartão: marés com os anos lidos (passagem de ano) e o aviso de ano em falta", () => {
  const c = contexto();
  const pq = config.pesqueiros.ancao;
  c.mares = { ...c.mares, ok: true, anos: [2026, 2027], aviso: null };
  assert.match(fontesDoCartao(pq, c), /Marés: Instituto Hidrográfico, Faro-Olhão 2026 e 2027 \(tabela oficial, horas TU\)/);
  c.mares = { ...c.mares, anos: [2027], aviso: "tabela de 2028 não obtida (HTTP 404)" };
  assert.match(fontesDoCartao(pq, c), /Faro-Olhão 2027 \(tabela oficial, horas TU\) · tabela de 2028 não obtida \(HTTP 404\)/);
  assert.doesNotMatch(fontesDoCartao(pq, c), /Faro-Olhão 2026 \(/, "o ano já não está escrito no código");
});

test("formato: dataHora em hora de Portugal continental (Inverno, Verão, mudança de dia, sem valor)", () => {
  assert.equal(dataHora(Date.parse("2026-11-15T10:26:00Z")), "15/11 às 10:26");
  assert.equal(dataHora(Date.parse("2026-07-15T10:26:00Z")), "15/07 às 11:26");
  assert.equal(dataHora(Date.parse("2026-07-15T23:30:00Z")), "16/07 às 00:30");
  assert.equal(dataHora(Date.parse("2026-12-31T23:59:00Z")), "31/12 às 23:59");
  assert.equal(dataHora(NaN), "—");
  assert.equal(dataHora(undefined), "—");
});
