// Comparador (plano de evolução, PR 2): só mostra as notas do motor, sem as mudar nem criar outra
// classificação; valores em falta nunca viram zero; notas incompletas nunca aparecem como definitivas.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { analisarDias } from "../js/regras/analise.js";
import { validateTides } from "../js/fontes/mares-locais.js";
import { pontosNecessarios } from "../js/pontos.js";
import { limitesDiaLisboa, lisbonDate } from "../js/normalizacao.js";
import { linhasComparador, ordenarLinhas, resumoComparacao, periodosPassados, estadoDaNota, porque,
  celulasFactores, renderComparador, vistas } from "../js/ui/comparador.js";

const ler = rel => JSON.parse(readFileSync(new URL(rel, import.meta.url), "utf8"));
const config = ler("../config.json");
const SunCalc = createRequire(import.meta.url)("../vendor/suncalc.js");
const marees = validateTides(ler("../mares/2026.json")).events;
const IDS = Object.keys(config.pesqueiros);

// Os dados reais de 14/10/2026 (como em testes/reais.test.js); falhar: quais fontes falham.
function cenario({ falharMar = false, falharTerra = false, semMares = false } = {}) {
  const ok = (tipo, f) => ({ ok: true, data: ler(`./reais/openmeteo_${tipo}_${f}_20261014_0946.json`), source: "teste", readAt: "2026-10-14T08:46:00Z" });
  const falha = { ok: false, data: null, source: "teste", readAt: "2026-10-14T08:46:00Z", error: "HTTP 429" };
  const ladoDe = k => (/Quarteira|ForteNovo/i.test(k) ? "quarteira" : "faro");
  const pts = pontosNecessarios(config);
  const pontos = {
    mar: Object.fromEntries(pts.mar.map(k => [k, falharMar ? falha : ok("marine", ladoDe(k))])),
    terra: Object.fromEntries(pts.terra.map(k => [k, falharTerra ? falha : ok("forecast", ladoDe(k))]))
  };
  const dias = Array.from({ length: 7 }, (_, i) => lisbonDate(new Date("2026-10-14T12:00:00Z"), i));
  const sol = (dia, p) => {
    const t = SunCalc.getTimes(new Date(limitesDiaLisboa(dia).inicio + 12 * 3600000), config.locais[p].latitude, config.locais[p].longitude);
    return { nascer: t.sunrise.getTime(), por: t.sunset.getTime() };
  };
  const analise = analisarDias({ dias, mares: semMares ? null : marees, sol, config, pontos });
  return { analise, config, pontos, sol, mares: semMares ? { ok: false, error: "não obtido" } : { ok: true, anos: [2026] },
    lidoEm: "2026-10-14T08:46:00Z" };
}
const completo = cenario();

test("comparador: os oito pesqueiros, em cada dia, espécie e período, com a nota exacta do motor", () => {
  for (const [i, d] of completo.analise.dias.entries()) {
    for (const esp of ["robalo", "dourada"]) {
      for (const vista of vistas(config)) {
        const linhas = linhasComparador(d, completo, esp, vista);
        assert.deepEqual(linhas.map(l => l.id), IDS, `${d.dia} ${esp} ${vista}`);
        for (const l of linhas) {
          const p = d.pesqueiros[l.id];
          const doMotor = vista === "dia" ? p.notas[esp] : p.periodos.find(x => x.nome === vista).notas[esp];
          assert.equal(l.n, doMotor ?? null, `${i} ${esp} ${vista} ${l.id}: a mesma nota (o mesmo objecto) do motor`);
        }
      }
    }
  }
});

test("comparador: não altera a análise do motor", () => {
  const antes = JSON.stringify(completo.analise);
  for (let indice = 0; indice < 7; indice++) for (const especie of ["robalo", "dourada"]) for (const vista of vistas(config)) {
    for (const ordem of ["pesqueiros", "nota"]) renderComparador({ ...completo, indice, especie, vista, ordem });
  }
  assert.equal(JSON.stringify(completo.analise), antes);
});

