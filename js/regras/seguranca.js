// Regra 1 — segurança (prevalece sobre tudo). Função pura.
// Aviso de Agitação Marítima amarelo ou superior, válido em qualquer momento do dia local,
// bloqueia os bicos das barras e o molhe nesse dia inteiro. Se a consulta de avisos não
// confirmou o estado (ok=false), a segurança fica por verificar. Para lá do alcance dos
// avisos, "aviso ainda não emitido".
import { limitesDiaLisboa } from "../normalizacao.js";
import { SITUACAO_AVISOS, ordemNivel } from "../fontes/ipma-avisos.js";

export const ESTADO_SEGURANCA = Object.freeze({
  LIVRE: "sem aviso",                   // confirmado: nenhum aviso amarelo+ nesse dia
  BLOQUEADO: "aviso amarelo ou superior",
  POR_VERIFICAR: "segurança por verificar",
  NAO_EMITIDO: "aviso ainda não emitido"
});

// diaIndice: 0 = hoje, 1 = amanhã, ... (dias civis de Lisboa).
export function segurancaDoDia(resultadoAvisos, dia, diaIndice, { nivelMinimo = "amarelo", alcanceDias = 3 } = {}) {
  if (diaIndice >= alcanceDias) return { estado: ESTADO_SEGURANCA.NAO_EMITIDO, avisos: [] };
  const confirmado = resultadoAvisos?.ok === true &&
    [SITUACAO_AVISOS.SEM_AVISOS, SITUACAO_AVISOS.COM_AVISOS].includes(resultadoAvisos.situacao);
  if (!confirmado) return { estado: ESTADO_SEGURANCA.POR_VERIFICAR, avisos: [], motivo: resultadoAvisos?.error ?? null };

  const limites = limitesDiaLisboa(dia);
  const minimo = ordemNivel(nivelMinimo);
  if (!limites || minimo === null) return { estado: ESTADO_SEGURANCA.POR_VERIFICAR, avisos: [], motivo: "dia ou nível mínimo inválido" };
  // Intervalo do aviso [inicio, fim] sobrepõe o dia [inicio, fim)?
  const relevantes = (resultadoAvisos.data ?? []).filter(a =>
    a.ordemNivel >= minimo && Date.parse(a.inicio) < limites.fim && Date.parse(a.fim) >= limites.inicio);
  return relevantes.length
    ? { estado: ESTADO_SEGURANCA.BLOQUEADO, avisos: relevantes }
    : { estado: ESTADO_SEGURANCA.LIVRE, avisos: [] };
}

// Bicos das barras e molhe só podem ser recomendados com o estado confirmado LIVRE.
export function podeRecomendarBicosEMolhe(seguranca) {
  return seguranca.estado === ESTADO_SEGURANCA.LIVRE;
}
