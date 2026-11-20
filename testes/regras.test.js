import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { limitesDiaLisboa } from "../js/normalizacao.js";
import { horasOpenMeteo, porDia } from "../js/regras/serie.js";
import { potenciaHora, potenciaMaximaDoDia, AVISO_PERIODO_PICO } from "../js/regras/potencia.js";
import { classificarComponentes, energia } from "../js/regras/componentes.js";
import { classificarAmplitude, amplitudesConsecutivas, CLASSE_MARE } from "../js/regras/mares.js";
import { getSunAndMoon } from "../js/fontes/suncalc.js";
import { validateTides } from "../js/fontes/mares-locais.js";
import { MARINE_FIXTURE, TIDE_FIXTURE } from "./dados-teste.js";

const config = JSON.parse(readFileSync(new URL("../config.json", import.meta.url), "utf8"));
const COEF = config.potenciaOndas.coeficiente;

// ---------- Dia civil de Lisboa ----------

test("limitesDiaLisboa: dias de 24, 25 (25/10) e 23 horas (29/03)", () => {
  const horas = d => { const l = limitesDiaLisboa(d); return (l.fim - l.inicio) / 3600000; };
  assert.equal(horas("2026-10-24"), 24);
  assert.equal(horas("2026-10-25"), 25);
  assert.equal(horas("2026-03-29"), 23);
  assert.equal(new Date(limitesDiaLisboa("2026-10-25").inicio).toISOString(), "2026-10-24T23:00:00.000Z");
  assert.equal(limitesDiaLisboa("2026-02-30"), null);
  assert.equal(limitesDiaLisboa("ontem"), null);
});

test("série Open-Meteo: as duas 01:00 de 25/10 ficam no mesmo dia, com instantes distintos", () => {
  const horas = horasOpenMeteo(MARINE_FIXTURE);
  assert.deepEqual(horas.map(h => h.dia), ["2026-10-25", "2026-10-25", "2026-10-25", "2026-10-25"]);
  assert.equal(new Set(horas.map(h => h.instante)).size, 4);
  assert.equal(porDia(horas).get("2026-10-25").length, 4);
});

// ---------- Potência (regra 5) ----------

test("potência: P = 0,49 × Hs² × T com o período médio", () => {
  const p = potenciaHora({ hs: 1.0, periodoMedio: 7.0, periodoPico: 9.0 }, COEF);
  assert.equal(p.valor, 0.49 * 1 * 1 * 7);
  assert.equal(p.periodo, "médio");
  assert.equal(p.aviso, null);
});

test("potência: sem período médio usa o de pico, com aviso; sem os dois → não obtido", () => {
  const p = potenciaHora({ hs: 1.0, periodoMedio: null, periodoPico: 9.0 }, COEF);
  assert.equal(p.periodo, "pico");
  assert.equal(p.aviso, AVISO_PERIODO_PICO);
  const n = potenciaHora({ hs: 1.0, periodoMedio: null, periodoPico: null }, COEF);
  assert.equal(n.valor, null);
  assert.equal(n.status, "não obtido");
});

test("potência: Hs em falta → não obtido; valores impossíveis → inválido", () => {
  assert.equal(potenciaHora({ hs: null, periodoMedio: 7 }).status, "não obtido");
  assert.equal(potenciaHora({ hs: -0.5, periodoMedio: 7 }).status, "inválido");
  assert.equal(potenciaHora({ hs: NaN, periodoMedio: 7 }).status, "inválido");
  assert.equal(potenciaHora({ hs: 1, periodoMedio: 0 }).status, "inválido");
  assert.equal(potenciaHora({ hs: 1, periodoMedio: -3 }).status, "inválido");
});

test("potência: fronteiras 0,99 / 1,00 / 1,50 kW/m (valores exactos para a Fase de notas)", () => {
  // Hs = 1, T escolhido para dar P exacta: T = P / 0,49
  for (const alvo of [0.99, 1.0, 1.5]) {
    const p = potenciaHora({ hs: 1, periodoMedio: alvo / 0.49 }, COEF);
    assert.ok(Math.abs(p.valor - alvo) < 1e-12, String(alvo));
  }
});

