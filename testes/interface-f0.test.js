// F0 da evolução da interface (22/11/2026): correcções sem mudar o motor nem os dados.
// - Cartões do início: hoje, a nota do dia (a do melhor período, regra aprovada) não aparece como actual
//   quando o período dela já acabou: diz «(já passou)» e o selo passa a ser a melhor nota dos períodos
//   que faltam (as mesmas notas do motor). Nos outros dias, nada muda.
// - Tabela horária na página do pesqueiro: o contentor que desliza não tem padding (a coluna fixa fica
//   encostada ao bordo; antes via-se à esquerda dela o que desliza por baixo).
// - Mapa: marcador próprio dos pesqueiros, entrada na legenda, rótulos dos fundos sem sobreposição.
// Os testes no browser (testes-browser/f0.e2e.mjs) verificam o que só se vê com o CSS e o Leaflet.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { analisarDias } from "../js/regras/analise.js";
import { validateTides } from "../js/fontes/mares-locais.js";
import { pontosNecessarios } from "../js/pontos.js";
import { limitesDiaLisboa, lisbonDate } from "../js/normalizacao.js";
import { renderInicio, restoDoDia, periodosPassados, notasDoCartao, linhaEspecie } from "../js/ui/inicio.js";
import { renderPesqueiro } from "../js/ui/pesqueiro.js";
import { textoNota } from "../js/ui/formato.js";

const ler = rel => JSON.parse(readFileSync(new URL(rel, import.meta.url), "utf8"));
const texto = rel => readFileSync(new URL(rel, import.meta.url), "utf8");
const SunCalc = createRequire(import.meta.url)("../vendor/suncalc.js");
const eventos = validateTides(ler("../mares/2026.json")).events;
const LIDO = "2026-10-14T09:46:00Z"; // 10:46 em Lisboa: a madrugada (00–06) já acabou

function contexto(agora = LIDO) {
  const config = ler("../config.json");
  const ok = (tipo, f) => ({ ok: true, data: ler(`./reais/openmeteo_${tipo}_${f}_20261014_0946.json`), source: "teste", readAt: LIDO });
  const ladoDe = k => (/Quarteira|ForteNovo/i.test(k) ? "quarteira" : "faro");
  const pts = pontosNecessarios(config);
  const pontos = {
    mar: Object.fromEntries(pts.mar.map(k => [k, ok("marine", ladoDe(k))])),
    terra: Object.fromEntries(pts.terra.map(k => [k, ok("forecast", ladoDe(k))]))
  };
  const dias = Array.from({ length: 7 }, (_, i) => lisbonDate(new Date("2026-10-14T12:00:00Z"), i));
  const sol = (dia, p) => {
    const t = SunCalc.getTimes(new Date(limitesDiaLisboa(dia).inicio + 12 * 3600000), config.locais[p].latitude, config.locais[p].longitude);
    return { nascer: t.sunrise.getTime(), por: t.sunset.getTime() };
  };
  const analise = analisarDias({ dias, mares: eventos, sol, config, pontos });
  return { analise, config, pontos, sol, lua: () => ({ fase: 0.5, fracao: 1 }), mares: { ok: true, data: eventos, anos: [2026] },
    lidoEm: LIDO, agora, indice: 0 };
}
const base = contexto();
const IDS = Object.keys(base.config.pesqueiros);
const cartaoDe = (html, id) => html.split(`id="pq-${id}"`)[1].split("</article>")[0];
const seloDe = cartao => /<div class="selo ([^"]*)"[^>]*>([^<]*)<\/div>/.exec(cartao);

// Períodos sintéticos com a estrutura do motor.
const nota = (n, extra = {}) => ({ estado: "ok", nota: n, completa: true, intervalo: { min: n, max: n }, parcelas: [], ...extra });
const per = (nome, robalo) => ({ nome, notas: { robalo } });
const PERIODOS = ["madrugada", "manhã", "tarde", "noite"];

test("restoDoDia: só quando o período da nota do dia já acabou; a melhor nota dos que faltam, sem outra classificação", () => {
  const p = { notas: { robalo: nota(3, { periodo: "madrugada" }) },
    periodos: [per("madrugada", nota(3)), per("manhã", nota(1)), per("tarde", nota(2)), per("noite", nota(2))] };
  assert.equal(restoDoDia(p, "robalo", []), null, "nada passou: fica a nota do dia");
  assert.equal(restoDoDia({ ...p, notas: { robalo: nota(3, { periodo: "tarde" }) } }, "robalo", ["madrugada"]), null, "o período da nota do dia ainda não acabou");
  const r = restoDoDia(p, "robalo", ["madrugada"]);
  assert.equal(r.passou, "madrugada");
  assert.equal(r.nota, 2);
  assert.deepEqual(r.periodos, ["tarde", "noite"], "os empatados vão todos, sem desempate inventado");
  assert.equal(r.completa, true);
  assert.equal(r.melhor, p.periodos[2].notas.robalo, "é o objecto do motor, não uma cópia recalculada");
});

