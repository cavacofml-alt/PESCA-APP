// Cópia de segurança do diário (plano de evolução, PR 5, 20/11/2026): exportar para um ficheiro JSON
// versionado e importar com validação de TUDO antes de escrever. Uma importação inválida não escreve
// nada; uma válida escreve numa só transacção (ou tudo, ou nada). Os registos que já existem nunca são
// substituídos: o mesmo registo é ignorado, e um registo diferente com o mesmo id fica como conflito
// (o do aparelho mantém-se). Os dados ficam só no aparelho e no ficheiro que o utilizador guardar.
import { validarSaida } from "./saidas.js";
import { ESQUEMA_CONDICOES } from "./condicoes.js";
import { lisbonDate } from "../normalizacao.js";

export const FORMATO = "surfcasting-algarve-diario";
export const VERSAO_COPIA = 1;
export const MAX_REGISTOS = 20000;
export const CHAVE_ULTIMA_COPIA = "ultimaCopia";

export function criarCopia({ saidas, condicoes, agora = new Date().toISOString() }) {
  return { formato: FORMATO, versao: VERSAO_COPIA, exportadoEm: agora, app: "Surfcasting Algarve",
    nota: "Diário de saídas de pesca. Horas em UTC (ISO 8601). Sem fotografias.", saidas, condicoes };
}

export const nomeFicheiro = (agora = new Date()) => `diario-surfcasting-${lisbonDate(agora)}.json`;

function validarCondicoes(c, ids) {
  const erros = [];
  if (!c || typeof c !== "object") return ["registo não é um objecto"];
  if (typeof c.saidaId !== "string" || !ids.has(c.saidaId)) erros.push("não pertence a nenhuma saída do ficheiro");
  if (c.id !== `c-${c.saidaId}`) erros.push("id não corresponde à saída");
  if (c.esquema !== ESQUEMA_CONDICOES) erros.push(`esquema ${c.esquema} desconhecido`);
  if (typeof c.disponivel !== "boolean") erros.push("«disponivel» em falta");
  if (c.disponivel && (!Array.isArray(c.horas) || !Array.isArray(c.periodos))) erros.push("horas ou períodos em falta");
  return erros;
}

// Valida o ficheiro inteiro (texto ou objecto). { ok, erros, avisos, saidas, condicoes }.
export function validarCopia(entrada, { pesqueirosConhecidos = null } = {}) {
  let c = entrada;
  if (typeof entrada === "string") {
    try { c = JSON.parse(entrada); } catch { return { ok: false, erros: ["o ficheiro não é JSON válido"], avisos: [] }; }
  }
  const erros = [];
  const avisos = [];
  if (!c || typeof c !== "object" || Array.isArray(c)) return { ok: false, erros: ["o ficheiro não tem o formato do diário"], avisos };
  if (c.formato !== FORMATO) return { ok: false, erros: [`não é uma cópia do diário (formato «${c.formato ?? "em falta"}»)`], avisos };
  if (!Number.isInteger(c.versao) || c.versao < 1) erros.push("versão da cópia em falta ou inválida");
  else if (c.versao > VERSAO_COPIA) erros.push(`cópia da versão ${c.versao}, mais recente do que esta app (${VERSAO_COPIA}): actualizar a app primeiro`);
  if (!Array.isArray(c.saidas)) erros.push("lista de saídas em falta");
  if (c.condicoes !== undefined && !Array.isArray(c.condicoes)) erros.push("lista de condições inválida");
  if (erros.length) return { ok: false, erros, avisos };
  const condicoes = c.condicoes ?? [];
  if (c.saidas.length + condicoes.length > MAX_REGISTOS) return { ok: false, erros: [`mais de ${MAX_REGISTOS} registos`], avisos };
  const ids = new Set();
  c.saidas.forEach((s, i) => {
    const v = validarSaida(s, { pesqueirosConhecidos });
    for (const e of v.erros) erros.push(`saída ${i + 1}${s?.id ? ` (${s.id})` : ""}: ${e}`);
    for (const a of v.avisos) if (!avisos.includes(a)) avisos.push(a);
    if (typeof s?.id === "string") {
      if (ids.has(s.id)) erros.push(`saída ${i + 1}: id ${s.id} repetido`);
      ids.add(s.id);
    }
  });
  const idsC = new Set();
  condicoes.forEach((x, i) => {
    for (const e of validarCondicoes(x, ids)) erros.push(`condições ${i + 1}: ${e}`);
    if (idsC.has(x?.id)) erros.push(`condições ${i + 1}: id repetido`);
    idsC.add(x?.id);
  });
  return { ok: erros.length === 0, erros, avisos, saidas: c.saidas, condicoes };
}

