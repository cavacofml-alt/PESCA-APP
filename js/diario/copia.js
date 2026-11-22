// Cópia de segurança do diário (plano de evolução, PR 5, 20/11/2026): exportar para um ficheiro JSON
// versionado e importar com validação de TUDO antes de escrever. Uma importação inválida não escreve
// nada; uma válida escreve numa só transacção (ou tudo, ou nada). Os registos que já existem nunca são
// substituídos: o mesmo registo é ignorado, e um registo diferente com o mesmo id fica como conflito
// (o do aparelho mantém-se). Os dados ficam só no aparelho e no ficheiro que o utilizador guardar.
import { validarSaida } from "./saidas.js";
import { ESQUEMA_CONDICOES } from "./condicoes.js";
import { lisbonDate } from "../normalizacao.js";
import { ESTADO_NOTA } from "../regras/notas.js";
import { CLASSE_MARE } from "../regras/mares.js";
import { PERIODOS_PADRAO } from "../regras/periodos.js";

export const FORMATO = "surfcasting-algarve-diario";
export const VERSAO_COPIA = 1;
export const MAX_REGISTOS = 20000;
export const CHAVE_ULTIMA_COPIA = "ultimaCopia";

export function criarCopia({ saidas, condicoes, agora = new Date().toISOString() }) {
  return { formato: FORMATO, versao: VERSAO_COPIA, exportadoEm: agora, app: "Surfcasting Algarve",
    nota: "Diário de saídas de pesca. Horas em UTC (ISO 8601). Sem fotografias.", saidas, condicoes };
}

export const nomeFicheiro = (agora = new Date()) => `diario-surfcasting-${lisbonDate(agora)}.json`;

// ---------- Validação das condições importadas (revisão de 22/11/2026) ----------
// Valida a estrutura inteira que a app produz (condicoesDaSaida em condicoes.js) e que o ecrã lê
// (resumoCondicoes em ui/diario.js): uma cópia mal formada é recusada na importação e nunca chega a
// impedir o diário de se desenhar. Não basta haver listas: cada elemento tem de ter os campos, os
// tipos e os valores possíveis. Os valores numéricos são finitos ou null (dado em falta), nunca NaN.
const objecto = v => v !== null && typeof v === "object" && !Array.isArray(v);
const finito = v => typeof v === "number" && Number.isFinite(v);
const finitoOuNull = v => v === null || finito(v);
const textoOuNull = v => v === null || typeof v === "string";
const booleanoOuNull = v => v === null || typeof v === "boolean";
const MIN_MS = Date.UTC(2000, 0, 1);
const MAX_MS = Date.UTC(2100, 0, 1);
const instanteMs = v => Number.isSafeInteger(v) && v >= MIN_MS && v < MAX_MS;
const instanteIso = v => typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.test(v)
  && instanteMs(Date.parse(v));
