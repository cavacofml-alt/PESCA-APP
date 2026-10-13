// Regra 7 — temperatura da água. Função pura.
// Média do dia D comparada com a média do dia D−7, da mesma fonte e ponto. Cada média exige
// todas as horas do dia civil de Lisboa com valor; caso contrário "comparação não possível".
// Descida ≥ 2 ºC afasta a dourada.
import { limitesDiaLisboa, lisbonDate, roundTo } from "../normalizacao.js";

const valorAgua = v => typeof v === "number" && Number.isFinite(v);

export function mediaDoDia(horasDoDia, dia, campo = "sea_surface_temperature") {
  const limites = limitesDiaLisboa(dia);
  if (!limites) return { media: null, motivo: "dia inválido" };
  const esperadas = Math.round((limites.fim - limites.inicio) / 3600000);
  const valores = horasDoDia.filter(r => r.dia === dia).map(r => r[campo]);
  const validos = valores.filter(valorAgua);
  if (validos.length !== esperadas) {
    return { media: null, motivo: `${validos.length} de ${esperadas} horas com valor` };
  }
  return { media: validos.reduce((a, b) => a + b, 0) / validos.length };
}

export function aguaDoDia(todasAsHoras, dia, { descidaDesfavoravelC = 2 } = {}) {
  const limites = limitesDiaLisboa(dia);
  if (!limites) return { media: null, comparacao: null, motivo: "dia inválido" };
  const diaAnterior = lisbonDate(new Date(limites.inicio + 12 * 3600000), -7);
  const actual = mediaDoDia(todasAsHoras, dia);
  const anterior = mediaDoDia(todasAsHoras, diaAnterior);
  const base = { media: actual.media === null ? null : roundTo(actual.media, 1), diaComparado: diaAnterior };
  if (actual.media === null || anterior.media === null) {
    return { ...base, comparacao: null, afastaDourada: null,
      motivo: `comparação não possível (${dia}: ${actual.motivo ?? "ok"}; ${diaAnterior}: ${anterior.motivo ?? "ok"})` };
  }
  const variacao = actual.media - anterior.media;
  return { ...base, mediaAnterior: roundTo(anterior.media, 1), variacao: roundTo(variacao, 1),
    afastaDourada: -variacao >= descidaDesfavoravelC };
}
