// Publicação no Cloudflare Pages: só os ficheiros da app; nunca recolha/ (material da app de referência).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { publicar, NUNCA } from "../ferramentas/publicar.mjs";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("publicar: pasta com a app e sem recolha/, testes nem documentos de trabalho", () => {
  const destino = publicar(raiz, fs.mkdtempSync(path.join(os.tmpdir(), "publicar-")));
  try {
    for (const f of ["index.html", "sw.js", "config.json", "_headers", "manifest.webmanifest",
      "js/app.js", "js/regras/analise.js", "vendor/suncalc.js", "vendor/LICENSE-suncalc", "mares/2026.json",
      "assets/fotos/ria.jpg", "assets/icones/icone-512.png"]) {
      assert.ok(fs.existsSync(path.join(destino, f)), `${f} em falta`);
    }
    for (const f of NUNCA) assert.ok(!fs.existsSync(path.join(destino, f)), `${f} não pode ser publicado`);
    const todos = fs.readdirSync(destino, { recursive: true }).map(String);
    assert.ok(!todos.some(f => /recolha|ref/i.test(f)), "nada da recolha nem da app de referência");
  } finally {
    fs.rmSync(destino, { recursive: true, force: true });
  }
});

test("publicar: tudo o que o service worker guarda é publicado", () => {
  const sw = fs.readFileSync(path.join(raiz, "sw.js"), "utf8");
  const shell = [...sw.matchAll(/"\.\/([^"]*)"/g)].map(m => m[1]).filter(Boolean);
  const destino = publicar(raiz, fs.mkdtempSync(path.join(os.tmpdir(), "publicar-")));
  try {
    for (const f of shell) assert.ok(fs.existsSync(path.join(destino, f)), `${f} não publicado`);
  } finally {
    fs.rmSync(destino, { recursive: true, force: true });
  }
});

test("manifesto: ícones de 192 e 512 px que existem (necessários para instalar no Android)", () => {
  const m = JSON.parse(fs.readFileSync(path.join(raiz, "manifest.webmanifest"), "utf8"));
  const tamanhos = m.icons.map(i => i.sizes);
  assert.ok(tamanhos.includes("192x192") && tamanhos.includes("512x512"));
  for (const i of m.icons) assert.ok(fs.existsSync(path.join(raiz, i.src)), i.src);
});

test("wrangler.jsonc: o Cloudflare corre o passo de publicação e serve só a pasta publicar/", () => {
  const texto = fs.readFileSync(path.join(raiz, "wrangler.jsonc"), "utf8").replace(/^\s*\/\/.*$/gm, "");
  const w = JSON.parse(texto);
  assert.equal(w.build.command, "node ferramentas/publicar.mjs");
  assert.equal(w.assets.directory, "./publicar");
  assert.equal(w.main, undefined, "site estático: sem código no servidor");
});
