// Regra 8 — água doce / água turva por chuva forte. PENDENTE DE APROVAÇÃO.
// O limiar (20 mm, provisório no config) e a janela de "dias anteriores" ainda não foram
// aprovados pelo utilizador. Enquanto config.chuva.pendenteAprovacao for true, a regra não é
// avaliada e o resultado diz isso explicitamente — nunca "sem água turva". Função pura.

export const CHUVA_PENDENTE = "chuva forte: regra pendente de aprovação (limiar e janela)";

export function aguaTurvaDoDia(_horasTerra, _dia, { pendenteAprovacao = true } = {}) {
  if (pendenteAprovacao) return { turva: null, motivo: CHUVA_PENDENTE };
  // Só implementar depois de aprovados o limiar e a janela temporal.
  throw new Error("Regra da chuva ainda não implementada: falta aprovação do limiar e da janela");
}
