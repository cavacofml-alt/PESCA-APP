import { fetchJson, makeUrl } from "./http.js";
import { sourceResult } from "../normalizacao.js";
import { validarSerieUnix } from "./open-meteo-tempo.js";

const HOURLY = ["wind_speed_10m", "wind_direction_10m", "wind_gusts_10m",
  "pressure_msl", "precipitation"];
// Deliberately excludes sunrise/sunset: SunCalc is the sole source for solar events.
// Rajadas: não existe wind_gusts_unit; seguem wind_speed_unit.
export async function getForecast({ latitude, longitude, pastDays = 7, forecastDays = 7,
  baseUrl, fetchImpl = fetch, now = new Date() }) {
  const source = "Open-Meteo Forecast API";
  const readAt = now.toISOString();
  try {
    if (!baseUrl) throw new Error("Configuração em falta: URL do Open-Meteo Forecast");
    const url = makeUrl(baseUrl, {
      latitude, longitude, hourly: HOURLY.join(","), timezone: "Europe/Lisbon",
      timeformat: "unixtime", past_days: pastDays, forecast_days: forecastDays,
      wind_speed_unit: "kn", precipitation_unit: "mm"
    });
    const json = await fetchJson(url, { fetchImpl });
    validarSerieUnix(json);
    return sourceResult({ source, readAt, data: json });
  } catch (error) {
    return sourceResult({ source, readAt, error });
  }
}
