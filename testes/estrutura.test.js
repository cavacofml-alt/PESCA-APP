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
    ipmaWarnings: "https://api.ipma.pt/open-data/forecast/warnings/warnings_www.json",
    ipmaSeaForecastBase: "https://api.ipma.pt/open-data/forecast/oceanography/daily/"
  });
});

test("nenhum URL de API escrito em js/ (fonte única: config.json)", () => {
  for (const f of ficheirosJs("js")) assert.doesNotMatch(ler(f), /https?:\/\//, f);
});

test("app.js consulta Faro e Quarteira (marine + forecast)", () => {
  const app = ler("js/app.js");
  for (const local of ["faroMar", "faroTerra", "quarteiraMar", "quarteiraTerra"]) {
    assert.match(app, new RegExp(`locais\\.${local}`), local);
  }
});

// ---------- Service worker, executado num contexto falso ----------

function carregarSw({ rede }) {
  const handlers = {};
  const cache = new Map();
  const abertas = new Set();
  const cacheApi = {
    open: async nome => {
      abertas.add(nome);
      return { put: async (req, res) => cache.set(req.url, res), addAll: async () => {} };
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
  async function pedir(url) {
    let resposta;
    handlers.fetch({ request: { url, method: "GET" }, respondWith: p => { resposta = p; } });
    return resposta ? await resposta : "ignorado";
  }
  return { pedir, cache, src: ler("sw.js") };
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

test("sw: shell é cache primeiro", async () => {
  const sw = carregarSw({ rede: "ok" });
  sw.cache.set("https://exemplo.pt/js/app.js", { ok: true, origem: "cache" });
  assert.equal((await sw.pedir("https://exemplo.pt/js/app.js")).origem, "cache");
});

test("sw: pedidos a outros domínios (APIs) não passam pela cache", async () => {
  const sw = carregarSw({ rede: "ok" });
  assert.equal(await sw.pedir("https://api.ipma.pt/x.json"), "ignorado");
});

test("sw: cache versionada (v2 ou superior) e shell inclui todos os módulos da app", () => {
  const src = ler("sw.js");
  const versao = Number(src.match(/surfcasting-shell-v(\d+)/)?.[1]);
  assert.ok(versao >= 2);
  for (const f of ficheirosJs("js").filter(f => !f.startsWith(join("js", "regras")))) {
    assert.ok(src.includes(`"./${f.split("\\").join("/")}"`), `${f} em falta na shell`);
  }
});
