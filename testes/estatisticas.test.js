// Estatísticas pessoais (plano de evolução, PR 6): só do diário; n em cada valor; «sem registos» nunca
// é zero capturas; filtros; meses do meio sem saídas; períodos pela hora de Lisboa (qualquer fuso);
// amostra pequena; sem previsões nem causas.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { filtrar, resumo, porPesqueiro, porEspecie, porPeriodo, porMes, estatisticas, limitesPeriodo, AMOSTRA_PEQUENA } from "../js/diario/estatisticas.js";
import { renderEstatisticas } from "../js/ui/estatisticas.js";
import { validarSaida, listarSaidas } from "../js/diario/saidas.js";
import { armazemMemoria } from "../js/armazenamento/armazem-memoria.js";

const config = JSON.parse(readFileSync(new URL("../config.json", import.meta.url), "utf8"));
let k = 0;
const S = (inicio, pesqueiro, capturas = [], extra = {}) => ({
  id: `s-${++k}`, esquema: 1, pesqueiro, inicio, fim: extra.fim ?? null, especiesAlvo: extra.alvo ?? ["robalo"], outraAlvo: extra.outraAlvo ?? null,
  resultado: capturas.length ? "com capturas" : "sem capturas", capturas: capturas.map(([especie, quantidade, tamanhoCm = null, outra = null]) => ({ especie, quantidade, tamanhoCm, outra, observacoes: "" })),
  observacoes: "", criadoEm: inicio, alteradoEm: inicio, condicoesId: null
});
const saidas = [
  S("2026-07-10T05:00:00.000Z", "ancao", [["robalo", 2, 45]], { fim: "2026-07-10T08:00:00.000Z" }),       // 06:00 Lisboa → manhã (começa às 06)
  S("2026-07-12T17:30:00.000Z", "ancao"),                                                                    // 18:30 → noite
  S("2026-09-03T06:00:00.000Z", "molhe_quarteira", [["dourada", 1, 31], ["robalo", 1, 52]], { alvo: ["robalo", "dourada"], fim: "2026-09-03T09:00:00.000Z" }),
  S("2026-10-25T00:30:00.000Z", "ria", [["dourada", 3, null], ["outra", 2, 22, "Sargo"]], { alvo: ["dourada"] }), // 01:30 Lisboa (hora repetida) → madrugada
  S("2026-10-14T11:00:00.000Z", "praia_faro", [], { alvo: ["outra"], outraAlvo: "sargo" })                  // 12:00 → tarde
];

test("os registos de teste são saídas válidas do diário", () => {
  for (const s of saidas) assert.deepEqual(validarSaida(s).erros, [], s.id);
});

test("resumo: n, com e sem capturas, proporção, capturas por saída, horas só com fim; vazio → null, nunca 0", () => {
  const r = resumo(saidas);
  assert.deepEqual([r.n, r.comCapturas, r.semCapturas, r.capturas, r.nComHoras, r.horas], [5, 3, 2, 9, 2, 6]);
  assert.equal(r.proporcaoComCapturas, 0.6);
  assert.equal(r.capturasPorSaida, 1.8);
  assert.equal(r.pequena, true);
  const v = resumo([]);
  assert.deepEqual([v.n, v.proporcaoComCapturas, v.capturas, v.capturasPorSaida, v.horas], [0, null, null, null, null]);
});

test("por pesqueiro: os oito aparecem; sem saídas = «sem registos» (não zero)", () => {
  const p = porPesqueiro(saidas, config);
  assert.equal(p.length, 8);
  const ancao = p.find(x => x.id === "ancao");
  assert.deepEqual([ancao.n, ancao.comCapturas, ancao.capturas], [2, 1, 2]);
  const falesia = p.find(x => x.id === "falesia");
  assert.deepEqual(falesia, { id: "falesia", nome: config.pesqueiros.falesia.nome, n: 0, semRegistos: true });
  assert.equal(falesia.capturas, undefined, "nenhum «0 capturas» inventado");
  // Pesqueiro de uma cópia antiga, fora do config: aparece à parte.
  assert.match(porPesqueiro([S("2026-07-10T05:00:00.000Z", "antigo")], config).at(-1).nome, /fora da configuração/);
});

test("por espécie: alvo, apanhada, quantidade e tamanhos (com o seu n); «outra» pelo nome", () => {
  const e = Object.fromEntries(porEspecie(saidas).map(x => [x.nome, x]));
  assert.deepEqual([e.robalo.saidasComAlvo, e.robalo.saidasComCaptura, e.robalo.quantidade], [3, 2, 3]);
  assert.deepEqual(e.robalo.tamanhos, { n: 2, min: 45, mediana: 48.5, max: 52 });
  assert.deepEqual([e.dourada.saidasComAlvo, e.dourada.quantidade, e.dourada.tamanhos.n], [2, 4, 1]);
  // «Sargo» apanhado na Ria e «sargo» procurado na Praia de Faro são a mesma espécie (sem distinguir maiúsculas).
  assert.deepEqual([e.Sargo.saidasComAlvo, e.Sargo.saidasComCaptura, e.Sargo.quantidade], [1, 1, 2]);
  assert.equal(e.sargo, undefined);
  // Procurado e não apanhado: 0 em N saídas com registo (não «sem registos»).
  const so = porEspecie([saidas[4]])[0];
  assert.deepEqual([so.nome, so.saidasComAlvo, so.saidasComCaptura, so.quantidade], ["sargo", 1, 0, 0]);
});

