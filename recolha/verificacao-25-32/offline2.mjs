// Arranque offline com o service worker activo, em dois cenários. Cada página sem rede abre num separador novo.
// Uso: node offline2.mjs <cópia de trabalho>
import fs from "node:fs"; import path from "node:path"; import { pathToFileURL } from "node:url";
const WT = path.resolve(process.argv[2]);
const { servir } = await import(path.join(WT, "testes-browser/apoio.mjs"));
const { chromium, devices } = await import(pathToFileURL(path.join(WT, "node_modules/playwright/index.mjs")).href);
const AGORA = new Date("2026-11-15T10:40:00Z"), DESL = 32 * 86400;
const ler = n => JSON.parse(fs.readFileSync(path.join(WT, "testes/reais", n), "utf8"));
const om = (t, lon) => { const d = ler(`openmeteo_${t}_${lon > -8.05 ? "faro" : "quarteira"}_20261014_0946.json`); d.hourly.time = d.hourly.time.map(x => x + DESL); return d; };
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
async function contexto(browser, rede) {
  const ctx = await browser.newContext({ ...devices["Pixel 7"], locale: "pt-PT", timezoneId: "Europe/Lisbon", serviceWorkers: "allow" });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => {
    const u = new URL(route.request().url());
    if (!rede.apis) return route.abort("internetdisconnected");
    const h = { "access-control-allow-origin": "*" };
    if (u.host === "marine-api.open-meteo.com") return route.fulfill({ json: om("marine", Number(u.searchParams.get("longitude"))), headers: h });
    if (u.host === "api.open-meteo.com") return route.fulfill({ json: om("forecast", Number(u.searchParams.get("longitude"))), headers: h });
    if (u.host === "ogcapi.hidrografico.pt") return route.fulfill({ json: ler("ih_boia_faro_20261115.json"), headers: h });
    if (/openstreetmap|dgterritorio/.test(u.host)) return route.fulfill({ body: PNG, contentType: "image/png" });
    return route.abort();
  });
  return ctx;
}
const existe = url => fs.existsSync(path.join(WT, (url.split("?")[0].replace(/^\//, "") || "index.html")));
async function semRede(ctx, base, lista) {
  for (const [url, sel, aviso] of lista) {
    if (!existe(url)) { console.log(`   —      ${url} (não existe neste SHA)`); continue; }
    const p = await ctx.newPage(); await p.clock.setFixedTime(new Date(AGORA.getTime() + 2 * 3600000));
    const erros = []; p.on("pageerror", e => erros.push(String(e).slice(0, 120)));
    let estado;
    try {
      await p.goto(base + url, { timeout: 10000 });
      await p.waitForSelector(sel, { timeout: 10000 });
      const arq = aviso ? await p.locator(".aviso-origem.arquivo").count() : null;
      estado = `ABRE${aviso ? (arq ? " · com «Previsão arquivada»" : " · SEM aviso de arquivo") : ""}`;
    } catch (e) {
      const txt = (await p.textContent("body").catch(() => "")).replace(/\s+/g, " ").trim().slice(0, 140);
      estado = `NÃO ABRE (${String(e).split("\n")[0].slice(0, 90)}) · ecrã: «${txt}»`;
    }
    console.log(`   ${estado.startsWith("ABRE") && !estado.includes("SEM") ? "ok    " : "FALHA "} ${url} → ${estado}${erros.length ? ` · erros: ${erros.join(" | ")}` : ""}`);
    await p.close();
  }
}
const LISTA = [["/", ".cartoes .cartao", true], ["/comparador.html", ".linha-comp", true], ["/comparador.html?dia=1", ".linha-comp", true],
  ["/pesqueiro.html?id=ancao", ".janela-pq, .bloco-pq", true], ["/pesqueiro.html?id=falesia", ".janela-pq, .bloco-pq", true],
  ["/diario.html", "#nova-saida", false], ["/estatisticas.html", "main h1", false], ["/historico.html", "main h1", false], ["/guia.html", "main h1", false],
  ["/fontes.html", ".cartao-fonte", false], ["/mapa.html", "#mapa", false], ["/mapa.html?pesqueiro=falesia", "#mapa", false]];
const browser = await chromium.launch();
for (const [nome, visitas] of [["A) uma só visita com rede (a primeira, quando o service worker se instala)", 1],
                               ["B) duas visitas com rede (a segunda já controlada pelo service worker) e visita a comparador, pesqueiro=ancao e diário", 2]]) {
  console.log(nome);
  const srv = await servir(); const rede = { apis: true }; const ctx = await contexto(browser, rede);
  const p = await ctx.newPage(); await p.clock.setFixedTime(AGORA);
  await p.goto(`${srv.url}/`); await p.waitForSelector(".cartoes .cartao");
  await p.evaluate(() => navigator.serviceWorker.ready);
  await p.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, { timeout: 15000 });
  if (visitas === 2) {
    await p.reload(); await p.waitForSelector(".cartoes .cartao");
    for (const [u, s] of [["/comparador.html", ".linha-comp"], ["/pesqueiro.html?id=ancao", "h1"], ["/diario.html", "main"]]) {
      if (existe(u)) { await p.goto(srv.url + u); await p.waitForSelector(s); }
    }
  }
  const cache = await p.evaluate(async () => { const n = (await caches.keys())[0]; const c = await caches.open(n); return { nome: n, entradas: (await c.keys()).map(r => new URL(r.url).pathname + new URL(r.url).search) }; });
  console.log(`   cache «${cache.nome}»: ${cache.entradas.length} entradas; config.json: ${cache.entradas.includes("/config.json") ? "sim" : "NÃO"}; marés: ${cache.entradas.filter(e => e.startsWith("/mares/")).join(", ") || "NÃO"}; com query: ${cache.entradas.filter(e => e.includes("?")).join(", ") || "nenhuma"}`);
  await p.close();
  rede.apis = false; await srv.fechar();
  await semRede(ctx, srv.url, LISTA);
  await ctx.close();
}
await browser.close();
