// Instalação do service worker interrompida a meio (revisão de 22/11/2026, ressalva ao D1). O teste
// unitário simula o cache.addAll; aqui é o Chromium real. Em todos os casos o servidor responde 404 a
// mares/2027.json (um dos DADOS) enquanto o service worker novo se instala, e confirma-se que:
//   1. primeira instalação: o service worker novo não fica a controlar a página, não fica nenhuma cache,
//      a app funciona com rede e, com o ficheiro de volta, a visita seguinte instala-o;
//   2. actualização com um service worker anterior activo (outro nome de cache, como em cada
//      publicação): o anterior não é substituído, a cache dele fica intacta, a cache nova não fica e o
//      anterior continua a servir a app, também sem rede;
//   3. actualização com o MESMO nome de cache: a cache em uso não é apagada nem fica meio escrita
//      (addAll tudo ou nada no browser real; o index.html servido muda e a cópia na cache fica a antiga).
// O sw.js do repositório não muda: o «anterior» é o mesmo código com outro nome de cache (caso 2) ou
// com mais uma linha de comentário (caso 3), escrito só na pasta temporária que o servidor de teste
// publica. A tabela de 2027 não é precisa à app a 15/11/2026 (a janela de 7 dias fica em 2026).
// Correr: npm run test:browser.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { servir, abrir, lancar, AGORA } from "./apoio.mjs";

let browser;
before(async () => { browser = await lancar(); });
after(async () => { await browser?.close(); });

const errosReais = lista => lista.filter(e => !/ERR_INTERNET_DISCONNECTED|ERR_CONNECTION_REFUSED|Failed to load resource|Failed to fetch/.test(e));

// Nome da cache do sw.js publicado (o do repositório).
function nomeDaCache(pasta) {
  const m = fs.readFileSync(path.join(pasta, "sw.js"), "utf8").match(/const CACHE = "(surfcasting-shell-v(\d+))";/);
  assert.ok(m, "o sw.js define const CACHE = \"surfcasting-shell-vN\"");
  return { nome: m[1], versao: Number(m[2]) };
}
// Tira e repõe mares/2027.json da pasta servida (o servidor de teste responde 404 enquanto falta).
function tirar2027(pasta) {
  const f = path.join(pasta, "mares", "2027.json");
  fs.renameSync(f, `${f}.fora`);
  return () => fs.renameSync(`${f}.fora`, f);
}
// Caches da app e o conteúdo de cada uma (caminhos, por ordem alfabética, e número de entradas).
const lerCaches = pagina => pagina.evaluate(async () => {
  const r = {};
  for (const k of (await caches.keys()).filter(k => k.startsWith("surfcasting-shell-"))) {
    const urls = (await (await caches.open(k)).keys()).map(q => new URL(q.url).pathname + new URL(q.url).search).sort();
    r[k] = { n: urls.length, urls };
  }
  return r;
});
// Espera que o service worker esteja activo e a controlar a página.
async function controlada(pagina) {
  await pagina.evaluate(() => navigator.serviceWorker.ready);
  await pagina.waitForFunction(() => navigator.serviceWorker.controller?.state === "activated", null, { timeout: 15000 });
}
// Pede uma actualização e espera pelo fim da instalação do service worker novo (redundant ou activated).
const actualizar = pagina => pagina.evaluate(async () => {
  const reg = await navigator.serviceWorker.getRegistration();
  const antes = reg.active;
  const estados = [];
  const fim = new Promise(resolve => {
    reg.addEventListener("updatefound", () => {
      const w = reg.installing;
      estados.push(w.state);
      w.addEventListener("statechange", () => {
        estados.push(w.state);
        if (w.state === "redundant" || w.state === "activated") resolve();
      });
    });
  });
  await reg.update().catch(e => estados.push(`update() rejeitou: ${e}`));
  await Promise.race([fim, new Promise(r => setTimeout(() => { estados.push("tempo esgotado"); r(); }, 20000))]);
  return {
    estados, mesmoActivo: reg.active === antes, activo: reg.active?.state ?? null,
    waiting: Boolean(reg.waiting), installing: Boolean(reg.installing),
    controlador: navigator.serviceWorker.controller?.state ?? null
  };
});
// Abre uma página num separador novo sem rede (servidor desligado), com o relógio fixo.
async function semRede(contexto, url, seletor, erros) {
  const p = await contexto.newPage();
  await p.clock.setFixedTime(new Date(AGORA.getTime() + 2 * 3600000));
  p.on("pageerror", e => erros.push(`${url}: ${e}`));
  p.on("console", m => { if (m.type() === "error") erros.push(`${url}: ${m.text()}`); });
  const r = await p.goto(url);
  assert.ok(r?.ok(), `${url}: a página veio da cache do service worker anterior (estado ${r?.status()})`);
  await p.waitForSelector(seletor, { timeout: 15000 });
  return p;
}

