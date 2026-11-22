// F0 da evolução da interface (22/11/2026), no browser: o que só se vê com o CSS e o Leaflet.
// - Tabela horária da página do pesqueiro: coluna fixa encostada ao bordo do contentor (nos oito).
// - Cartões do início: hoje, uma nota de um período que já acabou não aparece como actual.
// - Mapa: marcador próprio dos pesqueiros, legenda, rótulos dos fundos sem sobreposição.
// Correr: npm run test:browser.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { servir, abrir, lancar, captura, AGORA, RAIZ } from "./apoio.mjs";

const config = JSON.parse(fs.readFileSync(path.join(RAIZ, "config.json"), "utf8"));
const IDS = Object.keys(config.pesqueiros);
let browser, srv;
before(async () => { browser = await lancar(); srv = await servir(); });
after(async () => { await browser?.close(); await srv?.fechar(); });

// Rótulos dos fundos visíveis e pares que se tapam (caixas no ecrã, também fora da parte visível).
const rotulos = pagina => pagina.evaluate(() => {
  const vis = [...document.querySelectorAll(".rotulo-forma")].filter(r => getComputedStyle(r).display !== "none")
    .map(r => r.getBoundingClientRect()).filter(a => a.width);
  let pares = 0;
  for (let i = 0; i < vis.length; i++) for (let j = i + 1; j < vis.length; j++) {
    const a = vis[i], b = vis[j];
    if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) pares++;
  }
  return { total: document.querySelectorAll(".rotulo-forma").length, visiveis: vis.length, pares };
});
const esperarFundos = pagina => pagina.waitForFunction(() => document.querySelectorAll(".rotulo-forma").length > 0, null, { timeout: 15000 });

for (const [nome, dispositivo] of [["Pixel 7", "Pixel 7"], ["360px", { width: 360, height: 780 }]]) {
  test(`tabela horária da página do pesqueiro (${nome}): coluna fixa encostada ao bordo, nos oito pesqueiros`, async () => {
    const { contexto, pagina, registo } = await abrir(browser, dispositivo);
    try {
      for (const id of IDS) {
        await pagina.goto(`${srv.url}/pesqueiro.html?id=${id}`);
        await pagina.waitForSelector(".horas-pq .tabela-horas th");
        for (const fim of [false, true]) {
          const m = await pagina.evaluate(async irAoFim => {
            const c = document.querySelector(".horas-pq .tabela-horas");
            if (irAoFim) c.scrollLeft = c.scrollWidth;
            await new Promise(r => requestAnimationFrame(r));
            const th = c.querySelector("th");
            return { folga: th.getBoundingClientRect().left - c.getBoundingClientRect().left, padding: getComputedStyle(c).paddingLeft, desliza: c.scrollLeft };
          }, fim);
          assert.equal(m.padding, "0px", `${id}: contentor sem padding`);
          assert.ok(Math.abs(m.folga) <= 0.5, `${id}${fim ? " (no fim)" : ""}: coluna fixa a ${m.folga} px do bordo`);
        }
      }
      await captura(pagina, `f0-horas-${nome}`);
      assert.deepEqual(registo.erros, []);
    } finally { await contexto.close(); }
  });
}

test("cartões do início às 10:40: a nota de um período que já acabou não aparece como actual; às 05:00 nada mudou", async () => {
  const { contexto, pagina, registo } = await abrir(browser, "Pixel 7");
  try {
    await pagina.goto(`${srv.url}/`);
    await pagina.waitForSelector(".cartoes .cartao");
    const cartoes = await pagina.$$eval(".cartoes .cartao", cs => cs.map(c => ({
      id: c.id, selo: c.querySelector(".selo").textContent.trim(),
      escolhida: c.querySelector(".nota-esp.sel")?.textContent.replace(/\s+/g, " ").trim() ?? "",
      seloEscolhida: c.querySelector(".nota-esp.sel .mini")?.textContent.trim() ?? null,
      madrugada: c.querySelector('.periodos li[title^="madrugada"]')?.className ?? ""
    })));
    assert.equal(cartoes.length, 8);
    const passados = cartoes.filter(c => /já passou/.test(c.escolhida));
    assert.ok(passados.length > 0, "às 10:40 há notas do dia da madrugada (dados reais deslocados)");
    for (const c of passados) {
      assert.match(c.escolhida, /resto de hoje/, `${c.id}: diz qual é a nota do resto de hoje`);
      assert.equal(c.selo, c.seloEscolhida, `${c.id}: o selo da fotografia é o do resto de hoje`);
      const doDia = /nota do dia (\S+)/.exec(c.escolhida)[1];
      assert.match(c.escolhida, new RegExp(`nota do dia ${doDia} · \\S+ \\(já passou\\)`));
    }
    for (const c of cartoes) if (c.madrugada) assert.match(c.madrugada, /passou/, `${c.id}: madrugada a cinzento`);
    await captura(pagina, "f0-inicio-1040");
    // Às 05:00 (madrugada a decorrer), nada passou: o selo é a nota do dia, sem «já passou».
    const cedo = await contexto.newPage();
    await cedo.clock.setFixedTime(new Date("2026-11-15T05:00:00Z"));
    await cedo.goto(`${srv.url}/`);
    await cedo.waitForSelector(".cartoes .cartao");
    assert.equal(await cedo.locator(".cartoes").getByText("já passou").count(), 0);
    assert.equal(await cedo.locator(".nota-esp.resto").count(), 0);
    assert.deepEqual(registo.erros, []);
  } finally { await contexto.close(); }
});

