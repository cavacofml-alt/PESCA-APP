// Sem rede, página a página (revisão de 22/11/2026): um teste para o início, outro para o comparador e
// outro para a página do pesqueiro. Em cada um: UMA visita com rede ao início (o service worker instala-se
// e fica guardada a leitura das 10:40); depois, sem rede nenhuma — o contexto do browser fica offline
// (navigator.onLine falso), as APIs são recusadas e o servidor da app é desligado. Às 12:40 a página abre
// da cache, recarrega-se sem rede, muda-se de dia e navega-se pelas ligações da própria página (cartões,
// barra, comparador, «voltar atrás»), sempre com a previsão arquivada das 10:40 e o aviso. No fim a rede
// volta (o servidor no mesmo endereço, as APIs e o contexto online): o evento «online» do browser
// actualiza a página aberta, sem a recarregar, e o aviso de arquivo desaparece.
// A origem de cada página fica provada, nunca presumida: abrir, recarregar e seguir uma ligação têm de
// ser servidos pelo service worker; «voltar atrás» também, ou então por uma restauração da cache de
// navegação do browser confirmada (ver voltar()).
// Correr: npm run test:browser.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { servir, abrir, lancar, captura, AGORA, RAIZ } from "./apoio.mjs";

const config = JSON.parse(fs.readFileSync(path.join(RAIZ, "config.json"), "utf8"));
const IDS = Object.keys(config.pesqueiros);
const DEPOIS = new Date(AGORA.getTime() + 2 * 3600000);   // 12:40: duas horas depois da leitura guardada
const ERROS_DE_REDE = /ERR_INTERNET_DISCONNECTED|ERR_CONNECTION_REFUSED|Failed to load resource|Failed to fetch/;
let browser;
before(async () => { browser = await lancar(); });
after(async () => { await browser?.close(); });

// Uma visita com rede ao início; o service worker tem de estar activo e a controlar a página. Depois
// desliga-se tudo e abre-se um separador novo às 12:40.
async function instalarEDesligar() {
  const srv = await servir();
  const { contexto, pagina, rede } = await abrir(browser, "Pixel 7", { serviceWorker: true });
  await pagina.goto(`${srv.url}/`);
  await pagina.waitForSelector(".cartoes .cartao");
  await pagina.waitForFunction(() => navigator.serviceWorker.controller?.state === "activated", null, { timeout: 15000 });
  await pagina.close();
  rede.apis = false;
  await contexto.setOffline(true);
  await srv.fechar();
  await assert.rejects(fetch(srv.url), "o servidor da app está desligado");
  await contexto.clock.setFixedTime(DEPOIS);
  // Para provar uma restauração da cache de navegação (BFCache): o evento pageshow diz se o documento
  // foi restaurado (persisted = true) ou carregado de novo.
  await contexto.addInitScript(() => addEventListener("pageshow", e => { window.__restauradaDoHistorico = e.persisted; }));
  const erros = [];
  const p = await contexto.newPage();
  p.on("pageerror", e => erros.push(String(e)));
  p.on("console", m => { if (m.type() === "error") erros.push(m.text()); });
  assert.equal(await p.evaluate(() => navigator.onLine), false, "o browser está sem rede");
  return { srv, contexto, p, rede, erros };
}

// A rede volta: o servidor da app no mesmo endereço, as APIs e o contexto online (o browser dispara «online»).
async function redeVolta({ srv, contexto, rede }) {
  const novo = await servir({ porta: Number(new URL(srv.url).port) });
  rede.apis = true;
  await contexto.setOffline(false);
  return novo;
}

// Previsão arquivada das 10:40, com o aviso e a hora da leitura.
async function arquivada(p, onde) {
  await p.waitForSelector(".aviso-origem.arquivo", { timeout: 15000 });
  assert.match(await p.textContent(".aviso-origem"), /Previsão arquivada — não é a previsão actual/, `${onde}: aviso de arquivo`);
  assert.match(await p.textContent(".topo .lido"), /^Previsão arquivada, lida às 10:40 \(há 2 h\)/, `${onde}: hora da leitura arquivada`);
}

