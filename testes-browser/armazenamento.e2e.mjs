// Armazenamento local no browser (plano de evolução, PR 3), com o IndexedDB real do Chromium:
// contrato do armazém, migração de esquema, base aberta noutro separador, e a app com rede (guarda a
// leitura), sem rede (previsão arquivada, marcada como tal) e sem nada guardado (indisponível).
// Correr: npm run test:browser.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { servir, abrir, lancar, larguras, captura, AGORA } from "./apoio.mjs";

let srv, browser;
before(async () => { srv = await servir(); browser = await lancar(); });
after(async () => { await browser?.close(); await srv?.fechar(); });

const ERROS_DE_REDE = /ERR_INTERNET_DISCONNECTED|Failed to load resource/;

test("IndexedDB: o armazém cumpre a mesma interface do de memória (lojas, índices, operações)", async () => {
  const { contexto, pagina, registo } = await abrir(browser);
  try {
    await pagina.goto(`${srv.url}/fontes.html`);
    const r = await pagina.evaluate(async () => {
      const { abrirIndexedDB } = await import("./js/armazenamento/indexeddb.js");
      const a = await abrirIndexedDB({ nome: "teste-contrato" });
      await a.guardar("leituras", { id: "2026-11-15T10:00:00.000Z", x: [1] });
      await a.guardar("leituras", { id: "2026-11-15T09:00:00.000Z", x: [2] });
      await a.guardar("diario", { id: "s1", inicio: "2026-11-15T07:00:00Z", pesqueiro: "ancao" });
      await a.guardar("meta", { chave: "ultimaLimpeza", valor: 1 });
      const out = { tipo: a.tipo, chaves: await a.chaves("leituras"), obtido: await a.obter("leituras", "2026-11-15T10:00:00.000Z"),
        lista: (await a.listar("leituras")).map(v => v.id), diario: await a.obter("diario", "s1") };
      await a.apagar("leituras", "2026-11-15T09:00:00.000Z");
      out.depoisApagar = await a.chaves("leituras");
      await a.limpar("leituras");
      out.depoisLimpar = await a.chaves("leituras");
      out.semChave = await a.guardar("leituras", { semId: 1 }).then(() => "guardou", e => e.name);
      await a.fechar();
      const db = await new Promise(res => { const q = indexedDB.open("teste-contrato"); q.onsuccess = () => res(q.result); });
      out.versao = db.version;
      out.lojas = [...db.objectStoreNames].sort();
      const tx = db.transaction(["diario", "condicoes"]);
      out.indices = { diario: [...tx.objectStore("diario").indexNames].sort(), condicoes: [...tx.objectStore("condicoes").indexNames] };
      db.close();
      return out;
    });
    assert.equal(r.tipo, "IndexedDB");
    assert.deepEqual(r.chaves, ["2026-11-15T09:00:00.000Z", "2026-11-15T10:00:00.000Z"]);
    assert.deepEqual(r.obtido, { id: "2026-11-15T10:00:00.000Z", x: [1] });
    assert.deepEqual(r.lista, r.chaves);
    assert.equal(r.diario.pesqueiro, "ancao");
    assert.deepEqual(r.depoisApagar, ["2026-11-15T10:00:00.000Z"]);
    assert.deepEqual(r.depoisLimpar, []);
    assert.equal(r.semChave, "DataError");
    assert.equal(r.versao, 1);
    assert.deepEqual(r.lojas, ["condicoes", "diario", "leituras", "meta"]);
    assert.deepEqual(r.indices, { diario: ["porInicio", "porPesqueiro"], condicoes: ["porSaida"] });
    assert.deepEqual(registo.erros, []);
  } finally { await contexto.close(); }
});

