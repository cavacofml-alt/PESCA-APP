// Página do pesqueiro no browser (plano de evolução, PR 4): os oito pesqueiros a partir do config,
// sem deslocamento horizontal (Pixel 7 e 360 px), ligações do início, do comparador e do mapa, e sem
// rede para as APIs. Correr: npm run test:browser.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { servir, abrir, lancar, larguras, captura, RAIZ } from "./apoio.mjs";

const config = JSON.parse(fs.readFileSync(path.join(RAIZ, "config.json"), "utf8"));
let srv, browser;
before(async () => { srv = await servir(); browser = await lancar(); });
after(async () => { await browser?.close(); await srv?.fechar(); });

for (const dispositivo of ["Pixel 7", { width: 360, height: 780 }]) {
  const nome = typeof dispositivo === "string" ? "pixel7" : "360px";
  test(`página do pesqueiro (${nome}): os oito, com notas, hora a hora e fontes, sem deslocamento horizontal`, async () => {
    const { contexto, pagina, registo } = await abrir(browser, dispositivo);
    try {
      for (const [id, pq] of Object.entries(config.pesqueiros)) {
        await pagina.goto(`${srv.url}/pesqueiro.html?id=${id}`);
        await pagina.waitForSelector(".horas-pq .tabela-horas");
        assert.equal(await pagina.textContent("h1"), pq.nome);
        assert.equal(await pagina.title(), `Surfcasting Algarve — ${pq.nome}`);
        assert.equal(await pagina.locator(".especie .nota").count(), pq.especies.length, id);
        assert.ok(await pagina.isVisible(".detalhes[open] .fontes"), `${id}: fontes visíveis`);
        const l = await larguras(pagina);
        assert.ok(l.conteudo <= l.ecra, `${id} (${nome}): ${l.conteudo} > ${l.ecra}`);
        if (id === "almargem" || id === "ria") await captura(pagina, `pesqueiro-${id}-${nome}`);
      }
      assert.deepEqual(registo.recusados, []);
      assert.deepEqual(registo.erros, []);
    } finally { await contexto.close(); }
  });
}

test("página do pesqueiro: chega-se do início e do comparador, no dia escolhido; o dia muda as notas; o mapa centra-se nele", async () => {
  const { contexto, pagina, registo } = await abrir(browser);
  try {
    await pagina.goto(`${srv.url}/`);
    await pagina.waitForSelector(".cartoes");
    await pagina.click(".dia[data-dia='2']");
    await pagina.click("#pq-ancao .ligacao-pq");
    await pagina.waitForURL(/pesqueiro\.html\?id=ancao&dia=2$/);
    await pagina.waitForSelector(".dia[data-dia='2'][aria-pressed=true]");
    await pagina.click(".dia[data-dia='0']");
    await pagina.waitForSelector(".dia[data-dia='0'][aria-pressed=true]");
    assert.match(await pagina.textContent(".bloco-pq h2 small"), /Hoje/);
    await pagina.goto(`${srv.url}/comparador.html?dia=1`);
    await pagina.waitForSelector(".linha-comp");
    await pagina.click("#cmp-falesia .lc-nome a");
    await pagina.waitForURL(/pesqueiro\.html\?id=falesia&dia=1$/);
    await pagina.waitForSelector("h1");
    await pagina.getByRole("link", { name: /^Ver no mapa/ }).click(); // a legenda do mini-mapa também diz «Ver no mapa»: é a ligação que conta
    await pagina.waitForURL(/mapa\.html\?pesqueiro=falesia$/);
    await pagina.waitForSelector(".leaflet-popup-content");
    assert.match(await pagina.textContent(".leaflet-popup-content"), /Falésia/);
    await pagina.click(".leaflet-popup-content >> text=Página do pesqueiro");
    await pagina.waitForURL(/pesqueiro\.html\?id=falesia$/);
    await pagina.goto(`${srv.url}/pesqueiro.html?id=naoExiste`);
    await pagina.waitForSelector(".lista-pq");
    assert.equal(await pagina.locator(".lista-pq a").count(), 8);
    assert.deepEqual(registo.erros, []);
  } finally { await contexto.close(); }
});

test("página do pesqueiro sem rede para as APIs: previsão indisponível, fontes não obtidas, sem notas inventadas", async () => {
  const { contexto, pagina, registo } = await abrir(browser, "Pixel 7", { semApis: true });
  try {
    await pagina.goto(`${srv.url}/pesqueiro.html?id=praia_faro`);
    await pagina.waitForSelector(".aviso-origem.indisponivel");
    assert.match(await pagina.textContent(".avisos"), /não obtidos/);
    assert.equal(await pagina.locator(".especie .nota:not(.nd)").count(), 0);
    await captura(pagina, "pesqueiro-sem-rede");
    assert.deepEqual(registo.erros.filter(e => !/ERR_INTERNET_DISCONNECTED|Failed to load resource/.test(e)), []);
  } finally { await contexto.close(); }
});