// Comparação estável (a ordem das chaves não conta).
const estavel = v => (Array.isArray(v) ? `[${v.map(estavel).join(",")}]`
  : v && typeof v === "object" ? `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${estavel(v[k])}`).join(",")}}` : JSON.stringify(v));

// O que a importação vai fazer, sem escrever nada.
export function planoImportacao({ saidas, condicoes }, existentes) {
  const porId = new Map(existentes.saidas.map(s => [s.id, s]));
  const condExist = new Set(existentes.condicoes.map(c => c.id));
  const novas = [];
  const conflitos = [];
  let iguais = 0;
  for (const s of saidas) {
    const atual = porId.get(s.id);
    if (!atual) novas.push(s);
    else if (estavel(atual) === estavel(s)) iguais++;
    else conflitos.push({ id: s.id, motivo: "já existe neste aparelho um registo diferente com o mesmo id (fica o do aparelho)" });
  }
  const idsNovas = new Set(novas.map(s => s.id));
  const condicoesNovas = condicoes.filter(c => idsNovas.has(c.saidaId) && !condExist.has(c.id));
  return { novas, iguais, conflitos, condicoesNovas };
}

// Importa: valida tudo, calcula o plano e escreve numa só transacção. Nunca lança.
export async function importarCopia(armazem, entrada, opcoes = {}) {
  const v = validarCopia(entrada, opcoes);
  if (!v.ok) return { ok: false, erros: v.erros, avisos: v.avisos };
  try {
    const existentes = { saidas: await armazem.listar("diario"), condicoes: await armazem.listar("condicoes") };
    const plano = planoImportacao(v, existentes);
    if (plano.novas.length) await armazem.escrever({ guardar: { diario: plano.novas, condicoes: plano.condicoesNovas } });
    return { ok: true, avisos: v.avisos, novas: plano.novas.length, iguais: plano.iguais, conflitos: plano.conflitos };
  } catch (e) {
    return { ok: false, erros: [e?.name === "QuotaExceededError" ? "sem espaço no aparelho: nada foi importado" : `nada foi importado: ${e?.message ?? e}`], avisos: v.avisos };
  }
}

export async function exportarCopia(armazem, agora = new Date().toISOString()) {
  const copia = criarCopia({ saidas: await armazem.listar("diario"), condicoes: await armazem.listar("condicoes"), agora });
  return { copia, texto: JSON.stringify(copia, null, 1) };
}

export async function registarCopia(armazem, agora = new Date().toISOString()) {
  await armazem.guardar("meta", { chave: CHAVE_ULTIMA_COPIA, valor: agora });
}

// Lembrete (config.persistencia.lembreteCopiaSegurancaDias): há saídas e nunca se fez cópia, ou a
// última foi há mais de N dias.
export function precisaLembrete({ numeroSaidas, ultimaCopia = null, agora = Date.now(), dias = 30 }) {
  if (!numeroSaidas) return false;
  const t = ultimaCopia ? Date.parse(ultimaCopia) : NaN;
  return !Number.isFinite(t) || agora - t > dias * 86400000;
}
