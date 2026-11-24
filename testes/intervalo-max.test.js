// Consistência do tratamento de intervalo.max (análise técnica de 23/11/2026, aprovada) em três funções:
// resumoComparacao (comparador), janelasDoPesqueiro (página do pesqueiro) e destaqueDoDia («Melhor
// oportunidade» do início). Uma nota incompleta abaixo da melhor só impede a conclusão definitiva se
// ainda a puder igualar ou passar (intervalo.max ≥ melhor) ou se o limite for desconhecido (intervalo
// ausente ou null, max ausente ou null: o comportamento prudente actual). Sem nota e «por confirmar»
// impedem sempre. Só testes: documentam o comportamento actual, sem o mudar. Ficam de fora os valores
// inválidos (NaN, Infinity, texto, outros tipos), tarefa futura de robustez, e o texto «pode ser … a …»
// das notas sem max, que também não é verificado aqui.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { analisarDias } from "../js/regras/analise.js";
import { validateTides } from "../js/fontes/mares-locais.js";
import { pontosNecessarios } from "../js/pontos.js";
import { limitesDiaLisboa, lisbonDate } from "../js/normalizacao.js";
import { resumoComparacao, renderComparador } from "../js/ui/comparador.js";
import { janelasDoPesqueiro } from "../js/ui/horario.js";
import { destaqueDoDia, renderInicio } from "../js/ui/inicio.js";
import { renderPesqueiro } from "../js/ui/pesqueiro.js";

const ler = rel => JSON.parse(readFileSync(new URL(rel, import.meta.url), "utf8"));
const LIDO = "2026-10-14T09:46:00Z"; // 10:46 em Lisboa

// Notas sintéticas com a estrutura do motor. A melhor nota é 3 (completa); o candidato tem 2, incompleta.
const AUSENTE = Symbol("intervalo ausente");
const ok = (nota, extra = {}) => ({ estado: "ok", nota, completa: true, intervalo: { min: nota, max: nota }, parcelas: [], ...extra });
const incompleta = intervalo => {
  const n = { estado: "ok", nota: 2, completa: false, parcelas: [] };
  if (intervalo !== AUSENTE) n.intervalo = intervalo;
  return n;
};
const semValor = (estado, motivo) => ({ estado, nota: null, completa: false, intervalo: null, parcelas: [], limite: null, naoAvaliadas: [], motivo });
const nd = () => semValor("n.d.", "potência não obtida");
const pc = () => semValor("por confirmar", "mar de Sul");

// igualar: o candidato ainda pode chegar à melhor nota (ou não se sabe) e impede a conclusão definitiva.
const CASOS = [
  { caso: "limite inferior (max 2 < 3)", intervalo: { min: 1, max: 2 }, igualar: false },
  { caso: "limite igual (max 3 = 3)", intervalo: { min: 2, max: 3 }, igualar: true },
  { caso: "limite superior (max 4 > 3)", intervalo: { min: 2, max: 4 }, igualar: true },
  { caso: "intervalo ausente", intervalo: AUSENTE, igualar: true },
  { caso: "intervalo: null", intervalo: null, igualar: true },
  { caso: "max ausente", intervalo: { min: 2 }, igualar: true },
  { caso: "max: null", intervalo: { min: 2, max: null }, igualar: true }
];

const per = (nome, robalo) => ({ nome, notas: { robalo }, alinhamento: { alinhado: false, alinhamentos: [] } });
const ctxS = { config: { pesqueiros: { a: { nomeCurto: "A" }, b: { nomeCurto: "B" } }, periodos: ler("../config.json").periodos }, lidoEm: LIDO, agora: LIDO };
const DIA = "2026-10-16"; // não é «hoje»: nenhum período passado
const dia = pesqueiros => ({ dia: DIA, pesqueiros, amplitude: { amplitude: 2.5, classe: "intermédia" } });
const linhas = (...ns) => ns.map((n, i) => ({ id: "abcdefgh"[i], nome: "ABCDEFGH"[i], n }));

// As três funções com o mesmo candidato (no mesmo dia e na mesma espécie).
function tres(candidato) {
  return {
    rc: resumoComparacao(linhas(ok(3), candidato)),
    jp: janelasDoPesqueiro({ periodos: [per("manhã", ok(3)), per("tarde", candidato)] }, { dia: DIA }, ctxS, "robalo"),
    dd: destaqueDoDia(dia({ a: { periodos: [per("manhã", ok(3))] }, b: { periodos: [per("tarde", candidato)] } }), ctxS, "robalo")
  };
}

