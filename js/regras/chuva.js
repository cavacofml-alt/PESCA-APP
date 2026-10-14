// Regra 8 — água doce / água turva por chuva forte (decisão 1a do utilizador, 14/10/2026).
// Chuva forte = soma da precipitação nas 48 h antes do início do dia (00:00 de Lisboa)
// ≥ 20 mm (provisório, config.chuva). Função pura.
// Horas em falta: se a soma das horas obtidas já chega ao limiar → turva; senão indeterminado
// (nunca "sem água turva" com dados incompletos).
import { limitesDiaLisboa, roundTo } from "../normalizacao.js";
import { valido } from "./serie.js";

const H = 3600000;

// todasAsHoras: série completa do ponto "terra" (com os dias anteriores).
export function aguaTurvaDoDia(todasAsHoras, dia, { limiar48hMm = 20, janelaHoras = 48 } = {}) {
  const limites = limitesDiaLisboa(dia);
  if (!limites) return { turva: null, motivo: "dia inválido" };
  // No Open-Meteo, "precipitation" é a soma da hora ANTERIOR ao instante indicado
  // (documentação: "Preceding hour sum"). A chuva de ]início − 48 h, início] está nos
  // valores marcados de (início − 47 h) até início, inclusive.
  const fim = limites.inicio;
  const inicio = fim - janelaHoras * H;
  const porInstante = new Map((todasAsHoras ?? []).map(r => [r.instante, r]));
  let soma = 0;
  let emFalta = 0;
  for (let t = inicio + H; t <= fim; t += H) {
    const v = porInstante.get(t)?.precipitation;
    if (valido(v)) soma += v; else emFalta++;
  }
  const chuva48hMm = roundTo(soma, 1);
  if (soma >= limiar48hMm) return { turva: true, chuva48hMm, horasEmFalta: emFalta };
  if (emFalta > 0) return { turva: null, chuva48hMm, horasEmFalta: emFalta,
    motivo: `chuva das 48 h anteriores incompleta (${emFalta} h sem valor; ${chuva48hMm} mm nas restantes)` };
  return { turva: false, chuva48hMm, horasEmFalta: 0 };
}
