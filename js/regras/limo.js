// Regra 2 — mar mexido e limo. Função pura.
// Mar mexido (mar total) = Hs ≥ 1,0 m ou P ≥ 1,5 kW/m (provisório).
// Com mar mexido, há limo se QUALQUER componente (vento local, fundo ou vaga) vier do sector
// Levante/Sudeste, na mesma hora. Direcção em falta ou inválida não conta como SE, mas impede
// concluir "sem limo" (resultado indeterminado). O mesmo para uma componente com a altura em falta:
// não se sabe se existe, por isso não confirma o limo mas também não deixa concluir "sem limo".
import { classificarComponentes } from "./componentes.js";
import { potenciaHora } from "./potencia.js";
import { sectorDaDirecao } from "./sectores.js";
import { valido, emFalta } from "./serie.js";

export const SECTOR_LIMO = "levanteSudeste";

// true / false / null (indeterminado: não há dados para concluir).
export function marMexido({ hs, potencia }, { hsMarMexidoM = 1.0, potenciaMarMexidoKWm = 1.5 } = {}) {
  const hsOk = valido(hs);
  const pOk = valido(potencia);
  if ((hsOk && hs >= hsMarMexidoM) || (pOk && potencia >= potenciaMarMexidoKWm)) return true;
  if (hsOk && pOk) return false;
  return null;
}

// Componentes de uma hora: vento local (do ponto "terra") + fundo e vaga (do ponto "mar").
// O vento só é componente quando há vento (velocidade > 0): com 0 nós a direcção não tem significado.
export function componentesDaHora(regMar, regTerra, limiarPeriodo = 6) {
  const { fundo, vaga, porClassificar, semAltura } = classificarComponentes(regMar ?? {}, limiarPeriodo);
  const lista = [
    ...fundo.map(c => ({ tipo: "fundo", ...c })),
    ...vaga.map(c => ({ tipo: "vaga", ...c })),
    ...porClassificar.map(c => ({ tipo: "por classificar", ...c })),
    ...semAltura.map(c => ({ tipo: "altura não obtida", ...c }))
  ];
  const v = regTerra?.wind_speed_10m;
  if (v === null || v === undefined || !valido(v)) {
    lista.push({ tipo: "vento", velocidade: null, direcao: null, nota: "vento não obtido" });
  } else if (v > 0) {
    lista.push({ tipo: "vento", velocidade: v, direcao: regTerra.wind_direction_10m ?? null, nota: null });
  }
  return lista;
}

export function limoDaHora(regMar, regTerra, cfg) {
  const potencia = potenciaHora({ hs: regMar?.wave_height, periodoMedio: regMar?.wave_period }, cfg.coeficiente).valor;
  const mexido = marMexido({ hs: regMar?.wave_height, potencia }, cfg);
  const todas = componentesDaHora(regMar, regTerra, cfg.periodoVagaVentoSegundos);
  const comps = todas.filter(c => c.tipo !== "altura não obtida");
  const semAltura = todas.filter(c => c.tipo === "altura não obtida").map(c => c.origem);
  const componentesSE = comps.filter(c => sectorDaDirecao(c.direcao, cfg.sectoresGraus) === SECTOR_LIMO);
  const semDirecao = comps.filter(c => sectorDaDirecao(c.direcao, cfg.sectoresGraus) === null).map(c => c.tipo);
  const base = { mexido, componentesSE, semDirecao, semAltura };
  if (mexido === false) return { ...base, limo: false };
  if (mexido === null) return { ...base, limo: null, motivo: "estado do mar não obtido (Hs e potência)" };
  if (componentesSE.length) return { ...base, limo: true };
  if (semDirecao.length) return { ...base, limo: null, motivo: `direcção em falta: ${semDirecao.join(", ")}` };
  if (semAltura.length) return { ...base, limo: null, motivo: `altura em falta: ${semAltura.join(", ")}` };
  return { ...base, limo: false };
}

// Dia (ou período): limo se alguma hora tiver limo; senão indeterminado se alguma hora for
// indeterminada ou se faltarem horas do mar (esperados = instantes que deviam existir);
// senão sem limo.
export function limoDoDia(horasMar, horasTerra, cfg, esperados = null) {
  const terraPorInstante = new Map(horasTerra.map(r => [r.instante, r]));
  const horas = horasMar.map(r => ({ instante: r.instante, ...limoDaHora(r, terraPorInstante.get(r.instante), cfg) }));
  if (horas.length === 0) return { limo: null, horas, motivo: "sem dados do mar para o dia" };
  const comLimo = horas.filter(h => h.limo === true);
  if (comLimo.length) return { limo: true, horas, horasComLimo: comLimo.map(h => h.instante) };
  const faltam = esperados ? emFalta(horasMar, esperados) : [];
  if (faltam.length) return { limo: null, horas, motivo: `${faltam.length} hora(s) sem dados do mar` };
  const indet = horas.filter(h => h.limo === null);
  if (indet.length) return { limo: null, horas, motivo: `${indet.length} hora(s) sem dados suficientes` };
  return { limo: false, horas };
}
