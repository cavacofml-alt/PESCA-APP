// Reúne os dados de que o motor precisa: Open-Meteo por ponto (mar e terra), tabela de marés
// local e nascer/pôr do Sol do SunCalc. Cada fonte falha sozinha (critério 10: a falha de uma
// fonte nunca bloqueia as outras). Sem cálculo de notas: isso é do motor (js/regras/).
import { getMarine } from "./fontes/open-meteo-marine.js";
import { getForecast } from "./fontes/open-meteo-forecast.js";
import { loadLocalTides } from "./fontes/mares-locais.js";
import { pontosNecessarios } from "./pontos.js";
import { lisbonDate, limitesDiaLisboa } from "./normalizacao.js";

// Dias civis de Lisboa a analisar, a começar no dia de "agora".
export function diasDoHorizonte(agora, n) {
  const hoje = lisbonDate(agora);
  const meioDia = limitesDiaLisboa(hoje).inicio + 12 * 3600000;
  return Array.from({ length: n }, (_, i) => lisbonDate(new Date(meioDia), i));
}

// Nascer e pôr do Sol (SunCalc, cálculo local) para um dia e um ponto do config.
export function solDoDia(SunCalc, config) {
  return (dia, ponto) => {
    const local = config.locais[ponto];
    const limites = limitesDiaLisboa(dia);
    if (!SunCalc || !local || !limites) return null;
    const t = SunCalc.getTimes(new Date(limites.inicio + 12 * 3600000), local.latitude, local.longitude);
    const ms = d => (d instanceof Date && Number.isFinite(d.getTime()) ? d.getTime() : null);
    return { nascer: ms(t.sunrise), por: ms(t.sunset) };
  };
}

export async function carregarDados({ config, fetchImpl = fetch, SunCalc = globalThis.SunCalc,
  agora = new Date(), urlMares = "./mares/2026.json" }) {
  const pts = pontosNecessarios(config);
  const pedidos = [
    ...pts.mar.map(k => getMarine({ ...config.locais[k], baseUrl: config.fontes.marineBase, fetchImpl, now: agora })),
    ...pts.terra.map(k => getForecast({ ...config.locais[k], baseUrl: config.fontes.forecastBase, fetchImpl, now: agora })),
    loadLocalTides({ url: urlMares, fetchImpl, now: agora,
      minIntervalMinutes: config.mares.intervaloEventoMinutos.minimo,
      maxIntervalMinutes: config.mares.intervaloEventoMinutos.maximo })
  ];
  const r = await Promise.all(pedidos);
  const mar = Object.fromEntries(pts.mar.map((k, i) => [k, r[i]]));
  const terra = Object.fromEntries(pts.terra.map((k, i) => [k, r[pts.mar.length + i]]));
  const mares = r[r.length - 1];
  return {
    pontos: { mar, terra },
    mares,
    sol: SunCalc ? solDoDia(SunCalc, config) : null,
    dias: diasDoHorizonte(agora, config.horizonteDias ?? 7),
    lidoEm: agora.toISOString()
  };
}
