// Impressão da shell do service worker: SHA-256 (12 primeiros caracteres) dos ficheiros que o
// sw.js guarda no telemóvel. Se algum mudar, a versão da cache tem de subir; senão o telemóvel
// continua com o código antigo (cache primeiro) e a config nova (rede primeiro).
// Uso: node ferramentas/versao-sw.mjs   → recalcula a impressão e, se mudou, sobe a versão.
// Um teste (testes/estrutura.test.js) falha se a impressão do sw.js não bater certo.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

export function lerShell(textoSw) {
  const bloco = textoSw.match(/const SHELL = \[([\s\S]*?)\];/)?.[1] ?? "";
  return [...bloco.matchAll(/"\.\/([^"]*)"/g)].map(m => m[1]).filter(Boolean);
}

export function impressaoShell(raiz, textoSw = fs.readFileSync(path.join(raiz, "sw.js"), "utf8")) {
  const h = crypto.createHash("sha256");
  for (const f of lerShell(textoSw)) {
    h.update(f);
    h.update("\0");
    h.update(fs.readFileSync(path.join(raiz, f)));
    h.update("\0");
  }
  return h.digest("hex").slice(0, 12);
}

export const impressaoGravada = textoSw => textoSw.match(/\/\/ impressão da shell: ([0-9a-f]{12})/)?.[1] ?? null;

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const ficheiro = path.join(raiz, "sw.js");
  let texto = fs.readFileSync(ficheiro, "utf8");
  const nova = impressaoShell(raiz, texto);
  if (impressaoGravada(texto) === nova) {
    console.log(`Shell sem alterações (${nova}); versão mantida.`);
  } else {
    texto = texto.replace(/surfcasting-shell-v(\d+)/, (_, n) => `surfcasting-shell-v${Number(n) + 1}`)
      .replace(/\/\/ impressão da shell: [0-9a-f]{12}/, `// impressão da shell: ${nova}`);
    fs.writeFileSync(ficheiro, texto);
    console.log(`Shell mudou: impressão ${nova}, ${texto.match(/surfcasting-shell-v\d+/)[0]}.`);
  }
}
