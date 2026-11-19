// Fase 3 — motor de regras: fronteiras, falhas das fontes e dados incompletos.
// Dados sintéticos de teste; não são previsões reais.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { limitesDiaLisboa, utcToLisbon } from "../js/normalizacao.js";
import { marMexido, limoDaHora, limoDoDia } from "../js/regras/limo.js";
import { ladoDaHora, ladosDoDia, LADO, AVISO_LIMO_DERIVA } from "../js/regras/molhe.js";
import { marForteForaDoSul, ondaDominante } from "../js/regras/sul.js";
import { pressaoDoDia } from "../js/regras/pressao.js";
import { aguaDoDia } from "../js/regras/agua.js";
import { alinhamentosDoDia } from "../js/regras/alinhamento.js";
import { anomaliasDoDia, CONFIRMAR } from "../js/regras/anomalias.js";
import { aguaTurvaDoDia } from "../js/regras/chuva.js";
import { amplitudeDoDia, repontosDoDia, CLASSE_MARE } from "../js/regras/mares.js";
import { notaRobalo, notaDouradaRia, notaDouradaMolhe, notaDouradaPraia, ordenarMelhoresDias, ESTADO_NOTA } from "../js/regras/notas.js";
import { analisarDias } from "../js/regras/analise.js";
import { horasOpenMeteo } from "../js/regras/serie.js";
import { periodoDe, porPeriodo } from "../js/regras/periodos.js";
import { instantesDoDia } from "../js/regras/serie.js";
import { potenciaMaximaDoDia } from "../js/regras/potencia.js";
import { mediaDoDia } from "../js/regras/agua.js";
import { pontosNecessarios } from "../js/pontos.js";

const config = JSON.parse(readFileSync(new URL("../config.json", import.meta.url), "utf8"));
const cfgMar = { ...config.mar, coeficiente: config.potenciaOndas.coeficiente };
const H = 3600000;

// Série horária sintética de um ou mais dias de Lisboa. gerar(i, instante) → campos.
function serie(dias, gerar) {
  const time = [];
  const campos = {};
  for (const dia of dias) {
    const { inicio, fim } = limitesDiaLisboa(dia);
    for (let t = inicio; t < fim; t += H) {
      const v = gerar(time.length, t);
      time.push(t / 1000);
      for (const [k, x] of Object.entries(v)) (campos[k] ??= []).push(x);
    }
  }
  return { hourly: { time, ...campos } };
}
const horasDe = json => horasOpenMeteo(json);
const mar = (hs, dir, periodo, extra = {}) => ({ wave_height: hs, wave_direction: dir, wave_period: periodo,
  wind_wave_height: 0, wind_wave_direction: null, wind_wave_period: null,
  swell_wave_height: hs, swell_wave_direction: dir, swell_wave_period: periodo, sea_surface_temperature: 19, ...extra });
const terra = (v, dir, g = v, p = 1015) => ({ wind_speed_10m: v, wind_direction_10m: dir, wind_gusts_10m: g, pressure_msl: p, precipitation: 0 });

// ---------- Mar mexido e limo (regra 2) ----------

test("mar mexido: Hs 0,99/1,00 m e P 1,49/1,50 kW/m", () => {
  assert.equal(marMexido({ hs: 0.99, potencia: 1.49 }), false);
  assert.equal(marMexido({ hs: 1.0, potencia: 0.5 }), true);
  assert.equal(marMexido({ hs: 0.5, potencia: 1.5 }), true);
  assert.equal(marMexido({ hs: 0.5, potencia: null }), null, "potência em falta não permite concluir");
  assert.equal(marMexido({ hs: null, potencia: 2 }), true, "P ≥ 1,5 basta");
});

test("limo: SE com mar mexido na mesma hora, qualquer intensidade do vento", () => {
  // Swell de NO, mar mexido; vento de SE com só 2 nós → limo.
  const r = limoDaHora(mar(1.2, 315, 8), terra(2, 120), cfgMar);
  assert.equal(r.limo, true);
  assert.equal(r.componentesSE[0].tipo, "vento");
});

test("limo: sem mar mexido não há limo, mesmo com SE", () => {
  assert.equal(limoDaHora(mar(0.5, 120, 5), terra(15, 120), cfgMar).limo, false);
});

test("limo: sectores nos limites (67,5° é SE; 67,49° não; 157,5° já não)", () => {
  assert.equal(limoDaHora(mar(1.2, 67.5, 8), terra(0, null), cfgMar).limo, true);
  assert.equal(limoDaHora(mar(1.2, 67.49, 8), terra(0, null), cfgMar).limo, false);
  assert.equal(limoDaHora(mar(1.2, 157.5, 8), terra(0, null), cfgMar).limo, false);
});

test("limo: direcção em falta não conta como SE, mas impede concluir 'sem limo'", () => {
  const r = limoDaHora(mar(1.2, 315, 8), terra(10, null), cfgMar);
  assert.equal(r.limo, null);
  assert.match(r.motivo, /direcção em falta: vento/);
  // Vento não obtido (hora em falta no ponto terra) também.
  assert.equal(limoDaHora(mar(1.2, 315, 8), undefined, cfgMar).limo, null);
  // Mas se outra componente já é SE, há limo.
  assert.equal(limoDaHora(mar(1.2, 120, 8), terra(10, null), cfgMar).limo, true);
});

test("limo do dia: uma hora com limo basta; sem dados do mar → indeterminado", () => {
  const dia = "2026-10-20";
  const m = horasDe(serie([dia], i => mar(i === 5 ? 1.2 : 0.5, 120, 8)));
  const t = horasDe(serie([dia], () => terra(5, 300)));
  const r = limoDoDia(m, t, cfgMar);
  assert.equal(r.limo, true);
  assert.equal(r.horasComLimo.length, 1);
  assert.equal(limoDoDia([], t, cfgMar).limo, null);
});

// ---------- Lado do molhe ----------

test("molhe: SE → poente; O/SO → nascente; N/NO → sem lado preferido (sem nota 'mar de terra')", () => {
  assert.equal(ladoDaHora(mar(0.8, 120, 8), terra(5, 300), cfgMar).lado, LADO.POENTE);
  assert.equal(ladoDaHora(mar(0.8, 240, 8), terra(5, 120), cfgMar).lado, LADO.NASCENTE);
  const n = ladoDaHora(mar(0.8, 330, 8), terra(5, 120), cfgMar);
  assert.equal(n.lado, LADO.SEM_LADO);
  assert.doesNotMatch(JSON.stringify(n), /terra/);
});

test("molhe: componentes em conflito → decide a de maior energia (Hs² × T)", () => {
  // Fundo SO 0,6 m × 12 s = 4,32; vaga SE 0,9 m × 4 s = 3,24 → nascente.
  const r = ladoDaHora(mar(0.6, 240, 12, { wind_wave_height: 0.9, wind_wave_direction: 120, wind_wave_period: 4 }), terra(5, 120), cfgMar);
  assert.equal(r.lado, LADO.NASCENTE);
  assert.equal(r.decide, "fundo");
});

test("molhe: sem componente com Hs ≥ 0,2 m decide o vento (0,19 vs 0,20)", () => {
  assert.equal(ladoDaHora(mar(0.19, 240, 8), terra(10, 120), cfgMar).decide, "vento");
  assert.equal(ladoDaHora(mar(0.19, 240, 8), terra(10, 120), cfgMar).lado, LADO.POENTE);
  assert.equal(ladoDaHora(mar(0.2, 240, 8), terra(10, 120), cfgMar).decide, "fundo");
});

