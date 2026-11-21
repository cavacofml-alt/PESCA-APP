// PR 9 do plano de evolução (21/11/2026) no browser: «melhor oportunidade» no primeiro ecrã, cartões
// com as notas das duas espécies, página do pesqueiro com mini-mapa, melhor janela e «hora a hora» na
// hora actual; estados incompleto, indisponível e arquivado; barra com ícones; contraste calculado nos
// estilos reais; teclado; sem deslocamento horizontal (Pixel 7 e 360 px). Correr: npm run test:browser.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { servir, abrir, lancar, larguras, captura, RAIZ, AGORA } from "./apoio.mjs";

const config = JSON.parse(fs.readFileSync(path.join(RAIZ, "config.json"), "utf8"));
let srv, browser;
before(async () => { srv = await servir(); browser = await lancar(); });
after(async () => { await browser?.close(); await srv?.fechar(); });

// Contraste (WCAG 2.x) do texto com o fundo efectivo: o primeiro antepassado com cor de fundo sólida;
// dentro da «melhor oportunidade» (fundo em gradiente) conta a cor mais clara do gradiente.
async function contrastes(pagina, seletores) {
  return pagina.evaluate(lista => {
    // rgb()/rgba() em 0–255; color(srgb …) (por exemplo, de color-mix) em 0–1.
    const rgb = s => {
      const n = (s.match(/[\d.]+/g) ?? []).map(Number);
      return s.startsWith("color(srgb") ? n.map((v, i) => (i < 3 ? v * 255 : v)) : n;
    };
    const lum = ([r, g, b]) => [r, g, b].map(v => v / 255).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
      .reduce((a, c, i) => a + c * [0.2126, 0.7152, 0.0722][i], 0);
    const fundo = el => {
      for (let e = el; e; e = e.parentElement) {
        if (e.classList?.contains("destaque")) return [19, 97, 127]; // --mar-3, o tom mais claro do gradiente
        const c = rgb(getComputedStyle(e).backgroundColor);
        if (c.length >= 3 && (c.length < 4 || c[3] === 1)) return c.slice(0, 3);
      }
      return [255, 255, 255];
    };
    const out = [];
    for (const s of lista) {
      for (const el of [...document.querySelectorAll(s)].slice(0, 12)) {
        if (!el.textContent.trim() || !el.getClientRects().length) continue;
        const a = lum(rgb(getComputedStyle(el).color)), b = lum(fundo(el));
        out.push({ s, texto: el.textContent.trim().slice(0, 30), razao: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) });
      }
    }
    return out;
  }, seletores);
}

