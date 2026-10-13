// Fase 3 — motor de regras: fronteiras, falhas das fontes e dados incompletos.
// Dados sintéticos de teste; não são previsões reais.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { limitesDiaLisboa } from "../js/normalizacao.js";
import { marMexido, limoDaHora, limoDoDia } from "../js/regras/limo.js";
import { ladoDaHora, ladosDoDia, LADO, AVISO_LIMO_DERIVA } from "../js/regras/molhe.js";
import { pressaoDoDia } from "../js/regras/pressao.js";
import { aguaDoDia } from "../js/regras/agua.js";
import { alinhamentosDoDia } from "../js/regras/alinhamento.js";
import { anomaliasDoDia, CONFIRMAR } from "../js/regras/anomalias.js";
import { aguaTurvaDoDia, CHUVA_PENDENTE } from "../js/regras/chuva.js";
import { amplitudeDoDia, repontosDoDia, CLASSE_MARE } from "../js/regras/mares.js";
import { notaRobalo, notaDouradaRia, notaDouradaMolhe, ordenarMelhoresDias, ESTADO_NOTA } from "../js/regras/notas.js";
import { analisarDias } from "../js/regras/analise.js";
import { horasOpenMeteo } from "../js/regras/serie.js";

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

test("rajada: 3× não assinala, acima de 3× assinala; vento 0 com rajada → inconsistente", () => {
  const h = ([v, g]) => ({ instante: 0, wind_speed_10m: v, wind_gusts_10m: g });
  assert.equal(anomaliasDoDia([h([10, 30])], config.anomalias).assinalar, false);
  const r = anomaliasDoDia([h([10, 30.1])], config.anomalias);
  assert.equal(r.assinalar, true);
  assert.equal(r.mensagem, CONFIRMAR);
  const z = anomaliasDoDia([h([0, 5])], config.anomalias);
  assert.equal(z.assinalar, true);
  assert.equal(z.inconsistentes.length, 1);
  assert.equal(anomaliasDoDia([h([0, 0])]).assinalar, false);
  assert.equal(anomaliasDoDia([h([null, 5])]).horasSemDados, 1);
});

// ---------- Chuva (regra 8, pendente) ----------