test("molhe: intervalos do dia em hora de Lisboa e aviso de limo à deriva", () => {
  const dia = "2026-10-20";
  const m = horasDe(serie([dia], i => mar(0.8, i < 12 ? 120 : 240, 8)));
  const t = horasDe(serie([dia], () => terra(5, 300)));
  const r = ladosDoDia(m, t, cfgMar);
  assert.deepEqual(r.intervalos.map(i => [i.lado, i.deLocal, i.ateLocal]),
    [[LADO.POENTE, "00:00", "11:00"], [LADO.NASCENTE, "12:00", "23:00"]]);
  assert.equal(r.aviso, AVISO_LIMO_DERIVA);
});

test("molhe: horas seguidas com o mesmo lado ficam num só intervalo, mesmo que mude quem decide", () => {
  const dia = "2026-10-20";
  // Fundo de SE até às 11:00; depois só vento de SE (ondas < 0,2 m) → poente o dia todo.
  const m = horasDe(serie([dia], i => (i < 12 ? mar(0.8, 120, 8) : mar(0.1, 120, 8))));
  const t = horasDe(serie([dia], () => terra(10, 120)));
  const r = ladosDoDia(m, t, cfgMar);
  assert.equal(r.intervalos.length, 1);
  assert.deepEqual([r.intervalos[0].lado, r.intervalos[0].deLocal, r.intervalos[0].ateLocal], [LADO.POENTE, "00:00", "23:00"]);
  assert.deepEqual(r.intervalos[0].decide, ["fundo", "vento"]);
});

// ---------- Pressão (regra 6) ----------

function pressoes(diaAnterior, dia, pAntes, pDepois) {
  return horasDe(serie([diaAnterior, dia], (i, t) => terra(5, 300, 5, t < limitesDiaLisboa(dia).inicio ? pAntes(i) : pDepois(i))));
}

test("pressão: descida de 5,0 hPa em 24 h activa; 4,99 não", () => {
  const h5 = pressoes("2026-10-19", "2026-10-20", () => 1015, () => 1010);
  const d = h5.filter(r => r.dia === "2026-10-20");
  assert.equal(pressaoDoDia(d, h5, config.pressao).descida.activo, true);
  const h4 = pressoes("2026-10-19", "2026-10-20", () => 1015, () => 1010.01);
  assert.equal(pressaoDoDia(h4.filter(r => r.dia === "2026-10-20"), h4, config.pressao).descida.activo, false);
});

test("pressão: sem as 24 h anteriores → não obtido; com lacunas e sem descida → indeterminado", () => {
  const so = horasDe(serie(["2026-10-20"], () => terra(5, 300, 5, 1010)));
  assert.equal(pressaoDoDia(so, so, config.pressao).descida.activo, null);
  const h = pressoes("2026-10-19", "2026-10-20", i => (i === 3 ? null : 1015), () => 1013);
  const r = pressaoDoDia(h.filter(x => x.dia === "2026-10-20"), h, config.pressao);
  assert.equal(r.descida.activo, null);
  assert.match(r.descida.motivo, /1 hora/);
});

test("pressão alta e estável: ≥ 1020 e variação < 2 em todas as horas; lacunas → indeterminado", () => {
  const ok = pressoes("2026-10-19", "2026-10-20", () => 1020, () => 1021.99);
  assert.equal(pressaoDoDia(ok.filter(r => r.dia === "2026-10-20"), ok, config.pressao).altaEstavel.valor, true);
  const var2 = pressoes("2026-10-19", "2026-10-20", () => 1020, () => 1022);
  assert.equal(pressaoDoDia(var2.filter(r => r.dia === "2026-10-20"), var2, config.pressao).altaEstavel.valor, false);
  const baixa = pressoes("2026-10-19", "2026-10-20", () => 1020, i => (i === 30 ? 1019.9 : 1020));
  assert.equal(pressaoDoDia(baixa.filter(r => r.dia === "2026-10-20"), baixa, config.pressao).altaEstavel.valor, false);
  const lacuna = pressoes("2026-10-19", "2026-10-20", () => 1020, i => (i === 30 ? null : 1020));
  assert.equal(pressaoDoDia(lacuna.filter(r => r.dia === "2026-10-20"), lacuna, config.pressao).altaEstavel.valor, null);
});

test("pressão: 24 h antes por instante absoluto no dia de 25 horas (25/10)", () => {
  const h = pressoes("2026-10-24", "2026-10-25", () => 1016, () => 1011);
  const d = h.filter(r => r.dia === "2026-10-25");
  assert.equal(d.length, 25);
  const r = pressaoDoDia(d, h, config.pressao);
  // Dia de 25 horas: a última hora (23:00 WET = 23:00Z de 25/10) compara com 23:00Z de 24/10,
  // que já é 00:00 de 25/10 em Lisboa (1011): variação 0. As outras horas comparam com 24/10
  // (1016): descida 5. Todas as comparações existem porque usam instantes absolutos.
  assert.equal(r.descida.activo, true);
  assert.equal(r.descida.descidaHpa, 5);
});

// ---------- Água (regra 7) ----------

test("água: D vs D−7 com dias completos; descida 2,0 afasta, 1,9 não", () => {
  const dias = ["2026-10-13", "2026-10-20"];
  const h = horasDe(serie(dias, (i, t) => ({ sea_surface_temperature: t < limitesDiaLisboa("2026-10-20").inicio ? 21 : 19 })));
  const r = aguaDoDia(h, "2026-10-20", config.temperaturaAgua);
  assert.equal(r.afastaDourada, true);
  assert.equal(r.variacao, -2);
  const h2 = horasDe(serie(dias, (i, t) => ({ sea_surface_temperature: t < limitesDiaLisboa("2026-10-20").inicio ? 20.9 : 19 })));
  assert.equal(aguaDoDia(h2, "2026-10-20", config.temperaturaAgua).afastaDourada, false);
});

test("água: hora em falta ou D−7 ausente → comparação não possível", () => {
  const h = horasDe(serie(["2026-10-13", "2026-10-20"], i => ({ sea_surface_temperature: i === 30 ? null : 20 })));
  const r = aguaDoDia(h, "2026-10-20", config.temperaturaAgua);
  assert.equal(r.afastaDourada, null);
  assert.match(r.motivo, /comparação não possível/);
  const so = horasDe(serie(["2026-10-20"], () => ({ sea_surface_temperature: 20 })));
  assert.equal(aguaDoDia(so, "2026-10-20").afastaDourada, null);
});

test("água: o dia de 25 horas (25/10) exige as 25 horas", () => {
  const h = horasDe(serie(["2026-10-18", "2026-10-25"], () => ({ sea_surface_temperature: 20 })));
  assert.equal(aguaDoDia(h, "2026-10-25").variacao, 0);
  const falta = h.filter((r, i) => i !== h.length - 1);
  assert.equal(aguaDoDia(falta, "2026-10-25").afastaDourada, null);
});

// ---------- Alinhamento (regra 9) ----------

test("alinhamento: reponto a 60 min do Sol conta; a 61 não; sem Sol ou marés → indeterminado", () => {
  const sol = { nascer: Date.parse("2026-10-20T06:45:00Z"), por: Date.parse("2026-10-20T17:55:00Z") };
  const em = m => [{ instante: sol.nascer + m * 60000, tipo: "PM" }];
  assert.equal(alinhamentosDoDia(em(60), sol, config.alinhamento).alinhado, true);
  assert.equal(alinhamentosDoDia(em(-60), sol, config.alinhamento).alinhado, true);
  assert.equal(alinhamentosDoDia(em(61), sol, config.alinhamento).alinhado, false);
  assert.equal(alinhamentosDoDia(em(0), null).alinhado, null);
  assert.equal(alinhamentosDoDia(null, sol).alinhado, null);
});

// ---------- Anomalias (regra 10) ----------

