// Regra 10 — valores anómalos: rajada > 3× o vento médio na mesma hora → "confirmar antes
// de sair". Só se avalia com vento médio ≥ 5 nós (decisão 3b do utilizador, 14/10/2026;
// config.anomalias.ventoMedioMinimoNos): com brisa fraca a razão dispara sem significado.
// Com mínimo 0, vento 0 e rajada positiva → dados inconsistentes. Função pura.
import { valido } from "./serie.js";

export const CONFIRMAR = "confirmar antes de sair";

export function anomaliasDoDia(horasTerra, { rajadaSobreVentoMedioMaximo = 3, ventoMedioMinimoNos = 0 } = {}) {
  const anomalas = [];
  const inconsistentes = [];
  let semDados = 0;
  let abaixoDoMinimo = 0;
  for (const r of horasTerra) {
    const v = r.wind_speed_10m;
    const g = r.wind_gusts_10m;
    if (!valido(v) || !valido(g)) { semDados++; continue; }
    if (v < ventoMedioMinimoNos) { abaixoDoMinimo++; continue; }
    if (v === 0) {
      if (g > 0) inconsistentes.push({ instante: r.instante, vento: v, rajada: g });
      continue;
    }
    if (g > rajadaSobreVentoMedioMaximo * v) anomalas.push({ instante: r.instante, vento: v, rajada: g, razao: g / v });
  }
  const assinalar = anomalas.length > 0 || inconsistentes.length > 0;
  return { assinalar, mensagem: assinalar ? CONFIRMAR : null, anomalas, inconsistentes, horasSemDados: semDados,
    horasAbaixoDoMinimo: abaixoDoMinimo };
}
