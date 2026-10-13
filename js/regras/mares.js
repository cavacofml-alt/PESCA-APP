// Regra 4 — marés, amplitude em metros (nunca coeficientes). Função pura.
// Amplitude arredondada a 0,01 m: < 2,00 morta; 2,00–3,00 inclusive intermédia; > 3,00 viva.
import { roundTo, ESTADO } from "../normalizacao.js";

export const CLASSE_MARE = Object.freeze({ MORTA: "morta", INTERMEDIA: "intermédia", VIVA: "viva" });

export function classificarAmplitude(metros, { casasDecimais = 2, mortaMaxExclusivoM = 2.0, vivaMinExclusivoM = 3.0 } = {}) {
  if (metros === null || metros === undefined) return { amplitude: null, classe: null, status: ESTADO.NAO_OBTIDO };
  if (typeof metros !== "number" || !Number.isFinite(metros) || metros < 0) {
    return { amplitude: null, classe: null, status: ESTADO.INVALIDO };
  }
  const a = roundTo(metros, casasDecimais);
  const classe = a < mortaMaxExclusivoM ? CLASSE_MARE.MORTA : a > vivaMinExclusivoM ? CLASSE_MARE.VIVA : CLASSE_MARE.INTERMEDIA;
  return { amplitude: a, classe, status: ESTADO.OBTIDO };
}

// Amplitude entre cada par de eventos consecutivos (PM→BM ou BM→PM) da tabela validada
// por validateTides. Cada entrada guarda os dois instantes, para se saber a que dia pertence.
export function amplitudesConsecutivas(eventos) {
  const out = [];
  for (let i = 1; i < eventos.length; i++) {
    const a = eventos[i - 1];
    const b = eventos[i];
    out.push({ de: a.timestamp, ate: b.timestamp, metros: Math.abs(b.heightM - a.heightM) });
  }
  return out;
}

// Repontos: os instantes de PM e BM (a corrente inverte-se).
export function repontos(eventos) {
  return eventos.map(e => ({ instante: e.timestamp, tipo: e.type, alturaM: e.heightM }));
}
