// Monta a pasta publicar/ só com os ficheiros da app, para o Cloudflare Workers (site estático).
// A pasta recolha/ (material de trabalho), os testes, as ferramentas, o Playwright e os
// documentos de trabalho NUNCA são publicados no site. (O repositório também é público: o que
// está em recolha/ vê-se no GitHub, mas não no site.)
// Lista explícita: um ficheiro novo só é publicado se for acrescentado aqui.
// Uso (comando de build no wrangler.jsonc): node ferramentas/publicar.mjs  → saída: publicar
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PUBLICAR = [
  "index.html", "diagnostico.html", "mapa.html", "fontes.html", "comparador.html", "pesqueiro.html", "diario.html", "estatisticas.html", "manifest.webmanifest", "sw.js", "config.json", "_headers",
  "css", "js", "vendor", "mares", "fundos", "assets"
];
export const NUNCA = ["recolha", "testes", "testes-browser", "ferramentas", ".github", "node_modules", "CLAUDE.md", "README.md",
  "package.json", "package-lock.json"];

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
