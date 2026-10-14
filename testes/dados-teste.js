// Fixtures fixas e offline. Não são previsões reais nem devem aparecer como condições actuais.

// Open-Meteo com timeformat=unixtime, à volta da mudança de hora de 25/10/2026.
// A hora legal 01:00 repete-se: 1792886400 = 01:00 WEST (00:00Z), 1792890000 = 01:00 WET (01:00Z).
export const HORAS_25_OUT = Object.freeze([1792882800, 1792886400, 1792890000, 1792893600]);

export const MARINE_FIXTURE = Object.freeze({
  latitude: 36.97, longitude: -7.98, timezone: "Europe/Lisbon",
  hourly_units: { time: "unixtime", wave_height: "m", wave_period: "s" },
  hourly: {
    time: HORAS_25_OUT,
    wave_height: [0.8, 1.0, 1.1, null],
    wave_direction: [315, 120, 125, null],
    wave_period: [7.0, 5.9, 6.0, null],
    wind_wave_height: [0.3, 0.5, 0.6, null],
    wind_wave_direction: [300, 130, 130, null],
    wind_wave_period: [5.9, 5.9, 6.0, null],
    swell_wave_height: [0.7, 0.8, 0.8, null],
    swell_wave_direction: [315, 140, 140, null],
    swell_wave_period: [9.0, 6.0, 6.0, null],
    sea_surface_temperature: [19.5, 19.4, 19.4, null]
  }
});

export const FORECAST_FIXTURE = Object.freeze({
  latitude: 37.01, longitude: -7.93, timezone: "Europe/Lisbon",
  hourly_units: { time: "unixtime", wind_speed_10m: "kn", wind_gusts_10m: "kn" },
  hourly: {
    time: HORAS_25_OUT,
    wind_speed_10m: [8, 10, 10, null],
    wind_direction_10m: [315, 120, 120, null],
    wind_gusts_10m: [20, 31, 30, null],
    pressure_msl: [1018, 1012, 1012, null],
    precipitation: [0, 12, 3, null]
  }
});

export const TIDE_FIXTURE = Object.freeze({
  schemaVersion: 1, station: "Faro-Olhão", year: 2026, timezone: "Europe/Lisbon",
  source: "Dados de teste fixos",
  events: [
    { instant: "2026-10-24T23:10:00+01:00", type: "PM", heightM: 3.1, source: "fixture" },
    { instant: "2026-10-25T05:20:00Z", type: "BM", heightM: 0.7, source: "fixture" },
    { instant: "2026-10-25T11:30:00Z", type: "PM", heightM: 3.2, source: "fixture" }
  ]
});

// Estado do mar IPMA (hp-daily-sea-forecast-dayN.json). Valores inventados para teste;
// nomes dos campos conforme a secção 9 do CLAUDE.md.
export function ipmaMarFixture(forecastDate) {
  return {
    owner: "IPMA", country: "PT", forecastDate, dataUpdate: `${forecastDate}T06:00:00`,
    data: [
      { globalIdLocal: 1080526, latitude: "37.1933", longitude: "-8.0",
        waveHighMin: "0.5", waveHighMax: "1.0", wavePeriodMin: "6.0", wavePeriodMax: "8.0",
        predWaveDir: "SW", sstMin: "19.5", sstMax: "20.1", totalSeaMin: "0.6", totalSeaMax: "1.2" },
      { globalIdLocal: 1110600, latitude: "38.7", longitude: "-9.4",
        waveHighMin: "1.5", waveHighMax: "2.0", wavePeriodMin: "9.0", wavePeriodMax: "11.0",
        predWaveDir: "NW", sstMin: "17.5", sstMax: "18.0", totalSeaMin: "1.6", totalSeaMax: "2.2" }
    ]
  };
}