test("primeira instalação interrompida (404 em mares/2027.json): o service worker não fica activo, não fica cache, a app funciona com rede e a visita seguinte instala-o", async () => {
  const srv = await servir();
  const { contexto, pagina, registo } = await abrir(browser, "Pixel 7", { serviceWorker: true });
  // Regista os estados do service worker que a app instala (js/registo-sw.js chama register()).
  await contexto.addInitScript(() => {
    window.__sw = [];
    const sw = navigator.serviceWorker;
    if (!sw) return;
    const original = sw.register.bind(sw);
    sw.register = (...args) => original(...args).then(reg => {
      const w = reg.installing;
      window.__sw.push(w ? w.state : `sem installing (activo: ${reg.active?.state ?? "nenhum"})`);
      w?.addEventListener("statechange", () => window.__sw.push(w.state));
      return reg;
    });
  });
  const repor = tirar2027(srv.pasta);
  try {
    await pagina.goto(`${srv.url}/`);
    await pagina.waitForSelector(".cartoes .cartao");
    await pagina.waitForFunction(() => window.__sw.includes("redundant") || window.__sw.includes("activated"), null, { timeout: 20000 });
    const estados = await pagina.evaluate(() => window.__sw);
    assert.equal(estados.at(-1), "redundant", `a instalação falhou: ${estados.join(" → ")}`);
    assert.ok(!estados.includes("installed") && !estados.includes("activated"), `nunca ficou instalado nem activo: ${estados.join(" → ")}`);
    const estado = await pagina.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      return { controlador: navigator.serviceWorker.controller?.state ?? null, activo: reg?.active?.state ?? null, waiting: Boolean(reg?.waiting) };
    });
    assert.deepEqual(estado, { controlador: null, activo: null, waiting: false }, "nenhum service worker controla a página nem fica à espera");
    assert.deepEqual(await lerCaches(pagina), {}, "não ficou nenhuma cache da app (nem parcial)");
    // A app funciona com rede, sem service worker.
    assert.equal(await pagina.locator(".cartao").count(), 8);
    assert.equal(await pagina.locator(".aviso-origem.arquivo").count(), 0, "dados actuais, não arquivados");

    // Com o ficheiro de volta, a visita seguinte instala o service worker e guarda a tabela de 2027.
    repor();
    const p2 = await contexto.newPage();
    await p2.clock.setFixedTime(AGORA);
    await p2.goto(`${srv.url}/`);
    await p2.waitForSelector(".cartoes .cartao");
    await controlada(p2);
    const caches = await lerCaches(p2);
    const { nome } = nomeDaCache(srv.pasta);
    assert.deepEqual(Object.keys(caches), [nome]);
    assert.ok(caches[nome].urls.includes("/mares/2027.json"), "a tabela de 2027 está na cache");
    assert.deepEqual(errosReais(registo.erros), []);
  } finally {
    if (!fs.existsSync(path.join(srv.pasta, "mares", "2027.json"))) repor();
    await contexto.close();
    await srv.fechar();
  }
});