test("comparador: a Ria não tem robalo («não se aplica») e fica no fim, nas duas ordens (como no ecrã inicial)", () => {
  const d = completo.analise.dias[1];
  const linhas = linhasComparador(d, completo, "robalo", "dia");
  const ria = linhas.find(l => l.id === "ria");
  assert.equal(ria.n, null);
  assert.equal(ria.estado, "não se aplica");
  assert.equal(ordenarLinhas(linhas, "nota").at(-1).id, "ria");
  assert.deepEqual(ordenarLinhas(linhas, "pesqueiros").map(l => l.id), [...IDS.filter(id => id !== "ria"), "ria"]);
  assert.deepEqual(ordenarLinhas(linhasComparador(d, completo, "dourada", "dia"), "pesqueiros").map(l => l.id), IDS,
    "na dourada todos têm regra: a ordem do config");
  assert.deepEqual(resumoComparacao(linhas).naoSeAplica.map(l => l.id), ["ria"]);
});

test("comparador: ordem «por nota» = nota e, em empate, os critérios de «Onde e quando»", () => {
  const L = (id, ordem, nota, extra = {}) => ({ id, ordem, nome: id, n: { estado: "ok", nota, completa: true, intervalo: { min: nota, max: nota } },
    alinhado: false, outra: -1, k: 1, ...extra });
  const linhas = [
    L("a", 0, 4), L("b", 1, 4, { alinhado: true }), L("c", 2, 4, { outra: 3 }), L("d", 3, 4, { k: 0 }),
    L("e", 4, 5), { id: "f", ordem: 5, nome: "f", n: { estado: "n.d.", motivo: "potência não obtida" } },
    { id: "g", ordem: 6, nome: "g", n: { estado: "por confirmar", motivo: "mar de Sul" } }, { id: "h", ordem: 7, nome: "h", n: null }
  ];
  assert.deepEqual(ordenarLinhas(linhas, "nota").map(l => l.id), ["e", "b", "c", "d", "a", "g", "f", "h"]);
  assert.deepEqual(ordenarLinhas([...linhas].reverse(), "pesqueiros").map(l => l.id), ["a", "b", "c", "d", "e", "f", "g", "h"],
    "nascente → poente; n.d. e «por confirmar» no seu lugar, só «não se aplica» (h) no fim");
});

test("comparador: empate no topo assinalado; nunca «definitivo» com empate", () => {
  const linhas = linhasComparador(completo.analise.dias[1], completo, "robalo", "dia");
  const r = resumoComparacao(linhas);
  assert.equal(r.topo, 5);
  assert.deepEqual(r.noTopo.map(l => l.id), ["molhe_quarteira", "molhe_vilamoura"]);
  assert.equal(r.empate, true);
  assert.equal(r.definitivo, false);
  const html = renderComparador({ ...completo, indice: 1, especie: "robalo" });
  assert.match(html, /Nota mais alta: Molhe de Quarteira e Molhe de Vilamoura \(empate\)/);
});

test("comparador: com uma só nota mais alta, completa, e nenhuma que a possa igualar, a comparação é definitiva", () => {
  const r = resumoComparacao(linhasComparador(completo.analise.dias[1], completo, "dourada", "dia"));
  assert.deepEqual(r.noTopo.map(l => l.id), ["ria"]);
  assert.equal(r.definitivo, true);
  assert.equal(r.parcial, false);
});