test("rajada (3b): só com vento médio ≥ 5 nós; 3× não assinala, acima de 3× assinala", () => {
  const h = ([v, g]) => ({ instante: 0, wind_speed_10m: v, wind_gusts_10m: g });
  const cfg = config.anomalias;
  assert.equal(cfg.ventoMedioMinimoNos, 5);
  assert.equal(anomaliasDoDia([h([10, 30])], cfg).assinalar, false);
  const r = anomaliasDoDia([h([10, 30.1])], cfg);
  assert.equal(r.assinalar, true);
  assert.equal(r.mensagem, CONFIRMAR);
  // Vento fraco: não se avalia, mesmo com razão alta.
  const fraco = anomaliasDoDia([h([4.9, 20]), h([1, 4]), h([0, 5])], cfg);
  assert.equal(fraco.assinalar, false);
  assert.equal(fraco.horasAbaixoDoMinimo, 3);
  assert.equal(anomaliasDoDia([h([5, 15.1])], cfg).assinalar, true, "5 nós já conta");
  // Sem mínimo (0): vento 0 com rajada é inconsistente.
  assert.equal(anomaliasDoDia([h([0, 5])], { rajadaSobreVentoMedioMaximo: 3, ventoMedioMinimoNos: 0 }).inconsistentes.length, 1);
  assert.equal(anomaliasDoDia([h([null, 5])], cfg).horasSemDados, 1);
});

// ---------- Chuva (regra 8, decisão 1a) ----------

test("chuva (1a): ≥ 20 mm nas 48 h antes do dia → turva; 19,9 não; horas em falta → indeterminado", () => {
  const dia = "2026-10-20";
  const ini = limitesDiaLisboa(dia).inicio;
  // Precipitação = soma da hora anterior: o valor marcado às 00:00 do dia conta (chuva 23–24 h).
  const chuva = valorEm => horasDe(serie(["2026-10-18", "2026-10-19", dia], (i, t) => ({ precipitation: valorEm(t) })));
  const em = (mm, ...instantes) => t => (instantes.includes(t) ? mm : 0);
  assert.equal(aguaTurvaDoDia(chuva(em(10, ini, ini - 47 * H)), dia, config.chuva).turva, true);  // 20 mm nas pontas da janela
  assert.equal(aguaTurvaDoDia(chuva(em(10, ini, ini - 48 * H)), dia, config.chuva).turva, false); // −48 h já fica fora
  assert.equal(aguaTurvaDoDia(chuva(em(10, ini + H, ini - 47 * H)), dia, config.chuva).turva, false); // 01:00 do próprio dia não conta
  assert.equal(aguaTurvaDoDia(chuva(t => (t === ini ? 19.9 : 0)), dia, config.chuva).turva, false);
  assert.equal(aguaTurvaDoDia(chuva(t => (t === ini ? 19.9 : 0)), dia, config.chuva).chuva48hMm, 19.9);
  const lacuna = chuva(t => (t === ini - 5 * H ? null : 0));
  const r = aguaTurvaDoDia(lacuna, dia, config.chuva);
  assert.equal(r.turva, null);
  assert.match(r.motivo, /1 h sem valor/);
  // Com lacunas mas já ≥ 20 mm nas horas obtidas → turva.
  assert.equal(aguaTurvaDoDia(chuva(t => (t === ini - 5 * H ? null : t === ini ? 25 : 0)), dia, config.chuva).turva, true);
});

// ---------- Amplitude do dia (decisão A) ----------

const ev = (iso, type, heightM) => ({ timestamp: Date.parse(iso), type, heightM, instant: iso, source: "teste" });
const TABELA = [
  ev("2026-10-19T20:00:00Z", "PM", 3.0),
  ev("2026-10-20T02:10:00Z", "BM", 0.6),   // 03:10 em Lisboa, 20/10
  ev("2026-10-20T08:20:00Z", "PM", 3.3),
  ev("2026-10-20T14:30:00Z", "BM", 0.4),
  ev("2026-10-20T20:40:00Z", "PM", 3.1),
  ev("2026-10-21T02:50:00Z", "BM", 0.5)
];

test("amplitude do dia: maior par com pelo menos um evento no dia", () => {
  const a = amplitudeDoDia(TABELA, "2026-10-20", config.mares);
  assert.equal(a.amplitude, 2.9); // 3,3 − 0,4
  assert.equal(a.classe, CLASSE_MARE.INTERMEDIA);
});

test("amplitude: par que atravessa a meia-noite conta para os dois dias", () => {
  // 23:30Z de 19/10 = 00:30 de 20/10 em Lisboa; BM antes, às 22:00 de 19/10 (Lisboa).
  const t = [ev("2026-10-19T15:00:00Z", "PM", 3.0), ev("2026-10-19T21:00:00Z", "BM", 0.1),
    ev("2026-10-19T23:30:00Z", "PM", 3.6), ev("2026-10-20T05:40:00Z", "BM", 1.5), ev("2026-10-20T11:50:00Z", "PM", 2.5),
    ev("2026-10-20T18:00:00Z", "BM", 1.4), ev("2026-10-21T00:10:00Z", "PM", 2.6)];
  assert.equal(amplitudeDoDia(t, "2026-10-20", config.mares).amplitude, 3.5); // 0,1 (19/10) → 3,6 (20/10)
});

test("amplitude: tabela incompleta à volta do dia → não obtido (não subestimar)", () => {
  assert.equal(amplitudeDoDia(TABELA.slice(1), "2026-10-20").status, "não obtido");
  assert.equal(amplitudeDoDia(TABELA.slice(0, 5), "2026-10-20").status, "não obtido");
  assert.equal(amplitudeDoDia(TABELA, "2026-11-01").status, "não obtido");
  assert.equal(amplitudeDoDia(null, "2026-10-20").status, "não obtido");
});

test("repontos do dia: null quando a tabela não cobre o dia (não é 'sem repontos')", () => {
  assert.equal(repontosDoDia(TABELA, "2026-10-20").length, 4);
  assert.equal(repontosDoDia(TABELA, "2026-11-01"), null);
  assert.equal(repontosDoDia(null, "2026-10-20"), null);
});

// ---------- Notas (secção 6) ----------

const base = {
  classeMare: CLASSE_MARE.MORTA, alinhado: false,
  descidaPressao: false, altaEstavel: false, aguaAfasta: false, turva: false, potenciaMax: 1.2, limo: false,
  marForaDoSul: true
};
const robalo = (f, opt) => notaRobalo({ ...base, ...f }, config.pontuacao, config.mar, opt);

test("robalo: fronteiras de potência 0,99 / 1,00 / 1,49 / 1,50 kW/m", () => {
  assert.equal(robalo({ potenciaMax: 0.99 }).nota, 1);
  assert.equal(robalo({ potenciaMax: 1.0 }).nota, 3);
  assert.equal(robalo({ potenciaMax: 1.49 }).nota, 3);
  assert.equal(robalo({ potenciaMax: 1.5 }).nota, 4);
});

test("robalo: P < 1 é 1 obrigatório mesmo com alinhamento e descida de pressão", () => {
  const r = robalo({ potenciaMax: 0.5, alinhado: true, descidaPressao: true });
  assert.equal(r.nota, 1);
  assert.match(r.limite.descricao, /potência < 1/);
});

test("robalo: potência não obtida → n.d., nunca 1/5 por defeito", () => {
  const r = robalo({ potenciaMax: null });
  assert.equal(r.estado, ESTADO_NOTA.ND);
  assert.equal(r.nota, null);
});

test("robalo nas praias: limo força 1; limo indeterminado → n.d.", () => {
  assert.equal(robalo({ potenciaMax: 2, limo: true, alinhado: true }).nota, 1);
  assert.equal(robalo({ potenciaMax: 2, limo: null }).estado, ESTADO_NOTA.ND);
  assert.equal(robalo({ potenciaMax: 0.8, limo: null }).nota, 1, "P < 1 decide antes do limo");
});

