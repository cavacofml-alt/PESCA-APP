// Estatísticas no browser (plano de evolução, PR 6): lidas do diário no IndexedDB real, com filtros,
// n em cada valor, «sem registos», Pixel 7 e 360 px, e sem rede. Correr: npm run test:browser.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { servir, abrir, lancar, larguras, textoLarguras, captura } from "./apoio.mjs";

let srv, browser;
before(async () => { srv = await servir(); browser = await lancar(); });
after(async () => { await browser?.close(); await srv?.fechar(); });

// Saídas escritas directamente na base (o diário é testado em diario.e2e.mjs).
async function semear(pagina, { validas = true, estragadas = false } = {}) {
  await pagina.goto(`${srv.url}/fontes.html`);
  await pagina.evaluate(async ({ validas, estragadas }) => {
    const { abrirIndexedDB } = await import("./js/armazenamento/indexeddb.js");
    const a = await abrirIndexedDB();
    const S = (id, inicio, pesqueiro, capturas, alvo = ["robalo"]) => ({ id, esquema: 1, pesqueiro, inicio, fim: null, especiesAlvo: alvo, outraAlvo: null,
      resultado: capturas.length ? "com capturas" : "sem capturas", capturas, observacoes: "", criadoEm: inicio, alteradoEm: inicio, condicoesId: null });
    const boas = [
      S("s-1", "2026-09-10T05:30:00.000Z", "ancao", [{ especie: "robalo", outra: null, quantidade: 2, tamanhoCm: 44, observacoes: "" }]),
      S("s-2", "2026-11-01T07:30:00.000Z", "ancao", []),
      S("s-3", "2026-11-10T15:00:00.000Z", "ria", [{ especie: "dourada", outra: null, quantidade: 3, tamanhoCm: null, observacoes: "" }], ["dourada"])
    ];
    // Registos estragados (não passam na validação): 30/02 não existe; esquema desconhecido.
    const mas = [
      S("x-1", "2026-02-30T06:00:00.000Z", "ancao", [{ especie: "robalo", outra: null, quantidade: 5, tamanhoCm: 60, observacoes: "" }]),
      { ...S("x-2", "2026-11-12T06:00:00.000Z", "falesia", [{ especie: "robalo", outra: null, quantidade: 4, tamanhoCm: 50, observacoes: "" }]), esquema: 99 }
    ];
    await a.escrever({ guardar: { diario: [...(validas ? boas : []), ...(estragadas ? mas : [])] } });
    await a.fechar();
  }, { validas, estragadas });
}

for (const dispositivo of ["Pixel 7", { width: 360, height: 780 }]) {
  const nome = typeof dispositivo === "string" ? "pixel7" : "360px";
  test(`estatísticas (${nome}): a partir do diário, com n, «sem registos» e filtros; sem deslocamento horizontal`, async () => {
    const { contexto, pagina, registo } = await abrir(browser, dispositivo);
    try {
      await semear(pagina);
      await pagina.goto(`${srv.url}/diario.html`);
      await pagina.click("text=Estatísticas ›");
      await pagina.waitForURL(/estatisticas\.html$/);
      await pagina.waitForSelector(".tabela-stats");
      assert.match(await pagina.textContent("[aria-label=Resumo]"), /n = 3 saída\(s\)[\s\S]*2 de 3 \(67 %\)/);
      assert.match(await pagina.textContent("[aria-label='Por pesqueiro']"), /Ancão\s*2\*\s*1\/2 \(50 %\)/);
      assert.match(await pagina.textContent("[aria-label='Por mês']"), /out 2026\s*0\s*sem saídas registadas \(não é zero capturas\)/);
      assert.match(await pagina.textContent("[aria-label='Por pesqueiro']"), /Falésia[^\n]*0\s*sem registos/);
      await pagina.selectOption("[name=especie]", "dourada");
      await pagina.waitForFunction(() => /n = 1 saída\(s\) de 3/.test(document.querySelector("[aria-label=Resumo]")?.textContent));
      await pagina.selectOption("[name=pesqueiro]", "falesia");
      await pagina.waitForSelector("text=Nenhuma saída com estes filtros");
      await pagina.selectOption("[name=especie]", "todas");
      await pagina.selectOption("[name=pesqueiro]", "todos");
      await pagina.selectOption("[name=periodo]", "intervalo");
      await pagina.waitForSelector("[name=desde]:visible");
      await pagina.fill("[name=desde]", "2026-11-01");
      await pagina.dispatchEvent("[name=desde]", "change");
      await pagina.waitForFunction(() => /n = 2 saída\(s\) de 3/.test(document.querySelector("[aria-label=Resumo]")?.textContent));
      const l = await larguras(pagina);
      assert.ok(l.ok, `sem deslocamento horizontal — ${textoLarguras(l)}`);
      await captura(pagina, `estatisticas-${nome}`);
      assert.deepEqual(registo.erros, []);
    } finally { await contexto.close(); }
  });
}

