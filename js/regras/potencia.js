// Regra 5 — potência da ondulação, hora a hora: P ≈ coef × Hs² × T (kW/m).
// Hs total e período da MESMA hora. Período médio total; se faltar, período de pico com
// aviso; se faltarem os dois → não obtido. Função pura.
import { ESTADO, roundTo } from "../normalizacao.js";
import { valido } from "./serie.js";

export const AVISO_PERIODO_PICO = "calculado com período de pico";

export function potenciaHora({ hs, periodoMedio, periodoPico }, coeficiente = 0.49) {
  if (hs === null || hs === undefined) return { valor: null, status: ESTADO.NAO_OBTIDO, periodo: null, aviso: null };
  if (!valido(hs)) return { valor: null, status: ESTADO.INVALIDO, periodo: null, aviso: null };
  let periodo = null;
  let aviso = null;
  if (periodoMedio !== null && periodoMedio !== undefined) {
    if (!valido(periodoMedio) || periodoMedio === 0) return { valor: null, status: ESTADO.INVALIDO, periodo: null, aviso: null };
    periodo = "médio";
  } else if (periodoPico !== null && periodoPico !== undefined) {
    if (!valido(periodoPico) || periodoPico === 0) return { valor: null, status: ESTADO.INVALIDO, periodo: null, aviso: null };
    periodo = "pico";
    aviso = AVISO_PERIODO_PICO;
  } else {
    return { valor: null, status: ESTADO.NAO_OBTIDO, periodo: null, aviso: null };
  }
  const t = periodo === "médio" ? periodoMedio : periodoPico;
  return { valor: coeficiente * hs * hs * t, status: ESTADO.OBTIDO, periodo, aviso };
}

// Potência de cada hora de um registo do Open-Meteo Marine.
export function potenciaDoRegisto(r, coeficiente) {
  return { instante: r.instante, ...potenciaHora({
    hs: r.wave_height, periodoMedio: r.wave_period, periodoPico: r.wave_peak_period
  }, coeficiente) };
}

// Máximo do dia (ou período) e hora em que ocorre. Horas sem valor — incluindo horas
// esperadas que nem existem nos registos — não entram no máximo; nesse caso completa=false
// (o máximo pode estar subestimado: nunca se estima).
export function potenciaMaximaDoDia(registosDoDia, coeficiente, esperados = null) {
  const porInstante = new Map(registosDoDia.map(r => [r.instante, r]));
  const registos = esperados ? esperados.map(t => porInstante.get(t) ?? { instante: t }) : registosDoDia;
  const horas = registos.map(r => potenciaDoRegisto(r, coeficiente));
  const obtidas = horas.filter(h => h.status === ESTADO.OBTIDO);
  const semValor = horas.length - obtidas.length;
  if (obtidas.length === 0) {
    return { valor: null, status: ESTADO.NAO_OBTIDO, instante: null, horasSemValor: semValor, completa: false, avisos: [] };
  }
  const max = obtidas.reduce((a, b) => (b.valor > a.valor ? b : a));
  const avisos = [...new Set(obtidas.map(h => h.aviso).filter(Boolean))];
  return {
    valor: roundTo(max.valor, 2), valorExacto: max.valor, status: ESTADO.OBTIDO,
    instante: max.instante, periodo: max.periodo, horasSemValor: semValor, completa: semValor === 0, avisos
  };
}
