// Verificações estáticas: URL numa só fonte, Quarteira consultada, service worker.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const raiz = fileURLToPath(new URL("..", import.meta.url));
const ler = rel => readFileSync(join(raiz, rel), "utf8");
const config = JSON.parse(ler("config.json"));

function ficheirosJs(dir) {
  return readdirSync(join(raiz, dir)).flatMap(nome => {
    const rel = join(dir, nome);
    return statSync(join(raiz, rel)).isDirectory() ? ficheirosJs(rel) : rel.endsWith(".js") ? [rel] : [];
  });
}

test("config.json tem os URL correctos das fontes", () => {
  assert.deepEqual(config.fontes, {
    marineBase: "https://marine-api.open-meteo.com/v1/marine",
    forecastBase: "https://api.open-meteo.com/v1/forecast",
    ipmaSeaForecastBase: "https://api.ipma.pt/open-data/forecast/oceanography/daily/",
    boiasIhBase: "https://ogcapi.hidrografico.pt/collections/buoys_datawell/locations/"
  });
});

test("nenhum URL de API escrito em js/ (fonte única: config.json)", () => {
  for (const f of ficheirosJs("js")) assert.doesNotMatch(ler(f), /https?:\/\//, f);
});

test("a app e o diagnóstico consultam os pontos de todos os pesqueiros (via pontosNecessarios)", () => {
  for (const f of ["js/dados.js", "js/diagnostico.js"]) {
    const src = ler(f);
    assert.match(src, /pontosNecessarios\(config\)/, f);
    assert.match(src, /\.mar\.map/, f);
    assert.match(src, /\.terra\.map/, f);
  }
  assert.match(ler("js/app.js"), /carregarDados\(/);
});

// ---------- Service worker, executado num contexto falso ----------

function carregarSw({ rede }) {
  const handlers = {};
  const cache = new Map();
  const abertas = new Set();
  const instalados = [];
  const cacheApi = {
    open: async nome => {
      abertas.add(nome);
      return {
        // Atraso deliberado: prova que a resposta espera pela gravação.
        put: (req, res) => new Promise(ok => setTimeout(() => { cache.set(req.url, res); ok(); }, 5)),
        addAll: async lista => { instalados.push(...lista); }
      };
    },
    match: async req => cache.get(req.url),
    keys: async () => [...abertas]
  };
  const ctx = {
    self: { addEventListener: (tipo, fn) => { handlers[tipo] = fn; }, location: { origin: "https://exemplo.pt" },
      skipWaiting() {}, clients: { claim() {} } },
    caches: cacheApi,
    fetch: async req => {
      if (rede === "falha") throw new TypeError("sem rede");
      return { ok: true, origem: "rede", url: req.url, clone() { return { ...this, origem: "cache" }; } };
    },
    Response: class {
      constructor(corpo, init) { Object.assign(this, init, { corpo, ok: true, redirected: false, origem: "cópia limpa" }); }
      static error() { return { ok: false, origem: "erro" }; }
    },
    URL
  };
  vm.runInNewContext(ler("sw.js"), ctx);
  async function instalar() {
    let espera;
    handlers.install({ waitUntil: p => { espera = p; } });
    await espera;
    return instalados;
  }
  async function pedir(url) {
    let resposta;
    handlers.fetch({ request: { url, method: "GET" }, respondWith: p => { resposta = p; } });
    return resposta ? await resposta : "ignorado";
  }
  return { pedir, instalar, cache };
}

test("sw: *.json é rede primeiro, mesmo com cópia em cache", async () => {
  const sw = carregarSw({ rede: "ok" });
  sw.cache.set("https://exemplo.pt/config.json", { ok: true, origem: "cache-antiga" });
  const r = await sw.pedir("https://exemplo.pt/config.json");
  assert.equal(r.origem, "rede");
});

test("sw: *.json sem rede usa a cópia em cache; sem cópia devolve erro", async () => {
  const sw = carregarSw({ rede: "falha" });
  sw.cache.set("https://exemplo.pt/mares/2026.json", { ok: true, origem: "cache" });
  assert.equal((await sw.pedir("https://exemplo.pt/mares/2026.json")).origem, "cache");
  assert.equal((await sw.pedir("https://exemplo.pt/config.json")).origem, "erro");
});

test("sw: a cópia de *.json fica gravada antes de a resposta ser devolvida", async () => {
  const sw = carregarSw({ rede: "ok" });
  await sw.pedir("https://exemplo.pt/mares/2026.json");
  assert.ok(sw.cache.has("https://exemplo.pt/mares/2026.json"));
});

test("sw: a instalação guarda a shell completa e todos os ficheiros existem", async () => {
  const sw = carregarSw({ rede: "ok" });
  const instalados = await sw.instalar();
  const naPasta = (pasta, ext) => readdirSync(join(raiz, pasta)).filter(f => f.endsWith(ext)).map(f => `./${pasta}/${f}`);
  const esperado = ["./", "./manifest.webmanifest",
    ...readdirSync(raiz).filter(f => f.endsWith(".html")).map(f => `./${f}`),
    ...naPasta("css", ".css"), ...naPasta("assets/fotos", ".jpg"),
    ...[...ficheirosJs("js"), ...ficheirosJs("vendor")].map(f => "./" + f.split("\\").join("/")),
    // Leaflet: a folha de estilo e o ícone do selector de camadas (os ícones de marcador não são usados).
    ...naPasta("vendor/leaflet", ".css"), "./vendor/leaflet/images/layers.png", "./vendor/leaflet/images/layers-2x.png"];
  assert.deepEqual([...instalados].sort(), [...esperado].sort());
  for (const f of instalados.filter(f => f !== "./")) {
    assert.doesNotThrow(() => statSync(join(raiz, f)), `${f} não existe`);
  }
});

test("sw: shell é cache primeiro", async () => {
  const sw = carregarSw({ rede: "ok" });
  sw.cache.set("https://exemplo.pt/js/app.js", { ok: true, origem: "cache" });
  assert.equal((await sw.pedir("https://exemplo.pt/js/app.js")).origem, "cache");
});

test("sw: pedidos a outros domínios (APIs) não passam pela cache", async () => {
  const sw = carregarSw({ rede: "ok" });
  assert.equal(await sw.pedir("https://api.ipma.pt/x.json"), "ignorado");
});

test("sw: cache versionada (v2 ou superior)", () => {
  const versao = Number(ler("sw.js").match(/surfcasting-shell-v(\d+)/)?.[1]);
  assert.ok(versao >= 2);
});

test("sw: resposta guardada com redireccionamento é servida limpa (o Chrome recusa-a numa navegação)", async () => {
  // Cloudflare: /diagnostico.html → 307 → /diagnostico; o cache.addAll guarda-a com redirected=true.
  const sw = carregarSw({ rede: "ok" });
  sw.cache.set("https://exemplo.pt/diagnostico.html", { ok: true, redirected: true, status: 200, statusText: "OK",
    headers: { "content-type": "text/html" }, blob: async () => "<html>", origem: "cache" });
  const r = await sw.pedir("https://exemplo.pt/diagnostico.html");
  assert.equal(r.redirected, false);
  assert.equal(r.corpo, "<html>");
  assert.equal(r.status, 200);
  assert.deepEqual(r.headers, { "content-type": "text/html" });
  // Uma resposta guardada sem redireccionamento é devolvida tal como está.
  sw.cache.set("https://exemplo.pt/js/app.js", { ok: true, origem: "cache" });
  assert.equal((await sw.pedir("https://exemplo.pt/js/app.js")).origem, "cache");
});

test("páginas: as ligações internas não passam por redireccionamentos do Cloudflare", () => {
  for (const f of ["index.html", "diagnostico.html"]) assert.ok(!/href="\.\/index\.html"/.test(ler(f)), f);
});

test("sw: a versão da cache acompanha a shell (impressão SHA-256 dos ficheiros guardados)", async () => {
  // Sem isto, o telemóvel fica com o código antigo (cache primeiro) e a config nova (rede
  // primeiro): aconteceu com a dourada nas praias (PR #6, sw ainda v9).
  const { impressaoShell, impressaoGravada } = await import("../ferramentas/versao-sw.mjs");
  const sw = ler("sw.js");
  assert.equal(impressaoGravada(sw), impressaoShell(fileURLToPath(new URL("..", import.meta.url)), sw),
    "a shell mudou: correr «node ferramentas/versao-sw.mjs» (sobe a versão da cache)");
});

test("Falésia: ondulação e água ao largo (célula de mar), vento no ponto da Fizk", () => {
  const f = config.pesqueiros.falesia;
  assert.equal(f.mar, "falesiaMar");
  assert.equal(f.agua, "falesiaMar");
  assert.equal(f.terra, "fizkFalesiaAlfamar");
  // Grelha do Open-Meteo Marine de 1/12°: as linhas 37,042 e 37,125 têm o meio em 37,0833. O ponto da
  // Fizk (37,0834) caía na de 37,125, com o centro em terra; o ponto de mar tem de ficar a sul do meio.
  assert.ok(config.locais.falesiaMar.latitude < 37.0833);
});