test("estatísticas sem rede e sem saídas: diz que não há registos (não zero)", async () => {
  const { contexto, pagina, registo } = await abrir(browser, "Pixel 7", { semApis: true });
  try {
    await pagina.goto(`${srv.url}/estatisticas.html`);
    await pagina.waitForSelector(".vazio");
    assert.match(await pagina.textContent(".vazio"), /Ainda não há saídas no diário: sem registos, não há estatísticas/);
    assert.equal(await pagina.locator(".falha").count(), 0, "sem registos inválidos, sem aviso");
    assert.deepEqual(registo.externos, []);
    assert.deepEqual(registo.erros, []);
  } finally { await contexto.close(); }
});

// Registos inválidos no diário (revisão do PR #30, 22/11/2026): não entram nas contas e o ecrã diz quantos são.
test("estatísticas com registos inválidos: contas só com os válidos e aviso com a contagem", async () => {
  const { contexto, pagina, registo } = await abrir(browser, "Pixel 7");
  try {
    await semear(pagina, { validas: true, estragadas: true });
    await pagina.goto(`${srv.url}/estatisticas.html`);
    await pagina.waitForSelector("[aria-label=Resumo]");
    assert.equal((await pagina.textContent(".falha")).trim(), "2 registo(s) com formato inválido não entram nas estatísticas.");
    assert.match(await pagina.textContent("[aria-label=Resumo]"), /n = 3 saída\(s\)[\s\S]*2 de 3 \(67 %\)/);
    assert.match(await pagina.textContent("[aria-label='Por pesqueiro']"), /Falésia[^\n]*0\s*sem registos/, "a saída inválida da Falésia não conta");
    // Com um filtro sem resultados, o aviso continua à vista.
    await pagina.selectOption("[name=pesqueiro]", "falesia");
    await pagina.waitForSelector("text=Nenhuma saída com estes filtros");
    assert.equal(await pagina.locator(".falha").count(), 1);
    assert.deepEqual(registo.erros, []);
  } finally { await contexto.close(); }
});

test("estatísticas só com registos inválidos: aviso e nenhuma estatística", async () => {
  const { contexto, pagina, registo } = await abrir(browser, "Pixel 7");
  try {
    await semear(pagina, { validas: false, estragadas: true });
    await pagina.goto(`${srv.url}/estatisticas.html`);
    await pagina.waitForSelector(".vazio");
    assert.equal((await pagina.textContent(".falha")).trim(), "2 registo(s) com formato inválido não entram nas estatísticas.");
    assert.match(await pagina.textContent(".vazio"), /Não há saídas válidas no diário: sem registos válidos, não há estatísticas/);
    assert.equal(await pagina.locator("[aria-label=Resumo], .tabela-stats, #filtros").count(), 0);
    assert.deepEqual(registo.erros, []);
  } finally { await contexto.close(); }
});