test("por período: pela hora de início em Lisboa (Verão, hora repetida de 25/10); períodos sem saídas ficam «sem registos»", () => {
  const p = Object.fromEntries(porPeriodo(saidas, config).map(x => [x.nome, x]));
  assert.deepEqual([p.madrugada.n, p["manhã"].n, p.tarde.n, p.noite.n], [1, 2, 1, 1]);
  assert.equal(porPeriodo([saidas[0]], config).find(x => x.nome === "tarde").semRegistos, true);
});

test("por mês: do primeiro ao último, com os meses do meio sem saídas marcados (não zero)", () => {
  const m = porMes(saidas);
  assert.deepEqual(m.map(x => [x.mes, x.n]), [["2026-07", 2], ["2026-08", 0], ["2026-09", 1], ["2026-10", 2]]);
  assert.equal(m[1].semRegistos, true);
  assert.equal(m[1].capturas, undefined);
  assert.deepEqual(porMes([]), []);
  // 31/10 às 23:30 UTC já é 31/10 em Lisboa (Inverno); 30/06 às 23:30 UTC é 01/07 em Lisboa (Verão).
  assert.deepEqual(porMes([S("2026-06-30T23:30:00.000Z", "ria")]).map(x => x.mes), ["2026-07"]);
});

test("filtros: período (dias de Lisboa), pesqueiro e espécie (só conta as capturas dessa espécie)", () => {
  const agora = new Date("2026-10-26T12:00:00Z");
  assert.deepEqual(limitesPeriodo({ periodo: "30d" }, agora), { desde: "2026-09-27", ate: "2026-10-26" });
  assert.deepEqual(limitesPeriodo({ periodo: "ano" }, agora), { desde: "2026-01-01", ate: "2026-10-26" });
  assert.deepEqual(limitesPeriodo({ periodo: "intervalo", desde: "2026-09-01", ate: "" }, agora), { desde: "2026-09-01", ate: null });
  assert.deepEqual(filtrar(saidas, { periodo: "30d" }, agora).map(s => s.id), [saidas[3].id, saidas[4].id]);
  assert.deepEqual(filtrar(saidas, { pesqueiro: "ancao" }).map(s => s.id), [saidas[0].id, saidas[1].id]);
  const dourada = filtrar(saidas, { especie: "dourada" });
  assert.deepEqual(dourada.map(s => s.id), [saidas[2].id, saidas[3].id]);
  assert.deepEqual(dourada[0].capturas.map(c => c.especie), ["dourada"], "o robalo da mesma saída não conta");
  assert.equal(resumo(dourada).capturas, 4);
  assert.equal(filtrar(saidas, { periodo: "intervalo", desde: "2026-07-11", ate: "2026-07-12" }).length, 1);
});

test("ecrã: n em cada valor, amostra pequena, «sem registos» e nenhuma conclusão causal", () => {
  const html = renderEstatisticas({ config, armazem: { ok: true }, stats: estatisticas(saidas, config), filtros: {} });
  assert.match(html, /n = 5 saída\(s\)/);
  assert.match(html, /amostra pequena/);
  assert.match(html, /3 de 5 \(60 %\)/);
  assert.match(html, /<td title="amostra pequena: não tirar conclusões">2\*<\/td><td>1\/2 \(50 %\)/, "Ancão: n = 2 com «*»");
  assert.match(html, /sem saídas registadas \(não é zero capturas\)/);
  assert.ok(html.includes(`<tr class="sem"><th>${config.pesqueiros.falesia.nomeCurto}</th><td>0</td><td colspan="3">sem registos`));
  assert.match(html, /45,0 · <b>48,5<\/b> · 52,0 <small>\(mín\. · mediana · máx\.; n = 2\)/);
  assert.match(html, /não uma previsão: não diz porque é que se apanhou mais ou menos peixe/);
  assert.doesNotMatch(html, /melhor pesqueiro|recomend|previsão de|deve pescar|NaN|undefined/i);
  const vazio = renderEstatisticas({ config, armazem: { ok: true }, stats: estatisticas([], config), filtros: {} });
  assert.match(vazio, /Ainda não há saídas no diário/);
  const filtrado = renderEstatisticas({ config, armazem: { ok: true }, stats: estatisticas(saidas, config, { pesqueiro: "falesia" }), filtros: { pesqueiro: "falesia" } });
  assert.match(filtrado, /Nenhuma saída com estes filtros\. Não quer dizer zero capturas/);
  assert.match(renderEstatisticas({ config, armazem: { ok: false, erro: "x" } }), /Sem diário neste aparelho/);
  // Com 10 ou mais saídas, sem aviso de amostra pequena no resumo.
  const muitas = Array.from({ length: AMOSTRA_PEQUENA }, (_, i) => S(`2026-08-${String(i + 1).padStart(2, "0")}T06:00:00.000Z`, "ancao"));
  const h2 = html_ => html_.split('aria-label="Resumo"><h2>')[1].split("</h2>")[0];
  assert.match(h2(html), /amostra pequena/);
  assert.doesNotMatch(h2(renderEstatisticas({ config, armazem: { ok: true }, stats: estatisticas(muitas, config, { pesqueiro: "ancao" }), filtros: {} })), /amostra pequena/);
});

