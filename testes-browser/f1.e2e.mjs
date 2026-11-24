// F1 da interface (24/11/2026) no browser: nos dez ecrãs, a 360 px e no Pixel 7, todos os botões visíveis têm
// pelo menos 44 × 44 px (também no painel «hora a hora» e no formulário do diário); a barra superior é azul, de
// lado a lado, com o texto a ≥ 4,5:1 e sem deslocamento horizontal; o foco vê-se a branco na barra; o botão
// desactivado é plano e cinzento. Só aspecto: o motor e o conteúdo não mudam. Correr: npm run test:browser.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { servir, abrir, lancar, larguras, textoLarguras, captura } from "./apoio.mjs";

let srv, browser;
before(async () => { srv = await servir(); browser = await lancar(); });
after(async () => { await browser?.close(); await srv?.fechar(); });

const PAGINAS = [["inicio", "/"], ["comparador", "/comparador.html"], ["pesqueiro", "/pesqueiro.html?id=ancao"], ["mapa", "/mapa.html"],
  ["diario", "/diario.html"], ["estatisticas", "/estatisticas.html"], ["historico", "/historico.html"], ["guia", "/guia.html"],
  ["fontes", "/fontes.html"], ["diagnostico", "/diagnostico.html"]];

const desenhada = p => p.waitForFunction(() => !/^A (ler|abrir|carregar)/.test(document.querySelector(".topo .lido")?.textContent ?? "A ler"), null, { timeout: 15000 });