test("robalo: +1 alinhamento +1 pressão limitado a 5, com parcelas visíveis", () => {
  const r = robalo({ potenciaMax: 2, alinhado: true, descidaPressao: true });
  assert.equal(r.nota, 5);
  assert.deepEqual(r.parcelas.map(p => p.valor), [4, 1, 1]);
});

test("robalo: ajuste sem dados fica 'não avaliado' e não soma", () => {
  const r = robalo({ potenciaMax: 1.2, descidaPressao: null, motivoPressao: "pressão não obtida" });
  assert.equal(r.nota, 3);
  assert.deepEqual(r.naoAvaliadas, ["descida de pressão ≥ 5 hPa/24 h"]);
});

test("robalo no molhe com P ≥ 1,5 e Sudeste com mar mexido (2b): nota normal, lado poente, aviso de limo", () => {
  const r = robalo({ potenciaMax: 2, limo: true }, { tipo: "molhe" });
  assert.equal(r.estado, ESTADO_NOTA.OK);
  assert.equal(r.nota, 4);
  assert.match(r.observacao, /lado poente/);
  assert.match(r.observacao, /limo à deriva/);
  assert.equal(robalo({ potenciaMax: 2, limo: false }, { tipo: "molhe" }).nota, 4);
  assert.equal(robalo({ potenciaMax: 2, limo: null }, { tipo: "molhe" }).nota, 4, "no molhe o limo não decide a nota");
  assert.equal(robalo({ potenciaMax: 2, limo: true }, { tipo: "praia" }).nota, 1, "nas praias continua 1");
});

const ria = f => notaDouradaRia({ ...base, ...f }, config.pontuacao);

test("dourada Ria: base pela maré e limites 1–5", () => {
  assert.equal(ria({ classeMare: CLASSE_MARE.MORTA }).nota, 4);
  assert.equal(ria({ classeMare: CLASSE_MARE.INTERMEDIA }).nota, 3);
  assert.equal(ria({ classeMare: CLASSE_MARE.VIVA }).nota, 1);
  assert.equal(ria({ classeMare: CLASSE_MARE.MORTA, alinhado: true, descidaPressao: true }).nota, 5);
  assert.equal(ria({ classeMare: CLASSE_MARE.VIVA, altaEstavel: true, aguaAfasta: true }).nota, 1);
  assert.equal(ria({ classeMare: CLASSE_MARE.MORTA, turva: true }).nota, 2);
});

const CHUVA_INCOMPLETA = "chuva das 48 h anteriores incompleta (3 h sem valor; 0 mm nas restantes)";

test("dourada Ria: sem amplitude → n.d.; chuva por verificar → parcela não avaliada", () => {
  assert.equal(ria({ classeMare: null }).estado, ESTADO_NOTA.ND);
  const r = ria({ turva: null, motivoChuva: CHUVA_INCOMPLETA });
  assert.equal(r.nota, 4);
  assert.ok(r.naoAvaliadas.includes("água turva por chuva"));
});

const molhe = f => notaDouradaMolhe({ ...base, ...f }, config.pontuacao, config.mar);

test("dourada molhe: P 1,49 viável; 1,50 → 1; água turva → 1", () => {
  assert.equal(molhe({ potenciaMax: 1.49 }).nota, 3);
  assert.equal(molhe({ potenciaMax: 1.5 }).nota, 1);
  assert.equal(molhe({ potenciaMax: 0.5, turva: true }).nota, 1);
});

test("dourada molhe: limite por verificar (chuva incompleta ou P em falta) → n.d.", () => {
  assert.equal(molhe({ turva: null, motivoChuva: CHUVA_INCOMPLETA }).estado, ESTADO_NOTA.ND);
  assert.equal(molhe({ potenciaMax: null }).estado, ESTADO_NOTA.ND);
  // P ≥ 1,5 já decide 1, mesmo com a chuva por verificar.
  assert.equal(molhe({ potenciaMax: 2, turva: null }).nota, 1);
});

// ---------- Períodos (decisão B, opção C) ----------

test("períodos: fronteiras pela hora de Lisboa (06, 12, 18)", () => {
  const p = iso => periodoDe(Date.parse(iso));
  assert.equal(p("2026-10-20T04:59:00Z"), "madrugada"); // 05:59 WEST
  assert.equal(p("2026-10-20T05:00:00Z"), "manhã");     // 06:00
  assert.equal(p("2026-10-20T10:59:00Z"), "manhã");     // 11:59
  assert.equal(p("2026-10-20T11:00:00Z"), "tarde");     // 12:00
  assert.equal(p("2026-10-20T17:00:00Z"), "noite");     // 18:00
  assert.equal(p("2026-10-20T22:59:00Z"), "noite");     // 23:59
});

test("períodos: no dia de 25 horas (25/10) as duas 01:00 ficam na madrugada", () => {
  assert.equal(periodoDe(Date.parse("2026-10-25T00:00:00Z")), "madrugada"); // 01:00 WEST
  assert.equal(periodoDe(Date.parse("2026-10-25T01:00:00Z")), "madrugada"); // 01:00 WET
  assert.equal(periodoDe(Date.parse("2026-10-25T05:59:00Z")), "madrugada"); // 05:59 WET
  assert.equal(periodoDe(Date.parse("2026-10-25T06:00:00Z")), "manhã");
});

test("análise por períodos: potência alta só de madrugada → 4 de madrugada, 3 no resto; nota do dia = melhor período", () => {
  const e = entrada();
  const dia = "2026-10-20";
  // 0,49 × 0,9² × 9 = 3,57 de madrugada; 0,49 × 0,6² × 7 = 1,23 no resto do dia.
  const m = serie(["2026-10-13", "2026-10-19", dia], (i, t) =>
    (t >= limitesDiaLisboa(dia).inicio && t < limitesDiaLisboa(dia).inicio + 6 * H ? mar(0.9, 300, 9) : mar(0.6, 300, 7)));
  for (const k of pontosNecessarios(config).mar) e.pontos.mar[k] = { ...e.pontos.mar[k], data: m };
  const pf = analisarDias({ ...e, mares: null }).dias[0].pesqueiros.praia_faro;
  const n = Object.fromEntries(pf.periodos.map(p => [p.nome, p.notas.robalo.nota]));
  assert.deepEqual(n, { madrugada: 4, "manhã": 3, tarde: 3, noite: 3 });
  assert.equal(pf.notas.robalo.nota, 4);
  assert.equal(pf.notas.robalo.periodo, "madrugada");
});

test("análise por períodos: o alinhamento só conta no período do reponto", () => {
  const { dias } = analisarDias(entrada());
  // TABELA: BM 02:10Z (03:10), PM 08:20Z (09:20), BM 14:30Z (15:30), PM 20:40Z (21:40); Sol 06:45Z e 17:55Z.
  // Nenhum reponto a ≤ 60 min do Sol → nenhum período alinhado; mas a tabela cobre o dia (não é null).
  for (const p of dias[0].pesqueiros.ria.periodos) assert.equal(p.alinhamento.alinhado, false, p.nome);
  const sol = () => ({ nascer: Date.parse("2026-10-20T07:50:00Z"), por: Date.parse("2026-10-20T17:55:00Z") });
  const r = analisarDias({ ...entrada(), sol }).dias[0].pesqueiros.ria.periodos;
  const alinhados = r.filter(p => p.alinhamento.alinhado).map(p => p.nome);
  assert.deepEqual(alinhados, ["manhã"]); // PM 09:20 a 30 min do nascer (08:50)
});

// ---------- Melhores dias ----------

