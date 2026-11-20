// Regra 3 — vento local, ondulação de fundo e vaga de vento analisados em separado.
// Qualquer componente com período < 6 s é vaga de vento, mesmo que a fonte a classifique
// como swell. Função pura.
import { valido } from "./serie.js";

// Componentes de ondulação de uma hora do Open-Meteo Marine.
// Devolve { fundo: [...], vaga: [...], porClassificar: [...], semAltura: [...] }; cada componente
// tem { origem, hs, direcao, periodo, nota }. Altura 0 = componente ausente. Altura em falta ou
// inválida = não se sabe se a componente existe: fica em «semAltura», que impede concluir (limo,
// lado do molhe) mas não confirma nada (revisão do ChatGPT, 19/11/2026).
export function classificarComponentes(r, limiarPeriodo = 6) {
  const fundo = [];
  const vaga = [];
  const porClassificar = [];
  const semAltura = [];
  const swell = { origem: "swell", hs: r.swell_wave_height, direcao: r.swell_wave_direction, periodo: r.swell_wave_period };
  const ventoVaga = { origem: "wind_wave", hs: r.wind_wave_height, direcao: r.wind_wave_direction, periodo: r.wind_wave_period };

  // Vaga de vento da fonte: é sempre vaga, qualquer que seja o período.
  if (!valido(ventoVaga.hs)) semAltura.push({ ...ventoVaga, nota: "altura da vaga de vento não obtida" });
  else if (ventoVaga.hs > 0) vaga.push({ ...ventoVaga, nota: null });

  if (!valido(swell.hs)) semAltura.push({ ...swell, nota: "altura do swell não obtida" });
  else if (swell.hs > 0) {
    if (!valido(swell.periodo)) porClassificar.push({ ...swell, nota: "período do swell em falta ou inválido" });
    else if (swell.periodo < limiarPeriodo) vaga.push({ ...swell, nota: `swell com período < ${limiarPeriodo} s tratado como vaga` });
    else fundo.push({ ...swell, nota: null });
  }
  return { fundo, vaga, porClassificar, semAltura };
}

// Energia relativa de uma componente (Hs² × T), para decidir entre componentes em conflito.
export function energia(c) {
  return valido(c.hs) && valido(c.periodo) ? c.hs * c.hs * c.periodo : null;
}