for (const dispositivo of ["Pixel 7", { width: 360, height: 780 }]) {
  const nome = typeof dispositivo === "string" ? "pixel7" : "360px";
  test(`início (${nome}): melhor oportunidade inteira no primeiro ecrã; cartões com as duas espécies; contraste e sem deslocamento`, async () => {
    const { contexto, pagina, registo } = await abrir(browser, dispositivo);
    try {
      await pagina.goto(`${srv.url}/`);
      await pagina.waitForSelector(".cartoes .cartao");
      for (const especie of ["robalo", "dourada"]) {
        await pagina.click(`.especie-btn[data-especie=${especie}]`);
        await pagina.waitForSelector(`.especie-btn[data-especie=${especie}][aria-pressed=true]`);
        const m = await pagina.evaluate(() => {
          const d = document.querySelector(".destaque");
          const r = d.getBoundingClientRect();
          return { topo: r.top, fundo: r.bottom, ecra: innerHeight - document.querySelector(".barra").getBoundingClientRect().height,
            estado: d.dataset.estado, texto: d.textContent };
        });
        assert.ok(m.topo >= 0 && m.fundo <= m.ecra, `${especie}: a melhor oportunidade cabe acima da barra (${Math.round(m.fundo)} ≤ ${Math.round(m.ecra)})`);
        assert.match(m.estado, /^(definitiva|empate|incompleta|parcial|sem-notas)$/);
        if (m.estado !== "definitiva") assert.doesNotMatch(m.texto, /completa e sem empate/);
        // Cartões: os oito, cada um com as notas de todas as espécies que o pesqueiro tem.
        const cartoes = await pagina.evaluate(() => [...document.querySelectorAll(".cartao")].map(c => ({
          id: c.id.replace("pq-", ""), especies: [...c.querySelectorAll(".nota-esp")].map(n => n.dataset.especie),
          pagina: c.querySelector(".ligacao-pq")?.getAttribute("href") })));
        assert.equal(cartoes.length, 8);
        for (const c of cartoes) {
          assert.deepEqual(c.especies.sort(), [...config.pesqueiros[c.id].especies].sort(), c.id);
          assert.equal(c.pagina, `./pesqueiro.html?id=${c.id}`);
        }
      }
      const baixos = (await contrastes(pagina, [".destaque .rot", ".destaque h2 a", ".destaque-janela", ".destaque-estado", ".porque-lista li",
        ".chips-condicoes li", ".destaque .btn", ".mini", ".selo", ".estado-nota", ".nota-esp .esp", ".factores-cartao li", ".periodos li span",
        ".periodos li b", ".lido", ".barra a", ".dia", ".especie-btn", ".janelas li span", ".rot", ".btn-horas", ".ligacao-pq"]))
        .filter(x => x.razao < 4.5);
      assert.deepEqual(baixos, [], "texto com contraste ≥ 4,5:1");
      const l = await larguras(pagina);
      assert.ok(l.conteudo <= l.ecra, `sem deslocamento horizontal (${l.conteudo} > ${l.ecra})`);
      await captura(pagina, `interface-inicio-${nome}`);
      assert.deepEqual(registo.recusados, []);
      assert.deepEqual(registo.erros, []);
    } finally { await contexto.close(); }
  });

  test(`página do pesqueiro (${nome}): mini-mapa com os pontos de dados, melhor janela, condições, «hora a hora» na hora actual`, async () => {
    const { contexto, pagina, registo } = await abrir(browser, dispositivo);
    try {
      for (const [id, pq] of Object.entries(config.pesqueiros)) {
        await pagina.goto(`${srv.url}/pesqueiro.html?id=${id}`);
        await pagina.waitForSelector(".janela-pq");
        const pontos = new Set(["terra", "mar", "agua"].map(k => pq[k]).filter(k => k && config.locais[k])).size;
        await pagina.waitForFunction(n => document.querySelectorAll("#mini-mapa .leaflet-interactive").length === n, pontos);
        assert.equal(await pagina.locator(".janela-esp").count(), pq.especies.length, id);
        assert.ok(await pagina.locator(".condicoes-pq .tile").count() >= 5, id);
        // Hoje (15/11 às 10:40): a coluna «agora» existe e está à vista na tabela.
        const v = await pagina.evaluate(() => {
          const t = document.querySelector(".horas-pq .tabela-horas");
          const c = t.querySelector("tr.cab td.agora");
          const th = t.querySelector("th").getBoundingClientRect();
          const r = c?.getBoundingClientRect(), tr = t.getBoundingClientRect();
          return { existe: Boolean(c), texto: c?.textContent, avista: Boolean(r && r.left >= th.right - 1 && r.right <= tr.right + 1),
            melhor: t.querySelectorAll("td.nota-per.melhor").length };
        });
        assert.ok(v.existe, `${id}: coluna «agora»`);
        assert.match(v.texto, /^10:00agora$/);
        assert.ok(v.avista, `${id}: a hora actual à vista`);
        assert.ok(v.melhor >= 1, `${id}: melhor período marcado`);
        const l = await larguras(pagina);
        assert.ok(l.conteudo <= l.ecra, `${id} (${nome}): ${l.conteudo} > ${l.ecra}`);
        if (id === "falesia" || id === "molhe_quarteira") await captura(pagina, `interface-pesqueiro-${id}-${nome}`);
      }
      const baixos = (await contrastes(pagina, [".janela-topo", ".janela-quando", ".destaque-estado", ".tile-rot", ".tile-valor", ".tile-det",
        ".tile-tipo", ".lista-mares li", ".legenda-horas li", ".tabela-horas th", ".tabela-horas td", ".tipo-linha"])).filter(x => x.razao < 4.5);
      assert.deepEqual(baixos, [], "texto com contraste ≥ 4,5:1");
      assert.deepEqual(registo.recusados, []);
      assert.deepEqual(registo.erros, []);
    } finally { await contexto.close(); }
  });
}

