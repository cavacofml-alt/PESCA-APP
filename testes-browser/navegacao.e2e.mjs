// Fase 1A no browser: barra de navegação, página «Fontes», diagnóstico sem IPMA, sem deslocamento
// horizontal em telemóvel (Pixel 7 e 360 px), capturas em saida-browser/.
// Correr: npm run test:browser (precisa do Playwright e do Chromium).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { servir, abrir, lancar, larguras, captura, RAIZ } from "./apoio.mjs";

const config = JSON.parse(fs.readFileSync(path.join(RAIZ, "config.json"), "utf8"));
let srv, browser;
before(async () => { srv = await servir(); browser = await lancar(); });
after(async () => { await browser?.close(); await srv?.fechar(); });

const PAGINAS = [["inicio", "/", ".cartoes"], ["mapa", "/mapa.html", ".leaflet-container"],
  ["fontes", "/fontes.html", ".cartao-fonte"], ["diagnostico", "/diagnostico.html", "#results article"]];

test("navegação: a barra leva aos três ecrãs e marca o actual; Fontes ↔ Diagnóstico", async () => {
  const { contexto, pagina, registo } = await abrir(browser);
  try {
    await pagina.goto(`${srv.url}/`);
    await pagina.waitForSelector(".cartoes");
    await pagina.click("nav.barra >> text=Fontes");
    await pagina.waitForURL(/\/fontes\.html$/);
    await pagina.waitForSelector(".cartao-fonte");
    assert.equal(await pagina.textContent("nav.barra a.activo"), "Fontes");
    await pagina.click("text=Diagnóstico técnico das fontes");
    await pagina.waitForURL(/\/diagnostico\.html$/);
    assert.equal(await pagina.textContent("nav.barra a.activo"), "Fontes");
    await pagina.click("text=voltar às fontes");
    await pagina.waitForURL(/\/fontes\.html$/);
    await pagina.click("nav.barra >> text=Mapa");
    await pagina.waitForURL(/\/mapa\.html$/);
    assert.equal(await pagina.textContent("nav.barra a.activo"), "Mapa");
    await pagina.click("nav.barra >> text=Início");
    await pagina.waitForSelector(".cartoes");
    assert.equal(await pagina.textContent("nav.barra a.activo"), "Início");
    assert.deepEqual(registo.erros, []);
  } finally { await contexto.close(); }
});

test("Fontes: todas as fontes e os créditos das fotografias aparecem", async () => {
  const { contexto, pagina, registo } = await abrir(browser);
  try {
    await pagina.goto(`${srv.url}/fontes.html`);
    await pagina.waitForSelector(".cartao-fonte");
    assert.equal(await pagina.locator(".cartao-fonte").count(), config.paginaFontes.fontes.length);
    const fotos = Object.values(config.pesqueiros).filter(p => p.foto).length;
    assert.equal(await pagina.locator("#creditos li").count(), fotos);
    assert.deepEqual(registo.externos, [], "a página «Fontes» não faz pedidos externos");
    assert.deepEqual(registo.erros, []);
  } finally { await contexto.close(); }
});

test("Diagnóstico: consulta as fontes da app e nunca o IPMA", async () => {
  const { contexto, pagina, registo } = await abrir(browser);
  try {
    await pagina.goto(`${srv.url}/diagnostico.html`);
    await pagina.waitForFunction(() => document.querySelectorAll("#results article").length > 5);
    const titulos = await pagina.locator("#results article h2").allTextContents();
    assert.ok(titulos.some(t => t.startsWith("Open-Meteo Marine")));
    assert.ok(titulos.some(t => t.startsWith("Instituto Hidrográfico")));
    assert.ok(!titulos.some(t => /IPMA/i.test(t)), titulos.join(" | "));
    assert.ok(!registo.externos.some(h => /ipma/i.test(h)), "nenhum pedido ao IPMA");
    assert.deepEqual(registo.recusados, []);
  } finally { await contexto.close(); }
});

for (const dispositivo of ["Pixel 7", { width: 360, height: 780 }]) {
  const nome = typeof dispositivo === "string" ? "pixel7" : "360px";
  test(`sem deslocamento horizontal e capturas (${nome})`, async () => {
    const { contexto, pagina, registo } = await abrir(browser, dispositivo);
    try {
      for (const [id, url, seletor] of PAGINAS) {
        await pagina.goto(`${srv.url}${url}`);
        await pagina.waitForSelector(seletor);
        await pagina.waitForTimeout(300);
        const l = await larguras(pagina);
        assert.ok(l.conteudo <= l.ecra, `${id} (${nome}): conteúdo ${l.conteudo} px > ecrã ${l.ecra} px`);
        await captura(pagina, `${id}-${nome}`);
      }
      assert.deepEqual(registo.recusados, []);
    } finally { await contexto.close(); }
  });
}
