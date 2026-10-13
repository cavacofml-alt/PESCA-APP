import { fetchJson } from "./http.js";
import { sourceResult, lisbonDate } from "../normalizacao.js";

// Faro (lat 37.1933, lon -8.0). Não há ponto do IPMA em Quarteira.
export const GLOBAL_ID_FARO = 1080526;

export async function getSeaForecastDay(day, { baseUrl, fetchImpl = fetch, now = new Date() } = {}) {
  if (![0, 1, 2].includes(day)) throw new RangeError("O dia IPMA deve ser 0, 1 ou 2");
  const source = `IPMA — estado do mar dia ${day}`;
  const readAt = now.toISOString();
  try {
    if (!baseUrl) throw new Error("Configuração em falta: URL do estado do mar");
    const json = await fetchJson(`${baseUrl}hp-daily-sea-forecast-day${day}.json`, { fetchImpl });
    if (!json || !Array.isArray(json.data)) throw new Error("Formato de estado do mar inesperado");
    // O ficheiro dayN pode ainda não ter sido actualizado (observado: a 08/10 o day0
    // ainda trazia forecastDate 07/10). Só se aceita se corresponder ao dia pedido.
    const esperado = lisbonDate(now, day);
    if (json.forecastDate !== esperado) {
      throw new Error(`não obtido (desactualizado): forecastDate ${json.forecastDate ?? "em falta"}, esperado ${esperado}`);
    }
    const faro = json.data.filter(row => Number(row?.globalIdLocal) === GLOBAL_ID_FARO);
    if (faro.length === 0) throw new Error(`não obtido: resposta sem registo de Faro (${GLOBAL_ID_FARO})`);
    if (faro.length > 1) throw new Error(`inválido: ${faro.length} registos de Faro (${GLOBAL_ID_FARO}), esperado 1`);
    return sourceResult({ source, readAt, data: faro });
  } catch (error) {
    return sourceResult({ source, readAt, error });
  }
}
