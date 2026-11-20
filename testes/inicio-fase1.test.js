// Fase 1 da evolução (20/11/2026): ecrã inicial reorganizado. «Onde e quando» no topo, só com as notas
// do motor (sem outra classificação); alinhamento uma vez; «Mar agora» compacto. Sem rede.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { analisarDias } from "../js/regras/analise.js";
import { renderInicio, janelasDoDia, ondeQuando, ordemDosCartoes } from "../js/ui/inicio.js";
import { diasDoHorizonte, solDoDia } from "../js/dados.js";
import { pontosNecessarios } from "../js/pontos.js";
import { validateTides } from "../js/fontes/mares-locais.js";

const lerJson = rel => JSON.parse(readFileSync(new URL(`../${rel}`, import.meta.url), "utf8"));
const config = lerJson("config.json");
const SunCalc = createRequire(import.meta.url)("../vendor/suncalc.js");
const marine = lerJson("testes/reais/openmeteo_marine_faro_20261014_0946.json");
const forecast = lerJson("testes/reais/openmeteo_forecast_faro_20261014_0946.json");
const mares = validateTides(lerJson("mares/2026.json")).events;
const LIDO = "2026-10-14T09:46:00.000Z"; // 10:46 em Lisboa

function contexto(indice = 0, especie = "robalo") {
  const pts = pontosNecessarios(config);
  const ok = data => ({ ok: true, data, source: "teste", readAt: LIDO, error: null });
  const pontos = { mar: Object.fromEntries(pts.mar.map(k => [k, ok(marine)])), terra: Object.fromEntries(pts.terra.map(k => [k, ok(forecast)])) };
  const sol = solDoDia(SunCalc, config);
  const analise = analisarDias({ dias: diasDoHorizonte(new Date(LIDO), 7), pontos, mares, sol, config });
  return { analise, config, pontos, mares: { ok: true }, sol, lidoEm: LIDO, indice, especie };
}

test("«Onde e quando»: as notas do motor por pesqueiro e período, da maior para a menor; hoje sem os períodos que já acabaram", () => {
  const c = contexto(0);
  const d = c.analise.dias[0];
  const { janelas, hoje } = janelasDoDia(d, c, "robalo", { maximo: 99 });
  assert.equal(hoje, true);
  assert.ok(janelas.length > 0);
  // Cada janela é exactamente a nota que o motor calculou para esse pesqueiro e período.
  for (const j of janelas) {
    const per = d.pesqueiros[j.id].periodos.find(p => p.nome === j.periodo);
    assert.equal(j.n, per.notas.robalo, `${j.id} ${j.periodo}`);
    assert.equal(j.n.estado, "ok");
  }
  // 10:46 em Lisboa: a madrugada (00–06) já acabou e não entra; a manhã (06–12) ainda entra.
  assert.ok(!janelas.some(j => j.periodo === "madrugada"));
  for (let k = 1; k < janelas.length; k++) assert.ok(janelas[k - 1].n.nota >= janelas[k].n.nota, "ordem decrescente");
  // Noutro dia, a madrugada conta.
  const outro = janelasDoDia(c.analise.dias[2], contexto(2), "robalo", { maximo: 99 });
  assert.equal(outro.hoje, false);
  assert.ok(outro.janelas.some(j => j.periodo === "madrugada"));
});

// Dia sintético para o desempate (estrutura igual à do motor).
const nota = (n, extra = {}) => ({ estado: "ok", nota: n, completa: true, ...extra });
const per = (nome, robalo, dourada, alinhado = false) => ({ nome, notas: { robalo, dourada },
  alinhamento: { alinhado, alinhamentos: alinhado ? [{ tipo: "BM", reponto: Date.parse("2026-10-16T17:00:00Z"), evento: "pôr do Sol", minutos: 10 }] : [] } });
const cfgSint = { pesqueiros: { a: { nomeCurto: "A" }, b: { nomeCurto: "B" }, c: { nomeCurto: "C" } }, periodos: config.periodos };

test("«Onde e quando»: desempate pelo alinhamento, depois a outra espécie, o período mais cedo e a ordem dos pesqueiros", () => {
  const d = { dia: "2026-10-16", indice: 2, pesqueiros: {
    a: { periodos: [per("manhã", nota(4), nota(2)), per("tarde", nota(4), nota(3))] },
    // Como no motor: o alinhamento do dia fica também ao nível do pesqueiro.
    b: { periodos: [per("manhã", nota(4), nota(3)), per("tarde", nota(4), nota(2), true)], alinhamento: per("tarde", null, null, true).alinhamento },
    c: { periodos: [per("manhã", { estado: "n.d.", motivo: "potência não obtida" }, null), per("tarde", { estado: "por confirmar" }, null), per("noite", nota(5, { completa: false, intervalo: { min: 4, max: 5 } }), null)] }
  } };
  const r = janelasDoDia(d, { config: cfgSint, lidoEm: "2026-10-14T09:46:00Z" }, "robalo", { maximo: 4 });
  // 5 primeiro (mesmo incompleta); entre os 4: o B à tarde tem alinhamento; depois a dourada mais alta
  // (B manhã e A tarde, 3, antes de A manhã, 2); entre esses, o período mais cedo (manhã antes de tarde).
  assert.deepEqual(r.janelas.map(j => `${j.id} ${j.periodo}`), ["c noite", "b tarde", "b manhã", "a tarde"]);
  // n.d. e «por confirmar» não entram (ficam nos cartões); a nota incompleta entra, marcada.
  assert.ok(!r.janelas.some(j => j.n.estado !== "ok"));
  assert.equal(r.maisComMesmaNota, 0);
  const tres = janelasDoDia(d, { config: cfgSint, lidoEm: "2026-10-14T09:46:00Z" }, "robalo", { maximo: 2 });
  assert.deepEqual(tres.janelas.map(j => `${j.id} ${j.periodo}`), ["c noite", "b tarde"]);
  const html = ondeQuando({ dias: [{ ...d, amplitude: { amplitude: 1.8, classe: "morta" }, repontos: null, melhorRobalo: 5 }] }, 0,
    { config: cfgSint, lidoEm: "2026-10-14T09:46:00Z" }, "robalo");
  assert.match(html, /<li><b class="mini n5 inc">5<\/b><span><a href="#pq-c">C<\/a> · noite 18–24 h · incompleta \(pode ser 4 a 5\)<\/span><\/li>/);
  assert.match(html, /<a href="#pq-b">B<\/a> · tarde 12–18 h · Baixa-mar às \d\d:\d\d, a 10 min do pôr do Sol/);
  // O alinhamento só acontece no B: o topo diz em qual.
  assert.match(html, /<b>Alinhamento<\/b> Baixa-mar às \d\d:\d\d, a 10 min do pôr do Sol \(só em: B\)/);
});