test("restoDoDia: incompleta, pode subir, sem nota e por confirmar ditos; nunca um número inventado", () => {
  const p = { notas: { robalo: nota(4, { periodo: "madrugada" }) },
    periodos: [per("madrugada", nota(4)), per("manhã", nota(2, { completa: false, intervalo: { min: 2, max: 2 } })),
      per("tarde", nota(1, { completa: false, intervalo: { min: 1, max: 3 } })), per("noite", { estado: "n.d.", nota: null, motivo: "potência não obtida" })] };
  const r = restoDoDia(p, "robalo", ["madrugada"]);
  assert.equal(r.nota, 2);
  assert.equal(r.completa, false, "a melhor que falta é incompleta");
  assert.deepEqual(r.podeSubir, ["tarde"], "a tarde (1, pode ir até 3) pode passar o 2");
  assert.deepEqual(r.semNota, ["noite"]);
  const html = notasDoCartao(p, "robalo", ["madrugada"]);
  assert.match(html, /<b class="mini n2 inc">2<\/b>/);
  assert.match(html, /resto de hoje · manhã · incompleta · pode subir: tarde · sem nota: noite/);
  assert.match(html, /nota do dia 4 · madrugada \(já passou\)/);
  // Nenhum período que falta com nota: «—», nunca 0 nem a nota passada.
  const vazio = { notas: { robalo: nota(4, { periodo: "madrugada" }) },
    periodos: [per("madrugada", nota(4)), per("manhã", { estado: "por confirmar", nota: null, motivo: "mar de Sul" }), per("tarde", { estado: "n.d.", nota: null })] };
  const r2 = restoDoDia(vazio, "robalo", ["madrugada"]);
  assert.equal(r2.nota, null);
  const h2 = notasDoCartao(vazio, "robalo", ["madrugada"]);
  assert.match(h2, /<b class="mini nd">—<\/b>/);
  assert.match(h2, /resto de hoje sem nota \(manhã, tarde\)/);
  assert.doesNotMatch(h2, /class="mini n4/);
});

// Revisão de 22/11/2026: «pode subir» só com um limite superior numérico acima da melhor nota. Sem limite
// superior (intervalo ausente, nulo, sem max, max nulo, infinito ou não numérico) ou com limite igual à
// melhor nota (pode empatar), o período fica dito como «incompleta» e não se afirma que pode subir. Com
// limite abaixo da nota, não se diz nada.
test("restoDoDia: «pode subir» só com limite superior numérico acima da nota; sem limite, só «incompleta»", () => {
  const SEM_LIMITE = [["intervalo ausente", undefined], ["intervalo nulo", null], ["sem max", { min: 1 }],
    ["max nulo", { min: 1, max: null }], ["max infinito", { min: 1, max: Infinity }], ["max não numérico", { min: 1, max: "5" }],
    ["max NaN", { min: 1, max: NaN }]];
  for (const [caso, intervalo] of SEM_LIMITE) {
    const tarde = { estado: "ok", nota: 1, completa: false, parcelas: [] };
    if (intervalo !== undefined) tarde.intervalo = intervalo;
    const p = { notas: { robalo: nota(4, { periodo: "madrugada" }) },
      periodos: [per("madrugada", nota(4)), per("manhã", nota(2)), per("tarde", tarde), per("noite", nota(2))] };
    const r = restoDoDia(p, "robalo", ["madrugada"]);
    assert.equal(r.nota, 2, `${caso}: a melhor nota que falta é a do motor`);
    assert.deepEqual(r.podeSubir, [], `${caso}: sem limite superior, não se afirma que pode subir`);
    assert.deepEqual(r.incompletas, ["tarde"], `${caso}: a tarde continua dita como incompleta`);
    assert.equal(r.completa, true, `${caso}: a melhor (manhã e noite) é completa`);
    const html = notasDoCartao(p, "robalo", ["madrugada"]);
    assert.match(html, /resto de hoje · manhã, noite · completa · incompleta: tarde/, caso);
    assert.doesNotMatch(html, /pode subir/, caso);
  }
  // Limite numérico acima da nota: «pode subir». Igual (revisão final de 22/11/2026): pode empatar, não
  // passar — fica «incompleta», nunca «pode subir». Abaixo: nada (não pode chegar à melhor).
  const pComLimite = max => ({ notas: { robalo: nota(4, { periodo: "madrugada" }) },
    periodos: [per("madrugada", nota(4)), per("manhã", nota(2)), per("tarde", nota(1, { completa: false, intervalo: { min: 1, max } }))] });
  const com = max => restoDoDia(pComLimite(max), "robalo", ["madrugada"]);
  assert.deepEqual([com(3).podeSubir, com(3).incompletas], [["tarde"], []], "até 3 passa o 2: pode subir");
  assert.deepEqual([com(2).podeSubir, com(2).incompletas], [[], ["tarde"]], "até 2 pode igualar o 2, não passar: incompleta, não «pode subir»");
  assert.deepEqual([com(1).podeSubir, com(1).incompletas], [[], []], "até 1: nada");
  // O texto do cartão comunica a incompletude no caso de igualdade, sem «pode subir».
  const htmlIgual = notasDoCartao(pComLimite(2), "robalo", ["madrugada"]);
  assert.match(htmlIgual, /resto de hoje · manhã · completa · incompleta: tarde/, "igualdade: a tarde dita como incompleta");
  assert.doesNotMatch(htmlIgual, /pode subir/, "igualdade: nunca «pode subir»");
  assert.match(notasDoCartao(pComLimite(3), "robalo", ["madrugada"]), /resto de hoje · manhã · completa · pode subir: tarde/);
  assert.doesNotMatch(notasDoCartao(pComLimite(1), "robalo", ["madrugada"]), /pode subir|incompleta: tarde/, "abaixo: não se diz nada");
  // Sem nenhum período com nota, as listas vêm vazias (nunca undefined).
  const vazio = restoDoDia({ notas: { robalo: nota(4, { periodo: "madrugada" }) },
    periodos: [per("madrugada", nota(4)), per("manhã", { estado: "n.d.", nota: null })] }, "robalo", ["madrugada"]);
  assert.deepEqual([vazio.nota, vazio.podeSubir, vazio.incompletas, vazio.semNota], [null, [], [], ["manhã"]]);
  // O motor dá sempre um intervalo numérico às notas «ok» (o caso sem limite não acontece com os dados reais).
  for (const id of IDS) for (const d of base.analise.dias) for (const pr of d.pesqueiros[id].periodos ?? []) {
    for (const n of Object.values(pr.notas ?? {})) if (n?.estado === "ok") assert.ok(Number.isFinite(n.intervalo?.max), `${id} ${d.dia} ${pr.nome}`);
  }
});

test("cartões dos oito pesqueiros, às 10:46: nenhuma nota de um período que já acabou aparece como actual", () => {
  assert.equal(IDS.length, 8);
  const passados = periodosPassados(base.analise.dias[0].dia, base);
  assert.deepEqual(passados, ["madrugada"]);
  let comResto = 0;
  for (const especie of ["robalo", "dourada"]) {
    const html = renderInicio({ ...base, especie });
    for (const id of IDS) {
      const p = base.analise.dias[0].pesqueiros[id];
      const cartao = cartaoDe(html, id);
      const [, classeSelo, valorSelo] = seloDe(cartao);
      const n = p.notas[especie];
      if (!n) { assert.equal(valorSelo, "—", `${id} ${especie}: sem regra para a espécie`); continue; }
      // Calculado aqui à parte: a melhor nota dos períodos que não acabaram.
      const vivos = p.periodos.filter(x => !passados.includes(x.nome)).map(x => x.notas[especie]).filter(x => x?.estado === "ok");
      const maxVivo = vivos.length ? Math.max(...vivos.map(x => x.nota)) : null;
      if (n.estado === "ok" && passados.includes(n.periodo)) {
        comResto++;
        assert.equal(valorSelo, maxVivo === null ? "—" : String(maxVivo), `${id} ${especie}: selo = melhor do resto do dia`);
        assert.ok(cartao.includes(`nota do dia ${textoNota(n)} · ${n.periodo} (já passou)`), `${id} ${especie}: a nota do dia diz que já passou`);
        assert.match(cartao, /<li class="[^"]* passou" title="madrugada: [^"]*já passou"/, `${id} ${especie}: a madrugada a cinzento`);
      } else {
        assert.equal(valorSelo, n.estado === "ok" ? String(n.nota) : "—", `${id} ${especie}: selo = nota do dia`);
        const bloco = cartao.split(`data-especie="${especie}"`)[1].split("</div>")[0];
        assert.doesNotMatch(bloco, /já passou|resto de hoje/, `${id} ${especie}: sem «já passou» quando o período ainda não acabou`);
      }
      assert.doesNotMatch(classeSelo, /undefined|NaN/);
    }
  }
  assert.ok(comResto > 0, "o caso «nota do dia já passou» aparece nos dados reais às 10:46");
});

test("cartões: noutro dia e antes de o período acabar, a nota do dia fica como estava", () => {
  // Amanhã: nada passou.
  const amanha = renderInicio({ ...base, especie: "robalo", indice: 1 });
  assert.doesNotMatch(amanha, /já passou|resto de hoje/);
  for (const id of IDS) {
    const n = base.analise.dias[1].pesqueiros[id].notas.robalo;
    if (n?.estado === "ok") assert.equal(seloDe(cartaoDe(amanha, id))[2], String(n.nota), `${id}: amanhã, selo = nota do dia`);
  }
  // Hoje às 05:30 (madrugada ainda a decorrer): também nada passou.
  const cedo = contexto("2026-10-14T04:30:00Z");
  assert.deepEqual(periodosPassados(cedo.analise.dias[0].dia, cedo), []);
  assert.doesNotMatch(renderInicio({ ...cedo, especie: "robalo" }), /já passou|resto de hoje/);
});

test("linha de períodos e página do pesqueiro: os períodos que acabaram ficam a cinzento e a nota do dia diz «já passou»", () => {
  const p = { notas: { robalo: nota(3, { periodo: "madrugada" }) }, periodos: PERIODOS.map((x, i) => per(x, nota(i === 0 ? 3 : 1))) };
  const html = linhaEspecie("robalo", p.notas.robalo, p.periodos, { passados: ["madrugada"] });
  assert.match(html, /<span class="per">madrugada \(já passou\)<\/span>/);
  assert.equal((html.match(/<li class="[^"]* passou"/g) ?? []).length, 1);
  assert.doesNotMatch(linhaEspecie("robalo", p.notas.robalo, p.periodos), /passou/, "sem passados, como antes");
  // Página do pesqueiro (bloco «Notas por período») às 10:46: a madrugada a cinzento.
  for (const id of IDS) {
    const html = renderPesqueiro({ ...base, id, indice: 0 });
    const notas = html.split('aria-label="Notas"')[1].split("</section>")[0];
    for (const [esp, n] of Object.entries(base.analise.dias[0].pesqueiros[id].notas)) {
      if (n?.estado === "ok" && n.periodo === "madrugada") assert.match(notas, /madrugada \(já passou\)/, `${id} ${esp}`);
    }
    assert.match(notas, /title="madrugada: [^"]*já passou"/, `${id}: madrugada marcada`);
  }
});

test("tabela horária da página do pesqueiro: o contentor que desliza não tem padding (CSS)", () => {
  const css = texto("../css/app.css");
  const regra = /\.horas-pq \.tabela-horas \{([^}]*)\}/.exec(css)?.[1] ?? "";
  assert.match(regra, /padding:\s*0\s*;/, "sem padding: a coluna fixa fica encostada ao bordo");
  assert.match(css, /\.horas-pq \.tabela-horas th \{[^}]*padding-left:/, "o recuo passa para a coluna fixa");
});

test("mapa: marcador próprio dos pesqueiros, entrada na legenda e rótulos dos fundos arrumados (código)", () => {
  const js = texto("../js/mapa.js");
  assert.doesNotMatch(js, /fillColor: "#ef6c00"/, "já não é o círculo laranja parecido com o dos cabeços");
  assert.match(js, /L\.marker\(\[p\.latitude, p\.longitude\], \{ icon: iconePesqueiro\(\), title: pq\.nome/);
  assert.match(js, /leg-pino[^]*pesqueiro \(ponto da previsão do mar\)/);
  assert.match(js, /const ZOOM_ROTULOS = 12\.5;/);
  const css = texto("../css/app.css");
  assert.match(css, /\.rotulos-longe \.rotulo-forma, \.rotulo-forma\.rotulo-tapado \{ display: none; \}/);
  // O alfinete não usa as cores dos fundões (#1d4ed8) nem dos cabeços (#a16207).
  const pino = /\.pino-pq, \.leg-pino \{([^}]*)\}/.exec(css)?.[1] ?? "";
  assert.match(pino, /background: var\(--mar\)/);
});
