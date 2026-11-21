// Guia no browser (plano de evolução, PR 8): a partir das Fontes; índice com ligações aos seis temas;
// «Em geral» e «Nesta app» separados; sem pedidos externos (funciona sem rede); Pixel 7 e 360 px.
// Correr: npm run test:browser.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { servir, abrir, lancar, larguras, captura } from "./apoio.mjs";

let srv, browser;
before(async () => { srv = await servir(); browser = await lancar(); });
after(async () => { await browser?.close(); await srv?.fechar(); });

for (const dispositivo of ["Pixel 7", { width: 360, height: 780 }]) {
  const nome = typeof dispositivo === "string" ? "pixel7" : "360px";
  test(`guia (${nome}): seis temas, geral separado da app, índice, sem pedidos externos nem deslocamento horizontal`, async () => {
    const { contexto, pagina, registo } = await abrir(browser, dispositivo, { semApis: true });
    try {
      await pagina.goto(`${srv.url}/fontes.html`);
      await pagina.click("text=Guia: marés");
      await pagina.waitForURL(/guia\.html$/);
      await pagina.waitForSelector(".tema-guia");
      assert.equal(await pagina.locator(".tema-guia").count(), 6);
      assert.equal(await pagina.locator(".tema-guia .geral").count(), 6);
      assert.equal(await pagina.locator(".tema-guia .na-app").count(), 6);
      await pagina.click(".indice-guia >> text=Ler os fundos e as estruturas");
      await pagina.waitForFunction(() => { const r = document.querySelector("#fundos").getBoundingClientRect(); return Math.abs(r.top) < 40; });
      assert.equal(await pagina.textContent("nav.barra a.activo"), "Fontes");
      const l = await larguras(pagina);
      assert.ok(l.conteudo <= l.ecra, `${l.conteudo} > ${l.ecra}`);
      await captura(pagina, `guia-${nome}`);
      assert.deepEqual(registo.externos, [], "o guia não faz pedidos externos");
      assert.deepEqual(registo.erros, []);
    } finally { await contexto.close(); }
  });
}