test("melhores dias: nota máxima, depois alinhamento, depois a outra espécie, depois o mais próximo", () => {
  const d = (indice, r, g, alinhado = false) => ({ dia: `d${indice}`, indice, melhorRobalo: r, melhorDourada: g, alinhado });
  const ord = ordenarMelhoresDias([d(0, 3, 3), d(1, 4, 2), d(2, 4, 2, true), d(3, 4, 3), d(4, null, null), d(5, 4, 3)]);
  assert.deepEqual(ord.map(x => x.dia), ["d2", "d3", "d5", "d1", "d0", "d4"]);
});

// ---------- Análise completa: falhas das fontes ----------

// Pontos sintéticos para todos os pontos que o config.json usa. falha: pontos que falham.
function entrada({ falha = [], mares = TABELA } = {}) {
  const dias = ["2026-10-20"];
  const anteriores = ["2026-10-13", "2026-10-18", "2026-10-19"];
  const todos = [...anteriores, ...dias];
  const marJson = serie(todos, () => mar(0.9, 300, 9));
  const terraJson = serie(todos, () => terra(8, 330, 12, 1012));
  const ok = data => ({ ok: true, data, source: "teste", readAt: "2026-10-20T06:00:00.000Z" });
  const falhou = { ok: false, data: null, error: "HTTP 500", source: "teste" };
  return {
    dias,
    pontos: {
      mar: Object.fromEntries(pontosNecessarios(config).mar.map(k => [k, falha.includes(k) ? falhou : ok(marJson)])),
      terra: Object.fromEntries(pontosNecessarios(config).terra.map(k => [k, falha.includes(k) ? falhou : ok(terraJson)]))
    },
    mares,
    sol: () => ({ nascer: Date.parse("2026-10-20T06:45:00Z"), por: Date.parse("2026-10-20T17:55:00Z") }),
    config
  };
}

test("análise: dia normal produz notas com fonte dos pontos e parcelas", () => {
  const { dias, melhoresDias } = analisarDias(entrada());
  const d = dias[0];
  // 0,49 × 0,9² × 9 = 3,57 kW/m; vento e ondulação de NO → sem limo → 4.
  assert.equal(d.pesqueiros.praia_faro.potencia.valor, 3.57);
  assert.equal(d.pesqueiros.praia_faro.notas.robalo.nota, 4);
  assert.equal(d.pesqueiros.ria.notas.dourada.estado, ESTADO_NOTA.OK);
  // Decisão C: pontos de pesca do utilizador nas praias.
  // A água das praias vem do ponto do mar (regra 7 da dourada nas praias, 14/10/2026).
  assert.deepEqual(d.pesqueiros.almargem.pontos, { mar: "forteNovo", terra: "forteNovo", agua: "forteNovo" });
  assert.deepEqual(d.pesqueiros.praia_faro.pontos, { mar: "faroMarPoente", terra: "faroMarPoente", agua: "faroMarPoente" });
  assert.deepEqual(melhoresDias, ["2026-10-20"]);
});

test("análise: sem regra de segurança — o molhe tem nota e não há avisos de segurança", () => {
  const { dias } = analisarDias(entrada());
  const p = dias[0].pesqueiros;
  assert.equal(dias[0].seguranca, undefined);
  assert.equal(p.molhe_quarteira.notas.robalo.estado, ESTADO_NOTA.OK);
  assert.ok(Object.values(p).every(x => !x.avisos.some(a => /segurança|desaconselh/i.test(a))));
});

test("análise: ponto de Faro em falta → robalo n.d. em Faro, sem usar outro ponto em silêncio", () => {
  const { dias } = analisarDias(entrada({ falha: ["faroMarPoente"] }));
  const p = dias[0].pesqueiros;
  assert.equal(p.praia_faro.notas.robalo.estado, ESTADO_NOTA.ND);
  assert.equal(p.praia_faro.pontos.mar, "faroMarPoente");
  for (const id of ["ancao", "almargem"]) assert.equal(p[id].notas.robalo.estado, ESTADO_NOTA.OK, `${id} não é afectado`);
});

test("análise: sem tabela de marés → dourada Ria n.d. e alinhamento indeterminado", () => {
  const { dias } = analisarDias(entrada({ mares: null }));
  const ria = dias[0].pesqueiros.ria;
  assert.equal(ria.notas.dourada.estado, ESTADO_NOTA.ND);
  assert.equal(ria.alinhamento.alinhado, null);
  assert.ok(ria.notas.dourada.motivo.includes("amplitude não obtida"));
});

test("análise: sem chuva nas 48 h → sem água turva; dourada no molhe decidida pela potência", () => {
  const { dias } = analisarDias(entrada());
  const p = dias[0].pesqueiros;
  assert.equal(p.ria.chuva.turva, false);
  assert.equal(p.ria.chuva.chuva48hMm, 0);
  // P = 3,57 ≥ 1,5 → limite da regra 11 → 1.
  assert.equal(p.molhe_quarteira.notas.dourada.nota, 1);
  assert.ok(!Object.values(p).some(x => x.avisos.some(a => a.startsWith("Chuva"))));
});

test("análise: chuva forte (25 mm em 48 h) → Ria −2, avisos na Ria, no molhe e no Almargem", () => {
  const e = entrada();
  const terraChuva = serie(["2026-10-13", "2026-10-18", "2026-10-19", "2026-10-20"], (i, t) =>
    ({ ...terra(8, 330, 12, 1012), precipitation: t === limitesDiaLisboa("2026-10-20").inicio - 6 * H ? 25 : 0 }));
  for (const k of pontosNecessarios(config).terra) e.pontos.terra[k] = { ...e.pontos.terra[k], data: terraChuva };
  const p = analisarDias(e).dias[0].pesqueiros;
  assert.equal(p.ria.chuva.turva, true);
  assert.ok(p.ria.notas.dourada.parcelas.some(x => x.descricao === "água turva por chuva" && x.valor === -2));
  assert.ok(p.ria.avisos.some(a => a.includes("Ria turva")));
  assert.ok(p.molhe_quarteira.avisos.some(a => a.includes("junto ao molhe")));
  assert.ok(p.almargem.avisos.some(a => a.includes("foz da ribeira")));
  assert.ok(!p.praia_faro.avisos.some(a => a.startsWith("Chuva")), "sem aviso de chuva na Praia de Faro");
});

// ---------- Revisão do ChatGPT da Fase 3 (regressões) ----------

const esp20 = instantesDoDia("2026-10-20");
const mar20 = esp20.map(t => ({ instante: t, ...mar(0.5, 300, 8) }));
const terra20 = esp20.map(t => ({ instante: t, ...terra(5, 300) }));

test("revisão 1: água turva confirmada decide 1/5 no molhe mesmo com a potência desconhecida", () => {
  const r = molhe({ potenciaMax: null, turva: true });
  assert.equal(r.estado, ESTADO_NOTA.OK);
  assert.equal(r.nota, 1);
  assert.match(r.limite.descricao, /água turva/);
  // Sem nenhum limite aplicado e um por verificar → n.d.
  assert.equal(molhe({ potenciaMax: null, turva: false }).estado, ESTADO_NOTA.ND);
});

test("revisão 2: nota com parcelas por avaliar fica completa=false; em empate prefere-se a completa", () => {
  assert.equal(ria({}).completa, true);
  const inc = ria({ descidaPressao: null, motivoPressao: "pressão não obtida" });
  assert.equal(inc.completa, false);
  assert.equal(inc.nota, 4);
  // Períodos com a mesma nota: a completa ganha, mesmo vindo depois.
  const { dias } = analisarDias(entrada());
  const ria20 = dias[0].pesqueiros.ria;
  assert.equal(ria20.notas.dourada.completa, true);
});

