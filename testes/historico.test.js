// Histórico de previsões e validação pessoal (plano de evolução, PR 7): só horas que eram previsão
// quando foram lidas e que já chegaram; só grandezas comparáveis têm diferença (período e direcção
// nunca); falta de medição nunca é zero; distância entre a célula e a boia; não toca no motor.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { COMPARACOES, paresPrevisaoObservacao, resumoValidacao, serieDoPonto, observacoesDasLeituras, distanciaKm, saidasComPrevisao, GRUPOS_ANTECEDENCIA }
  from "../js/historico/validacao.js";
import { renderHistorico } from "../js/ui/historico.js";

const ler = rel => JSON.parse(readFileSync(new URL(rel, import.meta.url), "utf8"));
const config = ler("../config.json");
const PONTO = config.boias.faro.previsaoPonto;
const marine = ler("./reais/openmeteo_marine_faro_20261014_0946.json");
const T = iso => Date.parse(iso);
const obs = (iso, hm0, agua, { qc = "obtido", tm02 = 5.1, direcao = 250 } = {}) => ({ instante: T(iso),
  hm0: { valor: qc === "obtido" ? hm0 : null, estado: qc }, agua: { valor: agua, estado: "obtido" }, tm02: { valor: tm02, estado: "obtido" }, direcao: { valor: direcao, estado: "obtido" } });
const leitura = (lidoEm, observacoes = [], marOk = true) => ({ id: lidoEm, esquema: 1, lidoEm, resumo: { pontosObtidos: 16, pontos: 16, boia: true },
  fontes: { mar: { [PONTO]: marOk ? { ok: true, data: marine, readAt: lidoEm } : { ok: false, error: "HTTP 429" } }, terra: {},
    boiaFaro: { ok: true, data: { observacoes } } } });

const L1 = leitura("2026-10-14T08:46:00.000Z", [obs("2026-10-14T07:00:00Z", 1.2, 21.0)]);
const L2 = leitura("2026-10-14T20:00:00.000Z", [
  obs("2026-10-14T10:00:00Z", 1.10, 21.4), obs("2026-10-14T11:10:00Z", 1.0, 21.5),   // 11:10: a 10 min das 11:00
  obs("2026-10-14T12:20:00Z", 0.9, 21.5),                                            // 12:20: a 20 min das 12:00 (fora) e das 12:30 (não é hora certa)
  obs("2026-10-14T13:00:00Z", null, 21.6, { qc: "inválido" })                       // Hm0 com QC mau
]);
const AGORA = T("2026-10-14T14:00:00Z");

test("comparações: só a altura da onda e a água; período (wave_period ≠ Tm02) e direcção (média ≠ pico) nunca", () => {
  assert.deepEqual(COMPARACOES.filter(c => c.comparavel).map(c => c.campo), ["hs", "agua"]);
  assert.deepEqual(COMPARACOES.filter(c => !c.comparavel).map(c => c.campo), ["periodo", "direcao"]);
  for (const c of COMPARACOES) assert.equal(typeof c.nota, "string");
});