test("potência máxima do dia: valor, hora e horas sem dados", () => {
  const horas = horasOpenMeteo(MARINE_FIXTURE);
  const max = potenciaMaximaDoDia(horas, COEF);
  // 0,8²×7×0,49 = 2,1952; 1,0²×5,9×0,49 = 2,891; 1,1²×6,0×0,49 = 3,5574
  assert.equal(max.valor, 3.56);
  assert.equal(max.instante, horas[2].instante);
  assert.equal(max.horasSemValor, 1);
  const vazio = potenciaMaximaDoDia([horas[3]], COEF);
  assert.equal(vazio.status, "não obtido");
  assert.equal(vazio.valor, null);
});

// ---------- Componentes (regra 3) ----------

test("componentes: swell com T 5,9 s é vaga; com 6,0 s é fundo", () => {
  const base = { wind_wave_height: 0, swell_wave_height: 0.8, swell_wave_direction: 140 };
  const c59 = classificarComponentes({ ...base, swell_wave_period: 5.9 });
  assert.equal(c59.fundo.length, 0);
  assert.equal(c59.vaga.length, 1);
  assert.match(c59.vaga[0].nota, /tratado como vaga/);
  const c60 = classificarComponentes({ ...base, swell_wave_period: 6.0 });
  assert.equal(c60.fundo.length, 1);
  assert.equal(c60.vaga.length, 0);
});

test("componentes: vaga de vento da fonte é sempre vaga; swell sem período fica por classificar", () => {
  const c = classificarComponentes({ wind_wave_height: 0.5, wind_wave_direction: 130, wind_wave_period: 6.5,
    swell_wave_height: 0.7, swell_wave_direction: 300, swell_wave_period: null });
  assert.equal(c.vaga.length, 1);
  assert.equal(c.vaga[0].origem, "wind_wave");
  assert.equal(c.porClassificar.length, 1);
  assert.equal(c.fundo.length, 0);
});

test("componentes: altura em falta ≠ altura 0 (revisão de 19/11/2026)", () => {
  // Altura 0 = componente ausente; altura em falta ou inválida = não se sabe se existe.
  const zero = classificarComponentes({ wind_wave_height: 0, swell_wave_height: 0 });
  assert.deepEqual([zero.fundo.length, zero.vaga.length, zero.semAltura.length], [0, 0, 0]);
  const falta = classificarComponentes({ wind_wave_height: null, swell_wave_height: undefined, swell_wave_direction: 120 });
  assert.deepEqual(falta.semAltura.map(c => c.origem), ["wind_wave", "swell"]);
  assert.deepEqual([falta.fundo.length, falta.vaga.length, falta.porClassificar.length], [0, 0, 0]);
  assert.match(falta.semAltura[1].nota, /altura do swell não obtida/);
  for (const mau of [NaN, Infinity, -0.5, "0,8"]) {
    assert.equal(classificarComponentes({ wind_wave_height: 0, swell_wave_height: mau }).semAltura.length, 1, String(mau));
  }
});

test("energia Hs² × T", () => {
  assert.equal(energia({ hs: 2, periodo: 10 }), 40);
  assert.equal(energia({ hs: 2, periodo: null }), null);
});

// ---------- Marés (regra 4) ----------

test("amplitude: fronteiras 1,99 / 2,00 / 3,00 / 3,01 m", () => {
  assert.equal(classificarAmplitude(1.99).classe, CLASSE_MARE.MORTA);
  assert.equal(classificarAmplitude(2.0).classe, CLASSE_MARE.INTERMEDIA);
  assert.equal(classificarAmplitude(3.0).classe, CLASSE_MARE.INTERMEDIA);
  assert.equal(classificarAmplitude(3.01).classe, CLASSE_MARE.VIVA);
});

