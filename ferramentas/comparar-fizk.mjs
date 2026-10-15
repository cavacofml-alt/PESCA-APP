// Compara, hora a hora, as notas da Fizk (CSV de uma recolha do Claude web) com as nossas, para os
// mesmos pontos e a mesma previsão do Open-Meteo. Ferramenta de verificação (não faz parte da app).
// Uso:
//   node ferramentas/comparar-fizk.mjs <pasta com openmeteo_*.json> <pesqueiro>=<csv da Fizk> [...]
// Ex.: node ferramentas/comparar-fizk.mjs recolha/2026-10-15/apis vilamoura=recolha/2026-10-15/claude-web/1_Vilamoura.csv
// Escreve Markdown: por período, as notas da Fizk (0–10) ao lado das nossas (1–5); hora a hora, também
// os dados da Fizk ao lado dos nossos, para confirmar que vêm da mesma previsão. A direcção da Fizk é a
// rotação da seta + 180° (a seta aponta para onde vai o vento ou a onda).
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { analisarDias } from "../js/regras/analise.js";
import { validateTides } from "../js/fontes/mares-locais.js";
import { pontosNecessarios } from "../js/pontos.js";
import { limitesDiaLisboa, utcToLisbon } from "../js/normalizacao.js";

const [pasta, ...pares] = process.argv.slice(2);
if (!pasta || !pares.length) {
  console.error("Uso: node ferramentas/comparar-fizk.mjs <pasta apis> <pesqueiro>=<csv da Fizk> [...]");
  process.exit(1);
}
const raiz = new URL("..", import.meta.url);
const config = JSON.parse(fs.readFileSync(new URL("config.json", raiz), "utf8"));
const SunCalc = createRequire(import.meta.url)("../vendor/suncalc.js");
const pts = pontosNecessarios(config);

// CSV da Fizk: 1.ª linha é um comentário, 2.ª o cabeçalho; «;» a separar e vírgula decimal.
function lerCsv(ficheiro) {
  const [, cabecalho, ...linhas] = fs.readFileSync(ficheiro, "utf8").trim().split(/\r?\n/);
  const nomes = cabecalho.split(";");
  return linhas.map(l => Object.fromEntries(l.split(";").map((v, i) => [nomes[i], v])));
}
const numero = v => (v === undefined || /PRO|vis/i.test(v) ? null : Number(String(v).replace(",", ".").replace("°", "")));

const ler = (tipo, k) => {
  const f = fs.readdirSync(pasta).filter(x => x.startsWith(`openmeteo_${tipo}_${k}_`)).sort().pop();
  if (!f) return { ok: false, data: null, error: `ficheiro openmeteo_${tipo}_${k}_* em falta`, source: k };
  return { ok: true, data: JSON.parse(fs.readFileSync(path.join(pasta, f), "utf8")), source: f,
    readAt: fs.statSync(path.join(pasta, f)).mtime.toISOString() };
};
const pontos = {
  mar: Object.fromEntries(pts.mar.map(k => [k, ler("marine", k)])),
  terra: Object.fromEntries(pts.terra.map(k => [k, ler("forecast", k)]))
};
const mares = validateTides(JSON.parse(fs.readFileSync(new URL("mares/2026.json", raiz), "utf8"))).events;
const sol = (dia, ponto) => {
  const { latitude, longitude } = config.locais[ponto];
  const t = SunCalc.getTimes(new Date(limitesDiaLisboa(dia).inicio + 12 * 3600000), latitude, longitude);
  return { nascer: t.sunrise.getTime(), por: t.sunset.getTime() };
};

const csvs = pares.map(p => { const [id, f] = p.split("="); return { id, linhas: lerCsv(f) }; });
const dias = [...new Set(csvs.flatMap(c => c.linhas.map(l => l.data)))].sort();
const { dias: res } = analisarDias({ dias, pontos, mares, sol, config });
console.log(`# Notas da Fizk e as nossas, hora a hora\n\nDados nossos: ${pasta}. Notas nossas provisórias (secção 6 do CLAUDE.md).`);

const v = (x, casas = 1) => (x === null || x === undefined || !Number.isFinite(x) ? "—" : x.toFixed(casas).replace(".", ","));
const nossa = n => (!n ? "—" : n.estado === "ok" ? String(n.nota) : n.estado === "por confirmar" ? "?" : "n.d.");
const porque = n => (!n ? "" : n.estado !== "ok" ? n.motivo ?? "" : n.limite ? n.limite.descricao
  : n.parcelas.filter(p => p.estado === "aplicada").map(p => p.descricao).join(" + "));
const faixa = xs => { const ok = xs.filter(x => x !== null); return ok.length ? `${v(Math.min(...ok))}–${v(Math.max(...ok))}` : "não visível"; };
const kmh = nos => (nos === null || nos === undefined ? null : nos * 1.852);
const rumoFizk = rot => (rot === null ? null : (rot + 180) % 360);