const diaIso = v => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`))
  && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;
const ESTADOS_NOTA = Object.values(ESTADO_NOTA);
const CLASSES_MARE = Object.values(CLASSE_MARE);
const ESPECIES_COM_NOTA = ["robalo", "dourada"];
const TIPOS_REPONTO = ["PM", "BM"];
const CAMPOS_NUMERICOS_HORA = ["hs", "periodo", "direcaoOnda", "potencia", "vento", "rajada", "direcaoVento", "pressao", "agua", "chuva"];

function errosNota(n, onde) {
  if (n === null) return [];
  if (!objecto(n)) return [`${onde}: nota mal formada`];
  const e = [];
  if (!ESTADOS_NOTA.includes(n.estado)) e.push(`${onde}: estado da nota «${n.estado}» desconhecido`);
  if (n.estado === ESTADO_NOTA.OK ? !(finito(n.nota) && n.nota >= 1 && n.nota <= 5) : !finitoOuNull(n.nota)) e.push(`${onde}: nota inválida`);
  if (!booleanoOuNull(n.completa)) e.push(`${onde}: «completa» inválido`);
  if (n.intervalo !== null && !(Array.isArray(n.intervalo) && n.intervalo.length === 2 && n.intervalo.every(finito) && n.intervalo[0] <= n.intervalo[1])) {
    e.push(`${onde}: intervalo inválido`);
  }
  if (!textoOuNull(n.motivo)) e.push(`${onde}: motivo inválido`);
  if (typeof n.provisorio !== "boolean") e.push(`${onde}: «provisorio» inválido`);
  return e;
}

function errosDisponiveis(c, saida, nomesPeriodos) {
  const e = [];
  if (saida && c.pesqueiro !== saida.pesqueiro) e.push("pesqueiro diferente do da saída");
  if (typeof c.tipo !== "string" || !c.tipo) e.push("tipo em falta");
  const l = c.leitura;
  if (!objecto(l)) e.push("leitura em falta");
  else {
    if (!instanteIso(l.id)) e.push("leitura: id inválido");
    if (!instanteIso(l.lidoEm)) e.push("leitura: lidoEm inválido");
    if (!["antes", "depois"].includes(l.relacao)) e.push("leitura: relação com o início inválida");
    if (!finito(l.horasEntreLeituraEInicio)) e.push("leitura: horas entre a leitura e o início inválidas");
  }
  const dias = new Set();
  if (!Array.isArray(c.dias) || !c.dias.length) e.push("dias em falta");
  else c.dias.forEach((d, k) => {
    const onde = `dia ${k + 1}`;
    if (!objecto(d)) { e.push(`${onde}: mal formado`); return; }
    if (!diaIso(d.dia)) e.push(`${onde}: data inválida`); else dias.add(d.dia);
    if (!finitoOuNull(d.amplitude)) e.push(`${onde}: amplitude inválida`);
    if (d.classe !== null && !CLASSES_MARE.includes(d.classe)) e.push(`${onde}: classe de maré inválida`);
    if (!Array.isArray(d.repontos)) e.push(`${onde}: repontos em falta`);
    else d.repontos.forEach((r, j) => {
      if (!objecto(r) || !TIPOS_REPONTO.includes(r.tipo) || !instanteMs(r.instante) || !finitoOuNull(r.alturaM)) e.push(`${onde}, reponto ${j + 1}: mal formado`);
    });
  });
  if (!Array.isArray(c.periodos)) e.push("períodos em falta");
  else c.periodos.forEach((p, k) => {
    const onde = `período ${k + 1}`;
    if (!objecto(p)) { e.push(`${onde}: mal formado`); return; }
    if (!diaIso(p.dia) || (dias.size && !dias.has(p.dia))) e.push(`${onde}: dia inválido`);
    if (!nomesPeriodos.includes(p.nome)) e.push(`${onde}: nome «${p.nome}» desconhecido`);
    if (!objecto(p.notas)) { e.push(`${onde}: notas em falta`); return; }
    for (const [esp, n] of Object.entries(p.notas)) {
      if (!ESPECIES_COM_NOTA.includes(esp)) e.push(`${onde}: espécie «${esp}» sem regra`);
      e.push(...errosNota(n, `${onde}, ${esp}`));
    }
  });
  if (!Array.isArray(c.horas) || !c.horas.length) e.push("horas em falta");
  else c.horas.forEach((h, k) => {
    const onde = `hora ${k + 1}`;
    if (!objecto(h)) { e.push(`${onde}: mal formada`); return; }
    if (!instanteMs(h.instante)) e.push(`${onde}: instante inválido`);
    for (const campo of CAMPOS_NUMERICOS_HORA) if (!finitoOuNull(h[campo])) e.push(`${onde}: ${campo} inválido`);
    if (!booleanoOuNull(h.limo)) e.push(`${onde}: limo inválido`);
    if (!textoOuNull(h.lado)) e.push(`${onde}: lado inválido`);
  });
  if (!Number.isInteger(c.horasComValores) || c.horasComValores < 1 || (Array.isArray(c.horas) && c.horasComValores > c.horas.length)) {
    e.push("número de horas com valores inválido");
  }
  if (c.boia !== null) {
    const b = c.boia;
    if (!objecto(b) || !instanteMs(b.instante) || !finitoOuNull(b.hm0) || !finitoOuNull(b.tm02) || !finitoOuNull(b.agua) || typeof b.tipo !== "string") {
      e.push("medição da boia mal formada");
    }
  }
  return e;
}

function validarCondicoes(c, saidasPorId, nomesPeriodos) {
  if (!objecto(c)) return ["registo não é um objecto"];
  const erros = [];
  const saida = typeof c.saidaId === "string" ? saidasPorId.get(c.saidaId) : undefined;
  if (!saida) erros.push("não pertence a nenhuma saída do ficheiro");
  if (c.id !== `c-${c.saidaId}`) erros.push("id não corresponde à saída");
  if (c.esquema !== ESQUEMA_CONDICOES) erros.push(`esquema ${c.esquema} desconhecido`);
  if (!instanteIso(c.calculadoEm)) erros.push("data do cálculo (calculadoEm) inválida");
  if (typeof c.disponivel !== "boolean") erros.push("«disponivel» em falta");
  else if (!c.disponivel) { if (typeof c.motivo !== "string" || !c.motivo) erros.push("motivo em falta"); }
  else erros.push(...errosDisponiveis(c, saida, nomesPeriodos));
  return erros;
}

// Valida o ficheiro inteiro (texto ou objecto). { ok, erros, avisos, saidas, condicoes }.
export function validarCopia(entrada, { pesqueirosConhecidos = null, nomesPeriodos = PERIODOS_PADRAO.map(p => p.nome) } = {}) {
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
  const saidasPorId = new Map();
  c.saidas.forEach((s, i) => {
    const v = validarSaida(s, { pesqueirosConhecidos });
    for (const e of v.erros) erros.push(`saída ${i + 1}${s?.id ? ` (${s.id})` : ""}: ${e}`);
    for (const a of v.avisos) if (!avisos.includes(a)) avisos.push(a);
    if (typeof s?.id === "string") {
      if (saidasPorId.has(s.id)) erros.push(`saída ${i + 1}: id ${s.id} repetido`);
      saidasPorId.set(s.id, s);
    }
  });
  const idsC = new Set();
  condicoes.forEach((x, i) => {
    for (const e of validarCondicoes(x, saidasPorId, nomesPeriodos)) erros.push(`condições ${i + 1}: ${e}`);
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
