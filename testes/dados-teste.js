// Fixtures fixas e offline. Não são previsões reais nem devem aparecer como condições actuais.
export const MARINE_FIXTURE = Object.freeze({
  latitude: 36.97, longitude: -7.98,
  hourly: {
    time: ["2026-10-25T01:00", "2026-10-25T02:00", "2026-10-25T03:00"],
    wave_height: [0.8, 1.0, null],
    wave_direction: [315, 120, null],
    wave_period: [7.0, 5.9, null],
    wind_wave_height: [0.3, 0.5, null],
    wind_wave_direction: [300, 130, null],
    wind_wave_period: [5.9, 5.9, null],
    swell_wave_height: [0.7, 0.8, null],
    swell_wave_direction: [315, 140, null],
    swell_wave_period: [9.0, 6.0, null],
    sea_surface_temperature: [19.5, 19.4, null]
  }
});

export const FORECAST_FIXTURE = Object.freeze({
  hourly: {
    time: ["2026-10-25T01:00", "2026-10-25T02:00", "2026-10-25T03:00"],
    wind_speed_10m: [8, 10, null],
    wind_direction_10m: [315, 120, null],
    wind_gusts_10m: [20, 31, null],
    pressure_msl: [1018, 1012, null],
    precipitation: [0, 12, null]
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

export const IPMA_WARNING_FIXTURE = Object.freeze([
  { idAreaAviso: "FAR", awarenessTypeName: "Agitação Marítima", awarenessLevelID: "2",
    startTime: "2026-10-25T00:00:00", endTime: "2026-10-25T23:59:00" }
]);