test("ponto 3 (decisão c do utilizador): mar de Sul nas praias com P ≥ 1,5 → por confirmar; o limo não muda", () => {
  // O sector do limo não muda: Sul com mar mexido continua sem limo; 150° é Sudeste.
  assert.equal(limoDaHora(mar(1.2, 180, 8), terra(10, 200), cfgMar).limo, false);
  assert.equal(limoDaHora(mar(1.2, 150, 8), terra(10, 200), cfgMar).limo, true, "150° é Sudeste");
  const sul = robalo({ potenciaMax: 1.8, limo: false, marForaDoSul: false, motivoSul: "mar de Sul" });
  assert.equal(sul.estado, ESTADO_NOTA.POR_CONFIRMAR);
  assert.equal(sul.nota, null);
  assert.equal(robalo({ potenciaMax: 1.8, limo: false, marForaDoSul: null }).estado, ESTADO_NOTA.ND);
  assert.equal(robalo({ potenciaMax: 1.8, limo: false, marForaDoSul: true }).nota, 4);
  // Abaixo de 1,5 a regra não depende da direcção; no molhe vale a decisão 2b.
  assert.equal(robalo({ potenciaMax: 1.2, marForaDoSul: false }).nota, 3);
  assert.equal(robalo({ potenciaMax: 1.8, marForaDoSul: false }, { tipo: "molhe" }).nota, 4);
});

test("revisão 5: limo com uma hora do mar em falta → indeterminado (salvo se outra hora já tiver limo)", () => {
  const sem14 = mar20.filter((_, i) => i !== 14);
  assert.equal(limoDoDia(sem14, terra20, cfgMar, esp20).limo, null);
  assert.match(limoDoDia(sem14, terra20, cfgMar, esp20).motivo, /1 hora/);
  const comLimo = sem14.map((r, i) => (i === 3 ? { ...r, ...mar(1.2, 120, 8) } : r));
  assert.equal(limoDoDia(comLimo, terra20, cfgMar, esp20).limo, true);
  assert.equal(limoDoDia(mar20, terra20, cfgMar, esp20).limo, false);
});

test("revisão 5 (25/10): o dia de 25 horas com só 24 registos não conclui 'sem limo'", () => {
  const esp25 = instantesDoDia("2026-10-25");
  assert.equal(esp25.length, 25);
  const m = esp25.slice(0, 24).map(t => ({ instante: t, ...mar(0.5, 300, 8) }));
  const t = esp25.map(i => ({ instante: i, ...terra(5, 300) }));
  assert.equal(limoDoDia(m, t, cfgMar, esp25).limo, null);
});

test("revisão 6: pressão com registos inteiros em falta → indeterminado, nunca 'alta e estável'", () => {
  const H = 3600000;
  const ini = limitesDiaLisboa("2026-10-20").inicio;
  const todas = [];
  for (let i = -24; i < 24; i++) if (i < 20) todas.push({ instante: ini + i * H, pressure_msl: 1021 });
  const r = pressaoDoDia([], todas, config.pressao, esp20);
  assert.equal(r.altaEstavel.valor, null);
  assert.equal(r.descida.activo, null);
  // Com as 24 horas → alta e estável.
  const completas = [];
  for (let i = -24; i < 24; i++) completas.push({ instante: ini + i * H, pressure_msl: 1021 });
  assert.equal(pressaoDoDia([], completas, config.pressao, esp20).altaEstavel.valor, true);
});

test("revisão 7: sem o pôr (ou o nascer) do Sol, 'sem alinhamento' passa a indeterminado", () => {
  const ini = limitesDiaLisboa("2026-10-20").inicio;
  const rep = [{ instante: ini + 18 * 3600000, tipo: "PM" }];
  assert.equal(alinhamentosDoDia(rep, { nascer: ini + 6 * 3600000, por: null }, config.alinhamento).alinhado, null);
  assert.equal(alinhamentosDoDia(rep, { nascer: null, por: ini + 18.5 * 3600000 }, config.alinhamento).alinhado, true, "alinhamento encontrado com o evento que existe");
});

test("revisão 8: potência com horas em falta — máximo conhecido < 1,5 → robalo n.d.; ≥ 1,5 → nota normal", () => {
  const m = mar20.map((r, i) => (i === 14 ? { ...r, wave_height: null } : { ...r, wave_height: 0.6, wave_period: 5.4 }));
  const p = potenciaMaximaDoDia(m, 0.49, esp20);
  assert.equal(p.completa, false);
  assert.equal(p.horasSemValor, 1);
  assert.equal(robalo({ potenciaMax: p.valorExacto, potenciaCompleta: p.completa }).estado, ESTADO_NOTA.ND);
  assert.equal(robalo({ potenciaMax: 1.6, potenciaCompleta: false }).nota, 4, "uma hora em falta não baixa um máximo ≥ 1,5");
  // Registo inteiro ausente também conta como hora sem valor.
  assert.equal(potenciaMaximaDoDia(mar20.slice(1), 0.49, esp20).completa, false);
  // Dourada no molhe: < 1,5 incompleto → limite por verificar; ≥ 1,5 → 1.
  assert.equal(molhe({ potenciaMax: 1.0, potenciaCompleta: false }).estado, ESTADO_NOTA.ND);
  assert.equal(molhe({ potenciaMax: 1.6, potenciaCompleta: false }).nota, 1);
});

test("revisão 9: média da água com um instante duplicado (falta uma hora) → não calculada", () => {
  const ag = esp20.map(t => ({ instante: t, dia: "2026-10-20", sea_surface_temperature: 20 }));
  ag[5] = { ...ag[4] };
  assert.equal(mediaDoDia(ag, "2026-10-20").media, null);
  assert.equal(mediaDoDia(esp20.map(t => ({ instante: t, sea_surface_temperature: 20 })), "2026-10-20").media, 20);
});

test("revisão 10: todas as parcelas aparecem, com estado aplicada / não aplicada / não avaliada", () => {
  const r = ria({ descidaPressao: true, altaEstavel: false, aguaAfasta: null, motivoAgua: "comparação não possível" });
  const estado = Object.fromEntries(r.parcelas.map(p => [p.descricao, p.estado]));
  assert.equal(estado["descida de pressão ≥ 5 hPa/24 h"], "aplicada");
  assert.equal(estado["pressão alta e estável"], "não aplicada");
  assert.equal(estado["descida da água ≥ 2 ºC (vs. D−7)"], "não avaliada");
  assert.equal(r.parcelas.length, 6);
});

test("revisão 1 (análogo no robalo): limo confirmado na praia dá 1/5 mesmo com a potência desconhecida ou incompleta", () => {
  const a = robalo({ potenciaMax: null, limo: true });
  assert.equal(a.estado, ESTADO_NOTA.OK);
  assert.equal(a.nota, 1);
  assert.match(a.limite.descricao, /limo/);
  assert.equal(robalo({ potenciaMax: 1.2, potenciaCompleta: false, limo: true }).nota, 1);
  // Sem limo confirmado, a regra da Fase 1 mantém-se: potência não obtida → n.d.
  assert.equal(robalo({ potenciaMax: null, limo: false }).estado, ESTADO_NOTA.ND);
  assert.equal(robalo({ potenciaMax: null, limo: null }).estado, ESTADO_NOTA.ND);
});

// ---------- Segunda revisão do ChatGPT da Fase 3 ----------