test("IndexedDB: escrever várias operações é tudo ou nada (um erro desfaz o apagar)", async () => {
  const { contexto, pagina, registo } = await abrir(browser);
  try {
    await pagina.goto(`${srv.url}/fontes.html`);
    const r = await pagina.evaluate(async () => {
      const { abrirIndexedDB } = await import("./js/armazenamento/indexeddb.js");
      const a = await abrirIndexedDB({ nome: "teste-transaccao" });
      await a.guardar("leituras", { id: "2026-11-20T08:00:00.000Z", x: 1 });
      const erro = await a.escrever({ apagar: { leituras: ["2026-11-20T08:00:00.000Z"] },
        guardar: { leituras: [{ id: "2026-11-20T10:00:00.000Z" }, { semId: true }] } }).then(() => "escreveu", e => e.name);
      const depoisErro = await a.chaves("leituras");
      await a.escrever({ apagar: { leituras: ["2026-11-20T08:00:00.000Z"] }, guardar: { leituras: [{ id: "2026-11-20T10:00:00.000Z" }] } });
      const depoisOk = await a.chaves("leituras");
      await a.fechar();
      return { erro, depoisErro, depoisOk };
    });
    assert.equal(r.erro, "DataError");
    assert.deepEqual(r.depoisErro, ["2026-11-20T08:00:00.000Z"], "nada mudou");
    assert.deepEqual(r.depoisOk, ["2026-11-20T10:00:00.000Z"]);
    assert.deepEqual(registo.erros, []);
  } finally { await contexto.close(); }
});

test("IndexedDB: migração de esquema conserva e transforma os registos; versão mais antiga é recusada sem bloquear", async () => {
  const { contexto, pagina } = await abrir(browser);
  try {
    await pagina.goto(`${srv.url}/fontes.html`);
    const r = await pagina.evaluate(async () => {
      const { abrirIndexedDB, abrirArmazem } = await import("./js/armazenamento/indexeddb.js");
      const { MIGRACOES } = await import("./js/armazenamento/esquema.js");
      const nome = "teste-migracao";
      const v1 = await abrirIndexedDB({ nome });
      await v1.guardar("diario", { id: "s1", inicio: "2026-11-15T07:00:00Z", pesqueiro: "ancao", especie: "robalo" });
      // A versão 1 continua aberta: a migração para a 2 fecha-a (onversionchange) e avança.
      const m2 = (db, tx) => {
        const loja = tx.objectStore("diario");
        loja.createIndex("porEspecie", "especie");
        loja.openCursor().onsuccess = ev => {
          const c = ev.target.result;
          if (c) { c.update({ ...c.value, esquemaSaida: 2 }); c.continue(); }
        };
      };
      const v2 = await abrirIndexedDB({ nome, migracoes: [...MIGRACOES, m2] });
      const s1 = await v2.obter("diario", "s1");
      await v2.fechar();
      const db = await new Promise(res => { const q = indexedDB.open(nome); q.onsuccess = () => res(q.result); });
      const versao = db.version;
      const indices = [...db.transaction("diario").objectStore("diario").indexNames].sort();
      db.close();
      const antiga = await abrirArmazem({ nome });   // a app antiga (versão 1) com a base já na 2
      const v1Fechada = await v1.obter("diario", "s1").then(() => "aberta", e => e.name);
      return { s1, versao, indices, antiga, v1Fechada };
    });
    assert.deepEqual(r.s1, { id: "s1", inicio: "2026-11-15T07:00:00Z", pesqueiro: "ancao", especie: "robalo", esquemaSaida: 2 });
    assert.equal(r.versao, 2);
    assert.deepEqual(r.indices, ["porEspecie", "porInicio", "porPesqueiro"]);
    assert.equal(r.antiga.ok, false, "uma app mais antiga não abre a base nova: segue sem guardar");
    assert.match(r.antiga.erro, /version|versão/i);
    assert.equal(r.v1Fechada, "InvalidStateError", "a ligação antiga foi fechada para deixar migrar");
  } finally { await contexto.close(); }
});

