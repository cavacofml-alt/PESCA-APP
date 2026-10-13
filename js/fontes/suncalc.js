// Adaptador para SunCalc. A biblioteca é carregada localmente, sem segunda fonte solar.
// Colocar a distribuição licenciada de SunCalc em vendor/suncalc.js antes de publicar.
export function getSunAndMoon(date, latitude, longitude, SunCalc = globalThis.SunCalc) {
  if (!SunCalc || typeof SunCalc.getTimes !== "function" || typeof SunCalc.getMoonIllumination !== "function") {
    return {
      source: "SunCalc (local)",
      ok: false,
      readAt: new Date().toISOString(),
      error: "Biblioteca SunCalc não instalada em vendor/suncalc.js",
      data: null
    };
  }
  try {
    const times = SunCalc.getTimes(date, latitude, longitude);
    const moon = SunCalc.getMoonIllumination(date);
    const validDate = d => d instanceof Date && Number.isFinite(d.getTime());
    return {
      source: "SunCalc (cálculo local)",
      ok: true,
      readAt: new Date().toISOString(),
      error: null,
      data: {
        sunrise: validDate(times.sunrise) ? times.sunrise.toISOString() : null,
        sunset: validDate(times.sunset) ? times.sunset.toISOString() : null,
        moonFraction: Number.isFinite(moon.fraction) ? moon.fraction : null,
        moonPhase: Number.isFinite(moon.phase) ? moon.phase : null
      }
    };
  } catch (error) {
    return { source: "SunCalc (local)", ok: false, readAt: new Date().toISOString(), error: String(error), data: null };
  }
}