test("chuva: enquanto pendente nunca devolve 'sem água turva'", () => {
  const r = aguaTurvaDoDia([], "2026-10-20", config.chuva);
  assert.equal(config.chuva.pendenteAprovacao, true);
  assert.equal(r.turva, null);
  assert.equal(r.motivo, CHUVA_PENDENTE);
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
  descidaPressao: false, altaEstavel: false, aguaAfasta: false, turva: false, potenciaMax: 1.2, limo: false
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

test("robalo no molhe com P ≥ 1,5 e limo: regra não definida → n.d.", () => {
  const r = robalo({ potenciaMax: 2, limo: true }, { tipo: "molhe" });
  assert.equal(r.estado, ESTADO_NOTA.ND);
  assert.match(r.motivo, /regra não definida/);
  assert.equal(robalo({ potenciaMax: 2, limo: false }, { tipo: "molhe" }).nota, 4);
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

test("dourada Ria: sem amplitude → n.d.; chuva pendente → parcela não avaliada", () => {
  assert.equal(ria({ classeMare: null }).estado, ESTADO_NOTA.ND);
  const r = ria({ turva: null, motivoChuva: CHUVA_PENDENTE });
  assert.equal(r.nota, 4);
  assert.ok(r.naoAvaliadas.includes("água turva por chuva"));
});

const molhe = f => notaDouradaMolhe({ ...base, ...f }, config.pontuacao, config.mar);

test("dourada molhe: P 1,49 viável; 1,50 → 1; água turva → 1", () => {
  assert.equal(molhe({ potenciaMax: 1.49 }).nota, 3);
  assert.equal(molhe({ potenciaMax: 1.5 }).nota, 1);
  assert.equal(molhe({ potenciaMax: 0.5, turva: true }).nota, 1);
});

test("dourada molhe: limite por verificar (chuva pendente ou P em falta) → n.d.", () => {
  assert.equal(molhe({ turva: null, motivoChuva: CHUVA_PENDENTE }).estado, ESTADO_NOTA.ND);
  assert.equal(molhe({ potenciaMax: null }).estado, ESTADO_NOTA.ND);
  // P ≥ 1,5 já decide 1, mesmo com a chuva pendente.
  assert.equal(molhe({ potenciaMax: 2, turva: null }).nota, 1);
});

// ---------- Melhores dias ----------

test("melhores dias: nota máxima, depois alinhamento, depois a outra espécie, depois o mais próximo", () => {
  const d = (indice, r, g, alinhado = false) => ({ dia: `d${indice}`, indice, melhorRobalo: r, melhorDourada: g, alinhado });
  const ord = ordenarMelhoresDias([d(0, 3, 3), d(1, 4, 2), d(2, 4, 2, true), d(3, 4, 3), d(4, null, null), d(5, 4, 3)]);
  assert.deepEqual(ord.map(x => x.dia), ["d2", "d3", "d5", "d1", "d0", "d4"]);
});

// ---------- Análise completa: falhas das fontes ----------

function entrada({ faroMarOk = true, mares = TABELA } = {}) {
  const dias = ["2026-10-20"];
  const anteriores = ["2026-10-13", "2026-10-19"];
  const todos = [...anteriores, ...dias];
  const marJson = serie(todos, () => mar(0.9, 300, 9));
  const terraJson = serie(todos, () => terra(8, 330, 12, 1012));
  const ok = data => ({ ok: true, data, source: "teste", readAt: "2026-10-20T06:00:00.000Z" });
  return {
    dias,
    pontos: {
      faroMar: faroMarOk ? ok(marJson) : { ok: false, data: null, error: "HTTP 500", source: "teste" },
      faroTerra: ok(terraJson), quarteiraMar: ok(marJson), quarteiraTerra: ok(terraJson)
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
  assert.deepEqual(d.pesqueiros.almargem.pontos, { mar: "quarteiraMar", terra: "quarteiraTerra", agua: null });
  assert.deepEqual(melhoresDias, ["2026-10-20"]);
});

test("análise: sem regra de segurança — bicos e molhe têm nota como as praias", () => {
  const { dias } = analisarDias(entrada());
  const p = dias[0].pesqueiros;
  assert.equal(dias[0].seguranca, undefined);
  for (const id of ["bicos_faro", "bico_ancao"]) {
    assert.equal(p[id].notas.robalo.estado, ESTADO_NOTA.OK, id);
    assert.equal(p[id].notas.robalo.nota, p.praia_faro.notas.robalo.nota, id);
  }
  assert.equal(p.molhe_quarteira.notas.robalo.estado, ESTADO_NOTA.OK);
  assert.ok(Object.values(p).every(x => !x.avisos.some(a => /segurança|desaconselh/i.test(a))));
});

test("análise: Faro mar em falta → robalo n.d. em Faro/Ancão, sem usar Quarteira em silêncio", () => {
  const { dias } = analisarDias(entrada({ faroMarOk: false }));
  const p = dias[0].pesqueiros;
  for (const id of ["praia_faro", "ancao"]) {
    assert.equal(p[id].notas.robalo.estado, ESTADO_NOTA.ND, id);
    assert.equal(p[id].pontos.mar, "faroMar");
  }
  assert.equal(p.almargem.notas.robalo.estado, ESTADO_NOTA.OK, "Quarteira não é afectada");
});

test("análise: sem tabela de marés → dourada Ria n.d. e alinhamento indeterminado", () => {
  const { dias } = analisarDias(entrada({ mares: null }));
  const ria = dias[0].pesqueiros.ria;
  assert.equal(ria.notas.dourada.estado, ESTADO_NOTA.ND);
  assert.equal(ria.alinhamento.alinhado, null);
  assert.ok(ria.notas.dourada.motivo.includes("amplitude não obtida"));
});

test("análise: a dourada no molhe fica n.d. enquanto a regra da chuva estiver pendente", () => {
  const { dias } = analisarDias(entrada());
  const n = dias[0].pesqueiros.molhe_quarteira.notas.dourada;
  // P = 3,57 ≥ 1,5 → o limite da potência já decide 1, sem precisar da chuva.
  assert.equal(n.nota, 1);
  assert.ok(dias[0].pesqueiros.molhe_quarteira.avisos.includes(CHUVA_PENDENTE));
});