test("«Onde e quando»: empates para lá das três primeiras são contados; sem notas, diz-o", () => {
  const d = { dia: "2026-10-16", indice: 2, pesqueiros: {
    a: { periodos: [per("manhã", nota(4), null), per("tarde", nota(4), null)] },
    b: { periodos: [per("manhã", nota(4), null), per("tarde", nota(4), null)] } } };
  const r = janelasDoDia(d, { config: cfgSint, lidoEm: "2026-10-14T09:46:00Z" }, "robalo");
  assert.equal(r.janelas.length, 3);
  assert.equal(r.maisComMesmaNota, 1);
  const vazio = { dia: "2026-10-14", indice: 0, pesqueiros: { a: { periodos: [per("madrugada", nota(5), null)] } },
    amplitude: { amplitude: null, motivo: "tabela incompleta" }, repontos: null };
  const html = ondeQuando({ dias: [vazio] }, 0, { config: cfgSint, lidoEm: "2026-10-14T09:46:00Z" }, "robalo");
  assert.match(html, /Sem notas para o resto de hoje\./);
});

test("início: «Onde e quando» antes de «Mar agora» e dos cartões; o alinhamento do dia aparece uma vez", () => {
  for (const indice of [0, 1, 2]) {
    const c = contexto(indice);
    const html = renderInicio(c);
    const iOQ = html.indexOf('<section class="onde-quando"'), iMar = html.indexOf('class="mar-agora"'), iCartoes = html.indexOf('<section class="cartoes"');
    assert.ok(iOQ > 0 && iOQ < iCartoes && (iMar < 0 || iOQ < iMar), `dia ${indice}`);
    const d = c.analise.dias[indice];
    const comAlinhamento = Object.values(d.pesqueiros).filter(p => p.alinhamento?.alinhamentos?.length).length;
    const vezes = (html.match(/<b>Alinhamento<\/b>/g) ?? []).length;
    if (comAlinhamento === Object.keys(d.pesqueiros).length) assert.equal(vezes, 1, `dia ${indice}: todos têm o mesmo alinhamento → uma vez`);
    else assert.ok(vezes <= 1 + comAlinhamento, `dia ${indice}`);
    // Cada janela leva ao cartão do pesqueiro.
    for (const m of html.matchAll(/<a href="#pq-([a-z_]+)">/g)) assert.ok(html.includes(`id="pq-${m[1]}"`), m[1]);
  }
});

test("início: a espécie escolhida muda «Onde e quando»", () => {
  const html = renderInicio(contexto(1, "dourada"));
  assert.match(html, /<h2>Onde e quando <small>· Amanhã · Dourada<\/small><\/h2>/);
});

test("início: com robalo, a Ria (sem nota de robalo) vai para o fim; com dourada, a ordem é a de sempre", () => {
  const c = contexto(0);
  const d = c.analise.dias[0];
  const geo = Object.keys(d.pesqueiros);
  assert.equal(geo[0], "ria");
  const robalo = ordemDosCartoes(d, "robalo").map(([id]) => id);
  assert.deepEqual(robalo, [...geo.filter(id => id !== "ria"), "ria"]);
  assert.deepEqual(ordemDosCartoes(d, "dourada").map(([id]) => id), geo);
  const html = renderInicio(c);
  assert.ok(html.indexOf('id="pq-ria"') > html.indexOf('id="pq-falesia"'), "Ria depois da Falésia no robalo");
  assert.equal((html.match(/<article class="cartao"/g) ?? []).length, geo.length, "nenhum cartão desaparece");
});

test("«Onde e quando»: minutos do alinhamento diferentes entre pesqueiros aparecem como intervalo", () => {
  const al = m => ({ alinhado: true, alinhamentos: [{ tipo: "PM", reponto: Date.parse("2026-10-16T17:08:00Z"), evento: "pôr do Sol", minutos: m }] });
  const d = { dia: "2026-10-16", indice: 2, amplitude: { amplitude: 1.4, classe: "morta" }, repontos: null, melhorRobalo: 4, pesqueiros: {
    a: { periodos: [per("noite", nota(4), null)], alinhamento: al(43) },
    b: { periodos: [per("noite", nota(4), null)], alinhamento: al(44) } } };
  const html = ondeQuando({ dias: [d] }, 0, { config: cfgSint, lidoEm: "2026-10-14T09:46:00Z" }, "robalo");
  assert.match(html, /<b>Alinhamento<\/b> Preia-mar às \d\d:08, a 43–44 min do pôr do Sol<\/div>/);
});
