// Reúne os dados de que o motor precisa: Open-Meteo por ponto (mar e terra), tabela de marés
// local e nascer/pôr do Sol do SunCalc; e a boia de Faro e o fundo típico das praias, só para mostrar. Cada fonte falha
// sozinha (critério 10: a falha de uma fonte nunca bloqueia as outras). Sem cálculo de notas:
// isso é do motor (js/regras/).
import { getMarine } from "./fontes/open-meteo-marine.js";
import { getForecast } from "./fontes/open-meteo-forecast.js";
import { loadTidesForWindow } from "./fontes/mares-locais.js";
import { getBoia } from "./fontes/ih-boias.js";
import { carregarFundoTipico } from "./fontes/fundo-tipico.js";
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

// Fase da Lua ao meio-dia de Lisboa (SunCalc, cálculo local): fracção iluminada e fase (0–1).
export function luaDoDia(SunCalc) {
  return dia => {
    const limites = limitesDiaLisboa(dia);
    if (!SunCalc || !limites) return null;
    const m = SunCalc.getMoonIllumination(new Date(limites.inicio + 12 * 3600000));
    return Number.isFinite(m.fraction) && Number.isFinite(m.phase) ? { fracao: m.fraction, fase: m.phase } : null;
  };
}

export async function carregarDados({ config, fetchImpl = fetch, SunCalc = globalThis.SunCalc,
  agora = new Date(), urlMares = ano => `./mares/${ano}.json`, urlFundo = "./fundos/tipico.json" }) {
  const pts = pontosNecessarios(config);
  const pedidos = [
    ...pts.mar.map(k => getMarine({ ...config.locais[k], baseUrl: config.fontes.marineBase, fetchImpl, now: agora })),
    ...pts.terra.map(k => getForecast({ ...config.locais[k], baseUrl: config.fontes.forecastBase, fetchImpl, now: agora })),
    // Tabelas dos anos que a janela toca (dois dias de folga de cada lado, para os repontos à volta).
    loadTidesForWindow({ inicio: agora.getTime() - 2 * 86400000,
      fim: agora.getTime() + ((config.horizonteDias ?? 7) + 2) * 86400000, urlFor: urlMares, fetchImpl, now: agora,
      minIntervalMinutes: config.mares.intervaloEventoMinutos.minimo,
      maxIntervalMinutes: config.mares.intervaloEventoMinutos.maximo })
  ];
  // Boia de Faro (observado): fica à parte do motor; a falha não bloqueia as outras fontes.
  const b = config.boias?.faro;
  const boia = b ? getBoia({ baseUrl: config.fontes.boiasIhBase, idEstacao: b.idEstacao, horas: b.horas, fetchImpl, now: agora }) : null;
  // Fundo típico das praias (levantamentos já tratados, ficheiro local): só para mostrar.
  const fundo = carregarFundoTipico({ url: urlFundo, fetchImpl, now: agora });
  const [r, boiaFaro, fundoTipico] = await Promise.all([Promise.all(pedidos), boia, fundo]);
  const mar = Object.fromEntries(pts.mar.map((k, i) => [k, r[i]]));
  const terra = Object.fromEntries(pts.terra.map((k, i) => [k, r[pts.mar.length + i]]));
  const mares = r[r.length - 1];
  return {
    pontos: { mar, terra },
    mares,
    boiaFaro,
    fundoTipico,
    sol: SunCalc ? solDoDia(SunCalc, config) : null,
    lua: SunCalc ? luaDoDia(SunCalc) : null,
    dias: diasDoHorizonte(agora, config.horizonteDias ?? 7),
    lidoEm: agora.toISOString()
  };
}