// Abre (ou recarrega) e confirma que a resposta veio do service worker.
async function daCache(p, accao, onde) {
  const r = await accao();
  assert.ok(r?.ok() && r.fromServiceWorker(), `${onde}: página servida pelo service worker (estado ${r?.status()})`);
}

// Clica numa ligação e espera pela página nova, servida pelo service worker.
async function seguir(p, seletor, url, onde) {
  const [r] = await Promise.all([
    p.waitForResponse(x => x.request().isNavigationRequest() && x.request().frame() === p.mainFrame(), { timeout: 15000 }),
    p.locator(seletor).first().click()
  ]);
  assert.ok(r.ok() && r.fromServiceWorker(), `${onde}: navegação servida pelo service worker (estado ${r.status()})`);
  await p.waitForURL(url, { timeout: 15000 });
}

// «Voltar atrás» (revisão de 22/11/2026): a origem tem de ficar provada.
// - Com resposta (o browser pediu a página outra vez): tem de vir do service worker.
// - Sem resposta (goBack devolve null): só se aceita a restauração do próprio documento pela cache de
//   navegação do browser (BFCache), provada pelo evento pageshow com persisted = true. Qualquer outro
//   caso falha.
// Nos dois casos, o browser continua sem rede e conferir() confirma o conteúdo da página (a previsão
// arquivada certa). Devolve a origem, que o teste regista.
// Nota: o Chromium do Playwright arranca com --disable-back-forward-cache, por isso nestes testes
// «voltar atrás» volta sempre a pedir a página (ao service worker). O segundo caso fica escrito para que
// uma restauração nunca seja aceite sem prova.
async function voltar(p, url, onde, conferir) {
  const r = await p.goBack({ timeout: 15000 });
  await p.waitForURL(url, { timeout: 15000 });
  let origem;
  if (r) {
    assert.ok(r.ok() && r.fromServiceWorker(), `${onde}: servida pelo service worker (estado ${r.status()}, service worker: ${r.fromServiceWorker()})`);
    origem = "service worker";
  } else {
    assert.equal(await p.evaluate(() => window.__restauradaDoHistorico), true,
      `${onde}: sem resposta e sem restauração confirmada pela cache de navegação — origem por provar`);
    origem = "cache de navegação (BFCache, pageshow persisted)";
  }
  assert.equal(await p.evaluate(() => navigator.onLine), false, `${onde}: continua sem rede`);
  await conferir();
  return `${onde}: ${origem}`;
}

const diaEscolhido = p => p.getAttribute(".dia[aria-pressed=true]", "data-dia");
const nome = id => config.pesqueiros[id].nome;

// Actualiza sem recarregar: a marca posta antes de a rede voltar continua lá depois.
async function actualizaSemRecarregar(p, onde) {
  await p.waitForFunction(() => !document.querySelector(".aviso-origem") && /^Dados lidos às 12:40/.test(document.querySelector(".topo .lido")?.textContent ?? ""), null, { timeout: 15000 });
  assert.equal(await p.evaluate(() => window.__semRecarregar), true, `${onde}: a página não foi recarregada`);
}