test("app: com rede guarda a leitura; sem rede mostra a previsão arquivada com data, hora e idade; a rede volta e actualiza", async () => {
  const { contexto, pagina, registo, rede } = await abrir(browser);
  try {
    await pagina.goto(`${srv.url}/`);
    await pagina.waitForSelector(".cartoes");
    assert.equal(await pagina.locator(".aviso-origem").count(), 0, "dados actuais: sem aviso");
    const guardadas = await pagina.evaluate(async () => {
      const { abrirIndexedDB } = await import("./js/armazenamento/indexeddb.js");
      const a = await abrirIndexedDB();
      const k = await a.chaves("leituras");
      const l = await a.obter("leituras", k[0]);
      await a.fechar();
      return { k, pontos: l.resumo };
    });
    assert.equal(guardadas.k.length, 1);
    assert.deepEqual(guardadas.pontos, { pontosObtidos: 16, pontos: 16, boia: true });
    // Três horas depois, sem rede para as APIs.
    rede.apis = false;
    await pagina.clock.setFixedTime(new Date(AGORA.getTime() + 3 * 3600000));
    await pagina.reload();
    await pagina.waitForSelector(".aviso-origem.arquivo");
    assert.match(await pagina.textContent(".aviso-origem"), /Previsão arquivada — não é a previsão actual/);
    assert.match(await pagina.textContent(".topo .lido"), /Previsão arquivada, lida às 10:40 \(há 3 h\)/);
    assert.equal(await pagina.locator(".cartao").count(), 8, "os oito pesqueiros");
    assert.ok(await pagina.locator(".janelas li").count() >= 1, "notas da leitura arquivada");
    await pagina.click(".cartao .detalhes summary");
    assert.match(await pagina.textContent(".cartao .fontes"), /arquivada \(sem rede\) · lido às 10:40/);
    const l = await larguras(pagina);
    assert.ok(l.conteudo <= l.ecra);
    await captura(pagina, "inicio-sem-rede-arquivo");
    // O comparador também diz que é arquivada.
    await pagina.goto(`${srv.url}/comparador.html`);
    await pagina.waitForSelector(".aviso-origem.arquivo");
    await captura(pagina, "comparador-sem-rede-arquivo");
    // A rede volta: actualiza sozinha e o aviso desaparece.
    await pagina.goto(`${srv.url}/`);
    await pagina.waitForSelector(".aviso-origem.arquivo");
    rede.apis = true;
    await pagina.evaluate(() => window.dispatchEvent(new Event("online")));
    await pagina.waitForFunction(() => !document.querySelector(".aviso-origem") && /Dados lidos às/.test(document.querySelector(".topo .lido")?.textContent));
    assert.deepEqual(registo.erros.filter(e => !ERROS_DE_REDE.test(e)), []);
  } finally { await contexto.close(); }
});

for (const dispositivo of ["Pixel 7", { width: 360, height: 780 }]) {
  const nome = typeof dispositivo === "string" ? "pixel7" : "360px";
  test(`app sem rede e sem nada guardado (${nome}): previsão indisponível, sem notas completas, sem deslocamento horizontal`, async () => {
    const { contexto, pagina, registo } = await abrir(browser, dispositivo, { semApis: true });
    try {
      await pagina.goto(`${srv.url}/`);
      await pagina.waitForSelector(".aviso-origem.indisponivel");
      assert.match(await pagina.textContent(".aviso-origem"), /Previsão indisponível\.[\s\S]*Não há nenhuma previsão guardada neste aparelho/);
      assert.match(await pagina.textContent(".topo .lido"), /^Previsão não obtida \(tentativa às 10:40/);
      assert.equal(await pagina.locator(".cartao").count(), 8);
      assert.equal(await pagina.locator(".selo:not(.nd):not(.inc)").count(), 0, "nenhuma nota completa");
      const l = await larguras(pagina);
      assert.ok(l.conteudo <= l.ecra, `${l.conteudo} > ${l.ecra}`);
      await captura(pagina, `inicio-sem-rede-indisponivel-${nome}`);
      assert.deepEqual(registo.erros.filter(e => !ERROS_DE_REDE.test(e)), []);
    } finally { await contexto.close(); }
  });
}

test("diagnóstico: mostra o armazenamento neste aparelho", async () => {
  const { contexto, pagina } = await abrir(browser);
  try {
    await pagina.goto(`${srv.url}/`);
    await pagina.waitForSelector(".cartoes");
    await pagina.goto(`${srv.url}/diagnostico.html`);
    await pagina.waitForFunction(() => [...document.querySelectorAll("#results article h2")].some(h => /Armazenamento/.test(h.textContent)));
    const txt = await pagina.locator("#results article", { hasText: "Armazenamento" }).textContent();
    assert.match(txt, /1 leitura\(s\) guardada\(s\)/);
  } finally { await contexto.close(); }
});
