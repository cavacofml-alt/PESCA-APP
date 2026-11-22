// O próprio critério de largura (revisão de 22/11/2026, D4): larguras() tem de falhar quando a página
// é mais larga do que o ecrã configurado, tanto por overflow como por zoom out. Antes comparava com
// innerWidth, que em emulação de telemóvel cresce com o conteúdo, e uma página de 570 px num ecrã de
// 412 px passava. Correr: npm run test:browser.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { servir, abrir, lancar, larguras, textoLarguras } from "./apoio.mjs";

let srv, browser;
before(async () => { srv = await servir(); browser = await lancar(); });
after(async () => { await browser?.close(); await srv?.fechar(); });

for (const dispositivo of ["Pixel 7", { width: 360, height: 780 }]) {
  const nome = typeof dispositivo === "string" ? "pixel7" : "360px";
  test(`larguras() (${nome}): falha com um elemento mais largo do que o ecrã; passa sem ele`, async () => {
    const { contexto, pagina, registo } = await abrir(browser, dispositivo);
    try {
      await pagina.goto(`${srv.url}/fontes.html`);
      await pagina.waitForSelector(".cartao-fonte");
      const antes = await larguras(pagina);
      assert.ok(antes.ok, `página normal: ${textoLarguras(antes)}`);
      assert.equal(antes.ecra, pagina.viewportSize().width);
      // Um elemento de 600 px, mais largo do que qualquer dos ecrãs de teste.
      await pagina.evaluate(() => {
        const d = document.createElement("div");
        d.id = "largo";
        d.style.cssText = "width: 600px; height: 8px";
        document.querySelector("main").append(d);
      });
      await pagina.waitForTimeout(200);
      const depois = await larguras(pagina);
      assert.equal(depois.ok, false, `com o elemento de 600 px tem de falhar: ${textoLarguras(depois)}`);
      assert.ok(depois.conteudo > depois.ecra || depois.janela !== depois.ecra);
      console.log(`# ${nome}: ${textoLarguras(depois)}; o critério antigo (conteúdo ≤ innerWidth) ${depois.conteudo <= depois.janela ? "PASSAVA" : "também falhava"}`);
      await pagina.evaluate(() => document.getElementById("largo").remove());
      await pagina.waitForTimeout(200);
      const fim = await larguras(pagina);
      assert.ok(fim.ok, `sem o elemento volta a passar: ${textoLarguras(fim)}`);
      assert.deepEqual(registo.erros, []);
    } finally { await contexto.close(); }
  });
}