// Botões visíveis com menos de 44 px de largura ou de altura. Os marcadores e controlos do Leaflet ficam de
// fora: o mapa é da fase F4.
const pequenos = p => p.evaluate(() => [...document.querySelectorAll("button, .btn, .botao, .atalho")]
  .filter(e => e.getClientRects().length && !e.closest(".leaflet-container"))
  .map(e => { const r = e.getBoundingClientRect(); return { el: `${e.tagName.toLowerCase()}${e.id ? `#${e.id}` : ""}.${[...e.classList].join(".")}`, texto: e.textContent.trim().slice(0, 20), w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 }; })
  .filter(x => x.w < 44 || x.h < 44));

// Contraste do título e da hora da leitura com o fundo da barra; fundo da barra e a sombra que o leva de lado a lado.
const barra = p => p.evaluate(() => {
  const rgb = s => (s.match(/[\d.]+/g) ?? []).map(Number).slice(0, 3);
  const lum = ([r, g, b]) => [r, g, b].map(v => v / 255).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)).reduce((a, c, i) => a + c * [0.2126, 0.7152, 0.0722][i], 0);
  const razao = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
  const topo = document.querySelector(".topo");
  const cs = getComputedStyle(topo);
  const fundo = rgb(cs.backgroundColor);
  const r = topo.getBoundingClientRect();
  return { fundo, sombra: cs.boxShadow, corte: cs.clipPath, topo: r.top,
    titulo: razao(rgb(getComputedStyle(topo.querySelector("h1")).color), fundo),
    lido: razao(rgb(getComputedStyle(topo.querySelector(".lido")).color), fundo) };
});

for (const dispositivo of ["Pixel 7", { width: 360, height: 780 }]) {
  const nome = typeof dispositivo === "string" ? "pixel7" : "360px";

  test(`F1 (${nome}): nos dez ecrãs, botões com ≥ 44 × 44 px, barra superior azul com texto a ≥ 4,5:1, sem deslocamento horizontal`, async () => {
    for (const [pagina, url] of PAGINAS) {
      const { contexto, pagina: p, registo } = await abrir(browser, dispositivo);
      try {
        await p.goto(srv.url + url);
        await desenhada(p);
        await p.waitForTimeout(300);
        assert.deepEqual(await pequenos(p), [], `${pagina}: botões com menos de 44 px`);
        const b = await barra(p);
        assert.deepEqual(b.fundo, [10, 53, 80], `${pagina}: barra com o azul --mar`);
        assert.match(b.sombra, /rgb\(10, 53, 80\) 0px 0px 0px \d+(\.\d+)?px/, `${pagina}: fundo de lado a lado`);
        assert.match(b.corte, /^inset\(0px -\d+(\.\d+)?px\)$/, `${pagina}: corte vertical da sombra`);
        assert.equal(b.topo, 0, `${pagina}: a barra começa no topo`);
        assert.ok(b.titulo >= 4.5 && b.lido >= 4.5, `${pagina}: contraste ${b.titulo.toFixed(2)} / ${b.lido.toFixed(2)}`);
        const l = await larguras(p);
        assert.ok(l.ok, `${pagina}: ${textoLarguras(l)}`);
        assert.deepEqual(registo.erros, [], `${pagina}: erros na página`);
        await captura(p, `f1-${nome}-${pagina}`);
      } finally { await contexto.close(); }
    }
  });
}

test("F1: painel «hora a hora» e formulário do diário com botões ≥ 44 px; desactivado plano e cinzento", async () => {
  const { contexto, pagina: p, registo } = await abrir(browser, { width: 360, height: 780 });
  try {
    await p.goto(`${srv.url}/`);
    await desenhada(p);
    await p.click(".btn-horas");
    await p.waitForSelector("dialog[open] .nav-dia");
    assert.deepEqual(await pequenos(p), [], "painel hora a hora");
    // No primeiro dia, «dia anterior» está desactivado.
    const anterior = await p.$eval("dialog[open] .nav-dia[disabled]", e => ({ fundo: getComputedStyle(e).backgroundColor, cursor: getComputedStyle(e).cursor, sombra: getComputedStyle(e).boxShadow }));
    assert.deepEqual(anterior, { fundo: "rgb(230, 237, 242)", cursor: "not-allowed", sombra: "none" });
    await p.keyboard.press("Escape");

    await p.goto(`${srv.url}/diario.html`);
    await p.waitForSelector("#nova-saida");
    const exportar = await p.$eval("#exportar", e => ({ desactivado: e.disabled, fundo: getComputedStyle(e).backgroundColor, cor: getComputedStyle(e).color, cursor: getComputedStyle(e).cursor }));
    assert.deepEqual(exportar, { desactivado: true, fundo: "rgb(230, 237, 242)", cor: "rgb(78, 99, 112)", cursor: "not-allowed" }, "sem saídas, «Exportar cópia» desactivado");
    await p.click("#nova-saida");
    await p.waitForSelector("dialog[open] .form-saida");
    assert.deepEqual(await pequenos(p), [], "formulário do diário");
    await captura(p, "f1-360px-diario-formulario");
    assert.deepEqual(registo.erros, []);
  } finally { await contexto.close(); }
});

test("F1: o foco do teclado vê-se a branco na barra superior e na «melhor oportunidade»", async () => {
  const { contexto, pagina: p } = await abrir(browser, "Pixel 7");
  try {
    await p.goto(`${srv.url}/`);
    await desenhada(p);
    await p.focus("#actualizar");
    await p.keyboard.press("Shift+Tab");
    await p.keyboard.press("Tab");
    const foco = await p.evaluate(() => { const e = document.activeElement; const s = getComputedStyle(e); return { id: e.id, cor: s.outlineColor, estilo: s.outlineStyle }; });
    assert.deepEqual(foco, { id: "actualizar", cor: "rgb(255, 255, 255)", estilo: "solid" });
    const botao = await p.$(".destaque .btn");
    if (botao) {
      await botao.focus();
      await p.keyboard.press("Shift+Tab");
      await p.keyboard.press("Tab");
      const f2 = await p.evaluate(() => { const e = document.activeElement; return { dentro: Boolean(e.closest(".destaque")), cor: getComputedStyle(e).outlineColor }; });
      assert.deepEqual(f2, { dentro: true, cor: "rgb(255, 255, 255)" });
    }
  } finally { await contexto.close(); }
});
