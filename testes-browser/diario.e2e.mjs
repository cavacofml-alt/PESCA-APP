// Diário no browser (plano de evolução, PR 5), com o IndexedDB real: criar (com capturas e sem
// capturas), condições associadas a partir da leitura guardada, editar, apagar, exportar e importar
// (um ficheiro inválido não mexe nos registos), sem rede para as APIs, Pixel 7 e 360 px.
// Correr: npm run test:browser.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { servir, abrir, lancar, larguras, captura } from "./apoio.mjs";

let srv, browser;
before(async () => { srv = await servir(); browser = await lancar(); });
after(async () => { await browser?.close(); await srv?.fechar(); });
const ERROS_DE_REDE = /ERR_INTERNET_DISCONNECTED|Failed to load resource/;

async function novaSaida(pagina, { pesqueiro = "ancao", dia = "2026-11-15", inicio = "07:00", fim = "10:30", semCapturas = false, capturas = [] } = {}) {
  await pagina.click("#nova-saida");
  await pagina.waitForSelector("dialog#dialogo-saida[open] form");
  await pagina.selectOption("[name=pesqueiro]", pesqueiro);
  await pagina.fill("[name=dia]", dia);
  await pagina.fill("[name=horaInicio]", inicio);
  await pagina.fill("[name=horaFim]", fim);
  if (semCapturas) await pagina.check("[name=resultado][value='sem capturas']");
  for (const [i, c] of capturas.entries()) {
    if (i > 0) await pagina.click("#mais-captura");
    const fs_ = pagina.locator(".captura").nth(i);
    await fs_.locator("select").selectOption(c.especie);
    if (c.outra) await fs_.locator("input[name^=cap-outra]").fill(c.outra);
    await fs_.locator("input[name^=cap-quantidade]").fill(String(c.quantidade));
    if (c.tamanho) await fs_.locator("input[name^=cap-tamanho]").fill(c.tamanho);
  }
  await pagina.click("#form-saida button[type=submit]");
}

for (const dispositivo of ["Pixel 7", { width: 360, height: 780 }]) {
  const nome = typeof dispositivo === "string" ? "pixel7" : "360px";
  test(`diário (${nome}): criar com capturas e sem capturas, sem deslocamento horizontal`, async () => {
    const { contexto, pagina, registo } = await abrir(browser, dispositivo);
    try {
      await pagina.goto(`${srv.url}/diario.html`);
      await pagina.waitForSelector(".vazio");
      await novaSaida(pagina, { capturas: [{ especie: "robalo", quantidade: 2, tamanho: "42,5" }, { especie: "outra", outra: "sargo", quantidade: 1 }] });
      await pagina.waitForSelector(".saida");
      await captura(pagina, `diario-formulario-guardado-${nome}`);
      await novaSaida(pagina, { pesqueiro: "molhe_quarteira", dia: "2026-11-14", inicio: "22:00", fim: "02:00", semCapturas: true });
      await pagina.waitForFunction(() => document.querySelectorAll(".saida").length === 2);
      const resumo = await pagina.$$eval(".saida summary", s => s.map(x => x.textContent.replace(/\s+/g, " ").trim()));
      assert.match(resumo[0], /^domingo, 15\/11\/2026 · 07:00–10:30 Praia do Ancão .* 3 capturas: 2 robalo, 1 sargo$/);
      assert.match(resumo[1], /^sábado, 14\/11\/2026 · 22:00–02:00 \(dia seguinte\) Molhe de Quarteira sem capturas$/);
      assert.match(await pagina.textContent(".aviso-origem.arquivo"), /Cópia de segurança/);
      await pagina.click(".saida summary");
      const l = await larguras(pagina);
      assert.ok(l.conteudo <= l.ecra, `${l.conteudo} > ${l.ecra}`);
      await captura(pagina, `diario-${nome}`);
      // Formulário aberto também cabe no ecrã.
      await pagina.click("#nova-saida");
      await pagina.waitForSelector("dialog#dialogo-saida[open]");
      const f = await pagina.evaluate(() => { const r = document.querySelector("dialog#dialogo-saida").getBoundingClientRect(); return { esq: r.left, dir: r.right, ecra: innerWidth }; });
      assert.ok(f.esq >= 0 && f.dir <= f.ecra, JSON.stringify(f));
      await captura(pagina, `diario-formulario-${nome}`);
      assert.deepEqual(registo.erros, []);
    } finally { await contexto.close(); }
  });
}

test("diário: erros do formulário aparecem e nada é guardado", async () => {
  const { contexto, pagina } = await abrir(browser);
  try {
    await pagina.goto(`${srv.url}/diario.html`);
    await pagina.waitForSelector("#nova-saida");
    await novaSaida(pagina, { capturas: [{ especie: "outra", quantidade: 1 }] });
    await pagina.waitForSelector(".erros");
    assert.match(await pagina.textContent(".erros"), /qual é a espécie/);
    await pagina.click("#cancelar");
    assert.equal(await pagina.locator(".saida").count(), 0);
  } finally { await contexto.close(); }
});

