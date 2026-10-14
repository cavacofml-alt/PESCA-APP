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
import { renderInicio } from "../js/ui/inicio.js";
import { num, hora, rotuloDia, classeNota, textoNota, esc } from "../js/ui/formato.js";

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
  assert.match(html, /Dados lidos às 10:46/);
  assert.equal((html.match(/<h4>Fontes<\/h4>/g) ?? []).length, Object.keys(config.pesqueiros).length);
  assert.match(html, /Open-Meteo Marine \(37\.0133, -8\.00567\) · previsto · lido às 10:46/);
  assert.match(html, /CC BY-SA 4\.0/);
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
  const c = contexto();
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

test("ecrã: escolher outro dia muda a faixa e o resumo", () => {
  const html = renderInicio(contexto({ indice: 2 }));
  assert.match(html, /class="dia sel" data-dia="2"/);
  assert.match(html, /<span class="rot">sex 16<\/span>/);
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
