// Apoio aos testes no browser (Playwright, só de desenvolvimento). Sem Internet:
// - a app é servida localmente a partir da pasta que se publica (ferramentas/publicar.mjs);
// - os pedidos às APIs são respondidos com respostas reais guardadas em testes/reais/ (Open-Meteo
//   de 14/10/2026 deslocado 32 dias; boia de Faro de 15/11/2026);
// - os mosaicos dos mapas recebem uma imagem vazia; qualquer outro pedido externo é recusado e
//   fica registado;
// - o relógio da página fica fixo em 15/11/2026 às 10:40 UTC, a hora da resposta da boia.
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, devices } from "playwright";
import { publicar } from "../ferramentas/publicar.mjs";

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const SAIDA = path.join(RAIZ, "saida-browser");
export const AGORA = new Date("2026-11-15T10:40:00Z");
const DESLOCAMENTO_S = 32 * 86400; // 14/10 09:46 → 15/11 09:46

const TIPOS = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json", ".webmanifest": "application/manifest+json",
  ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".txt": "text/plain; charset=utf-8" };

// Servidor estático da pasta publicada (como no Cloudflare: «/» serve o index.html).
export async function servir() {
  const pasta = publicar(RAIZ, fs.mkdtempSync(path.join(os.tmpdir(), "pesca-publicar-")));
  const servidor = http.createServer((req, res) => {
    const caminho = decodeURIComponent(new URL(req.url, "http://x").pathname);
    let ficheiro = path.join(pasta, caminho.endsWith("/") ? `${caminho}index.html` : caminho);
    if (!ficheiro.startsWith(pasta) || !fs.existsSync(ficheiro) || fs.statSync(ficheiro).isDirectory()) {
      res.writeHead(404); res.end("não existe"); return;
    }
    res.writeHead(200, { "content-type": TIPOS[path.extname(ficheiro)] ?? "application/octet-stream" });
    fs.createReadStream(ficheiro).pipe(res);
  });
  await new Promise(r => servidor.listen(0, "127.0.0.1", r));
  return { url: `http://127.0.0.1:${servidor.address().port}`, fechar: () => new Promise(r => servidor.close(r)), pasta };
}

const lerReal = nome => JSON.parse(fs.readFileSync(path.join(RAIZ, "testes/reais", nome), "utf8"));
function openMeteo(tipo, longitude) {
  const zona = longitude > -8.05 ? "faro" : "quarteira";
  const d = lerReal(`openmeteo_${tipo}_${zona}_20261014_0946.json`);
  d.hourly.time = d.hourly.time.map(t => t + DESLOCAMENTO_S);
  return d;
}
const PNG_VAZIO = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");

// Contexto do browser com as respostas simuladas. dispositivo: "Pixel 7" ou { width, height }.
// semApis: as APIs (Open-Meteo, boia) falham como sem rede; a app em si continua a ser servida.
export const APIS = ["marine-api.open-meteo.com", "api.open-meteo.com", "ogcapi.hidrografico.pt"];
export async function abrir(browser, dispositivo = "Pixel 7", { semApis = false } = {}) {
  const base = typeof dispositivo === "string" ? devices[dispositivo] : { viewport: dispositivo, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
  const contexto = await browser.newContext({ ...base, locale: "pt-PT", timezoneId: "Europe/Lisbon", serviceWorkers: "block" });
  const registo = { externos: [], recusados: [], erros: [] };
  await contexto.route(/^https?:\/\/(?!127\.0\.0\.1)/, async route => {
    const u = new URL(route.request().url());
    registo.externos.push(u.host + u.pathname);
    if (semApis && APIS.includes(u.host)) return route.abort("internetdisconnected");
    if (u.host === "marine-api.open-meteo.com") return route.fulfill({ json: openMeteo("marine", Number(u.searchParams.get("longitude"))), headers: { "access-control-allow-origin": "*" } });
    if (u.host === "api.open-meteo.com") return route.fulfill({ json: openMeteo("forecast", Number(u.searchParams.get("longitude"))), headers: { "access-control-allow-origin": "*" } });
    if (u.host === "ogcapi.hidrografico.pt") return route.fulfill({ json: lerReal("ih_boia_faro_20261115.json"), headers: { "access-control-allow-origin": "*" } });
    if (u.host === "tile.openstreetmap.org" || u.host === "ortos.dgterritorio.gov.pt") return route.fulfill({ body: PNG_VAZIO, contentType: "image/png" });
    registo.recusados.push(u.href);
    return route.abort();
  });
  const pagina = await contexto.newPage();
  await pagina.clock.setFixedTime(AGORA);
  pagina.on("pageerror", e => registo.erros.push(String(e)));
  pagina.on("console", m => { if (m.type() === "error") registo.erros.push(m.text()); });
  return { contexto, pagina, registo };
}

export const lancar = () => chromium.launch();

// Largura do conteúdo maior do que o ecrã = deslocamento horizontal (proibido).
export const larguras = pagina => pagina.evaluate(() => ({ conteudo: document.documentElement.scrollWidth, ecra: window.innerWidth }));

export async function captura(pagina, nome) {
  fs.mkdirSync(SAIDA, { recursive: true });
  await pagina.screenshot({ path: path.join(SAIDA, `${nome}.png`), fullPage: true });
}
