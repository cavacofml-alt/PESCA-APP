// Comparador no browser (plano de evolução, PR 2): os oito pesqueiros, escolha da espécie, do dia, do
// período e da ordem; ligação a partir do início; sem deslocamento horizontal (Pixel 7 e 360 px);
// sem rede para as APIs (notas «sem nota», nunca zero). Correr: npm run test:browser.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { servir, abrir, lancar, larguras, captura } from "./apoio.mjs";

let srv, browser;
before(async () => { srv = await servir(); browser = await lancar(); });
after(async () => { await browser?.close(); await srv?.fechar(); });

const notas = pagina => pagina.$$eval(".linha-comp", ls => ls.map(l => ({
  nome: l.querySelector(".lc-nome").firstChild.textContent.trim(), estado: l.dataset.estado,
  nota: l.querySelector(".lc-topo .nota").textContent.replace("/5", "").trim() })));

for (const dispositivo of ["Pixel 7", { width: 360, height: 780 }]) {
  const nome = typeof dispositivo === "string" ? "pixel7" : "360px";
  test(`comparador (${nome}): oito pesqueiros, resumo, factores e sem deslocamento horizontal`, async () => {
    const { contexto, pagina, registo } = await abrir(browser, dispositivo);
    try {
      await pagina.goto(`${srv.url}/comparador.html`);
      await pagina.waitForSelector(".linha-comp");
      const ls = await notas(pagina);
      assert.equal(ls.length, 8);
      assert.match(await pagina.textContent(".resumo-comp h2"), /Hoje · (Robalo|Dourada)/);
      assert.ok(await pagina.isVisible(".factores table"));
      const l = await larguras(pagina);
      assert.ok(l.conteudo <= l.ecra, `sem deslocamento horizontal (${l.conteudo} > ${l.ecra})`);
      await captura(pagina, `comparador-${nome}`);
      assert.deepEqual(registo.recusados, []);
      assert.deepEqual(registo.erros, []);
    } finally { await contexto.close(); }
  });
}

test("comparador: espécie, período, ordem e dia mudam a comparação; a ordem «por nota» começa pela nota mais alta", async () => {
  const { contexto, pagina, registo } = await abrir(browser);
  try {
    await pagina.goto(`${srv.url}/comparador.html`);
    await pagina.waitForSelector(".linha-comp");
    await pagina.click(".especie-btn[data-especie=dourada]");
    await pagina.waitForFunction(() => /Dourada/.test(document.querySelector(".resumo-comp h2")?.textContent));
    assert.equal((await notas(pagina))[0].nome, "Ria Formosa", "nascente → poente por omissão");
    await pagina.click(".vistas button[data-valor=tarde]");
    await pagina.waitForFunction(() => /tarde \(12–18 h\)/.test(document.querySelector(".resumo-comp h2")?.textContent));
    await pagina.click(".ordens button[data-valor=nota]");
    await pagina.waitForSelector(".ordens button[data-valor=nota].sel");
    const ls = await notas(pagina);
    const comNota = ls.filter(x => /^\d$/.test(x.nota)).map(x => Number(x.nota));
    assert.deepEqual(comNota, [...comNota].sort((a, b) => b - a), ls.map(x => `${x.nome}:${x.nota}`).join(" "));
    assert.ok(ls.findIndex(x => !/^\d$/.test(x.nota)) === -1 || ls.slice(ls.findIndex(x => !/^\d$/.test(x.nota))).every(x => !/^\d$/.test(x.nota)),
      "as linhas sem nota ficam depois das que têm nota");
    await pagina.click(".dia[data-dia='2']");
    await pagina.waitForSelector(".dia[data-dia='2'][aria-pressed=true]");
    assert.doesNotMatch(await pagina.textContent(".resumo-comp h2"), /Hoje|Amanhã/);
    await captura(pagina, "comparador-dourada-tarde-por-nota");
    assert.deepEqual(registo.erros, []);
  } finally { await contexto.close(); }
});

test("comparador: o início liga ao comparador no dia escolhido", async () => {
  const { contexto, pagina, registo } = await abrir(browser);
  try {
    await pagina.goto(`${srv.url}/`);
    await pagina.waitForSelector(".onde-quando");
    await pagina.click(".dia[data-dia='1']");
    await pagina.waitForFunction(() => /Amanhã/.test(document.querySelector(".onde-quando h2")?.textContent));
    await pagina.click(".ligacao-comp a");
    await pagina.waitForURL(/\/comparador\.html\?dia=1$/);
    await pagina.waitForSelector(".linha-comp");
    assert.match(await pagina.textContent(".resumo-comp h2"), /^Amanhã/);
    assert.deepEqual(registo.erros, []);
  } finally { await contexto.close(); }
});

test("comparador sem rede para as APIs: nenhuma nota, fontes «não obtidas», nada a zero", async () => {
  const { contexto, pagina, registo } = await abrir(browser, "Pixel 7", { semApis: true });
  try {
    await pagina.goto(`${srv.url}/comparador.html`);
    await pagina.waitForSelector(".linha-comp");
    const ls = await notas(pagina);
    assert.equal(ls.length, 8);
    assert.ok(ls.every(x => ["sem nota", "não se aplica", "por confirmar"].includes(x.estado)), ls.map(x => `${x.nome}:${x.estado}`).join(" "));
    assert.ok(ls.every(x => !/^\d$/.test(x.nota)), "nenhuma nota numérica sem dados");
    assert.match(await pagina.textContent(".resumo-comp"), /Nenhum pesqueiro tem nota/);
    await pagina.click(".linha-comp .detalhes summary");
    assert.match(await pagina.textContent(".linha-comp .detalhes"), /não obtidos/);
    await captura(pagina, "comparador-sem-rede");
    // Só os erros de rede esperados (pedidos às APIs recusados).
    assert.deepEqual(registo.erros.filter(e => !/ERR_INTERNET_DISCONNECTED|Failed to load resource/.test(e)), []);
  } finally { await contexto.close(); }
});
