// Tenta aplicar uma quota real ao IndexedDB (Chromium) por três vias e diz qual funciona. Uso: node quota2.mjs <cópia de trabalho>
import path from "node:path"; import { pathToFileURL } from "node:url";
const WT = path.resolve(process.argv[2]);
const { servir, abrir } = await import(path.join(WT, "testes-browser/apoio.mjs"));
const { chromium } = await import(pathToFileURL(path.join(WT, "node_modules/playwright/index.mjs")).href);
const b = await chromium.launch(); const s = await servir();
const { contexto, pagina } = await abrir(b, "Pixel 7");
await pagina.goto(`${s.url}/`); await pagina.waitForSelector(".cartoes .cartao");
const est = () => pagina.evaluate(async () => navigator.storage.estimate());
console.log("antes:", JSON.stringify(await est()));
const origem = new URL(s.url).origin;
for (const [via, sessao] of [["sessão da página", await contexto.newCDPSession(pagina)], ["sessão do browser", await b.newBrowserCDPSession()]]) {
  try { await sessao.send("Storage.overrideQuotaForOrigin", { origin: origem, quotaSize: 2000000 }); console.log(`${via}: aceite →`, JSON.stringify(await est())); }
  catch (e) { console.log(`${via}: recusado — ${String(e).split("\n")[0]}`); }
}
await contexto.close(); await b.close(); await s.fechar();
