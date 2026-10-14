// Monta a pasta publicar/ só com os ficheiros da app, para o Cloudflare Pages.
// O site publicado é público: a pasta recolha/ (material da app de referência, que obriga a manter o
// repositório privado), os testes, as ferramentas e os documentos de trabalho NUNCA são
// publicados. Lista explícita: um ficheiro novo só é publicado se for acrescentado aqui.
// Uso (comando de build do Cloudflare Pages): node ferramentas/publicar.mjs  → saída: publicar
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PUBLICAR = [
  "index.html", "diagnostico.html", "manifest.webmanifest", "sw.js", "config.json", "_headers",
  "css", "js", "vendor", "mares", "assets"
];
export const NUNCA = ["recolha", "testes", "ferramentas", ".github", "CLAUDE.md", "README.md", "package.json"];

export function publicar(raiz, destino = path.join(raiz, "publicar")) {
  fs.rmSync(destino, { recursive: true, force: true });
  fs.mkdirSync(destino, { recursive: true });
  for (const item of PUBLICAR) {
    const origem = path.join(raiz, item);
    if (!fs.existsSync(origem)) throw new Error(`Em falta: ${item}`);
    fs.cpSync(origem, path.join(destino, item), { recursive: true });
  }
  for (const item of NUNCA) {
    if (fs.existsSync(path.join(destino, item))) throw new Error(`Não pode ser publicado: ${item}`);
  }
  return destino;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const destino = publicar(raiz);
  console.log(`Pasta pronta: ${path.relative(raiz, destino)}/ (${PUBLICAR.join(", ")})`);
}
