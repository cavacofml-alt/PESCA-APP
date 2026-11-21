// Histórico de previsões no browser (plano de evolução, PR 7): a partir das Fontes; com uma leitura
// guardada e medições da boia, mostra os pares (só altura e água com diferença); sem pares nem
// leituras, diz-o; Pixel 7 e 360 px; sem rede. Correr: npm run test:browser.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { servir, abrir, lancar, larguras, captura, RAIZ } from "./apoio.mjs";

const marine = JSON.parse(fs.readFileSync(path.join(RAIZ, "testes/reais/openmeteo_marine_faro_20261014_0946.json"), "utf8"));
const config = JSON.parse(fs.readFileSync(path.join(RAIZ, "config.json"), "utf8"));
let srv, browser;
before(async () => { srv = await servir(); browser = await lancar(); });
after(async () => { await browser?.close(); await srv?.fechar(); });

async function semear(pagina) {
  await pagina.goto(`${srv.url}/fontes.html`);
  await pagina.evaluate(async ({ marine, ponto }) => {
    const { abrirIndexedDB } = await import("./js/armazenamento/indexeddb.js");
    const a = await abrirIndexedDB();
    const o = (iso, hm0, agua) => ({ instante: Date.parse(iso), hm0: { valor: hm0, estado: "obtido" }, agua: { valor: agua, estado: "obtido" },
      tm02: { valor: 5.2, estado: "obtido" }, direcao: { valor: 250, estado: "obtido" } });
    const l = (lidoEm, observacoes) => ({ id: lidoEm, esquema: 1, lidoEm, diaLisboa: lidoEm.slice(0, 10), resumo: { pontosObtidos: 16, pontos: 16, boia: true },
      fontes: { mar: { [ponto]: { ok: true, data: marine, readAt: lidoEm } }, terra: {}, boiaFaro: { ok: true, data: { observacoes } } } });
    await a.escrever({ guardar: { leituras: [
      l("2026-10-14T08:46:00.000Z", []),
      l("2026-10-14T13:30:00.000Z", [o("2026-10-14T10:00:00Z", 1.1, 21.4), o("2026-10-14T11:00:00Z", 1.0, 21.5)])
    ] } });
    await a.fechar();
  }, { marine, ponto: config.boias.faro.previsaoPonto });
}

for (const dispositivo of ["Pixel 7", { width: 360, height: 780 }]) {
  const nome = typeof dispositivo === "string" ? "pixel7" : "360px";
  test(`histórico (${nome}): pares previsão × boia, só altura e água comparadas, sem deslocamento horizontal`, async () => {
    const { contexto, pagina, registo } = await abrir(browser, dispositivo);
    try {
      await pagina.clock.setFixedTime(new Date("2026-10-14T14:00:00Z"));
      await semear(pagina);
      await pagina.click("text=Histórico de previsões");
      await pagina.waitForURL(/historico\.html$/);
      await pagina.waitForSelector(".tabela-hist");
      const texto = await pagina.textContent("main");
      assert.match(texto, /Previsão arquivada ≠ observação/);
      assert.match(texto, /Leituras guardadas · 2/);
      assert.match(texto, /km da boia/);
      assert.match(texto, /sem medição/);
      const cab = await pagina.$$eval(".tabela-hist thead th", t => t.map(x => x.textContent));
      assert.deepEqual(cab, ["Hora", "Antecedência", "Onda prevista (m)", "Hm0 medido (m)", "Dif.", "Água prevista (°C)", "Água medida (°C)", "Dif.", "wave_period (s)", "Tm02 (s)"]);
      assert.equal(await pagina.textContent("nav.barra a.activo"), "Fontes");
      const l = await larguras(pagina);
      assert.ok(l.conteudo <= l.ecra, `${l.conteudo} > ${l.ecra}`);
      await captura(pagina, `historico-${nome}`);
      assert.deepEqual(registo.erros, []);
    } finally { await contexto.close(); }
  });
}

test("histórico sem rede e sem leituras: diz que não há previsões guardadas", async () => {
  const { contexto, pagina, registo } = await abrir(browser, "Pixel 7", { semApis: true });
  try {
    await pagina.goto(`${srv.url}/historico.html`);
    await pagina.waitForSelector(".vazio");
    assert.match(await pagina.textContent(".vazio"), /Ainda não há previsões guardadas neste aparelho/);
    assert.deepEqual(registo.externos, []);
    assert.deepEqual(registo.erros, []);
  } finally { await contexto.close(); }
});

test("histórico depois de usar a app: a leitura aparece; sem horas já chegadas com medição, diz-o", async () => {
  const { contexto, pagina, registo } = await abrir(browser);
  try {
    await pagina.goto(`${srv.url}/`);
    await pagina.waitForSelector(".cartoes");
    await pagina.goto(`${srv.url}/historico.html`);
    await pagina.waitForSelector("[aria-label='Leituras guardadas']");
    assert.match(await pagina.textContent("[aria-label='Leituras guardadas']"), /Leituras guardadas · 1/);
    assert.match(await pagina.textContent("[aria-label='Previsão e medição']"), /Ainda nenhuma hora prevista/);
    assert.deepEqual(registo.erros, []);
  } finally { await contexto.close(); }
});
