// Arranque sem rede com o service worker ACTIVO (revisão de 22/11/2026, D1 e D2). Os outros testes no
// browser bloqueiam o service worker e só recusam as APIs, por isso nunca testaram o arranque real sem
// rede. Aqui: UMA só visita com rede (a instalação), confirmação de que o service worker está activo e
// controla a página, e só depois se desliga tudo — as APIs E o servidor da app. Cada página abre num
// separador novo. Os endereços com parâmetros (?id=, ?dia=, ?pesqueiro=) nunca foram abertos com rede.
// Correr: npm run test:browser.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { servir, abrir, lancar, captura, AGORA, RAIZ } from "./apoio.mjs";

const config = JSON.parse(fs.readFileSync(path.join(RAIZ, "config.json"), "utf8"));
let browser;
before(async () => { browser = await lancar(); });
after(async () => { await browser?.close(); });

// Erros de carregamento esperados sem rede (pedidos recusados); qualquer outro erro conta.
const errosReais = lista => lista.filter(e => !/ERR_INTERNET_DISCONNECTED|ERR_CONNECTION_REFUSED|Failed to load resource|Failed to fetch/.test(e));

async function semRede(contexto, url, seletor, erros, { esperarDesenho = false } = {}) {
  const p = await contexto.newPage();
  await p.clock.setFixedTime(new Date(AGORA.getTime() + 2 * 3600000));
  p.on("pageerror", e => erros.push(`${url}: ${e}`));
  p.on("console", m => { if (m.type() === "error") erros.push(`${url}: ${m.text()}`); });
  const r = await p.goto(url);
  assert.ok(r?.ok(), `${url}: a página veio da cache do service worker (estado ${r?.status()})`);
  await p.waitForSelector(seletor, { timeout: 15000 });
  // Páginas cujo título já está no HTML: espera que a app as tenha desenhado (o texto inicial «A abrir…» muda).
  if (esperarDesenho) await p.waitForFunction(() => !/^A abrir/.test(document.querySelector(".lido")?.textContent ?? "A abrir"), null, { timeout: 15000 });
  return p;
}

test("sem rede, com o service worker activo, depois de UMA só visita com rede: as páginas abrem a partir da cache, incluindo endereços com parâmetros nunca abertos, e os parâmetros são lidos", async () => {
  const srv = await servir();
  const { contexto, pagina, rede } = await abrir(browser, "Pixel 7", { serviceWorker: true });
  const erros = [];
  try {
    // 1. Uma visita com rede. O service worker tem de estar activo e a controlar a página antes de se desligar o servidor.
    await pagina.goto(`${srv.url}/`);
    await pagina.waitForSelector(".cartoes .cartao");
    await pagina.evaluate(() => navigator.serviceWorker.ready);
    await pagina.waitForFunction(() => navigator.serviceWorker.controller?.state === "activated", null, { timeout: 15000 });
    // 2. D1: logo depois da instalação, a configuração, as marés e o fundo típico já estão na cache, e
    //    as páginas estão guardadas sem parâmetros.
    const cache = await pagina.evaluate(async () => {
      const nome = (await caches.keys()).find(k => k.startsWith("surfcasting-shell-"));
      const c = await caches.open(nome);
      return { nome, urls: (await c.keys()).map(r => new URL(r.url).pathname + new URL(r.url).search) };
    });
    for (const f of ["/config.json", "/mares/2026.json", "/mares/2027.json", "/fundos/tipico.json", "/pesqueiro.html", "/comparador.html", "/mapa.html"]) {
      assert.ok(cache.urls.includes(f), `${f} na cache ${cache.nome}`);
    }
    assert.deepEqual(cache.urls.filter(u => u.includes("?")), [], "nenhum endereço com parâmetros foi aberto com rede");
    // 3. Sem rede nenhuma: APIs recusadas e servidor da app desligado.
    rede.apis = false;
    await srv.fechar();
    await assert.rejects(fetch(srv.url), "o servidor da app está mesmo desligado");
    await pagina.close();

    // 4. As páginas, cada uma num separador novo.
    let p = await semRede(contexto, `${srv.url}/`, ".cartoes .cartao", erros);
    assert.equal(await p.locator(".cartao").count(), 8);
    assert.ok(await p.locator(".aviso-origem.arquivo").count() > 0, "início: «Previsão arquivada»");
    await captura(p, "offline-inicio");
    await p.close();

    p = await semRede(contexto, `${srv.url}/comparador.html?dia=1`, ".linha-comp", erros);
    assert.equal(await p.getAttribute(".dia[aria-pressed=true]", "data-dia"), "1", "o comparador leu ?dia=1");
    assert.ok(await p.locator(".aviso-origem.arquivo").count() > 0, "comparador: «Previsão arquivada»");
    await p.close();

    for (const [id, dia] of [["falesia", null], ["ria", 2]]) {
      const url = `${srv.url}/pesqueiro.html?id=${id}${dia ? `&dia=${dia}` : ""}`;
      p = await semRede(contexto, url, ".janela-pq", erros);
      assert.equal(await p.textContent("h1"), config.pesqueiros[id].nome, `a página leu ?id=${id}`);
      if (dia) assert.equal(await p.getAttribute(".dia[aria-pressed=true]", "data-dia"), String(dia), "a página leu &dia=2");
      assert.ok(await p.locator(".aviso-origem.arquivo").count() > 0, `${id}: «Previsão arquivada»`);
      if (id === "falesia") await captura(p, "offline-pesqueiro-falesia");
      await p.close();
    }

    p = await semRede(contexto, `${srv.url}/mapa.html?pesqueiro=falesia`, ".leaflet-popup-content", erros);
    assert.match(await p.textContent(".leaflet-popup-content"), /Falésia/, "o mapa leu ?pesqueiro=falesia");
    await p.close();

    for (const [u, s, desenho] of [["/diario.html", "main", true], ["/estatisticas.html", "main", true], ["/historico.html", "main", true],
      ["/guia.html", ".tema-guia", false], ["/fontes.html", ".cartao-fonte", false]]) {
      p = await semRede(contexto, srv.url + u, s, erros, { esperarDesenho: desenho });
      assert.doesNotMatch(await p.textContent("main"), /Erro:|Failed to fetch/, `${u} sem erro de carregamento`);
      await p.close();
    }
    assert.deepEqual(errosReais(erros), []);
  } finally {
    await contexto.close();
    await srv.fechar().catch(() => {});
  }
});