// Registos do diário que não passam na validação (revisão do PR #30, 22/11/2026): não entram nas contas e
// o ecrã diz quantos são, como o diário, também quando não há nenhuma saída válida.
test("registos inválidos: ficam fora das contas e o ecrã diz quantos são, também sem nenhuma saída válida", async () => {
  const validas = saidas.slice(0, 3);
  const estragadas = [
    { ...S("2026-07-11T06:00:00.000Z", "ancao", [["robalo", 5, 60]]), inicio: "2026-02-30T06:00:00.000Z" },   // 30/02 não existe
    { ...S("2026-07-11T06:00:00.000Z", "falesia", [["robalo", 4, 50]]), esquema: 99 }                          // esquema desconhecido
  ];
  for (const r of estragadas) assert.equal(validarSaida(r).ok, false, r.id);
  const avisoDe = n => `<p class="falha">${n} registo(s) com formato inválido não entram nas estatísticas.</p>`;

  // Válidas e inválidas juntas: as contas são as das válidas, e o aviso tem a contagem certa.
  const a = armazemMemoria();
  await a.escrever({ guardar: { diario: [...validas, ...estragadas] } });
  const lidas = await listarSaidas(a);
  assert.deepEqual([lidas.saidas.length, lidas.invalidas], [3, 2]);
  const stats = estatisticas(lidas.saidas, config);
  assert.deepEqual(stats, estatisticas(validas, config), "as contas são exactamente as das saídas válidas");
  assert.deepEqual([stats.total, stats.resumo.n, stats.resumo.capturas], [3, 3, 4]);
  const html = renderEstatisticas({ config, armazem: { ok: true }, stats, filtros: {}, invalidas: lidas.invalidas });
  assert.ok(html.includes(avisoDe(2)));
  assert.match(html, /n = 3 saída\(s\)/);
  assert.match(html, /<dt>Capturas<\/dt><dd>4 /);
  assert.ok(html.includes(`<tr class="sem"><th>${config.pesqueiros.falesia.nomeCurto}</th><td>0</td><td colspan="3">sem registos`), "a saída inválida da Falésia não conta");
  // Com um filtro sem resultados, o aviso continua.
  const filtrado = renderEstatisticas({ config, armazem: { ok: true }, stats: estatisticas(lidas.saidas, config, { pesqueiro: "falesia" }), filtros: { pesqueiro: "falesia" }, invalidas: lidas.invalidas });
  assert.ok(filtrado.includes(avisoDe(2)));
  assert.match(filtrado, /Nenhuma saída com estes filtros/);

  // Só registos inválidos: o aviso aparece e não há estatísticas nem «Ainda não há saídas».
  const b = armazemMemoria();
  await b.escrever({ guardar: { diario: estragadas } });
  const soInvalidas = await listarSaidas(b);
  assert.deepEqual([soInvalidas.saidas.length, soInvalidas.invalidas], [0, 2]);
  const htmlInv = renderEstatisticas({ config, armazem: { ok: true }, stats: estatisticas(soInvalidas.saidas, config), filtros: {}, invalidas: soInvalidas.invalidas });
  assert.ok(htmlInv.includes(avisoDe(2)));
  assert.match(htmlInv, /Não há saídas válidas no diário: sem registos válidos, não há estatísticas\./);
  assert.doesNotMatch(htmlInv, /Ainda não há saídas no diário|aria-label="Resumo"|tabela-stats|n = \d|id="filtros"/);

  // Nenhum registo, válido ou inválido: igual ao que era (sem aviso).
  const c = armazemMemoria();
  const nada = await listarSaidas(c);
  assert.deepEqual([nada.saidas.length, nada.invalidas], [0, 0]);
  const htmlVazio = renderEstatisticas({ config, armazem: { ok: true }, stats: estatisticas(nada.saidas, config), filtros: {}, invalidas: nada.invalidas });
  assert.equal(htmlVazio, renderEstatisticas({ config, armazem: { ok: true }, stats: estatisticas([], config), filtros: {} }));
  assert.match(htmlVazio, /Ainda não há saídas no diário: sem registos, não há estatísticas\./);
  assert.doesNotMatch(htmlVazio, /formato inválido/);
  // Sem armazenamento, nada muda.
  assert.doesNotMatch(renderEstatisticas({ config, armazem: { ok: false, erro: "x" }, invalidas: 3 }), /formato inválido/);
});