test("molhe: mar de Sul [157,5°; 202,5°[ → lado por confirmar (decisão pendente do utilizador)", () => {
  for (const d of [157.5, 180, 202.4]) {
    const r = ladoDaHora(mar(0.8, d, 8), terra(5, 300), cfgMar);
    assert.equal(r.lado, LADO.POR_CONFIRMAR, `${d}°`);
    assert.match(r.motivo, /Sul/);
  }
  assert.equal(ladoDaHora(mar(0.8, 157.4, 8), terra(5, 300), cfgMar).lado, LADO.POENTE);
  assert.equal(ladoDaHora(mar(0.8, 202.5, 8), terra(5, 300), cfgMar).lado, LADO.NASCENTE);
  // Sem vaga relevante decide o vento: vento de Sul → por confirmar.
  assert.equal(ladoDaHora(mar(0.1, 240, 8), terra(10, 180), cfgMar).lado, LADO.POR_CONFIRMAR);
  // O limo nas praias não muda: Sul com mar mexido continua sem limo.
  assert.equal(limoDaHora(mar(1.2, 180, 8), terra(10, 180), cfgMar).limo, false);
});

test("2.ª revisão, ponto 1′: nota decidida por limite tem intervalo de um só valor, mesmo incompleta", () => {
  const a = robalo({ potenciaMax: null, limo: true });
  assert.equal(a.completa, false);
  assert.ok(a.limite);
  assert.deepEqual(a.intervalo, { min: 1, max: 1 });
});

test("2.ª revisão, ponto 2: política aprovada — a nota mais alta ganha mesmo incompleta, com o intervalo à vista", () => {
  const inc = ria({ alinhado: true, descidaPressao: null, altaEstavel: null, motivoPressao: "pressão não obtida" });
  assert.equal(inc.nota, 5);
  assert.equal(inc.completa, false);
  assert.deepEqual(inc.intervalo, { min: 4, max: 5 }, "pressão por avaliar: −1 ou +1");
  const comp = ria({});
  assert.equal(comp.nota, 4);
  assert.deepEqual(comp.intervalo, { min: 4, max: 4 });
  // Melhores dias (secção 6): ordena pela nota; o 5 incompleto fica à frente do 4 completo.
  const d = (indice, g) => ({ dia: `d${indice}`, indice, melhorRobalo: null, melhorDourada: g, alinhado: false });
  assert.deepEqual(ordenarMelhoresDias([d(0, 4), d(1, 5)]).map(x => x.dia), ["d1", "d0"]);
});

test("2.ª revisão, ponto 8 (integração): uma hora de ondulação em falta na tarde → tarde n.d.; nota do dia marcada como incompleta", () => {
  const e = entrada();
  // 0,49 × 0,6² × 5,4 = 0,95 kW/m → robalo 1 nas horas conhecidas.
  const json = serie(["2026-10-13", "2026-10-18", "2026-10-19", "2026-10-20"], () => mar(0.6, 300, 5.4));
  const i = json.hourly.time.indexOf((limitesDiaLisboa("2026-10-20").inicio + 14 * H) / 1000);
  assert.ok(i > 0);
  for (const k of Object.keys(json.hourly)) json.hourly[k].splice(i, 1);
  e.pontos.mar.faroMarPoente = { ...e.pontos.mar.faroMarPoente, data: json };
  const pf = analisarDias(e).dias[0].pesqueiros.praia_faro;
  const tarde = pf.periodos.find(p => p.nome === "tarde");
  assert.equal(tarde.potencia.completa, false);
  assert.equal(tarde.notas.robalo.estado, ESTADO_NOTA.ND);
  assert.match(tarde.notas.robalo.motivo, /potência incompleta/);
  assert.equal(pf.periodos.find(p => p.nome === "manhã").notas.robalo.nota, 1);
  const r = pf.notas.robalo;
  assert.equal(r.nota, 1);
  assert.equal(r.completa, false);
  assert.deepEqual(r.periodosSemNota, ["tarde"]);
  assert.deepEqual(r.intervalo, { min: 1, max: 5 }, "a tarde podia ter nota mais alta");
  assert.equal(pf.potencia.completa, false);
  // Os outros pesqueiros não são afectados.
  assert.deepEqual(analisarDias(e).dias[0].pesqueiros.ancao.notas.robalo.periodosSemNota, []);
});

test("2.ª revisão, ponto 5: dia de 23 horas (29/03/2026) — sem a 01:00; 22 registos → limo indeterminado", () => {
  const esp = instantesDoDia("2026-03-29");
  assert.equal(esp.length, 23);
  assert.ok(!esp.some(t => utcToLisbon(new Date(t)).slice(11, 13) === "01"));
  const t = esp.map(i => ({ instante: i, ...terra(5, 300) }));
  const m = esp.map(i => ({ instante: i, ...mar(0.5, 300, 8) }));
  assert.equal(limoDoDia(m, t, cfgMar, esp).limo, false);
  assert.equal(limoDoDia(m.slice(1), t, cfgMar, esp).limo, null);
});

test("2.ª revisão: os períodos partem o dia sem sobreposições nem horas perdidas (23, 24 e 25 horas)", () => {
  for (const [dia, n] of [["2026-03-29", 23], ["2026-10-20", 24], ["2026-10-25", 25]]) {
    const p = porPeriodo(instantesDoDia(dia).map(t => ({ instante: t })), config.periodos);
    const todas = [...p.values()].flat().map(r => r.instante);
    assert.equal(todas.length, n, dia);
    assert.equal(new Set(todas).size, n, dia);
    assert.ok([...p.values()].every(rs => rs.length > 0), `${dia}: nenhum período vazio`);
  }
});

test("2.ª revisão, ponto 6: falta a pressão de 24 h antes de uma hora → sem conclusão de descida nem de estabilidade", () => {
  const ini = limitesDiaLisboa("2026-10-20").inicio;
  const todas = [];
  for (let i = -24; i < 24; i++) if (i !== -10) todas.push({ instante: ini + i * H, pressure_msl: 1021 });
  const r = pressaoDoDia([], todas, config.pressao, esp20);
  assert.equal(r.altaEstavel.valor, null);
  assert.equal(r.descida.activo, null);
});

test("2.ª revisão, ponto 7: sem dados do Sol (sol ausente ou null) → alinhamento indeterminado, sem erro", () => {
  assert.equal(alinhamentosDoDia([], null, config.alinhamento).alinhado, null);
  for (const sol of [undefined, () => null, () => ({ nascer: null, por: null })]) {
    const p = analisarDias({ ...entrada(), sol }).dias[0].pesqueiros.ria;
    assert.equal(p.alinhamento.alinhado, null);
    assert.equal(p.notas.dourada.completa, false);
    assert.equal(p.notas.dourada.parcelas.find(x => x.descricao.startsWith("alinhamento")).estado, "não avaliada");
  }
});

test("2.ª revisão, ponto 9: média do dia inválida → comparação não possível e parcela da água não avaliada", () => {
  const horas = [...instantesDoDia("2026-10-13"), ...instantesDoDia("2026-10-20")].map(t => ({ instante: t, sea_surface_temperature: 20 }));
  const sem = horas.filter((_, i) => i !== 30); // falta uma hora de 20/10
  const r = aguaDoDia(sem, "2026-10-20", config.temperaturaAgua);
  assert.equal(r.afastaDourada, null);
  assert.match(r.motivo, /comparação não possível/);
  assert.equal(aguaDoDia(horas, "2026-10-20", config.temperaturaAgua).afastaDourada, false);
  const n = ria({ aguaAfasta: r.afastaDourada, motivoAgua: r.motivo });
  assert.equal(n.parcelas.find(x => x.descricao.startsWith("descida da água")).estado, "não avaliada");
});

// ---------- Terceira revisão do ChatGPT e decisão c) (mar de Sul nas praias) ----------