test("amplitude: arredonda a 0,01 m antes de classificar", () => {
  assert.equal(classificarAmplitude(1.995).classe, CLASSE_MARE.INTERMEDIA); // 2,00
  assert.equal(classificarAmplitude(1.994).classe, CLASSE_MARE.MORTA);      // 1,99
  assert.equal(classificarAmplitude(3.004).classe, CLASSE_MARE.INTERMEDIA); // 3,00
  assert.equal(classificarAmplitude(3.005).classe, CLASSE_MARE.VIVA);       // 3,01
  // 2,3 - 0,3 em vírgula flutuante = 1,9999999999999998 → 2,00
  assert.equal(classificarAmplitude(2.3 - 0.3).amplitude, 2.0);
});

test("amplitude: em falta → não obtido; negativa ou NaN → inválido", () => {
  assert.equal(classificarAmplitude(null).status, "não obtido");
  assert.equal(classificarAmplitude(-1).status, "inválido");
  assert.equal(classificarAmplitude(NaN).status, "inválido");
});

test("amplitudes consecutivas da tabela de teste", () => {
  const { events } = validateTides(TIDE_FIXTURE);
  const a = amplitudesConsecutivas(events);
  assert.deepEqual(a.map(x => Math.round(x.metros * 100) / 100), [2.4, 2.5]);
});

// ---------- SunCalc (vendor) ----------

test("SunCalc 1.9.0 em vendor/: nascer e pôr do Sol em Faro coerentes", () => {
  const SunCalc = createRequire(import.meta.url)("../vendor/suncalc.js");
  const r = getSunAndMoon(new Date("2026-10-13T12:00:00Z"), 37.01, -7.93, SunCalc);
  assert.equal(r.ok, true);
  // Verificação independente, aproximada: meio-dia solar em Faro ≈ 12:00 UTC + 7,93° × 4 min
  // − equação do tempo (~14 min a meio de Outubro) ≈ 12:18 UTC; dia de ~11 h a 37° N.
  // Logo nascer ≈ 06:43 UTC e pôr ≈ 17:53 UTC. Tolerância de ±20 min.
  const minutosUtc = iso => { const d = new Date(iso); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
  const nascer = minutosUtc(r.data.sunrise);
  const por = minutosUtc(r.data.sunset);
  assert.ok(Math.abs(nascer - (6 * 60 + 43)) <= 20, `nascer ${r.data.sunrise}`);
  assert.ok(Math.abs(por - (17 * 60 + 53)) <= 20, `pôr ${r.data.sunset}`);
  assert.ok(Math.abs((nascer + por) / 2 - (12 * 60 + 18)) <= 5, "simétrico em torno do meio-dia solar");
});

test("SunCalc vs. USNO (Faro, 5–11/10/2026): diferença ≤ 3 min", () => {
  // Referência: horas do USNO citadas num relatório colado pelo utilizador (conversa com o
  // Gemini, ponto 37.02,-7.93, hora de Lisboa). Não consultadas directamente.
  const SunCalc = createRequire(import.meta.url)("../vendor/suncalc.js");
  const usno = { "2026-10-05": ["07:30", "19:09"], "2026-10-06": ["07:31", "19:07"], "2026-10-07": ["07:32", "19:06"],
    "2026-10-08": ["07:33", "19:04"], "2026-10-09": ["07:34", "19:03"], "2026-10-10": ["07:35", "19:02"], "2026-10-11": ["07:36", "19:01"] };
  const minutosLisboa = d => { const [h, m] = d.toLocaleTimeString("pt-PT", { timeZone: "Europe/Lisbon", hour: "2-digit", minute: "2-digit" }).split(":"); return +h * 60 + +m; };
  const minutos = s => { const [h, m] = s.split(":"); return +h * 60 + +m; };
  for (const [dia, [nascer, por]] of Object.entries(usno)) {
    const r = getSunAndMoon(new Date(`${dia}T12:00:00Z`), 37.02, -7.93, SunCalc);
    assert.ok(Math.abs(minutosLisboa(new Date(r.data.sunrise)) - minutos(nascer)) <= 3, `${dia} nascer`);
    assert.ok(Math.abs(minutosLisboa(new Date(r.data.sunset)) - minutos(por)) <= 3, `${dia} pôr`);
  }
});
