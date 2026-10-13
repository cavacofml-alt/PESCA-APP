import { fetchJson } from "./http.js";
import { sourceResult, parseUtc, ESTADO } from "../normalizacao.js";

// Único sítio onde se mapeiam os níveis do IPMA (awarenessLevelID).
export const NIVEIS_AVISO = Object.freeze({
  green:  { ordem: 0, nome: "verde" },
  yellow: { ordem: 1, nome: "amarelo" },
  orange: { ordem: 2, nome: "laranja" },
  red:    { ordem: 3, nome: "vermelho" }
});

// Ordem de um nível pelo nome português usado no config.json ("amarelo"). null se desconhecido.
export function ordemNivel(nome) {
  const nivel = Object.values(NIVEIS_AVISO).find(n => n.nome === nome);
  return nivel ? nivel.ordem : null;
}

// Converte um aviso em bruto do IPMA. startTime/endTime vêm sem fuso e são UTC.
// Nível desconhecido ou horas ilegíveis → status "inválido" (nunca se adivinha).
export function normalizarAviso(raw) {
  const nivel = NIVEIS_AVISO[raw?.awarenessLevelID] ?? null;
  const inicio = parseUtc(raw?.startTime);
  const fim = parseUtc(raw?.endTime);
  const problemas = [];
  if (!nivel) problemas.push(`nível desconhecido: ${raw?.awarenessLevelID}`);
  if (!inicio) problemas.push(`startTime ilegível: ${raw?.startTime}`);
  if (!fim) problemas.push(`endTime ilegível: ${raw?.endTime}`);
  if (inicio && fim && fim < inicio) problemas.push("endTime anterior a startTime");
  return {
    area: raw?.idAreaAviso ?? null,
    tipo: raw?.awarenessTypeName ?? null,
    nivel: nivel ? nivel.nome : null,
    ordemNivel: nivel ? nivel.ordem : null,
    inicio: inicio ? inicio.toISOString() : null,
    fim: fim ? fim.toISOString() : null,
    texto: typeof raw?.text === "string" ? raw.text : null,
    status: problemas.length ? ESTADO.INVALIDO : ESTADO.OBTIDO,
    problemas
  };
}

// Campos que todos os registos têm de trazer. Se o IPMA mudar o formato, o filtro por
// área/tipo deixaria de encontrar avisos e uma lista vazia passaria por "sem avisos":
// por isso valida-se a estrutura de TODOS os registos antes de filtrar.
const CAMPOS_AVISO = ["idAreaAviso", "awarenessTypeName", "awarenessLevelID", "startTime", "endTime"];

export function validarFormatoAvisos(json) {
  if (!Array.isArray(json)) throw new Error("Formato de avisos inesperado: não é uma lista");
  json.forEach((row, i) => {
    const falta = CAMPOS_AVISO.filter(c => typeof row?.[c] !== "string");
    if (falta.length) throw new Error(`Formato de avisos inesperado: registo ${i} sem ${falta.join(", ")}`);
  });
}

// ok=true só quando a resposta tem o formato esperado e todos os avisos relevantes são
// interpretáveis. Uma lista vazia com ok=true significa "sem avisos" confirmado.
// Aviso relevante inválido → ok=false (segurança por verificar), mantendo os dados lidos.
export async function getWarnings({ url, area, tipo, fetchImpl = fetch, now = new Date() }) {
  const source = "IPMA — avisos";
  const readAt = now.toISOString();
  try {
    if (!url || !area || !tipo) throw new Error("Configuração em falta: url, área ou tipo de aviso");
    const json = await fetchJson(url, { fetchImpl });
    validarFormatoAvisos(json);
    const avisos = json
      .filter(row => row.idAreaAviso === area && row.awarenessTypeName === tipo)
      .map(normalizarAviso);
    const invalidos = avisos.filter(a => a.status !== ESTADO.OBTIDO);
    if (invalidos.length) {
      const detalhe = invalidos.flatMap(a => a.problemas).join("; ");
      return sourceResult({ source, readAt, data: avisos,
        error: `segurança por verificar: ${invalidos.length} aviso(s) ilegível(eis) (${detalhe})` });
    }
    return sourceResult({ source, readAt, data: avisos });
  } catch (error) {
    return sourceResult({ source, readAt, error });
  }
}
