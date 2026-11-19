import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registarServiceWorker } from "../js/registo-sw.js";

// Navegador simulado: guarda os ouvintes, o registo e as recargas.
function simular({ controlador = {}, protocolo = "https:" } = {}) {
  const ouvintes = {};
  const r = { registos: [], recargas: 0 };
  const nav = {
    serviceWorker: {
      controller: controlador,
      addEventListener: (ev, fn) => { (ouvintes[ev] ??= []).push(fn); },
      register: url => { r.registos.push(url); return Promise.resolve(); }
    }
  };
  const loc = { protocol: protocolo, reload: () => { r.recargas++; } };
  r.mudar = () => (ouvintes.controllerchange ?? []).forEach(fn => fn());
  r.ok = registarServiceWorker(nav, loc);
  return r;
}

test("service worker: regista o sw.js", () => {
  const r = simular();
  assert.equal(r.ok, true);
  assert.deepEqual(r.registos, ["./sw.js"]);
  assert.equal(r.recargas, 0);
});

test("service worker: versão nova publicada → recarrega a página uma vez", () => {
  const r = simular({ controlador: { scriptURL: "sw.js (antigo)" } });
  r.mudar();
  assert.equal(r.recargas, 1);
  r.mudar(); // um segundo aviso na mesma página não volta a recarregar
  assert.equal(r.recargas, 1);
});

test("service worker: primeira instalação (sem service worker antes) não recarrega", () => {
  const r = simular({ controlador: null });
  r.mudar();
  assert.equal(r.recargas, 0);
});

test("service worker: sem suporte ou em file:// não faz nada", () => {
  assert.equal(registarServiceWorker({}, { protocol: "https:", reload() {} }), false);
  assert.equal(registarServiceWorker(undefined, undefined), false);
  const r = simular({ protocolo: "file:" });
  assert.equal(r.ok, false);
  assert.deepEqual(r.registos, []);
});

test("service worker: os três ecrãs usam o registo comum, e ele está na shell", () => {
  for (const f of ["js/app.js", "js/mapa.js", "js/diagnostico.js"]) {
    const t = readFileSync(f, "utf8");
    assert.match(t, /import \{ registarServiceWorker \} from "\.\/registo-sw\.js";/, f);
    assert.match(t, /^registarServiceWorker\(\);$/m, f);
    assert.doesNotMatch(t, /serviceWorker\.register/, f);
  }
  assert.match(readFileSync("sw.js", "utf8"), /"\.\/js\/registo-sw\.js"/);
});
