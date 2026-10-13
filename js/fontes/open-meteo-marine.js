import { fetchJson, makeUrl } from "./http.js";
import { sourceResult } from "../normalizacao.js";

const VARIABLES = [
  "wave_height", "wave_direction", "wave_period",
  "wind_wave_height", "wind_wave_direction", "wind_wave_period",
  "swell_wave_height", "swell_wave_direction", "swell_wave_period",
  "sea_surface_temperature"
];

export async function getMarine({ latitude, longitude, pastDays = 7, forecastDays = 7,
  baseUrl = "https://marine-api.open-meteo.com/v1/marine", fetchImpl = fetch, now = new Date() }) {
  const source = "Open-Meteo Marine API";
  const readAt = now.toISOString();
  try {
    const url = makeUrl(baseUrl, {
      latitude, longitude, hourly: VARIABLES.join(","), timezone: "Europe/Lisbon",
      past_days: pastDays, forecast_days: forecastDays
    });
    const json = await fetchJson(url, { fetchImpl });
    if (!json?.hourly?.time || !Array.isArray(json.hourly.time)) throw new Error("Resposta sem série horária válida");
    return sourceResult({ source, readAt, data: json });
  } catch (error) {
    return sourceResult({ source, readAt, error });
  }
}