test("mapa: alfinete próprio nos 7 pesqueiros com ponto, legenda, teclado; rótulos dos fundos sem sobreposição", async () => {
  const { contexto, pagina, registo } = await abrir(browser, "Pixel 7");
  try {
    await pagina.goto(`${srv.url}/mapa.html`);
    await pagina.waitForSelector(".leaflet-container");
    await esperarFundos(pagina);
    // Marcadores: os pesqueiros com ponto do mar (a Ria não tem), cada um com o nome.
    const nomes = await pagina.$$eval(".marcador-pesqueiro", ms => ms.map(m => m.getAttribute("title")));
    const esperados = IDS.filter(id => config.locais[config.pesqueiros[id].mar]).map(id => config.pesqueiros[id].nome);
    assert.equal(esperados.length, 7);
    assert.deepEqual([...nomes].sort(), [...esperados].sort());
    assert.equal(await pagina.locator(".leaflet-marker-pane .marcador-pesqueiro .pino-pq").count(), 7, "no painel dos marcadores, por cima do canvas");
    // Legenda com a entrada do pesqueiro.
    const legenda = (await pagina.textContent(".legenda-mapa")).replace(/\s+/g, " ");
    assert.equal(await pagina.locator(".legenda-mapa .leg-pino").count(), 1);
    assert.match(legenda, /pesqueiro \(ponto da previsão do mar\) · ● fundão · ● cabeço/);
    // Vista geral: sem rótulos (nem sobreposições).
    await pagina.waitForTimeout(300);
    const geral = await rotulos(pagina);
    assert.ok(geral.total > 0, "os fundos carregaram");
    assert.equal(geral.visiveis, 0, "vista geral sem rótulos");
    await captura(pagina, "f0-mapa-geral");
    // Teclado: o marcador recebe o foco e abre o balão com Enter.
    const marcador = pagina.locator(`.marcador-pesqueiro[title="${config.pesqueiros.ancao.nome}"]`);
    await marcador.focus();
    await pagina.keyboard.press("Enter");
    await pagina.waitForSelector(".leaflet-popup-content");
    assert.match(await pagina.textContent(".leaflet-popup-content"), /Ancão/);
    // Uma zona (atalho): rótulos visíveis e nenhum par sobreposto.
    await pagina.locator(".leaflet-popup-close-button").click();
    await pagina.locator("button.atalho", { hasText: "Praia de Faro" }).first().click();
    await pagina.waitForTimeout(1500);
    const zona = await rotulos(pagina);
    assert.ok(zona.visiveis > 0, "numa zona há rótulos");
    assert.equal(zona.pares, 0, `zona Praia de Faro: ${zona.pares} pares sobrepostos`);
    assert.deepEqual(registo.erros, []);
  } finally { await contexto.close(); }
});

test("mapa centrado num pesqueiro (zoom 15) e numa zona larga (12,5): rótulos sem sobreposição; a Ria abre sem balão", async () => {
  const { contexto, pagina, registo } = await abrir(browser, "Pixel 7");
  try {
    await pagina.goto(`${srv.url}/mapa.html?pesqueiro=almargem`);
    await pagina.waitForSelector(".leaflet-popup-content");
    await esperarFundos(pagina);
    await pagina.waitForTimeout(1500);
    const perto = await rotulos(pagina);
    assert.ok(perto.visiveis > 0, "perto do pesqueiro há rótulos");
    assert.equal(perto.pares, 0, `Almargem: ${perto.pares} pares sobrepostos`);
    await captura(pagina, "f0-mapa-almargem");
    await pagina.goto(`${srv.url}/mapa.html`);
    await pagina.waitForSelector(".leaflet-container");
    await esperarFundos(pagina);
    await pagina.locator("button.atalho", { hasText: "Quarteira–Garrão" }).first().click();
    await pagina.waitForTimeout(1500);
    const larga = await rotulos(pagina);
    assert.equal(larga.pares, 0, `Quarteira–Garrão: ${larga.pares} pares sobrepostos`);
    // A Ria não tem marcador próprio: o mapa abre no ponto de terra, sem balão e sem erro.
    await pagina.goto(`${srv.url}/mapa.html?pesqueiro=ria`);
    await pagina.waitForSelector(".leaflet-container");
    await pagina.waitForTimeout(800);
    assert.equal(await pagina.locator(".leaflet-popup-content").count(), 0);
    assert.deepEqual(registo.erros, []);
  } finally { await contexto.close(); }
});