test("comparador: notas incompletas nunca aparecem como definitivas (pressão não obtida)", () => {
  const c = cenario({ falharTerra: true });
  let vistas_ = 0;
  for (const [indice, d] of c.analise.dias.entries()) for (const esp of ["robalo", "dourada"]) {
    const linhas = linhasComparador(d, c, esp, "dia");
    for (const l of linhas) if (l.n) assert.equal(l.estado, estadoDaNota(l.n));
    const r = resumoComparacao(linhas);
    if (!r.parcial) continue;
    vistas_++;
    assert.ok(r.incompletas.length + r.semNota.length + r.porConfirmar.length > 0);
    if (r.noTopo.some(l => !l.n.completa)) assert.equal(r.definitivo, false, `${d.dia} ${esp}: topo incompleto`);
    const html = renderComparador({ ...c, indice, especie: esp });
    if (!r.definitivo) assert.match(html, /Comparação parcial:/);
    for (const l of r.incompletas) assert.match(html, new RegExp(`id="cmp-${l.id}" data-estado="incompleta"`));
  }
  assert.ok(vistas_ > 0, "o cenário sem Forecast dá notas incompletas ou sem nota");
  // O motivo do que falta aparece na linha «porquê» ou no estado.
  const l = linhasComparador(c.analise.dias[0], c, "dourada", "dia").find(x => x.estado === "incompleta" || x.estado === "sem nota");
  assert.ok(l, "há pelo menos uma nota de dourada incompleta ou sem nota");
  assert.ok(l.porque.some(t => /por avaliar|sem nota/.test(t)), l.porque.join(" | "));
});

