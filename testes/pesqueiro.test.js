// Página do pesqueiro (plano de evolução, PR 4): gerada do config para os oito pesqueiros (e para um
// pesqueiro novo sem mudar código), com as notas do motor, «hora a hora», marés, fundo, factores,
// fontes e avisos; reutiliza os componentes do início.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { analisarDias } from "../js/regras/analise.js";
import { validateTides } from "../js/fontes/mares-locais.js";
import { pontosNecessarios } from "../js/pontos.js";
import { limitesDiaLisboa, lisbonDate } from "../js/normalizacao.js";
import { renderPesqueiro, pontosDoPesqueiro, urlPesqueiro } from "../js/ui/pesqueiro.js";
import { renderInicio } from "../js/ui/inicio.js";
import { renderComparador } from "../js/ui/comparador.js";
import { textoNota } from "../js/ui/formato.js";

const ler = rel => JSON.parse(readFileSync(new URL(rel, import.meta.url), "utf8"));
const SunCalc = createRequire(import.meta.url)("../vendor/suncalc.js");
const eventos = validateTides(ler("../mares/2026.json")).events;

function contexto(config = ler("../config.json"), { falharMar = false } = {}) {
  const ok = (tipo, f) => ({ ok: true, data: ler(`./reais/openmeteo_${tipo}_${f}_20261014_0946.json`), source: "teste", readAt: "2026-10-14T08:46:00Z" });
  const falha = { ok: false, data: null, source: "teste", readAt: "2026-10-14T08:46:00Z", error: "HTTP 429" };
  const ladoDe = k => (/Quarteira|ForteNovo/i.test(k) ? "quarteira" : "faro");
  const pts = pontosNecessarios(config);
  const pontos = {
    mar: Object.fromEntries(pts.mar.map(k => [k, falharMar ? falha : ok("marine", ladoDe(k))])),
    terra: Object.fromEntries(pts.terra.map(k => [k, ok("forecast", ladoDe(k))]))
  };
  const dias = Array.from({ length: 7 }, (_, i) => lisbonDate(new Date("2026-10-14T12:00:00Z"), i));
  const sol = (dia, p) => {
    const t = SunCalc.getTimes(new Date(limitesDiaLisboa(dia).inicio + 12 * 3600000), config.locais[p].latitude, config.locais[p].longitude);
    return { nascer: t.sunrise.getTime(), por: t.sunset.getTime() };
  };
  const lua = () => ({ fase: 0.5, fracao: 1 });
  const analise = analisarDias({ dias, mares: eventos, sol, config, pontos });
  return { analise, config, pontos, sol, lua, mares: { ok: true, data: eventos, anos: [2026] }, lidoEm: "2026-10-14T08:46:00Z" };
}
const base = contexto();
const IDS = Object.keys(base.config.pesqueiros);

