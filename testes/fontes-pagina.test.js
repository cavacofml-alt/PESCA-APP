// Fase 1 (20/11/2026): página «Fontes» para o utilizador, separada do diagnóstico técnico; barra de
// navegação igual nos quatro ecrãs; o estado do mar do IPMA deixa de ser consultado.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { renderFontes, creditosFotos } from "../js/ui/fontes.js";

const ler = rel => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");
const config = JSON.parse(ler("config.json"));
const PAGINAS = { "index.html": "./", "mapa.html": "./mapa.html", "fontes.html": "./fontes.html", "diagnostico.html": "./fontes.html",
  "comparador.html": "./comparador.html", "pesqueiro.html": "./" };

test("Fontes: cada fonte com o que dá na app, o tipo, a licença e a ligação; créditos de todas as fotografias", () => {
  const html = renderFontes(config);
  for (const f of config.paginaFontes.fontes) {
    assert.ok(f.nome && f.tipo && f.uso && f.licenca && f.ligacao, f.nome);
    assert.ok(html.includes(`<h2>${f.nome}</h2>`), f.nome);
    assert.match(f.ligacao, /^https:\/\//, f.nome);
  }
  const comFoto = Object.values(config.pesqueiros).filter(pq => pq.foto);
  assert.ok(comFoto.length >= 5);
  for (const pq of comFoto) {
    assert.ok(pq.foto.autor && pq.foto.licenca && pq.foto.pagina, pq.nomeCurto);
    assert.ok(html.includes(`>${pq.foto.autor}</a>, ${pq.foto.licenca}`), pq.nomeCurto);
  }
  assert.match(creditosFotos(config), /Créditos das fotografias/);
  assert.match(html, /<a href="\.\/diagnostico\.html">Diagnóstico técnico das fontes ›<\/a>/);
  // Ligações externas abrem noutro separador, sem dar acesso à página de origem.
  for (const a of html.match(/<a href="https:[^>]*>/g)) assert.match(a, /target="_blank" rel="noopener"/);
});

test("Fontes: as licenças batem com a configuração e com as tabelas de marés", () => {
  const por = nome => config.paginaFontes.fontes.find(f => f.nome.includes(nome));
  const boia = por("boia ondógrafo");
  assert.equal(boia.licenca, config.boias.faro.licenca);
  assert.equal(boia.licencaUrl, config.boias.faro.licencaUrl);
  assert.equal(boia.tipo, "observado");
  const mares = por("Tabela de Marés");
  const m2027 = JSON.parse(ler("mares/2027.json"));
  assert.match(m2027.licence, /^CC BY-NC-ND 4\.0/);
  assert.match(mares.licenca, /2027: CC BY-NC-ND 4\.0/);
  assert.ok(m2027.licence.includes(mares.licencaUrl));
  assert.equal(mares.ligacao, m2027.sourceUrl);
  assert.equal(JSON.parse(ler("mares/2026.json")).licence, undefined, "2026 não tem licença aberta");
  assert.match(mares.licenca, /2026: © Instituto Hidrográfico/);
  // Só «CC BY-NC-ND 4.0» leva a ligação da licença; «2026: © Instituto Hidrográfico» fica sem ligação.
  const html = renderFontes(config);
  assert.ok(html.includes(`Licença: 2026: © Instituto Hidrográfico · 2027: <a href="${mares.licencaUrl}" target="_blank" rel="noopener">CC BY-NC-ND 4.0</a>`));
  assert.ok(html.includes(`Licença: <a href="${boia.licencaUrl}" target="_blank" rel="noopener">CC BY-NC 4.0</a>`));
  // Open-Meteo: a licença não foi confirmada a partir deste ambiente; a página não afirma uma.
  assert.equal(por("Open-Meteo").licenca, "Termos e licença no site do Open-Meteo");
  assert.match(por("Open-Meteo").nota, /previsões arquivadas, não medições/);
});

test("Fontes: o estado do mar do IPMA saiu (não é consultado nem listado)", () => {
  assert.equal(existsSync(new URL("../js/fontes/ipma-mar.js", import.meta.url)), false);
  assert.equal(config.fontes.ipmaSeaForecastBase, undefined);
  for (const f of ["js/diagnostico.js", "js/dados.js", "sw.js", "fontes.html", "diagnostico.html"]) assert.doesNotMatch(ler(f), /ipma/i, f);
  assert.doesNotMatch(JSON.stringify(config.paginaFontes), /IPMA/);
});

test("Diagnóstico: só estado técnico (sem créditos), estilo comum, ligação de volta às fontes", () => {
  const src = ler("js/diagnostico.js");
  assert.doesNotMatch(src, /Créditos das fotografias/);
  const html = ler("diagnostico.html");
  assert.match(html, /href="\.\/css\/app\.css"/);
  assert.doesNotMatch(html, /base\.css/);
  assert.match(html, /<a href="\.\/fontes\.html">voltar às fontes<\/a>/);
  assert.equal(existsSync(new URL("../css/base.css", import.meta.url)), false);
});

test("barra de navegação: a mesma nos cinco ecrãs (Início, Comparar, Mapa, Fontes), com o ecrã actual marcado", () => {
  for (const [pagina, activo] of Object.entries(PAGINAS)) {
    const nav = /<nav class="barra" aria-label="Secções">([\s\S]*?)<\/nav>/.exec(ler(pagina))?.[1];
    assert.ok(nav, pagina);
    const ligacoes = [...nav.matchAll(/<a href="([^"]+)"( class="activo")?>([^<]+)<\/a>/g)].map(m => [m[1], m[3], Boolean(m[2])]);
    assert.deepEqual(ligacoes.map(([h, t]) => [h, t]), [["./", "Início"], ["./comparador.html", "Comparar"], ["./mapa.html", "Mapa"], ["./fontes.html", "Fontes"]], pagina);
    assert.deepEqual(ligacoes.filter(l => l[2]).map(l => l[0]), [activo], `${pagina}: marcado ${activo}`);
  }
  for (const f of Object.keys(PAGINAS)) assert.doesNotMatch(ler(f), /href="\.\/diagnostico\.html">Fontes/, f);
  // Os créditos das fotografias estão nas Fontes: nenhuma ligação do início manda para o diagnóstico.
  const inicio = ler("js/ui/inicio.js");
  assert.doesNotMatch(inicio, /diagnostico\.html/);
  assert.match(inicio, /Créditos das fotografias na página <a href="\.\/fontes\.html">Fontes<\/a>/);
});

test("Fontes: página na shell do service worker e na publicação", async () => {
  const sw = ler("sw.js");
  for (const f of ["./fontes.html", "./js/pagina-fontes.js", "./js/ui/fontes.js"]) assert.ok(sw.includes(`"${f}"`), f);
  assert.doesNotMatch(sw, /base\.css|ipma-mar/);
  const { PUBLICAR, NUNCA } = await import("../ferramentas/publicar.mjs");
  assert.ok(PUBLICAR.includes("fontes.html"));
  for (const x of ["testes-browser", "node_modules", "package-lock.json"]) assert.ok(NUNCA.includes(x), x);
});
