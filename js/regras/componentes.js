// Regra 3 — vento local, ondulação de fundo e vaga de vento analisados em separado.
// Qualquer componente com período < 6 s é vaga de vento, mesmo que a fonte a classifique
// como swell. Função pura.
import { valido } from "./serie.js";

// Componentes de ondulação de uma hora do Open-Meteo Marine.
// Devolve { fundo: [...], vaga: [...], porClassificar: [...] }; cada componente tem
// { origem, hs, direcao, periodo, nota }.
export function classificarComponentes(r, limiarPeriodo = 6) {
  const fundo = [];
  const vaga = [];
  const porClassificar = [];
  const swell = { origem: "swell", hs: r.swell_wave_height, direcao: r.swell_wave_direction, periodo: r.swell_wave_period };
  const ventoVaga = { origem: "wind_wave", hs: r.wind_wave_height, direcao: r.wind_wave_direction, periodo: r.wind_wave_period };

  // Vaga de vento da fonte: é sempre vaga, qualquer que seja o período.
  if (valido(ventoVaga.hs) && ventoVaga.hs > 0) vaga.push({ ...ventoVaga, nota: null });

  if (valido(swell.hs) && swell.hs > 0) {
    if (!valido(swell.periodo)) porClassificar.push({ ...swell, nota: "período do swell em falta ou inválido" });
    else if (swell.periodo < limiarPeriodo) vaga.push({ ...swell, nota: `swell com período < ${limiarPeriodo} s tratado como vaga` });
    else fundo.push({ ...swell, nota: null });
  }
  return { fundo, vaga, porClassificar };
}

// Energia relativa de uma componente (Hs² × T), para decidir entre componentes em conflito.
export function energia(c) {
  return valido(c.hs) && valido(c.periodo) ? c.hs * c.hs * c.periodo : null;
}
