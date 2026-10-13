// Regra 10 — valores anómalos: rajada > 3× o vento médio na mesma hora → "confirmar antes
// de sair". Vento médio 0 com rajada positiva → dados inconsistentes (a razão é indefinida;
// não se usa nenhum limiar mínimo). Função pura.
import { valido } from "./serie.js";

export const CONFIRMAR = "confirmar antes de sair";

export function anomaliasDoDia(horasTerra, { rajadaSobreVentoMedioMaximo = 3 } = {}) {
  const anomalas = [];
  const inconsistentes = [];
  let semDados = 0;
  for (const r of horasTerra) {
    const v = r.wind_speed_10m;
    const g = r.wind_gusts_10m;
    if (!valido(v) || !valido(g)) { semDados++; continue; }
    if (v === 0) {
      if (g > 0) inconsistentes.push({ instante: r.instante, vento: v, rajada: g });
      continue;
    }
    if (g > rajadaSobreVentoMedioMaximo * v) anomalas.push({ instante: r.instante, vento: v, rajada: g, razao: g / v });
  }
  const assinalar = anomalas.length > 0 || inconsistentes.length > 0;
  return { assinalar, mensagem: assinalar ? CONFIRMAR : null, anomalas, inconsistentes, horasSemDados: semDados };
}