test("pares: só horas depois da leitura e que já chegaram; os past_days da leitura não contam", () => {
  const pares = paresPrevisaoObservacao([L1, L2], PONTO, { agora: AGORA });
  assert.ok(pares.length > 0);
  for (const p of pares) {
    assert.ok(p.valido > Date.parse(p.lidoEm), "hora válida depois da leitura");
    assert.ok(p.valido <= AGORA, "já aconteceu");
  }
  assert.ok(pares.every(p => p.lidoEm === L1.lidoEm), "a L2 foi lida depois das 14:00: nenhuma hora dela já chegou");
  assert.deepEqual(pares.map(p => new Date(p.valido).toISOString().slice(11, 16)), ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00"]);
  const p10 = pares.find(p => new Date(p.valido).toISOString().slice(11, 16) === "10:00");
  assert.equal(p10.antecedenciaH, (T("2026-10-14T10:00:00Z") - T(L1.lidoEm)) / 3600000);
  assert.equal(p10.valores.hs.observado, 1.10);
  assert.equal(p10.valores.hs.diferenca, p10.valores.hs.previsto - 1.10);
  assert.equal(p10.valores.periodo.diferenca, null, "período nunca comparado");
  assert.equal(p10.valores.periodo.observado, 5.1, "mas aparece lado a lado");
  assert.equal(p10.valores.direcao.diferenca, null);
});

test("pares: medição a ±15 min; sem medição ou com QC mau, o observado e a diferença ficam null (nunca zero)", () => {
  const pares = paresPrevisaoObservacao([L1, L2], PONTO, { agora: AGORA });
  const a = h => pares.find(p => new Date(p.valido).toISOString().slice(11, 16) === h);
  assert.equal(a("11:00").valores.hs.observado, 1.0, "11:10 conta para as 11:00");
  assert.equal(a("12:00").medicao, null, "12:20 está fora da tolerância");
  assert.deepEqual(a("12:00").valores.hs, { previsto: a("12:00").valores.hs.previsto, observado: null, diferenca: null });
  assert.equal(a("13:00").valores.hs.observado, null, "QC mau");
  assert.equal(a("13:00").valores.agua.observado, 21.6, "a água da mesma medição é boa");
  assert.equal(a("14:00").medicao, null);
  // Leitura com o ponto não obtido: sem pares, com o motivo.
  assert.match(serieDoPonto(leitura("2026-10-14T08:00:00.000Z", [], false), PONTO).motivo, /não obtido \(HTTP 429\)/);
  assert.deepEqual(paresPrevisaoObservacao([leitura("2026-10-14T08:00:00.000Z", [], false)], PONTO, { agora: AGORA }), []);
});

test("observações: as medições de todas as leituras juntam-se sem repetir", () => {
  const dup = leitura("2026-10-14T21:00:00.000Z", [obs("2026-10-14T10:00:00Z", 1.10, 21.4)]);
  assert.equal(observacoesDasLeituras([L1, L2, dup]).length, 5);
});

test("resumo por antecedência: n, diferença média e absoluta; grupos sem pares com null (nunca zero)", () => {
  const pares = paresPrevisaoObservacao([L1, L2], PONTO, { agora: AGORA });
  const r = resumoValidacao(pares);
  assert.deepEqual(r.map(g => g.nome), GRUPOS_ANTECEDENCIA.map(g => g.nome));
  const ate24 = r[0].porCampo.hs;
  const difs = pares.map(p => p.valores.hs.diferenca).filter(v => v !== null);
  assert.equal(ate24.n, difs.length);
  assert.equal(ate24.n, 2, "10:00 e 11:00");
  assert.ok(Math.abs(ate24.media - difs.reduce((a, b) => a + b, 0) / 2) < 1e-9);
  assert.ok(Math.abs(ate24.mediaAbs - difs.reduce((a, b) => a + Math.abs(b), 0) / 2) < 1e-9);
  assert.equal(ate24.semMedicao, 4, "09:00, 12:00, 13:00 (QC) e 14:00");
  assert.deepEqual(r[1].porCampo.hs, { n: 0, media: null, mediaAbs: null, semMedicao: 0, semPrevisao: 0 });
  assert.equal(r[0].porCampo.agua.n, 3, "a água das 13:00 conta");
});

test("localização: a célula do Open-Meteo fica a ~14 km da boia (nunca se trata a boia como o pesqueiro)", () => {
  const { celula } = serieDoPonto(L1, PONTO);
  assert.deepEqual(celula, { lat: 36.958336, lon: -7.9583282 });
  const d = distanciaKm(celula, { lat: 36.9048, lon: -7.8984 });
  assert.ok(d > 7 && d < 9, `${d} km`);
  assert.equal(distanciaKm(null, { lat: 1, lon: 1 }), null);
});

test("saídas do diário: previsão à hora mais perto do início e a boia guardada; sem condições, o motivo", () => {
  const s = { id: "s1", inicio: "2026-10-14T09:10:00.000Z", pesqueiro: "praia_faro", resultado: "sem capturas", capturas: [] };
  const c = { saidaId: "s1", disponivel: true, leitura: { lidoEm: L1.lidoEm, relacao: "antes" },
    horas: [{ instante: T("2026-10-14T09:00:00Z"), hs: 1.1 }, { instante: T("2026-10-14T10:00:00Z"), hs: 1.2 }], boia: { instante: T("2026-10-14T09:00:00Z"), hm0: 1.05 }, periodos: [] };
  const [x] = saidasComPrevisao([s], new Map([["s1", c]]));
  assert.deepEqual([x.hsPrevista, x.boia.hm0, x.relacao], [1.1, 1.05, "antes"]);
  const [y] = saidasComPrevisao([{ ...s, id: "s2" }], new Map());
  assert.equal(y.motivo, "sem condições guardadas");
});

test("ecrã: previsão ≠ observação, distância, «sem medição», período sem diferença; vazio e sem armazenamento", () => {
  const pares = paresPrevisaoObservacao([L1, L2], PONTO, { agora: AGORA });
  const html = renderHistorico({ config, armazem: { ok: true }, agora: new Date(AGORA).toISOString(), leituras: [L2, L1], pares, resumo: resumoValidacao(pares),
    celula: serieDoPonto(L1, PONTO).celula, distanciaKm: 8.2, saidas: [] });
  assert.match(html, /Previsão arquivada ≠ observação/);
  assert.match(html, /a <b>8 km<\/b> da boia/);
  assert.match(html, /Vale para a zona da boia, não para cada pesqueiro/);
  assert.match(html, /sem medição/);
  assert.match(html, /<th>wave_period \(s\)<\/th><th>Tm02 \(s\)<\/th><\/tr>/, "período lado a lado, sem coluna de diferença");
  assert.match(html, /Período: o wave_period do Open-Meteo não se identifica como Tm02/);
  assert.doesNotMatch(html, /NaN|undefined/);
  assert.match(renderHistorico({ config, armazem: { ok: true }, agora: new Date(AGORA).toISOString(), leituras: [], pares: [], resumo: [], saidas: [] }),
    /Ainda não há previsões guardadas neste aparelho/);
  assert.match(renderHistorico({ config, armazem: { ok: false, erro: "x" }, agora: "" }), /Sem histórico neste aparelho/);
});
