// Guia (plano de evolução, PR 8): estático e local; «Em geral» separado de «Nesta app»; os valores de
// «Nesta app» vêm do config (mudam com ele); a parte geral não traz regras de pesca.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { TEMAS, renderGuia } from "../js/ui/guia.js";

const config = JSON.parse(readFileSync(new URL("../config.json", import.meta.url), "utf8"));

test("guia: os seis temas pedidos, cada um com «Em geral» e «Nesta app»", () => {
  assert.deepEqual(TEMAS.map(t => t.id), ["mares", "ondulacao", "vento", "fundos", "app", "saida"]);
  for (const t of TEMAS) {
    assert.ok(t.geral.length >= 2, t.id);
    assert.ok(t.naApp(config).length >= 2, t.id);
  }
  const html = renderGuia(config);
  assert.equal((html.match(/<h3>Em geral<\/h3>/g) ?? []).length, 6);
  assert.equal((html.match(/<h3>Nesta app <small>· decisões do utilizador, provisórias<\/small><\/h3>/g) ?? []).length, 6);
  assert.doesNotMatch(html, /NaN|undefined|\[object/);
});

test("guia: a parte geral não traz regras de pesca (nada de espécies, notas ou limiares da app)", () => {
  for (const t of TEMAS) for (const p of t.geral) {
    assert.doesNotMatch(p, /\b(robalo|dourada|nota|notas|limo|pesqueiro bom|melhor)\b/i, `${t.id}: ${p}`);
  }
});

test("guia: os valores de «Nesta app» vêm do config e mudam com ele", () => {
  const base = renderGuia(config);
  assert.match(base, /abaixo de 2,00 m, morta; de 2,00 a 3,00 m, intermédia; acima de 3,00 m, viva/);
  assert.match(base, /P ≈ 0,49 × Hs² × T/);
  assert.match(base, /período abaixo de 6 s conta como vaga de vento/);
  assert.match(base, /Levante\/Sudeste \[67,5°; 157,5°\)/);
  assert.match(base, /20 mm ou mais nas 48 h/);
  const outro = structuredClone(config);
  outro.mares.mortaMaxExclusivoM = 2.5;
  outro.chuva.limiar48hMm = 25;
  outro.mar.potenciaRobaloMinimaKWm = 0.8;
  const html = renderGuia(outro);
  assert.match(html, /abaixo de 2,50 m, morta/);
  assert.match(html, /25 mm ou mais/);
  assert.match(html, /potência abaixo de 0,8 kW\/m/);
});

test("guia: sem ligações externas nem pedidos (funciona sem rede); a segurança não é avaliada pela app", () => {
  const html = renderGuia(config);
  assert.doesNotMatch(html, /https?:\/\//);
  assert.match(html, /A app não avalia a segurança/);
  assert.match(html, /Não é um manual de pesca nem traz regras novas/);
});
