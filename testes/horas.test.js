// Série hora a hora (motor) e painel «hora a hora» (ecrã). Sem rede.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { horasDoPesqueiro } from "../js/regras/horas.js";
import { instantesDoDia } from "../js/regras/serie.js";
import { ordenarMelhoresDias } from "../js/regras/notas.js";
import { analisarDias } from "../js/regras/analise.js";
import { validateTides } from "../js/fontes/mares-locais.js";
import { pontosNecessarios } from "../js/pontos.js";
import { diasDoHorizonte, solDoDia, luaDoDia } from "../js/dados.js";
import { renderHorario } from "../js/ui/horario.js";
import { rumo, nomeFaseLua } from "../js/ui/formato.js";

const raiz = new URL("..", import.meta.url);
const lerJson = f => JSON.parse(readFileSync(new URL(f, raiz), "utf8"));
const config = lerJson("config.json");
const cfgMar = { ...config.mar, coeficiente: config.potenciaOndas.coeficiente };
const SunCalc = createRequire(import.meta.url)("../vendor/suncalc.js");

const mar = (t, extra = {}) => ({ instante: t, wave_height: 1.0, wave_direction: 140, wave_period: 8,
  swell_wave_height: 0.8, swell_wave_direction: 240, swell_wave_period: 5, wind_wave_height: 0.5,
  wind_wave_direction: 120, wind_wave_period: 3, sea_surface_temperature: 20.4, ...extra });
const terra = (t, extra = {}) => ({ instante: t, wind_speed_10m: 12, wind_gusts_10m: 20, wind_direction_10m: 110,
  pressure_msl: 1018, precipitation: 0.2, ...extra });

test("horas: uma linha por hora esperada (25 a 25/10), hora em falta com valores null", () => {
  const esp = instantesDoDia("2026-10-25");
  const h = horasDoPesqueiro({ esperados: esp, mar: esp.slice(1).map(t => mar(t)), terra: esp.map(t => terra(t)),
    agua: null, cfgMar, tipo: "praia" });
  assert.equal(h.length, 25);
  assert.equal(h[0].mar, null, "hora sem registo do mar");
  assert.equal(h[0].limo, null);
  assert.equal(h[0].vento.velocidade, 12);
  assert.equal(h[1].mar.hs, 1.0);
  assert.equal(h[1].agua, 20.4, "sem ponto de água próprio, a temperatura vem do ponto do mar");
});

test("horas: swell com período < 6 s aparece na vaga (regra 3); potência da mesma hora", () => {
  const esp = instantesDoDia("2026-10-20").slice(0, 1);
  const [h] = horasDoPesqueiro({ esperados: esp, mar: [mar(esp[0])], terra: [terra(esp[0])], agua: null, cfgMar, tipo: "praia" });
  assert.equal(h.mar.fundo.length, 0);
  assert.equal(h.mar.vaga.length, 2);
  assert.ok(h.mar.vaga.some(c => /período < 6 s/.test(c.nota)));
  assert.equal(h.mar.potencia.valor, 0.49 * 1.0 * 1.0 * 8);
  assert.equal(h.limo.limo, true, "Hs ≥ 1 com componentes de Sudeste");
  assert.equal(h.lado, null, "praia: sem lado do molhe");
});

test("horas: limo e lado só onde se aplicam; direcções inválidas ficam null", () => {
  const esp = instantesDoDia("2026-10-20").slice(0, 1);
  const args = { esperados: esp, mar: [mar(esp[0])], terra: [terra(esp[0], { wind_direction_10m: 400 })], agua: null, cfgMar };
  const ria = horasDoPesqueiro({ ...args, tipo: "ria" })[0];
  assert.equal(ria.limo, null);
  assert.equal(ria.lado, null);
  assert.equal(ria.vento.direcao, null, "400° é inválido");
  const molhe = horasDoPesqueiro({ ...args, tipo: "molhe" })[0];
  assert.ok(molhe.lado && "lado" in molhe.lado);
  assert.ok(molhe.limo);
});

// Contexto com respostas reais guardadas (como no ecrã).
function contexto(indice = 0) {
  const marine = lerJson("testes/reais/openmeteo_marine_faro_20261014_0946.json");
  const forecast = lerJson("testes/reais/openmeteo_forecast_faro_20261014_0946.json");
  const pts = pontosNecessarios(config);
  const ok = data => ({ ok: true, data, source: "teste", readAt: "2026-10-14T09:46:00.000Z" });
  const pontos = { mar: Object.fromEntries(pts.mar.map(k => [k, ok(marine)])), terra: Object.fromEntries(pts.terra.map(k => [k, ok(forecast)])) };
  const eventos = validateTides(lerJson("mares/2026.json")).events;
  const sol = solDoDia(SunCalc, config);
  const analise = analisarDias({ dias: diasDoHorizonte(new Date("2026-10-14T09:46:00Z"), 7), pontos, mares: eventos, sol, config });
  return { analise, config, pontos, mares: { ok: true, data: eventos }, sol, lua: luaDoDia(SunCalc), lidoEm: "2026-10-14T09:46:00.000Z", indice };
}