test("intervalo.max: as três funções dão a mesma resposta; inferior não iguala; igual, superior e limite desconhecido impedem a conclusão definitiva", () => {
  for (const { caso, intervalo, igualar } of CASOS) {
    const { rc, jp, dd } = tres(incompleta(intervalo));
    // Comparador.
    assert.deepEqual(rc.noTopo.map(l => l.id), ["a"], caso);
    assert.equal(rc.empate, false, caso);
    assert.deepEqual(rc.podemIgualar.map(l => l.id), igualar ? ["b"] : [], `${caso}: comparador`);
    assert.equal(rc.definitivo, !igualar, `${caso}: comparador definitivo`);
    assert.equal(rc.parcial, true, `${caso}: há uma nota incompleta`);
    // Página do pesqueiro.
    assert.deepEqual(jp.melhor.map(x => x.nome), ["manhã"], caso);
    assert.deepEqual(jp.podemIgualar.map(x => x.nome), igualar ? ["tarde"] : [], `${caso}: página do pesqueiro`);
    assert.equal(jp.definitiva, !igualar, `${caso}: página do pesqueiro definitiva`);
    // Início.
    assert.deepEqual([dd.janela.id, dd.janela.periodo], ["a", "manhã"], caso);
    assert.deepEqual(dd.empate, [], caso);
    assert.deepEqual(dd.podemIgualar.map(x => x.id), igualar ? ["b"] : [], `${caso}: início`);
    assert.equal(dd.definitivo, !igualar, `${caso}: início definitivo`);
    // A mesma conclusão nos três ecrãs.
    assert.deepEqual([rc.definitivo, jp.definitiva, dd.definitivo], [!igualar, !igualar, !igualar], `${caso}: as três iguais`);
  }
});

test("intervalo.max: sem nota e «por confirmar» impedem sempre a conclusão definitiva, também ao lado de um limite inferior", () => {
  for (const [nome, falta] of [["sem nota", nd], ["por confirmar", pc]]) {
    const { rc, jp, dd } = tres(falta());
    assert.deepEqual(rc.podemIgualar.map(l => l.id), ["b"], `${nome}: comparador`);
    assert.equal(rc.definitivo, false, nome);
    assert.equal(rc.parcial, true, nome);
    assert.deepEqual((nome === "sem nota" ? rc.semNota : rc.porConfirmar).map(l => l.id), ["b"], nome);
    assert.deepEqual(jp.podemIgualar.map(x => x.nome), ["tarde"], `${nome}: página do pesqueiro`);
    assert.equal(jp.definitiva, false, nome);
    assert.deepEqual(dd.podemIgualar.map(x => x.id), ["b"], `${nome}: início`);
    assert.equal(dd.definitivo, false, nome);
    // Um candidato que não pode chegar à melhor (limite inferior) não torna definitiva a comparação se houver também
    // uma nota em falta.
    const inf = incompleta({ min: 1, max: 2 });
    const rc2 = resumoComparacao(linhas(ok(3), inf, falta()));
    assert.deepEqual(rc2.podemIgualar.map(l => l.id), ["c"], nome);
    assert.equal(rc2.definitivo, false, nome);
    const jp2 = janelasDoPesqueiro({ periodos: [per("manhã", ok(3)), per("tarde", inf), per("noite", falta())] }, { dia: DIA }, ctxS, "robalo");
    assert.deepEqual(jp2.podemIgualar.map(x => x.nome), ["noite"], nome);
    assert.equal(jp2.definitiva, false, nome);
    const dd2 = destaqueDoDia(dia({ a: { periodos: [per("manhã", ok(3))] }, b: { periodos: [per("tarde", inf), per("noite", falta())] } }), ctxS, "robalo");
    assert.deepEqual(dd2.podemIgualar.map(x => [x.id, x.periodo]), [["b", "noite"]], nome);
    assert.equal(dd2.definitivo, false, nome);
  }
});

