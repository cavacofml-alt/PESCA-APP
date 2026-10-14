// Corre o motor de regras e imprime um resumo por dia e por período. Ferramenta de
// verificação (não faz parte da app). Uso:
//   node ferramentas/analisar.mjs --rede [AAAA-MM-DD] [dias]     vai buscar os dados agora e guarda-os
//   node ferramentas/analisar.mjs <pasta> [AAAA-MM-DD] [dias]   usa ficheiros guardados
// Ficheiros: openmeteo_marine_<ponto>_*.json e openmeteo_forecast_<ponto>_*.json, com <ponto> = chave
// de config.locais (os pontos de que os pesqueiros precisam).
// Atrás de um proxy (ex.: ambiente do Claude Code), correr com
//   NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=<certificados> node --no-warnings ferramentas/analisar.mjs --rede
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { analisarDias } from "../js/regras/analise.js";
import { validateTides } from "../js/fontes/mares-locais.js";
import { getMarine } from "../js/fontes/open-meteo-marine.js";
import { getForecast } from "../js/fontes/open-meteo-forecast.js";
import { pontosNecessarios } from "../js/pontos.js";
import { lisbonDate, limitesDiaLisboa, utcToLisbon } from "../js/normalizacao.js";

const [origem, primeiro, nDias = "7"] = process.argv.slice(2);
if (!origem) { console.error("Uso: node ferramentas/analisar.mjs --rede|<pasta> [AAAA-MM-DD] [dias]"); process.exit(1); }
const raiz = new URL("..", import.meta.url);
const config = JSON.parse(fs.readFileSync(new URL("config.json", raiz), "utf8"));
const SunCalc = createRequire(import.meta.url)("../vendor/suncalc.js");
const pts = pontosNecessarios(config);

async function daRede() {
  const agora = new Date();
  const carimbo = utcToLisbon(agora).replace(/[-:]/g, "").replace("T", "_").slice(0, 13);
  const pasta = new URL(`recolha/${lisbonDate(agora)}/apis/`, raiz);
  fs.mkdirSync(pasta, { recursive: true });
  const guardar = (tipo, k, r) => {
    if (r.ok) fs.writeFileSync(new URL(`openmeteo_${tipo}_${k}_${carimbo}.json`, pasta), JSON.stringify(r.data));
    else console.error(`  ${tipo} ${k}: não obtido — ${r.error}`);
    return r;
  };
  const mar = {};
  const terra = {};
  for (const k of pts.mar) mar[k] = guardar("marine", k, await getMarine({ ...config.locais[k], baseUrl: config.fontes.marineBase }));
  for (const k of pts.terra) terra[k] = guardar("forecast", k, await getForecast({ ...config.locais[k], baseUrl: config.fontes.forecastBase }));
  console.log(`Dados lidos às ${utcToLisbon(agora).slice(11, 16)} e guardados em recolha/${lisbonDate(agora)}/apis/`);
  return { mar, terra };
}

function deFicheiros(pasta) {
  const ler = (tipo, k) => {
    const f = fs.readdirSync(pasta).filter(x => x.startsWith(`openmeteo_${tipo}_${k}_`)).sort().pop();
    if (!f) return { ok: false, data: null, error: `ficheiro openmeteo_${tipo}_${k}_* em falta`, source: k };
    return { ok: true, data: JSON.parse(fs.readFileSync(path.join(pasta, f), "utf8")), source: f,
      readAt: fs.statSync(path.join(pasta, f)).mtime.toISOString() };
  };
  return {
    mar: Object.fromEntries(pts.mar.map(k => [k, ler("marine", k)])),
    terra: Object.fromEntries(pts.terra.map(k => [k, ler("forecast", k)]))
  };
}

const pontos = origem === "--rede" ? await daRede() : deFicheiros(origem);
const mares = validateTides(JSON.parse(fs.readFileSync(new URL("mares/2026.json", raiz), "utf8"))).events;
const inicio = primeiro ?? lisbonDate(new Date());
const dias = Array.from({ length: Number(nDias) }, (_, i) => lisbonDate(new Date(limitesDiaLisboa(inicio).inicio + 12 * 3600000), i));
const sol = (dia, ponto) => {
  const { latitude, longitude } = config.locais[ponto];
  const t = SunCalc.getTimes(new Date(limitesDiaLisboa(dia).inicio + 12 * 3600000), latitude, longitude);
  return { nascer: t.sunrise.getTime(), por: t.sunset.getTime() };
};

const hora = ms => (ms === null || ms === undefined ? "—" : utcToLisbon(new Date(ms)).slice(11, 16));
const nota = n => (!n ? "—" : n.estado === "ok" ? `${n.nota}${n.naoAvaliadas.length ? "*" : ""}` : "n.d.");
const { dias: res, melhoresDias } = analisarDias({ dias, pontos, mares, sol, config });

for (const d of res) {
  const a = d.amplitude;
  console.log(`\n=== ${d.dia}  maré ${a.amplitude ?? "não obtida"} m ${a.classe ?? ""} · repontos ${(d.repontos ?? []).map(r => `${r.tipo} ${hora(r.instante)}`).join(" ") || "não obtidos"}`);
  for (const [id, p] of Object.entries(d.pesqueiros)) {
    const esp = Object.keys(p.notas);
    const porPeriodo = p.periodos.map(per => `${per.nome.slice(0, 5)} ${esp.map(e => nota(per.notas[e])).join("/")}`).join("  ");
    const melhor = esp.map(e => `${e} ${nota(p.notas[e])}${p.notas[e]?.periodo ? ` (${p.notas[e].periodo})` : ""}`).join(" | ");
    console.log(`  ${id.padEnd(16)} ${melhor.padEnd(38)} [${porPeriodo}]`);
    const nd = esp.map(e => p.notas[e]).filter(n => n?.estado !== "ok" && n?.motivo);
    if (nd.length) console.log(`  ${"".padEnd(16)} n.d.: ${nd.map(n => n.motivo).join("; ")}`);
    if (p.potencia) console.log(`  ${"".padEnd(16)} P máx ${p.potencia.valor ?? "n.o."} kW/m às ${hora(p.potencia.instante)} · limo ${p.limo.limo === null ? "indeterminado" : p.limo.limo ? "SIM" : "não"}${p.lados ? ` · lados ${p.lados.intervalos.map(i => `${i.lado ?? "?"} ${i.deLocal}–${i.ateLocal}`).join(", ")}` : ""}`);
    const ali = p.periodos.flatMap(per => per.alinhamento.alinhamentos ?? []);
    if (ali.length) console.log(`  ${"".padEnd(16)} ALINHAMENTO: ${ali.map(x => `${x.tipo} ${hora(x.reponto)} a ${x.minutos} min do ${x.evento}`).join("; ")}`);
  }
  const ria = d.pesqueiros.ria;
  console.log(`  pressão: descida ${ria.pressao.descida.activo} (${ria.pressao.descida.descidaHpa?.toFixed?.(1) ?? "—"} hPa) · alta/estável ${ria.pressao.altaEstavel.valor} · água ${ria.agua?.media ?? "—"} °C (vs D−7 ${ria.agua?.variacao ?? "n.d."})`);
}
console.log(`\nMelhores dias: ${melhoresDias.join(", ")}`);
console.log("Períodos: madrugada/manhã/tarde/noite. * = parcelas não avaliadas (ex.: chuva pendente). Notas provisórias.");