test("diário: com uma leitura guardada, a saída fica com as condições da previsão; editar e apagar", async () => {
  const { contexto, pagina, registo } = await abrir(browser);
  pagina.on("dialog", d => d.accept());
  try {
    await pagina.goto(`${srv.url}/`);          // guarda a leitura das 10:40
    await pagina.waitForSelector(".cartoes");
    await pagina.goto(`${srv.url}/diario.html`);
    await novaSaida(pagina, { pesqueiro: "praia_faro", capturas: [{ especie: "robalo", quantidade: 1 }] });
    await pagina.waitForSelector(".saida");
    assert.match(await pagina.textContent(".mensagem"), /Condições da previsão associadas/);
    await pagina.click(".saida summary");
    const cond = await pagina.textContent(".condicoes");
    assert.match(cond, /previsão \(Open-Meteo\) lida 15\/11 às 10:40, depois do início/);
    assert.match(cond, /Não são medições no pesqueiro/);
    assert.equal(await pagina.locator(".horas-saida tbody tr").count(), 4, "07:00, 08:00, 09:00 e 10:00");
    // Com a saída aberta, a tabela das condições desliza dentro do cartão: a página não passa a largura do ecrã.
    const l = await larguras(pagina);
    assert.ok(l.conteudo <= l.ecra, `saída aberta sem deslocamento horizontal (${l.conteudo} > ${l.ecra})`);
    // Editar: muda as observações; as condições ficam.
    await pagina.click(".editar");
    await pagina.fill("[name=observacoes]", "água limpa");
    await pagina.click("#form-saida button[type=submit]");
    await pagina.waitForFunction(() => /água limpa/.test(document.querySelector(".saida")?.textContent));
    await pagina.click(".saida summary");
    assert.match(await pagina.textContent(".condicoes"), /lida 15\/11 às 10:40/);
    // Apagar.
    await pagina.click(".apagar");
    await pagina.waitForSelector(".vazio");
    assert.match(await pagina.textContent(".mensagem"), /Saída apagada/);
    assert.deepEqual(registo.erros, []);
  } finally { await contexto.close(); }
});

test("diário: exportar e importar noutro aparelho; um ficheiro inválido é recusado sem mexer nos registos", async () => {
  const a = await abrir(browser);
  let ficheiro;
  try {
    await a.pagina.goto(`${srv.url}/diario.html`);
    await novaSaida(a.pagina, { capturas: [{ especie: "dourada", quantidade: 3, tamanho: "28" }] });
    await a.pagina.waitForSelector(".saida");
    const [descarga] = await Promise.all([a.pagina.waitForEvent("download"), a.pagina.click("#exportar")]);
    assert.match(descarga.suggestedFilename(), /^diario-surfcasting-2026-11-15\.json$/);
    ficheiro = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "diario-")), descarga.suggestedFilename());
    await descarga.saveAs(ficheiro);
    const copia = JSON.parse(fs.readFileSync(ficheiro, "utf8"));
    assert.equal(copia.formato, "surfcasting-algarve-diario");
    assert.equal(copia.saidas.length, 1);
    await a.pagina.waitForFunction(() => !document.querySelector(".aviso-origem.arquivo"), null, { timeout: 5000 });
  } finally { await a.contexto.close(); }

  const b = await abrir(browser);
  b.pagina.on("dialog", d => d.accept());
  try {
    await b.pagina.goto(`${srv.url}/diario.html`);
    await b.pagina.waitForSelector(".vazio");
    await b.pagina.setInputFiles("#importar", ficheiro);
    await b.pagina.waitForSelector(".saida");
    assert.match(await b.pagina.textContent(".mensagem"), /1 nova\(s\), 0 já existia\(m\)/);
    // Ficheiro inválido: recusado, a saída importada continua lá.
    const mau = path.join(path.dirname(ficheiro), "mau.json");
    fs.writeFileSync(mau, JSON.stringify({ formato: "surfcasting-algarve-diario", versao: 1, saidas: [{ id: "x" }] }));
    await b.pagina.setInputFiles("#importar", mau);
    await b.pagina.waitForSelector(".mensagem.erro");
    assert.match(await b.pagina.textContent(".mensagem"), /Ficheiro recusado, nada foi importado/);
    assert.equal(await b.pagina.locator(".saida").count(), 1);
    assert.match(await b.pagina.textContent(".saida summary"), /3 capturas: 3 dourada/);
  } finally { await b.contexto.close(); }
});

test("diário sem rede para as APIs: funciona (não depende de nenhuma fonte externa)", async () => {
  const { contexto, pagina, registo } = await abrir(browser, "Pixel 7", { semApis: true });
  try {
    await pagina.goto(`${srv.url}/diario.html`);
    await novaSaida(pagina, { semCapturas: true });
    await pagina.waitForSelector(".saida");
    assert.match(await pagina.textContent(".mensagem"), /Sem condições associadas: ainda não há previsões guardadas/);
    assert.deepEqual(registo.externos.filter(h => !/open-meteo|hidrografico/.test(h)), []);
    assert.deepEqual(registo.erros.filter(e => !ERROS_DE_REDE.test(e)), []);
  } finally { await contexto.close(); }
});
