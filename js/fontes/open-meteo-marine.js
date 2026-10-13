import { fetchJson, makeUrl } from "./http.js";
import { sourceResult } from "../normalizacao.js";
import { validarSerieUnix } from "./open-meteo-tempo.js";

const VARIABLES = [
  "wave_height", "wave_direction", "wave_period", "wave_peak_period",
  "wind_wave_height", "wind_wave_direction", "wind_wave_period",
  "swell_wave_height", "swell_wave_direction", "swell_wave_period",
  "sea_surface_temperature"
];

export async function getMarine({ latitude, longitude, pastDays = 7, forecastDays = 7,
  baseUrl, fetchImpl = fetch, now = new Date() }) {
  const source = "Open-Meteo Marine API";
  const readAt = now.toISOString();
  try {
    if (!baseUrl) throw new Error("Configuração em falta: URL do Open-Meteo Marine");
    // timeformat=unixtime: instantes absolutos. A hora local repete-se a 25/10/2026.
    const url = makeUrl(baseUrl, {
      latitude, longitude, hourly: VARIABLES.join(","), timezone: "Europe/Lisbon",
      timeformat: "unixtime", past_days: pastDays, forecast_days: forecastDays
    });
    const json = await fetchJson(url, { fetchImpl });
    validarSerieUnix(json);
    return sourceResult({ source, readAt, data: json });
  } catch (error) {
    return sourceResult({ source, readAt, error });
  }
}
