// Validação comum das séries horárias do Open-Meteo pedidas com timeformat=unixtime.
// hourly.time tem de ser uma lista de segundos Unix, estritamente crescente.
export function validarSerieUnix(json) {
  const time = json?.hourly?.time;
  if (!Array.isArray(time) || time.length === 0) throw new Error("Resposta sem série horária válida");
  for (let i = 0; i < time.length; i++) {
    if (typeof time[i] !== "number" || !Number.isInteger(time[i])) {
      throw new Error(`Série horária com instante não Unix na posição ${i}: ${time[i]}`);
    }
    if (i > 0 && time[i] <= time[i - 1]) {
      throw new Error(`Série horária fora de ordem ou repetida na posição ${i}`);
    }
  }
  return true;
}