test("actualização interrompida com um service worker anterior activo: o anterior não é substituído, a cache dele fica intacta, a nova não fica e a app continua a abrir, também sem rede", async () => {
  const srv = await servir();
  const { contexto, pagina, registo, rede } = await abrir(browser, "Pixel 7", { serviceWorker: true });
  const swReal = fs.readFileSync(path.join(srv.pasta, "sw.js"), "utf8");
  const { nome, versao } = nomeDaCache(srv.pasta);
  const anterior = `surfcasting-shell-v${versao - 1}`;
  const erros = [];
  try {
    // 1. Versão anterior: o mesmo código com o nome de cache da versão de antes, instalado com rede.
    fs.writeFileSync(path.join(srv.pasta, "sw.js"), swReal.replace(`const CACHE = "${nome}";`, `const CACHE = "${anterior}";`));
    await pagina.goto(`${srv.url}/`);
    await pagina.waitForSelector(".cartoes .cartao");
    await controlada(pagina);
    const antes = await lerCaches(pagina);
    assert.deepEqual(Object.keys(antes), [anterior]);
    assert.ok(antes[anterior].urls.includes("/mares/2027.json"));

    // 2. Publica-se a versão nova (o sw.js do repositório), mas mares/2027.json falha durante a instalação.
    fs.writeFileSync(path.join(srv.pasta, "sw.js"), swReal);
    const repor = tirar2027(srv.pasta);
    const r = await actualizar(pagina);
    assert.deepEqual(r.estados, ["installing", "redundant"], `a instalação da versão nova falhou: ${r.estados.join(" → ")}`);
    assert.deepEqual({ mesmoActivo: r.mesmoActivo, activo: r.activo, waiting: r.waiting, installing: r.installing, controlador: r.controlador },
      { mesmoActivo: true, activo: "activated", waiting: false, installing: false, controlador: "activated" },
      "o service worker anterior continua activo e a controlar a página; nenhum fica à espera");
    const depois = await lerCaches(pagina);
    assert.deepEqual(Object.keys(depois), [anterior], `a cache nova (${nome}) não ficou e a anterior não foi apagada`);
    assert.deepEqual(depois[anterior], antes[anterior], "a cache anterior ficou intacta");

    // 3. Com rede, a app continua a abrir (página controlada pelo service worker anterior).
    await pagina.reload();
    await pagina.waitForSelector(".cartoes .cartao");
    assert.equal(await pagina.locator(".cartao").count(), 8);
    assert.equal(await pagina.evaluate(() => navigator.serviceWorker.controller?.state), "activated");

    // 4. Sem rede nenhuma (APIs recusadas e servidor desligado), o anterior continua a servir a app.
    repor();
    rede.apis = false;
    await srv.fechar();
    await assert.rejects(fetch(srv.url), "o servidor da app está mesmo desligado");
    await pagina.close();
    let p = await semRede(contexto, `${srv.url}/`, ".cartoes .cartao", erros);
    assert.equal(await p.locator(".cartao").count(), 8);
    assert.ok(await p.locator(".aviso-origem.arquivo").count() > 0, "«Previsão arquivada»");
    await p.close();
    p = await semRede(contexto, `${srv.url}/pesqueiro.html?id=falesia`, ".janela-pq", erros);
    await p.close();
    assert.deepEqual(errosReais([...registo.erros, ...erros]), []);
  } finally {
    await contexto.close();
    await srv.fechar().catch(() => {});
  }
});

test("actualização interrompida com o MESMO nome de cache: a cache em uso não é apagada nem fica meio escrita (addAll tudo ou nada no Chromium)", async () => {
  const srv = await servir();
  const { contexto, pagina, registo } = await abrir(browser, "Pixel 7", { serviceWorker: true });
  const swReal = fs.readFileSync(path.join(srv.pasta, "sw.js"), "utf8");
  const { nome } = nomeDaCache(srv.pasta);
  const indice = path.join(srv.pasta, "index.html");
  try {
    // 1. Versão anterior com o mesmo nome de cache (outros bytes: mais uma linha de comentário).
    fs.writeFileSync(path.join(srv.pasta, "sw.js"), `${swReal}\n// versão anterior (teste): o mesmo nome de cache\n`);
    await pagina.goto(`${srv.url}/`);
    await pagina.waitForSelector(".cartoes .cartao");
    await controlada(pagina);
    const antes = await lerCaches(pagina);
    assert.deepEqual(Object.keys(antes), [nome]);

    // 2. Versão nova: o index.html servido muda e mares/2027.json falha durante a instalação.
    fs.writeFileSync(path.join(srv.pasta, "sw.js"), swReal);
    fs.appendFileSync(indice, "\n<!-- marca-da-versao-nova -->\n");
    const repor = tirar2027(srv.pasta);
    const r = await actualizar(pagina);
    assert.deepEqual(r.estados, ["installing", "redundant"], `a instalação falhou: ${r.estados.join(" → ")}`);
    assert.equal(r.mesmoActivo, true, "o service worker anterior continua activo");
    assert.equal(r.controlador, "activated");

    // 3. A cache em uso não foi apagada, tem as mesmas entradas, e nenhuma foi escrita pela instalação
    //    falhada: o index.html guardado é o antigo, sem a marca, e a tabela de 2027 antiga continua lá.
    const depois = await lerCaches(pagina);
    assert.deepEqual(depois, antes, "a cache em uso ficou igual");
    const guardado = await pagina.evaluate(async n => {
      const c = await caches.open(n);
      return { indice: await (await c.match("./index.html")).text(), mares2027: Boolean(await c.match("./mares/2027.json")) };
    }, nome);
    assert.doesNotMatch(guardado.indice, /marca-da-versao-nova/, "o index.html na cache não foi substituído pelo novo");
    assert.equal(guardado.mares2027, true, "a tabela de 2027 guardada antes continua na cache");

    // 4. A app continua a abrir, servida pelo service worker anterior (o index.html vem da cache).
    await pagina.reload();
    await pagina.waitForSelector(".cartoes .cartao");
    assert.equal(await pagina.locator(".cartao").count(), 8);
    assert.doesNotMatch(await pagina.content(), /marca-da-versao-nova/);
    repor();
    assert.deepEqual(errosReais(registo.erros), []);
  } finally {
    await contexto.close();
    await srv.fechar();
  }
});