test("mar de Sul nas praias: decide a onda dominante das horas com P ≥ 1,5; basta uma hora fora do Sul", () => {
  const h = (i, dir, extra) => ({ instante: esp20[i], ...mar(1.0, dir, 10, extra) }); // P = 4,9 kW/m
  const fraca = (i, dir) => ({ instante: esp20[i], ...mar(0.4, dir, 8) });              // P = 0,63 kW/m
  assert.equal(marForteForaDoSul([h(0, 180), h(1, 180)], cfgMar).valor, false);
  assert.equal(marForteForaDoSul([h(0, 180), h(1, 180)], cfgMar).motivo, "mar de Sul com P ≥ 1,5 kW/m: nota por confirmar no terreno");
  assert.equal(marForteForaDoSul([h(0, 180), h(1, 240)], cfgMar).valor, true);
  // Limites da faixa de Sul: 157,4 é Sudeste (fora), 157,5 e 202,4 são Sul, 202,5 é Sudoeste.
  assert.equal(marForteForaDoSul([h(0, 157.4)], cfgMar).valor, true);
  assert.equal(marForteForaDoSul([h(0, 157.5)], cfgMar).valor, false);
  assert.equal(marForteForaDoSul([h(0, 202.4)], cfgMar).valor, false);
  assert.equal(marForteForaDoSul([h(0, 202.5)], cfgMar).valor, true);
  // Horas fracas de Oeste não contam para a base 4.
  assert.equal(marForteForaDoSul([h(0, 180), fraca(1, 270)], cfgMar).valor, false);
  // Onda dominante: fundo de Sul mais fraco que a vaga de Sudoeste → fora do Sul.
  const misto = h(0, 180, { swell_wave_height: 0.5, swell_wave_period: 9, wind_wave_height: 0.9, wind_wave_direction: 240, wind_wave_period: 5 });
  assert.equal(ondaDominante(misto, cfgMar).componente.direcao, 240);
  assert.equal(marForteForaDoSul([misto], cfgMar).valor, true);
  // O vento não conta: mar de Sudoeste com vento de Sul → fora do Sul.
  assert.equal(marForteForaDoSul([h(0, 240)], cfgMar).valor, true);
  // Hora esperada sem dados podia ser forte e de Oeste → indeterminado.
  assert.equal(marForteForaDoSul([h(0, 180)], cfgMar, esp20.slice(0, 2)).valor, null);
  assert.equal(marForteForaDoSul([h(0, 180), h(1, 180)], cfgMar, esp20.slice(0, 2)).valor, false);
});

test("análise: mar forte de Sul → robalo por confirmar nas praias; molhe com nota (2b) e lado por confirmar", () => {
  const e = entrada();
  const json = serie(["2026-10-13", "2026-10-18", "2026-10-19", "2026-10-20"], () => mar(1.0, 180, 10));
  for (const k of pontosNecessarios(config).mar) e.pontos.mar[k] = { ...e.pontos.mar[k], data: json };
  const p = analisarDias(e).dias[0].pesqueiros;
  for (const id of ["praia_faro", "ancao", "almargem"]) {
    assert.equal(p[id].limo.limo, false, `${id}: Sul não é limo`);
    assert.equal(p[id].notas.robalo.estado, ESTADO_NOTA.POR_CONFIRMAR, id);
    assert.match(p[id].notas.robalo.motivo, /mar de Sul/);
  }
  assert.equal(p.molhe_quarteira.notas.robalo.estado, ESTADO_NOTA.OK);
  assert.equal(p.molhe_quarteira.notas.robalo.nota, 4);
  assert.deepEqual(p.molhe_quarteira.lados.intervalos.map(i => i.lado), [LADO.POR_CONFIRMAR]);
});

test("3.ª revisão: água — D com média válida e D−7 sem dados → comparação não possível", () => {
  const horas = instantesDoDia("2026-10-20").map(t => ({ instante: t, sea_surface_temperature: 21 }));
  const r = aguaDoDia(horas, "2026-10-20", config.temperaturaAgua);
  assert.equal(r.media, 21);
  assert.equal(r.afastaDourada, null);
  assert.match(r.motivo, /2026-10-13/);
});

test("3.ª revisão: o intervalo nunca junta factores exclusivos — pressão por avaliar dá −1 ou +1, nunca os dois", () => {
  // «Descida ≥ 5 hPa» (+1) e «alta e estável» (−1) excluem-se. O mínimo só usa as parcelas
  // negativas e o máximo só as positivas, por isso nenhum extremo as combina.
  const r = ria({ descidaPressao: null, altaEstavel: null });
  assert.equal(r.nota, 4);
  assert.deepEqual(r.intervalo, { min: 3, max: 5 });
});

// ---------- Dourada nas praias (decisão do utilizador, 14/10/2026, opção a) ----------

const praia = (f, opt) => notaDouradaPraia({ ...base, ...f }, config.pontuacao, config.mar, opt);

test("dourada nas praias: base 3 com os ajustes da dourada no molhe", () => {
  const r = praia({ potenciaMax: 1.0, limo: false });
  assert.equal(r.estado, ESTADO_NOTA.OK);
  assert.equal(r.nota, 3);
  assert.equal(praia({ potenciaMax: 1.0, limo: false, alinhado: true, descidaPressao: true }).nota, 5);
  assert.equal(praia({ potenciaMax: 1.0, limo: false, altaEstavel: true }).nota, 2);
  assert.equal(praia({ potenciaMax: 1.0, limo: false, aguaAfasta: true }).nota, 2);
});

test("dourada nas praias: limites — P ≥ 1,5 → 1 (fronteira 1,49/1,50) e limo → 1, mesmo com a potência desconhecida", () => {
  assert.equal(praia({ potenciaMax: 1.49, limo: false }).nota, 3);
  const r = praia({ potenciaMax: 1.5, limo: false });
  assert.equal(r.nota, 1);
  assert.match(r.limite.descricao, /potência ≥ 1.5/);
  const l = praia({ potenciaMax: null, limo: true });
  assert.equal(l.nota, 1);
  assert.match(l.limite.descricao, /limo/);
  // Limo por verificar e nenhum limite aplicado → n.d.; potência incompleta < 1,5 → n.d.
  assert.equal(praia({ potenciaMax: 1.0, limo: null, motivoLimo: "direcção em falta" }).estado, ESTADO_NOTA.ND);
  assert.match(praia({ potenciaMax: 1.0, limo: null, motivoLimo: "direcção em falta" }).motivo, /limo.*direcção em falta/);
  assert.equal(praia({ potenciaMax: 1.2, potenciaCompleta: false, limo: false }).estado, ESTADO_NOTA.ND);
});

test("dourada nas praias: água turva só conta com foz de ribeira (Almargem)", () => {
  const semFoz = praia({ potenciaMax: 1.0, limo: false, turva: true });
  assert.equal(semFoz.nota, 3, "Praia de Faro: a chuva não turva o mar de fora");
  assert.ok(!semFoz.parcelas.some(x => x.descricao === "água turva por chuva"));
  const foz = praia({ potenciaMax: 1.0, limo: false, turva: true }, { aguaDoce: true });
  assert.equal(foz.nota, 1);
  assert.match(foz.limite.descricao, /água turva/);
  assert.equal(praia({ potenciaMax: 1.0, limo: false, turva: null }, { aguaDoce: true }).estado, ESTADO_NOTA.ND);
  assert.equal(praia({ potenciaMax: 1.0, limo: false, turva: null }).estado, ESTADO_NOTA.OK, "sem foz, a chuva em falta não bloqueia");
});

test("análise: todas as praias com robalo e dourada; a Ria só com dourada", () => {
  const { dias } = analisarDias(entrada());
  const p = dias[0].pesqueiros;
  for (const id of ["praia_faro", "ancao", "almargem", "vilamoura", "falesia"]) {
    assert.deepEqual(Object.keys(p[id].notas).sort(), ["dourada", "robalo"], id);
    // P = 3,57 kW/m ≥ 1,5 → dourada 1 em todas.
    assert.equal(p[id].notas.dourada.nota, 1, id);
  }
  assert.deepEqual(Object.keys(p.ria.notas), ["dourada"]);
});