test("sem rede — início: abre da cache, recarrega, muda de dia, segue as ligações (cartão, barra, voltar atrás) e actualiza quando a rede volta", async t => {
  const c = await instalarEDesligar();
  const { p, srv } = c;
  const origens = [];
  let novo;
  try {
    await daCache(p, () => p.goto(`${srv.url}/`), "início");
    await p.waitForSelector(".cartoes .cartao");
    assert.equal(await p.locator(".cartao").count(), 8);
    await arquivada(p, "início");
    await captura(p, "sem-rede-inicio");
    await daCache(p, () => p.reload(), "início recarregado");
    await p.waitForSelector(".cartoes .cartao");
    assert.equal(await p.locator(".cartao").count(), 8);
    await arquivada(p, "início recarregado");
    // Outro dia, na própria página.
    await p.click(".dia[data-dia='2']");
    assert.equal(await diaEscolhido(p), "2");
    assert.equal(await p.locator(".cartao").count(), 8);
    await arquivada(p, "início, dia 2");
    // Cartão → página do pesqueiro (endereço com parâmetros nunca aberto com rede).
    await seguir(p, "#pq-almargem .ligacao-pq", /pesqueiro\.html\?id=almargem&dia=2$/, "cartão do Almargem");
    await p.waitForSelector(".janela-pq");
    assert.equal(await p.textContent("h1"), nome("almargem"));
    assert.equal(await diaEscolhido(p), "2", "a página leu &dia=2");
    await arquivada(p, "pesqueiro (a partir do cartão)");
    origens.push(await voltar(p, /\/$/, "voltar ao início", async () => {
      await p.waitForSelector(".cartoes .cartao");
      assert.equal(await p.locator(".cartao").count(), 8);
      await arquivada(p, "início (voltar atrás)");
    }));
    // Barra → comparador.
    await seguir(p, "nav.barra a[href='./comparador.html']", /comparador\.html$/, "barra: Comparar");
    await p.waitForSelector(".linha-comp");
    assert.equal(await p.locator(".linha-comp").count(), 8);
    await arquivada(p, "comparador (a partir da barra)");
    origens.push(await voltar(p, /\/$/, "voltar ao início, outra vez", async () => {
      await p.waitForSelector(".cartoes .cartao");
      assert.equal(await p.locator(".cartao").count(), 8);
      await arquivada(p, "início (voltar atrás, outra vez)");
    }));
    // A rede volta, com o início aberto.
    await p.evaluate(() => { window.__semRecarregar = true; });
    novo = await redeVolta(c);
    await actualizaSemRecarregar(p, "início");
    assert.equal(await p.locator(".cartao").count(), 8);
    assert.deepEqual(c.erros.filter(e => !ERROS_DE_REDE.test(e)), []);
    for (const o of origens) t.diagnostic(`voltar atrás — ${o}`);
  } finally {
    await c.contexto.close();
    await novo?.fechar();
  }
});

test("sem rede — comparador: abre da cache com ?dia, recarrega, muda de dia, segue as ligações (linha, barra, voltar atrás) e actualiza quando a rede volta", async t => {
  const c = await instalarEDesligar();
  const { p, srv } = c;
  const origens = [];
  let novo;
  try {
    await daCache(p, () => p.goto(`${srv.url}/comparador.html?dia=1`), "comparador");
    await p.waitForSelector(".linha-comp");
    assert.equal(await p.locator(".linha-comp").count(), 8);
    assert.equal(await diaEscolhido(p), "1", "o comparador leu ?dia=1");
    await arquivada(p, "comparador");
    await captura(p, "sem-rede-comparador");
    await daCache(p, () => p.reload(), "comparador recarregado");
    await p.waitForSelector(".linha-comp");
    assert.equal(await p.locator(".linha-comp").count(), 8);
    assert.equal(await diaEscolhido(p), "1", "depois de recarregar, continua no dia 1");
    await arquivada(p, "comparador recarregado");
    await p.click(".dia[data-dia='3']");
    assert.equal(await diaEscolhido(p), "3");
    assert.equal(await p.locator(".linha-comp").count(), 8);
    await arquivada(p, "comparador, dia 3");
    // Linha → página do pesqueiro.
    await seguir(p, ".linha-comp a[href*='id=falesia']", /pesqueiro\.html\?id=falesia&dia=3$/, "linha da Falésia");
    await p.waitForSelector(".janela-pq");
    assert.equal(await p.textContent("h1"), nome("falesia"));
    assert.equal(await diaEscolhido(p), "3");
    await arquivada(p, "pesqueiro (a partir do comparador)");
    origens.push(await voltar(p, /comparador\.html\?dia=1$/, "voltar ao comparador", async () => {
      await p.waitForSelector(".linha-comp");
      assert.equal(await p.locator(".linha-comp").count(), 8);
      await arquivada(p, "comparador (voltar atrás)");
    }));
    // Barra → início.
    await seguir(p, "nav.barra a[href='./']", /\/$/, "barra: Início");
    await p.waitForSelector(".cartoes .cartao");
    assert.equal(await p.locator(".cartao").count(), 8);
    await arquivada(p, "início (a partir da barra)");
    origens.push(await voltar(p, /comparador\.html\?dia=1$/, "voltar ao comparador, outra vez", async () => {
      await p.waitForSelector(".linha-comp");
      assert.equal(await p.locator(".linha-comp").count(), 8);
      await arquivada(p, "comparador (voltar atrás, outra vez)");
    }));
    // A rede volta, com o comparador aberto.
    await p.evaluate(() => { window.__semRecarregar = true; });
    novo = await redeVolta(c);
    await actualizaSemRecarregar(p, "comparador");
    assert.equal(await p.locator(".linha-comp").count(), 8);
    assert.deepEqual(c.erros.filter(e => !ERROS_DE_REDE.test(e)), []);
    for (const o of origens) t.diagnostic(`voltar atrás — ${o}`);
  } finally {
    await c.contexto.close();
    await novo?.fechar();
  }
});

