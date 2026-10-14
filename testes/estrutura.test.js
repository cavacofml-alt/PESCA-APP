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
    ipmaSeaForecastBase: "https://api.ipma.pt/open-data/forecast/oceanography/daily/"
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
    Response: { error: () => ({ ok: false, origem: "erro" }) },
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
    ...[...ficheirosJs("js"), ...ficheirosJs("vendor")].map(f => "./" + f.split("\\").join("/"))];
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