test("intervalo.max: com a melhor nota incompleta nada é definitivo, mesmo sem candidatos (comparador e página do pesqueiro)", () => {
  const topoInc = ok(3, { completa: false, intervalo: { min: 3, max: 4 } });
  const rc = resumoComparacao(linhas(topoInc, ok(2)));
  assert.deepEqual(rc.podemIgualar, []);
  assert.equal(rc.definitivo, false);
  assert.equal(rc.parcial, true);
  const jp = janelasDoPesqueiro({ periodos: [per("manhã", topoInc), per("tarde", ok(2))] }, { dia: DIA }, ctxS, "robalo");
  assert.deepEqual(jp.podemIgualar, []);
  assert.equal(jp.definitiva, false);
});

// Textos desenhados: a análise real da fixture de 14/10/2026 (como nos outros testes), dia seguinte (15/10, nenhum
// período passado), robalo. Todas as notas de robalo desse dia passam a 1 completa; depois entra o cenário.
const SunCalc = createRequire(import.meta.url)("../vendor/suncalc.js");
const eventos = validateTides(ler("../mares/2026.json")).events;
function contexto() {
  const config = ler("../config.json");
  const okp = (tipo, f) => ({ ok: true, data: ler(`./reais/openmeteo_${tipo}_${f}_20261014_0946.json`), source: "teste", readAt: LIDO });
  const ladoDe = k => (/Quarteira|ForteNovo/i.test(k) ? "quarteira" : "faro");
  const pts = pontosNecessarios(config);
  const pontos = {
    mar: Object.fromEntries(pts.mar.map(k => [k, okp("marine", ladoDe(k))])),
    terra: Object.fromEntries(pts.terra.map(k => [k, okp("forecast", ladoDe(k))]))
  };
  const dias = Array.from({ length: 7 }, (_, i) => lisbonDate(new Date("2026-10-14T12:00:00Z"), i));
  const sol = (d, p) => {
    const t = SunCalc.getTimes(new Date(limitesDiaLisboa(d).inicio + 12 * 3600000), config.locais[p].latitude, config.locais[p].longitude);
    return { nascer: t.sunrise.getTime(), por: t.sunset.getTime() };
  };
  const analise = analisarDias({ dias, mares: eventos, sol, config, pontos });
  return { analise, config, pontos, sol, lua: () => ({ fase: 0.5, fracao: 1 }), mares: { ok: true, data: eventos, anos: [2026] },
    lidoEm: LIDO, agora: LIDO, indice: 1, especie: "robalo" };
}
const base = contexto();
const X = "almargem";
const Y = "ancao";
const nomeX = base.config.pesqueiros[X].nomeCurto ?? base.config.pesqueiros[X].nome;

// O dia 1 com todas as notas de robalo a 1 completa; aplicar(d) põe o cenário.
function cenario(aplicar) {
  const analise = structuredClone(base.analise);
  const d = analise.dias[1];
  for (const p of Object.values(d.pesqueiros)) {
    for (const pr of p.periodos ?? []) if (pr.notas?.robalo) pr.notas.robalo = ok(1);
    if (p.notas?.robalo) p.notas.robalo = { ...ok(1), periodo: "manhã" };
  }
  aplicar(d);
  return { ...base, analise };
}
const periodo = (d, id, nome) => d.pesqueiros[id].periodos.find(x => x.nome === nome);
const limpo = s => s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

// Início e página do pesqueiro: X manhã 3 completa e X tarde com o candidato.
function inicioEPesqueiro(candidato) {
  const c = cenario(d => {
    periodo(d, X, "manhã").notas.robalo = ok(3);
    periodo(d, X, "tarde").notas.robalo = candidato;
    d.pesqueiros[X].notas.robalo = { ...ok(3), periodo: "manhã" };
  });
  const ini = renderInicio(c);
  const destaque = /<section class="destaque"[^>]*data-estado="([a-z-]+)">[\s\S]*?<p class="destaque-estado e-[a-z-]+">([\s\S]*?)<\/p>/.exec(ini);
  const pq = renderPesqueiro({ ...c, id: X });
  const janela = /<div class="janela-esp" data-especie="robalo" data-estado="([a-z-]+)">[\s\S]*?<p class="destaque-estado e-[a-z-]+">([\s\S]*?)<\/p>/.exec(pq);
  assert.ok(destaque && janela, "o início e a página do pesqueiro desenham o estado");
  return { inicio: { estado: destaque[1], texto: limpo(destaque[2]) }, pesqueiro: { estado: janela[1], texto: limpo(janela[2]) } };
}