test("sem rede — página do pesqueiro: os oito abrem da cache e recarregam; muda de dia, segue as ligações (comparador, outro pesqueiro, barra, voltar atrás) e actualiza quando a rede volta", async t => {
  const c = await instalarEDesligar();
  const { p, srv } = c;
  const origens = [];
  let novo;
  try {
    // Os oito pesqueiros, cada um aberto e recarregado sem rede (nenhum destes endereços foi aberto com rede).
    for (const id of IDS) {
      const url = `${srv.url}/pesqueiro.html?id=${id}`;
      for (const [etiqueta, accao] of [["", () => p.goto(url)], [" recarregada", () => p.reload()]]) {
        await daCache(p, accao, `${id}${etiqueta}`);
        await p.waitForSelector(".janela-pq");
        assert.equal(await p.textContent("h1"), nome(id), `${id}${etiqueta}: a página leu ?id=${id}`);
        assert.ok(await p.locator(".horas-pq .tabela-horas th").count() > 0, `${id}${etiqueta}: tabela hora a hora`);
        await arquivada(p, `${id}${etiqueta}`);
      }
    }
    await daCache(p, () => p.goto(`${srv.url}/pesqueiro.html?id=almargem`), "almargem");
    await p.waitForSelector(".janela-pq");
    await captura(p, "sem-rede-pesqueiro");
    await p.click(".dia[data-dia='2']");
    assert.equal(await diaEscolhido(p), "2");
    await arquivada(p, "almargem, dia 2");
    // Página → comparador do mesmo dia.
    await seguir(p, ".ligacao-comp a", /comparador\.html\?dia=2$/, "«Comparar com os outros pesqueiros»");
    await p.waitForSelector(".linha-comp");
    assert.equal(await diaEscolhido(p), "2", "o comparador leu ?dia=2");
    await arquivada(p, "comparador (a partir do pesqueiro)");
    // Comparador → outro pesqueiro.
    await seguir(p, ".linha-comp a[href*='id=ancao']", /pesqueiro\.html\?id=ancao&dia=2$/, "linha do Ancão");
    await p.waitForSelector(".janela-pq");
    assert.equal(await p.textContent("h1"), nome("ancao"));
    assert.equal(await diaEscolhido(p), "2");
    await arquivada(p, "ancão (a partir do comparador)");
    // Barra → início.
    await seguir(p, "nav.barra a[href='./']", /\/$/, "barra: Início");
    await p.waitForSelector(".cartoes .cartao");
    await arquivada(p, "início (a partir do pesqueiro)");
    origens.push(await voltar(p, /pesqueiro\.html\?id=ancao&dia=2$/, "voltar ao Ancão", async () => {
      await p.waitForSelector(".janela-pq");
      assert.equal(await p.textContent("h1"), nome("ancao"));
      assert.equal(await diaEscolhido(p), "2", "o Ancão volta no dia 2");
      await arquivada(p, "ancão (voltar atrás)");
    }));
    // A rede volta, com a página do pesqueiro aberta.
    await p.evaluate(() => { window.__semRecarregar = true; });
    novo = await redeVolta(c);
    await actualizaSemRecarregar(p, "ancão");
    assert.equal(await p.textContent("h1"), nome("ancao"));
    assert.deepEqual(c.erros.filter(e => !ERROS_DE_REDE.test(e)), []);
    for (const o of origens) t.diagnostic(`voltar atrás — ${o}`);
  } finally {
    await c.contexto.close();
    await novo?.fechar();
  }
});