for (const { id, linhas } of csvs) {
  const pq = config.pesqueiros[id];
  if (!pq) { console.error(`pesqueiro desconhecido: ${id}`); process.exit(1); }
  console.log(`\n## ${pq.nome ?? id}\n`);
  // Hora local de Lisboa → linha da Fizk (na hora repetida de 25/10 fica a primeira).
  const fizk = new Map();
  for (const l of linhas) if (!fizk.has(`${l.data}T${l.hora}`)) fizk.set(`${l.data}T${l.hora}`, l);
  const tabela = [];
  for (const d of res) {
    const p = d.pesqueiros[id];
    for (const h of p.horas) {
      const local = utcToLisbon(new Date(h.instante)).slice(0, 16);
      const f = fizk.get(local);
      if (!f) continue;
      const per = p.periodos.find(x => x.nome === h.periodo);
      tabela.push({ dia: d.dia, local, periodo: h.periodo, per, h, f });
    }
  }

  console.log("Por período: notas da Fizk (0–10, mínimo–máximo das horas visíveis) e as nossas (1–5, uma por período).\n");
  console.log("| Dia | Período | Fizk robalo | Nossa robalo | Fizk dourada | Nossa dourada | Porquê (nossa) |");
  console.log("|---|---|---|---|---|---|---|");
  for (const d of res) {
    for (const per of d.pesqueiros[id].periodos) {
      const linhasP = tabela.filter(t => t.dia === d.dia && t.periodo === per.nome);
      if (!linhasP.length) continue;
      const [mr, md] = ["robalo", "dourada"].map(e => porque(per.notas[e]));
      const motivos = mr === md ? mr : `robalo: ${mr}; dourada: ${md}`;
      console.log(`| ${d.dia.slice(8)}/${d.dia.slice(5, 7)} | ${per.nome} | ${faixa(linhasP.map(t => numero(t.f.score_lubina)))} | ${nossa(per.notas.robalo)} | ${faixa(linhasP.map(t => numero(t.f.score_dorada)))} | ${nossa(per.notas.dourada)} | ${motivos} |`);
    }
  }

  console.log("\nHora a hora. Dados: Fizk / nossos (Open-Meteo). Vento em km/h (o nosso vem em nós e é convertido). P e limo são só nossos.\n");
  console.log("| Hora | Fizk R | Fizk D | Nossa R | Nossa D | Vento | Rajada | Vento de (°) | Onda (m) | Período (s) | Onda de (°) | Água (°C) | P (kW/m) | Limo |");
  console.log("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
  const contagem = { horas: 0, iguais: 0 };
  for (const { local, per, h, f } of tabela) {
    const fv = numero(f.vento_kmh), fr = numero(f.rajada_kmh), fdv = rumoFizk(numero(f.seta_vento_rotacao_graus));
    const fhs = numero(f.altura_ondulacao_m), ft = numero(f.periodo_ondulacao_s), fdo = rumoFizk(numero(f.seta_ondulacao_rotacao_graus));
    const fa = numero(f.temp_agua_C);
    const nv = kmh(h.vento?.velocidade), nr = kmh(h.vento?.rajada);
    // Iguais dentro do arredondamento com que a Fizk mostra cada valor.
    const perto = (a, b, tol) => a !== null && b !== null && b !== undefined && Math.abs(a - b) <= tol;
    const difAng = (a, b) => (a === null || b === null || b === undefined ? Infinity : Math.abs(((a - b + 540) % 360) - 180));
    const iguais = perto(fv, nv, 1) && perto(fr, nr, 1) && difAng(fdv, h.vento?.direcao) <= 1 && perto(fhs, h.mar?.hs, 0.051)
      && perto(ft, h.mar?.periodo, 0.51) && difAng(fdo, h.mar?.direcao) <= 1 && perto(fa, h.agua, 0.051);
    contagem.horas++; if (iguais) contagem.iguais++;
    console.log(`| ${local.slice(8, 10)}/${local.slice(5, 7)} ${local.slice(11)} | ${v(numero(f.score_lubina))} | ${v(numero(f.score_dorada))} | ${nossa(per.notas.robalo)} | ${nossa(per.notas.dourada)}`
      + ` | ${v(fv, 0)} / ${v(nv, 0)} | ${v(fr, 0)} / ${v(nr, 0)} | ${v(fdv, 0)} / ${v(h.vento?.direcao, 0)}`
      + ` | ${v(fhs)} / ${v(h.mar?.hs, 2)} | ${v(ft, 0)} / ${v(h.mar?.periodo)} | ${v(fdo, 0)} / ${v(h.mar?.direcao, 0)} | ${v(fa)} / ${v(h.agua)}`
      + ` | ${v(h.mar?.potencia?.valor, 2)} | ${h.limo?.limo === true ? "sim" : h.limo?.limo === false ? "não" : "—"} |`);
  }
  console.log(`\nDados iguais (dentro do arredondamento da Fizk) em ${contagem.iguais} de ${contagem.horas} horas.`);
}