test("página: os oito pesqueiros, em cada dia, com o nome, as notas do motor por espécie e período, e sem valores estragados", () => {
  assert.equal(IDS.length, 8);
  for (const id of IDS) {
    const pq = base.config.pesqueiros[id];
    for (let indice = 0; indice < 7; indice++) {
      const html = renderPesqueiro({ ...base, id, indice });
      const p = base.analise.dias[indice].pesqueiros[id];
      assert.ok(html.includes(`<h1>${pq.nome}</h1>`), id);
      for (const esp of pq.especies) {
        const n = p.notas[esp];
        assert.ok(new RegExp(`class="nota [^"]*">${textoNota(n).replace(/[.?]/g, "\\$&")}`).test(html), `${id} ${indice} ${esp}`);
        for (const per of p.periodos) assert.ok(html.includes(`title="${per.nome}: `), `${id}: período ${per.nome}`);
      }
      assert.match(html, /<section class="bloco-pq horas-pq"[\s\S]*<div class="tabela-horas">/, "hora a hora");
      assert.match(html, /preia-mar \d\d:\d\d/, "marés por extenso");
      assert.match(html, /<h4>Fontes<\/h4>/);
      assert.doesNotMatch(html, /undefined|NaN|\[object/, `${id} ${indice}`);
    }
  }
});

test("página: localização com os pontos de dados do config; a Ria diz que o ponto é aproximado", () => {
  const ria = renderPesqueiro({ ...base, id: "ria" });
  assert.match(ria, /vento, pressão e chuva<\/dt><dd>lat\. 37,01000 · long\. −7,93000 <small>· ponto aproximado/);
  assert.match(ria, /temperatura da água<\/dt>/);
  assert.match(ria, /mapa\.html\?pesqueiro=ria/);
  const falesia = pontosDoPesqueiro(base.config.pesqueiros.falesia, base.config);
  assert.deepEqual(falesia.map(x => [x.chave, x.papeis]), [["falesiaAlfamar", ["vento, pressão e chuva"]],
    ["falesiaMar", ["ondulação e potência", "temperatura da água"]]]);
  assert.match(renderPesqueiro({ ...base, id: "almargem" }), /Ponto de pesca escolhido pelo utilizador \(Forte Novo/);
});

test("página: fundo típico nas praias (quando há), câmaras, estações e ligação ao comparador", () => {
  const fundoTipico = { ok: true, data: ler("../fundos/tipico.json") };
  const html = renderPesqueiro({ ...base, id: "almargem", fundoTipico });
  assert.match(html, /Fundo a 100\/150\/200 m/);
  assert.match(html, /Fundo típico/);
  assert.match(html, /Câmaras: <a /);
  assert.match(html, /Vento agora \(Windguru\)/);
  assert.match(html, /comparador\.html\?dia=0/);
  assert.doesNotMatch(renderPesqueiro({ ...base, id: "molhe_quarteira", fundoTipico }), /Fundo a 100\/150\/200 m/, "nos molhes não há fundo típico");
});

test("página: dados em falta aparecem como tal (n.d., não obtidos), nunca como zero", () => {
  const c = contexto(undefined, { falharMar: true });
  const html = renderPesqueiro({ ...c, id: "ancao" });
  assert.match(html, /Ondulação e potência \(Open-Meteo Marine\) não obtidos — HTTP 429/);
  assert.match(html, /class="nota nd">n\.d\./);
  assert.match(html, /Potência máx\.<\/dt><dd>não obtida/);
});

test("página: pesqueiro desconhecido ou sem id → lista dos pesqueiros, com ligações", () => {
  for (const id of ["naoExiste", ""]) {
    const html = renderPesqueiro({ ...base, id });
    assert.match(html, /Pesqueiro não encontrado/);
    assert.equal((html.match(/pesqueiro\.html\?id=/g) ?? []).length, 8);
  }
  assert.match(renderPesqueiro({ ...base, id: "<b>" }), /«&lt;b&gt;» não está na configuração/);
});

test("página: um pesqueiro novo no config tem página sem mudar código", () => {
  const config = ler("../config.json");
  config.pesqueiros.teste_novo = { ...config.pesqueiros.ancao, nome: "Pesqueiro de teste", nomeCurto: "Teste", foto: null, camaras: [], estacoes: [] };
  const c = contexto(config);
  const html = renderPesqueiro({ ...c, id: "teste_novo" });
  assert.match(html, /<h1>Pesqueiro de teste<\/h1>/);
  assert.equal((html.match(/pesqueiro\.html\?id=/g) ?? []).length, 9, "a lista dos outros pesqueiros também o tem");
  assert.deepEqual(c.analise.dias[0].pesqueiros.teste_novo.notas, c.analise.dias[0].pesqueiros.ancao.notas,
    "o mesmo ponto e o mesmo tipo dão as mesmas notas (o motor não mudou)");
});

test("página: dia fora do horizonte fica no primeiro ou no último; previsão arquivada também é avisada aqui", () => {
  assert.match(renderPesqueiro({ ...base, id: "ria", indice: 42 }), /data-dia="6" aria-pressed="true"/);
  const arquivo = { ...base, agora: "2026-10-14T11:46:00Z", origem: { tipo: "arquivo", lidoEm: base.lidoEm } };
  assert.match(renderPesqueiro({ ...arquivo, id: "ria" }), /Previsão arquivada — não é a previsão actual/);
});

test("ligações: o início e o comparador levam à página do pesqueiro, no dia escolhido", () => {
  assert.equal(urlPesqueiro("ria", 0), "./pesqueiro.html?id=ria");
  assert.equal(urlPesqueiro("praia_faro", 3), "./pesqueiro.html?id=praia_faro&dia=3");
  const inicio = renderInicio({ ...base, indice: 2 });
  for (const id of IDS) assert.ok(inicio.includes(`href="./pesqueiro.html?id=${id}&dia=2"`), id);
  const comp = renderComparador({ ...base, indice: 1, especie: "dourada" });
  for (const id of IDS) assert.ok(comp.includes(`href="./pesqueiro.html?id=${id}&dia=1"`), id);
});
