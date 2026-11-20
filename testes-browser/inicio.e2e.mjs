// Fase 1B no browser: ecrã inicial reorganizado. «Onde e quando» visível no primeiro ecrã (Pixel 7 e
// 360 px), ligações para os cartões, espécie e dia, «Mar agora» compacto, «hora a hora».
// Correr: npm run test:browser.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { servir, abrir, lancar, larguras, captura } from "./apoio.mjs";

let srv, browser;
before(async () => { srv = await servir(); browser = await lancar(); });
after(async () => { await browser?.close(); await srv?.fechar(); });

for (const dispositivo of ["Pixel 7", { width: 360, height: 780 }]) {
  const nome = typeof dispositivo === "string" ? "pixel7" : "360px";
  test(`início (${nome}): «Onde e quando» inteiro no primeiro ecrã, antes de «Mar agora» e dos cartões`, async () => {
    const { contexto, pagina, registo } = await abrir(browser, dispositivo);
    try {
      await pagina.goto(`${srv.url}/`);
      await pagina.waitForSelector(".cartoes");
      const m = await pagina.evaluate(() => {
        const r = s => document.querySelector(s)?.getBoundingClientRect();
        return { ecra: innerHeight, oq: r(".onde-quando"), mar: r(".mar-agora"), cartao: r(".cartoes > *"),
          janelas: document.querySelectorAll(".janelas li").length, alinhamentos: [...document.querySelectorAll(".alinhamento")].length,
          pagina: document.body.scrollHeight };
      });
      assert.ok(m.janelas >= 1, "há janelas para hoje com os dados de teste");
      assert.ok(m.oq.top >= 0 && m.oq.bottom <= m.ecra, `«Onde e quando» cabe no primeiro ecrã (${Math.round(m.oq.bottom)} ≤ ${m.ecra})`);
      assert.ok(m.oq.bottom <= m.mar.top && m.mar.bottom <= m.cartao.top, "ordem: «Onde e quando», «Mar agora», cartões");
      const l = await larguras(pagina);
      assert.ok(l.conteudo <= l.ecra, `sem deslocamento horizontal (${l.conteudo} > ${l.ecra})`);
      console.log(`# medição ${nome}: página ${m.pagina} px, 1.º cartão a ${Math.round(m.cartao.top)} px, ecrã ${m.ecra} px, blocos de alinhamento ${m.alinhamentos}`);
      await captura(pagina, `inicio-reorganizado-${nome}`);
      assert.deepEqual(registo.recusados, []);
      assert.deepEqual(registo.erros, []);
    } finally { await contexto.close(); }
  });
}

test("início: uma janela leva ao cartão do pesqueiro; espécie e dia mudam «Onde e quando»", async () => {
  const { contexto, pagina, registo } = await abrir(browser);
  try {
    await pagina.goto(`${srv.url}/`);
    await pagina.waitForSelector(".janelas li a");
    const alvo = await pagina.getAttribute(".janelas li a", "href");
    await pagina.click(".janelas li a");
    await pagina.waitForFunction(id => { const r = document.querySelector(id)?.getBoundingClientRect(); return r && Math.abs(r.top) < 40; }, alvo);
    assert.match(await pagina.textContent(".onde-quando h2"), /Hoje · Robalo/);
    await pagina.click(".especie-btn[data-especie=dourada]");
    await pagina.waitForFunction(() => /Dourada/.test(document.querySelector(".onde-quando h2")?.textContent));
    await pagina.click(".dia[data-dia='1']");
    await pagina.waitForFunction(() => /Amanhã · Dourada/.test(document.querySelector(".onde-quando h2")?.textContent));
    assert.deepEqual(registo.erros, []);
  } finally { await contexto.close(); }
});

test("início: «Mar agora» mostra uma linha (fonte, tipo, hora) e o resto ao tocar; «hora a hora» abre e fecha", async () => {
  const { contexto, pagina, registo } = await abrir(browser);
  try {
    await pagina.goto(`${srv.url}/`);
    await pagina.waitForSelector(".mar-agora summary");
    const resumo = await pagina.textContent(".mar-agora summary");
    assert.match(resumo, /Mar agora · Boia de Faro · observado/);
    assert.match(resumo, /medido a \d\d\/\d\d às \d\d:\d\d/);
    assert.equal(await pagina.isVisible(".mar-agora dl"), false, "pormenores fechados por omissão");
    await pagina.click(".mar-agora summary");
    assert.equal(await pagina.isVisible(".mar-agora dl"), true);
    assert.match(await pagina.textContent(".mar-agora dl"), /Tendência/);
    await pagina.click(".btn-horas");
    await pagina.waitForSelector("dialog#horario[open]");
    await pagina.click("dialog#horario .fechar");
    await pagina.waitForSelector("dialog#horario:not([open])", { state: "attached" });
    assert.deepEqual(registo.erros, []);
  } finally { await contexto.close(); }
});
