// Regra 5 — potência da ondulação, hora a hora: P ≈ coef × Hs² × T (kW/m).
// Hs total e T da MESMA hora. T é o «wave_period» do Open-Meteo: um período disponibilizado pela
// fonte, cuja definição espectral NÃO está confirmada (não se identifica como Tm02, Tm−1,0 nem
// período de energia). É usado como indicador provisório (revisão de 20/11/2026). Se faltar → não
// obtido. Decisão do utilizador de 20/11/2026: o período de pico não o substitui (a decisão da
// Fase 1 permitia-o, com aviso). A fórmula, o coeficiente e os limiares não mudam. O campo `aviso`
// fica para o motor e a interface, hoje sempre null. Indicador de águas profundas, não a energia
// na rebentação. Função pura.
import { ESTADO, roundTo } from "../normalizacao.js";
import { valido } from "./serie.js";

// De onde vem o período usado (para a interface e os testes); nunca «médio» nem «de energia».
export const FONTE_PERIODO = "wave_period (Open-Meteo)";

// periodo: o «wave_period» do Open-Meteo, em segundos (indicador provisório; ver acima).
export function potenciaHora({ hs, periodo }, coeficiente = 0.49) {
  const sem = status => ({ valor: null, status, fontePeriodo: null, aviso: null });
  if (hs === null || hs === undefined) return sem(ESTADO.NAO_OBTIDO);
  if (!valido(hs)) return sem(ESTADO.INVALIDO);
  if (periodo === null || periodo === undefined) return sem(ESTADO.NAO_OBTIDO);
  if (!valido(periodo) || periodo === 0) return sem(ESTADO.INVALIDO);
  return { valor: coeficiente * hs * hs * periodo, status: ESTADO.OBTIDO, fontePeriodo: FONTE_PERIODO, aviso: null };
}

// Potência de cada hora de um registo do Open-Meteo Marine.
export function potenciaDoRegisto(r, coeficiente) {
  return { instante: r.instante, ...potenciaHora({
    hs: r.wave_height, periodo: r.wave_period
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
    instante: max.instante, fontePeriodo: max.fontePeriodo, horasSemValor: semValor, completa: semValor === 0, avisos
  };
}
