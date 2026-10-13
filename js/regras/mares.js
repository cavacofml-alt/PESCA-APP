// Regra 4 — marés, amplitude em metros (nunca coeficientes). Função pura.
// Amplitude arredondada a 0,01 m: < 2,00 morta; 2,00–3,00 inclusive intermédia; > 3,00 viva.
import { roundTo, ESTADO, limitesDiaLisboa } from "../normalizacao.js";

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

// Decisão A — amplitude do dia: a maior entre pares consecutivos (PM↔BM) com pelo menos um
// dos dois eventos dentro do dia civil de Lisboa. Pares que atravessam a meia-noite contam
// para os dois dias. Para não subestimar, exige-se que a tabela tenha um evento antes do
// primeiro e depois do último evento do dia; caso contrário → não obtido.

export function amplitudeDoDia(eventos, dia, opcoes) {
  const limites = limitesDiaLisboa(dia);
  if (!limites || !Array.isArray(eventos)) return { ...classificarAmplitude(null), motivo: "marés não obtidas" };
  const dentro = i => eventos[i].timestamp >= limites.inicio && eventos[i].timestamp < limites.fim;
  const indices = eventos.map((_, i) => i).filter(dentro);
  if (indices.length === 0) return { ...classificarAmplitude(null), motivo: "tabela sem eventos neste dia" };
  const primeiro = indices[0];
  const ultimo = indices[indices.length - 1];
  if (primeiro === 0 || ultimo === eventos.length - 1) {
    return { ...classificarAmplitude(null), motivo: "tabela incompleta à volta deste dia" };
  }
  const pares = amplitudesConsecutivas(eventos.slice(primeiro - 1, ultimo + 2));
  const maior = pares.reduce((a, b) => (b.metros > a.metros ? b : a));
  return { ...classificarAmplitude(maior.metros, opcoes), de: maior.de, ate: maior.ate, pares: pares.length };
}

// Repontos com instante dentro do dia civil de Lisboa. null se a tabela não cobrir o dia
// inteiro (tem de haver um evento antes do início e outro depois do fim): uma lista vazia
// significaria "sem repontos", o que seria falso.
export function repontosDoDia(eventos, dia) {
  const limites = limitesDiaLisboa(dia);
  if (!limites || !Array.isArray(eventos)) return null;
  const cobre = eventos.some(e => e.timestamp < limites.inicio) && eventos.some(e => e.timestamp >= limites.fim);
  if (!cobre) return null;
  return repontos(eventos).filter(r => r.instante >= limites.inicio && r.instante < limites.fim);
}
