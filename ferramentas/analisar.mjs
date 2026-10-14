// Corre o motor de regras sobre respostas do Open-Meteo guardadas em ficheiros e imprime um
// resumo por dia. Ferramenta de verificação (não faz parte da app). Uso:
//   node ferramentas/analisar.mjs <pasta-com-json> [primeiro-dia AAAA-MM-DD] [n.º de dias]
// A pasta tem de ter openmeteo_marine_{faro,quarteira}_*.json e openmeteo_forecast_{faro,quarteira}_*.json.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { analisarDias } from "../js/regras/analise.js";
import { validateTides } from "../js/fontes/mares-locais.js";
import { lisbonDate, limitesDiaLisboa, utcToLisbon } from "../js/normalizacao.js";

const [pasta, primeiro, nDias = "7"] = process.argv.slice(2);
if (!pasta) { console.error("Uso: node ferramentas/analisar.mjs <pasta> [AAAA-MM-DD] [dias]"); process.exit(1); }
const raiz = new URL("..", import.meta.url);
const config = JSON.parse(fs.readFileSync(new URL("config.json", raiz), "utf8"));
const SunCalc = createRequire(import.meta.url)("../vendor/suncalc.js");

const ficheiro = prefixo => {
  const f = fs.readdirSync(pasta).filter(x => x.startsWith(prefixo)).sort().pop();
  if (!f) return { ok: false, data: null, error: `ficheiro ${prefixo}* em falta`, source: prefixo };
  const st = fs.statSync(path.join(pasta, f));
  return { ok: true, data: JSON.parse(fs.readFileSync(path.join(pasta, f), "utf8")), source: f, readAt: st.mtime.toISOString() };
};
const pontos = {
  faroMar: ficheiro("openmeteo_marine_faro"), quarteiraMar: ficheiro("openmeteo_marine_quarteira"),
  faroTerra: ficheiro("openmeteo_forecast_faro"), quarteiraTerra: ficheiro("openmeteo_forecast_quarteira")
};
const mares = validateTides(JSON.parse(fs.readFileSync(new URL("mares/2026.json", raiz), "utf8"))).events;
const inicio = primeiro ?? lisbonDate(new Date());
const dias = Array.from({ length: Number(nDias) }, (_, i) => lisbonDate(new Date(limitesDiaLisboa(inicio).inicio + 12 * 3600000), i));
const sol = (dia, ponto) => {
  const { latitude, longitude } = config.locais[ponto];
  const t = SunCalc.getTimes(new Date(limitesDiaLisboa(dia).inicio + 12 * 3600000), latitude, longitude);
  return { nascer: t.sunrise.getTime(), por: t.sunset.getTime() };
};

const hora = ms => (ms === null || ms === undefined ? "—" : utcToLisbon(new Date(ms)).slice(11, 16));
const nota = n => (!n ? "" : n.estado === "ok" ? `${n.nota}/5${n.naoAvaliadas.length ? "*" : ""}` : `n.d. (${n.motivo})`);
const { dias: res, melhoresDias } = analisarDias({ dias, pontos, mares, sol, config });

for (const d of res) {
  const a = d.amplitude;
  console.log(`\n=== ${d.dia}  maré: ${a.amplitude ?? "não obtida"} m ${a.classe ?? ""}  repontos: ${(d.repontos ?? []).map(r => `${r.tipo} ${hora(r.instante)}`).join(" · ") || "não obtidos"}`);
  for (const [id, p] of Object.entries(d.pesqueiros)) {
    const pot = p.potencia ? `P máx ${p.potencia.valor ?? "n.o."} kW/m às ${hora(p.potencia.instante)}` : "";
    const limo = p.limo ? `limo ${p.limo.limo === null ? "indeterminado" : p.limo.limo ? "SIM" : "não"}` : "";
    const lados = p.lados ? `lados: ${p.lados.intervalos.map(i => `${i.lado ?? "?"} ${i.deLocal}–${i.ateLocal}`).join(", ")}` : "";
    const ns = Object.entries(p.notas).map(([e, n]) => `${e} ${nota(n)}`).join(" | ");
    console.log(`  ${id.padEnd(16)} ${ns.padEnd(34)} ${pot} ${limo} ${lados}`.trimEnd());
    if (p.alinhamento.alinhado) console.log(`  ${"".padEnd(16)} ALINHAMENTO: ${p.alinhamento.alinhamentos.map(x => `${x.tipo} ${hora(x.reponto)} a ${x.minutos} min do ${x.evento}`).join("; ")}`);
  }
  const ria = d.pesqueiros.ria;
  console.log(`  pressão (Faro): descida ${ria.pressao.descida.activo} (${ria.pressao.descida.descidaHpa?.toFixed?.(1) ?? "—"} hPa) · alta/estável ${ria.pressao.altaEstavel.valor} · água ${ria.agua?.media ?? "—"} °C (vs D−7: ${ria.agua?.variacao ?? ria.agua?.motivo})`);
  const an = d.pesqueiros.praia_faro.anomalias;
  if (an?.assinalar) console.log(`  rajada > 3× (Faro): ${an.anomalas.map(x => hora(x.instante)).join(", ")}${an.inconsistentes.length ? ` · inconsistentes ${an.inconsistentes.length}` : ""}`);
}
console.log(`\nMelhores dias: ${melhoresDias.join(", ")}`);
console.log("* = nota com parcelas não avaliadas (ex.: chuva pendente)");
