import { fetchJson } from "./http.js";
import { sourceResult } from "../normalizacao.js";

export async function getSeaForecastDay(day, { baseUrl =
  "https://api.ipma.pt/open-data/forecast/meteorology/oceanography/", fetchImpl = fetch, now = new Date() } = {}) {
  if (![0, 1, 2].includes(day)) throw new RangeError("O dia IPMA deve ser 0, 1 ou 2");
  const source = `IPMA — estado do mar dia ${day}`;
  const readAt = now.toISOString();
  try {
    const json = await fetchJson(`${baseUrl}hp-daily-sea-forecast-day${day}.json`, { fetchImpl });
    if (!json || !Array.isArray(json.data)) throw new Error("Formato de estado do mar inesperado");
    const faro = json.data.filter(row => Number(row.globalIdLocal) === 1080526);
    return sourceResult({ source, readAt, data: faro });
  } catch (error) {
    return sourceResult({ source, readAt, error });
  }
}