test("painel: uma coluna por hora, notas por período que somam o dia, maré ilustrativa e sem PM/BM", () => {
  const c = contexto();
  const html = renderHorario(c, "molhe_quarteira");
  const n = c.analise.dias[0].pesqueiros.molhe_quarteira.horas.length;
  assert.equal((html.match(/<td class="h">/g) ?? []).length, n);
  for (const esp of ["robalo", "dourada"]) {
    const linha = html.split(`Nota ${esp}`)[1].split("</tr>")[0];
    const soma = [...linha.matchAll(/colspan="(\d+)"/g)].reduce((a, m) => a + Number(m[1]), 0);
    assert.equal(soma, n, `${esp}: períodos cobrem o dia`);
  }
  assert.match(html, /<svg class="curva-mare"/);
  assert.match(html, /a curva entre elas é só ilustrativa/);
  assert.match(html, /preia-mar \d\d:\d\d \(\d,\d m\)/);
  assert.ok(!/\b(PM|BM)\b/.test(html.replace(/data-[a-z]+="[^"]*"/g, "")));
  assert.match(html, /Lado do molhe/);
  assert.match(html, /Lua (nova|crescente|cheia|minguante)|Quarto|gibosa/);
  assert.match(html, /Open-Meteo Marine/);
});

test("painel: componente sem altura aparece «n.d.», nunca «nenhum» (revisão de 19/11/2026)", () => {
  const c = contexto();
  const h = c.analise.dias[0].pesqueiros.ancao.horas[0];
  h.mar = { ...h.mar, fundo: [], vaga: [], semAltura: [{ origem: "swell", hs: null, periodo: 9, direcao: 250, nota: "altura do swell não obtida" }] };
  const html = renderHorario(c, "ancao");
  const celula = linha => html.split(`<th scope="row">${linha}</th>`)[1].split("</td>")[0];
  assert.match(celula("Fundo"), /n\.d\./);
  assert.match(celula("Vaga"), /n\.d\./);
  // A série hora a hora guarda as componentes sem altura.
  assert.ok(Array.isArray(c.analise.dias[0].pesqueiros.ancao.horas[1].mar.semAltura));
});

test("painel: Ria sem limo nem lado; marés em falta dizem-no; pesqueiro inexistente → vazio", () => {
  const c = contexto();
  const ria = renderHorario(c, "ria");
  assert.ok(!/>Limo</.test(ria) && !/Lado do molhe/.test(ria));
  assert.match(renderHorario({ ...c, mares: { ok: false } }, "ancao"), /marés não obtidas/);
  assert.equal(renderHorario(c, "nao_existe"), "");
  assert.match(renderHorario(c, "ancao", 0), /nenhum|\d,\d m<br>/);
});

test("painel: navegação entre dias desligada nas pontas", () => {
  assert.match(renderHorario(contexto(0), "ancao"), /data-dia="-1" disabled/);
  assert.match(renderHorario(contexto(6), "ancao"), /data-dia="7" disabled/);
});

test("formato: rumos em português e fases da Lua", () => {
  assert.equal(rumo(0), "N");
  assert.equal(rumo(359), "N");
  assert.equal(rumo(225), "SO");
  assert.equal(rumo(292.5), "ONO");
  assert.equal(rumo(null), "—");
  assert.equal(nomeFaseLua(0.5), "Lua cheia");
  assert.equal(nomeFaseLua(0.01), "Lua nova");
  assert.equal(nomeFaseLua(0.25), "Quarto crescente");
});

test("melhores dias por espécie: ordena pela nota da espécie escolhida", () => {
  const d = (indice, r, g) => ({ dia: `d${indice}`, indice, melhorRobalo: r, melhorDourada: g, alinhado: false });
  const dias = [d(0, 5, 2), d(1, 3, 5)];
  assert.deepEqual(ordenarMelhoresDias(dias, "robalo").map(x => x.dia), ["d0", "d1"]);
  assert.deepEqual(ordenarMelhoresDias(dias, "dourada").map(x => x.dia), ["d1", "d0"]);
  // Sem espécie: os dois têm 5; desempate pela nota da outra espécie (2 < 3) → d1 primeiro.
  assert.deepEqual(ordenarMelhoresDias(dias).map(x => x.dia), ["d1", "d0"]);
});