// Comparador, vista «tarde»: Y tarde 3 completa e X tarde com o candidato.
function comparador(candidato) {
  const c = cenario(d => {
    periodo(d, Y, "tarde").notas.robalo = ok(3);
    if (candidato) periodo(d, X, "tarde").notas.robalo = candidato;
  });
  const html = renderComparador({ ...c, vista: "tarde" });
  return limpo(html.split('aria-label="Resumo da comparação"')[1].split("</section>")[0]);
}

const PARCIAL_INICIO = "Comparação parcial: 1 período(s) incompletos, sem nota ou por confirmar podiam igualar esta nota.";
const PARCIAL_PESQUEIRO = "Comparação parcial: tarde (incompleto, sem nota ou por confirmar) podia igualar.";
const PARCIAL_COMPARADOR = "Comparação parcial: não dá para dizer qual é o melhor.";

test("intervalo.max nos textos: sem candidatos, o comparador, a página do pesqueiro e o início dizem que a nota é definitiva", () => {
  const r = inicioEPesqueiro(ok(1));
  assert.deepEqual(r.inicio, { estado: "definitiva", texto: "A nota mais alta do dia, completa e sem empate." });
  assert.deepEqual(r.pesqueiro, { estado: "definitiva", texto: "O período com a nota mais alta do dia, completa e sem empate." });
  const cmp = comparador(null);
  assert.match(cmp, /Todas as notas comparadas estão completas\./);
  assert.doesNotMatch(cmp, /Comparação parcial|nenhuma pode chegar/);
});

test("intervalo.max nos textos: um limite inferior não aparece como possibilidade de igualar; igual, superior e limite desconhecido dão «Comparação parcial»", () => {
  for (const { caso, intervalo, igualar } of CASOS) {
    const r = inicioEPesqueiro(incompleta(intervalo));
    const cmp = comparador(incompleta(intervalo));
    if (!igualar) {
      assert.deepEqual(r.inicio, { estado: "definitiva", texto: "A nota mais alta do dia, completa e sem empate." }, caso);
      assert.deepEqual(r.pesqueiro, { estado: "definitiva", texto: "O período com a nota mais alta do dia, completa e sem empate." }, caso);
      assert.match(cmp, /Há notas incompletas ou em falta, mas nenhuma pode chegar a 3\./, caso);
      assert.doesNotMatch(cmp, /Comparação parcial/, caso);
    } else {
      assert.deepEqual(r.inicio, { estado: "parcial", texto: PARCIAL_INICIO }, caso);
      assert.deepEqual(r.pesqueiro, { estado: "parcial", texto: PARCIAL_PESQUEIRO }, caso);
      assert.ok(cmp.includes(PARCIAL_COMPARADOR), `${caso}: ${cmp}`);
      assert.doesNotMatch(cmp, /nenhuma pode chegar/, `${caso}: o comparador não diz que nenhuma pode chegar`);
    }
    // A nota incompleta aparece sempre na lista do comparador (nunca escondida).
    assert.ok(cmp.includes(`Incompletas: ${nomeX}`), `${caso}: ${cmp}`);
  }
});

test("intervalo.max nos textos: sem nota e «por confirmar» dão «Comparação parcial» e aparecem nas listas do comparador", () => {
  for (const [nome, falta, lista] of [["sem nota", nd, `Sem nota: ${nomeX} (potência não obtida)`], ["por confirmar", pc, `Por confirmar: ${nomeX} (mar de Sul)`]]) {
    const r = inicioEPesqueiro(falta());
    assert.deepEqual(r.inicio, { estado: "parcial", texto: PARCIAL_INICIO }, nome);
    assert.deepEqual(r.pesqueiro, { estado: "parcial", texto: PARCIAL_PESQUEIRO }, nome);
    const cmp = comparador(falta());
    assert.ok(cmp.includes(PARCIAL_COMPARADOR), `${nome}: ${cmp}`);
    assert.doesNotMatch(cmp, /nenhuma pode chegar/, nome);
    assert.ok(cmp.includes(lista), `${nome}: ${cmp}`);
  }
});