test("comparador: sem dados, nenhum pesqueiro tem nota e nada aparece como zero", () => {
  const c = cenario({ falharMar: true, falharTerra: true, semMares: true });
  for (const esp of ["robalo", "dourada"]) {
    const linhas = linhasComparador(c.analise.dias[0], c, esp, "dia");
    assert.equal(linhas.length, 8);
    assert.ok(linhas.every(l => l.n === null || l.n.estado !== "ok"), "nenhuma nota «ok» sem dados");
    const r = resumoComparacao(linhas);
    assert.equal(r.topo, null);
    for (const l of linhas.filter(x => x.n)) {
      assert.ok(celulasFactores(l, esp).every(v => !/^0([,.]0+)?$/.test(v)), `${l.id}: ${celulasFactores(l, esp)}`);
    }
    const html = renderComparador({ ...c, especie: esp });
    assert.match(html, /Nenhum pesqueiro tem nota/);
    assert.doesNotMatch(html, /class="nota n\d/, "nenhuma nota numérica");
    assert.doesNotMatch(html, />0<small>\/5|NaN|undefined/);
    assert.match(html, /não obtidos — HTTP 429/, "as fontes em falta aparecem com o erro");
  }
});

test("comparador: «porquê» com as parcelas aplicadas, as por avaliar e o limite", () => {
  const n = { estado: "ok", nota: 1, completa: false, intervalo: { min: 1, max: 1 },
    parcelas: [{ descricao: "base: P ≥ 1,5 kW/m", peso: 4, estado: "aplicada" }, { descricao: "alinhamento reponto/Sol", peso: 1, estado: "aplicada" },
      { descricao: "descida de pressão ≥ 5 hPa/24 h", peso: 1, estado: "não avaliada", motivo: "pressão não obtida" },
      { descricao: "pressão alta e estável", peso: -1, estado: "não aplicada" }],
    limite: { descricao: "limo (Levante/Sudeste com mar mexido)", valor: 1 } };
  assert.deepEqual(porque(n), ["base 4 (P ≥ 1,5 kW/m)", "+1 alinhamento reponto/Sol",
    "descida de pressão ≥ 5 hPa/24 h: por avaliar (pressão não obtida)", "limite: limo (Levante/Sudeste com mar mexido) → 1"]);
  assert.deepEqual(porque({ estado: "n.d.", motivo: "potência não obtida" }), ["sem nota: potência não obtida"]);
  assert.deepEqual(porque(null), []);
});

test("comparador: escolher um período mostra a nota desse período e marca-o", () => {
  const d = completo.analise.dias[1];
  for (const vista of vistas(config).slice(1)) {
    const html = renderComparador({ ...completo, indice: 1, especie: "robalo", vista });
    const lq = linhasComparador(d, completo, "robalo", vista).find(l => l.id === "molhe_quarteira");
    assert.equal(lq.periodo, vista);
    assert.equal(lq.n, d.pesqueiros.molhe_quarteira.periodos.find(p => p.nome === vista).notas.robalo);
    assert.match(html, new RegExp(`class="[^"]*\\bsel\\b[^"]*" title="${vista}:`), vista);
  }
});

test("comparador: a nota do dia diz quando o seu período já passou (hoje)", () => {
  const html = renderComparador({ ...completo, lidoEm: "2026-10-14T11:30:00Z", indice: 0, especie: "robalo" });
  const l = linhasComparador(completo.analise.dias[0], completo, "robalo", "dia").find(x => x.periodo === "madrugada" && x.n?.estado === "ok");
  assert.ok(l, "há um pesqueiro com a nota do dia na madrugada");
  const doPesqueiro = html.split('<li class="linha-comp"').find(s => s.includes(`id="cmp-${l.id}"`));
  assert.match(doPesqueiro, /madrugada \(já passou\)/);
  assert.doesNotMatch(renderComparador({ ...completo, lidoEm: "2026-10-14T11:30:00Z", indice: 1 }), /já passou/, "amanhã nada passou");
});

test("comparador: dia escolhido e dias fora do horizonte", () => {
  for (let i = 0; i < 7; i++) {
    const html = renderComparador({ ...completo, indice: i });
    assert.match(html, new RegExp(`data-dia="${i}" aria-pressed="true"`));
  }
  assert.match(renderComparador({ ...completo, indice: 99 }), /data-dia="6" aria-pressed="true"/);
  assert.match(renderComparador({ ...completo, indice: -3 }), /data-dia="0" aria-pressed="true"/);
  assert.match(renderComparador({ ...completo, vista: "inexistente", especie: "atum", ordem: "?" }), /Robalo <small>· o dia/);
});

test("comparador: períodos já passados só hoje e pela hora de Portugal continental (qualquer fuso do aparelho)", () => {
  const c = d => ({ config, lidoEm: d });
  // 14/10 (hora de Verão, UTC+1): 11:30 UTC = 12:30 em Lisboa → madrugada e manhã já passaram.
  assert.deepEqual(periodosPassados("2026-10-14", c("2026-10-14T11:30:00Z")), ["madrugada", "manhã"]);
  assert.deepEqual(periodosPassados("2026-10-14", c("2026-10-14T10:59:00Z")), ["madrugada"]);
  assert.deepEqual(periodosPassados("2026-10-15", c("2026-10-14T23:30:00Z")), [], "00:30 de 15/10 em Lisboa: nada passou");
  assert.deepEqual(periodosPassados("2026-10-14", c("2026-10-14T23:30:00Z")), [], "já é outro dia em Lisboa");
  // 25/10 (muda a hora às 02:00 → 01:00): 06:00 UTC = 06:00 em Lisboa (UTC+0) → madrugada passou.
  assert.deepEqual(periodosPassados("2026-10-25", c("2026-10-25T06:00:00Z")), ["madrugada"]);
  assert.deepEqual(periodosPassados("2026-10-25", c("2026-10-25T05:30:00Z")), []);
  // Inverno (UTC+0): 18:00 UTC = 18:00 em Lisboa.
  assert.deepEqual(periodosPassados("2026-12-01", c("2026-12-01T18:00:00Z")), ["madrugada", "manhã", "tarde"]);
  assert.deepEqual(periodosPassados("2026-12-01", c(null)), []);
});

test("comparador: factores com «?» quando faltam, nunca zero", () => {
  const c = cenario({ falharTerra: true });
  const l = linhasComparador(c.analise.dias[0], c, "dourada", "dia").find(x => x.id === "almargem");
  const cel = celulasFactores(l, "dourada");
  assert.equal(cel.length, 7);
  assert.equal(cel[3], "?", "descida de pressão: Forecast não obtido → por verificar");
  assert.equal(cel[4], "?", "pressão alta e estável: Forecast não obtido → por verificar");
  assert.ok(cel.every(v => !/^0([,.]0+)?$/.test(v)), cel.join(" "));
  const ria = linhasComparador(completo.analise.dias[0], completo, "dourada", "dia").find(x => x.id === "ria");
  assert.equal(celulasFactores(ria, "dourada")[1], "—", "a Ria não tem limo");
});
