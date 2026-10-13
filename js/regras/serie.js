// Converte a série horária do Open-Meteo (timeformat=unixtime) em registos por hora,
// com o dia civil de Lisboa. Função pura.
import { lisbonDate, parseUnixSeconds } from "../normalizacao.js";

export function horasOpenMeteo(json) {
  const h = json?.hourly;
  if (!h || !Array.isArray(h.time)) return [];
  const campos = Object.keys(h).filter(k => k !== "time" && Array.isArray(h[k]));
  return h.time.map((t, i) => {
    const instante = parseUnixSeconds(t);
    const registo = { instante: instante ? instante.getTime() : null, dia: instante ? lisbonDate(instante) : null };
    for (const c of campos) registo[c] = h[c][i] ?? null;
    return registo;
  });
}

// Agrupa registos com campo "dia" num Map dia → registos, pela ordem de chegada.
export function porDia(registos) {
  const mapa = new Map();
  for (const r of registos) {
    if (!r.dia) continue;
    if (!mapa.has(r.dia)) mapa.set(r.dia, []);
    mapa.get(r.dia).push(r);
  }
  return mapa;
}

// Número finito e não negativo? (alturas, períodos, velocidades)
export const valido = v => typeof v === "number" && Number.isFinite(v) && v >= 0;
