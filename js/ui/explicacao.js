// O que explica uma nota, a partir das parcelas e do limite que o motor devolve (o ecrã inicial, o
// comparador e a página do pesqueiro usam o mesmo). Não calcula nada: só descreve. Função pura.
import { ESTADO_NOTA } from "../regras/notas.js";

const sinal = p => (p > 0 ? `+${p}` : `−${Math.abs(p)}`);

// O que explica a nota, a partir das parcelas e do limite que o motor devolve: as parcelas aplicadas,
// as que ficaram por avaliar (com o motivo) e o limite obrigatório. As não aplicadas não se repetem.
export function porque(n) {
  if (!n) return [];
  if (n.estado !== ESTADO_NOTA.OK) return [`${n.estado === ESTADO_NOTA.ND ? "sem nota" : "por confirmar"}: ${n.motivo ?? "dados em falta"}`];
  const out = [];
  for (const x of n.parcelas ?? []) {
    const motivo = x.motivo ? ` (${x.motivo})` : "";
    if (x.descricao.startsWith("base")) {
      const qual = x.descricao.replace(/^base:?\s*/, "");
      if (x.estado === "aplicada") out.push(`base ${x.peso}${qual ? ` (${qual})` : ""}`);
      else if (x.estado === "não avaliada") out.push(`base por avaliar${motivo}`);
    } else if (x.estado === "aplicada") out.push(`${sinal(x.peso)} ${x.descricao}`);
    else if (x.estado === "não avaliada") out.push(`${x.descricao}: por avaliar${motivo}`);
  }
  if (n.limite) out.push(`limite: ${n.limite.descricao} → ${n.limite.valor}`);
  if (n.periodosSemNota?.length) out.push(`sem nota: ${n.periodosSemNota.join(", ")}`);
  return out;
}

// Estado de uma nota em palavras (comparador, cartões, destaque).
export function estadoDaNota(n) {
  if (!n) return "não se aplica";
  if (n.estado === ESTADO_NOTA.ND) return "sem nota";
  if (n.estado === ESTADO_NOTA.POR_CONFIRMAR) return "por confirmar";
  return n.completa ? "completa" : "incompleta";
}