test("navegação: a melhor oportunidade leva ao pesqueiro e ao comparador; barra com ícones, ecrã actual marcado; teclado com foco visível", async () => {
  const { contexto, pagina, registo } = await abrir(browser);
  try {
    await pagina.goto(`${srv.url}/`);
    await pagina.waitForSelector(".destaque");
    const barra = await pagina.evaluate(() => [...document.querySelectorAll(".barra a")].map(a => ({
      texto: a.textContent.trim(), actual: a.getAttribute("aria-current"),
      icone: getComputedStyle(a, "::before").maskImage || getComputedStyle(a, "::before").webkitMaskImage })));
    assert.deepEqual(barra.map(b => b.texto), ["Início", "Comparar", "Mapa", "Diário", "Fontes"]);
    assert.deepEqual(barra.map(b => b.actual), ["page", null, null, null, null]);
    for (const b of barra) assert.match(b.icone, /^url\("data:image\/svg\+xml/, b.texto);
    // Teclado: o primeiro Tab vai ao botão de actualizar, com contorno visível.
    await pagina.keyboard.press("Tab");
    const foco = await pagina.evaluate(() => ({ id: document.activeElement.id, contorno: getComputedStyle(document.activeElement).outlineStyle }));
    assert.equal(foco.id, "actualizar");
    assert.notEqual(foco.contorno, "none");
    const destino = await pagina.getAttribute(".destaque .accoes .btn:not(.sec)", "href");
    await pagina.click(".destaque .accoes .btn:not(.sec)");
    await pagina.waitForURL(new RegExp(destino.replace(/^\./, "").replace(/[?.]/g, "\\$&") + "$"));
    await pagina.waitForSelector(".janela-pq");
    assert.equal(await pagina.getAttribute(".barra a.activo", "aria-current"), "true", "subpágina do Início");
    await pagina.goBack();
    await pagina.waitForSelector(".destaque");
    await pagina.click(".destaque .btn.sec");
    await pagina.waitForURL(/comparador\.html\?dia=0$/);
    await pagina.waitForSelector(".linha-comp");
    assert.equal(await pagina.getAttribute(".barra a.activo", "aria-current"), "page");
    assert.deepEqual(registo.erros, []);
  } finally { await contexto.close(); }
});

test("sem rede: indisponível sem melhor oportunidade definitiva; depois de uma leitura, previsão arquivada também no pesqueiro e no «hora a hora»", async () => {
  const sem = await abrir(browser, "Pixel 7", { semApis: true });
  try {
    await sem.pagina.goto(`${srv.url}/`);
    await sem.pagina.waitForSelector(".aviso-origem.indisponivel");
    for (const especie of ["robalo", "dourada"]) {
      await sem.pagina.click(`.especie-btn[data-especie=${especie}]`);
      await sem.pagina.waitForSelector(`.especie-btn[data-especie=${especie}][aria-pressed=true]`);
      assert.notEqual(await sem.pagina.getAttribute(".destaque", "data-estado"), "definitiva", especie);
    }
    // Sem previsão, as notas dos cartões nunca aparecem como completas.
    assert.equal(await sem.pagina.locator(".nota-esp .mini:not(.nd):not(.pc):not(.inc)").count(), 0);
    await captura(sem.pagina, "interface-inicio-sem-rede");
  } finally { await sem.contexto.close(); }

  const { contexto, pagina, registo, rede } = await abrir(browser);
  try {
    await pagina.goto(`${srv.url}/`);
    await pagina.waitForSelector(".cartoes");
    rede.apis = false;
    await pagina.clock.setFixedTime(new Date(AGORA.getTime() + 2 * 3600000));
    await pagina.goto(`${srv.url}/pesqueiro.html?id=ancao`);
    await pagina.waitForSelector(".aviso-origem.arquivo");
    assert.ok(await pagina.isVisible(".horas-pq .aviso-horas"), "aviso no «hora a hora»");
    assert.equal(await pagina.locator(".horas-pq .tabela-horas.arquivada").count(), 1);
    assert.ok(await pagina.locator(".tile-tipo", { hasText: "arquivado" }).count() >= 1, "condições marcadas como arquivadas");
    const l = await larguras(pagina);
    assert.ok(l.conteudo <= l.ecra);
    await captura(pagina, "interface-pesqueiro-arquivo");
    assert.deepEqual(registo.erros.filter(e => !/ERR_INTERNET_DISCONNECTED|Failed to load resource/.test(e)), []);
  } finally { await contexto.close(); }
});
