import { fetchJson, makeUrl } from "./http.js";
import { sourceResult } from "../normalizacao.js";

const HOURLY = ["wind_speed_10m", "wind_direction_10m", "wind_gusts_10m",
  "pressure_msl", "precipitation"];
// Deliberately excludes sunrise/sunset: SunCalc is the sole source for solar events.
export async function getForecast({ latitude, longitude, pastDays = 7, forecastDays = 7,
  baseUrl = "https://api.open-meteo.com/v1/forecast", fetchImpl = fetch, now = new Date() }) {
  const source = "Open-Meteo Forecast API";
  const readAt = now.toISOString();
  try {
    const url = makeUrl(baseUrl, {
      latitude, longitude, hourly: HOURLY.join(","), timezone: "Europe/Lisbon",
      past_days: pastDays, forecast_days: forecastDays,
      wind_speed_unit: "kn", wind_gusts_unit: "kn", precipitation_unit: "mm"
    });
    const json = await fetchJson(url, { fetchImpl });
    if (!json?.hourly?.time || !Array.isArray(json.hourly.time)) throw new Error("Resposta sem série horária válida");
    return sourceResult({ source, readAt, data: json });
  } catch (error) {
    return sourceResult({ source, readAt, error });
  }
}
