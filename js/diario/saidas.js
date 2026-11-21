// Diário de saídas (plano de evolução, PR 5, 20/11/2026): modelo, validação e operações sobre o
// armazém local (IndexedDB; nada vai para servidores). Sem fotografias (decisão do utilizador).
// As horas escrevem-se na hora legal de Portugal continental e guardam-se como instantes UTC (ISO).
import { utcToLisbon } from "../normalizacao.js";

export const ESQUEMA_SAIDA = 1;
export const ESPECIES_DIARIO = ["robalo", "dourada", "outra"];
export const RESULTADOS = ["com capturas", "sem capturas"];
export const DURACAO_MAXIMA_HORAS = 24;

// «AAAA-MM-DD» + «HH:MM» de Lisboa → instante (ms). A hora repetida quando se atrasa o relógio
// (último domingo de Outubro, 01:00–02:00) é ambígua: fica a primeira e diz-se; a hora que não existe
// quando se adianta (último domingo de Março, 01:00–02:00) é recusada.
export function lisboaParaUtc(dia, hhmm) {
  const md = typeof dia === "string" && dia.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const mh = typeof hhmm === "string" && hhmm.match(/^(\d{2}):(\d{2})$/);
  if (!md || !mh) return { erro: "data ou hora inválida" };
  const [y, m, d] = md.slice(1).map(Number);
  const [h, mi] = mh.slice(1).map(Number);
  const civil = new Date(Date.UTC(y, m - 1, d));
  if (h > 23 || mi > 59 || civil.toISOString().slice(0, 10) !== dia) return { erro: "data ou hora inválida" };
  const base = Date.UTC(y, m - 1, d, h, mi);
  const alvo = `${dia}T${hhmm}`;
  const candidatos = [base - 3600000, base].filter(t => utcToLisbon(new Date(t))?.slice(0, 16) === alvo);
  if (!candidatos.length) return { erro: "essa hora não existe nesse dia (mudança para a hora de Verão)" };
  return { ms: Math.min(...candidatos), ambigua: candidatos.length > 1 };
}

// Instante → { dia, hora } de Lisboa (para o formulário).
export function utcParaLisboa(iso) {
  const l = utcToLisbon(new Date(Date.parse(iso)));
  return l ? { dia: l.slice(0, 10), hora: l.slice(11, 16) } : null;
}

// Do formulário (dia, horaInicio, horaFim em Lisboa) para os instantes. Uma hora de fim igual ou
// anterior à de início quer dizer que a saída acabou no dia seguinte (pesca de noite).
export function instantesDaSaida({ dia, horaInicio, horaFim }) {
  const i = lisboaParaUtc(dia, horaInicio);
  if (i.erro) return { erro: `início: ${i.erro}` };
  if (!horaFim) return { inicio: new Date(i.ms).toISOString(), fim: null, avisos: i.ambigua ? ["hora de início ambígua (mudança de hora): ficou a primeira"] : [] };
  let f = lisboaParaUtc(dia, horaFim);
  let diaSeguinte = false;
  if (f.erro || f.ms <= i.ms) {
    const [y, m, d] = dia.split("-").map(Number);
    const amanha = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
    f = lisboaParaUtc(amanha, horaFim);
    diaSeguinte = true;
  }
  if (f.erro) return { erro: `fim: ${f.erro}` };
  const avisos = [];
  if (i.ambigua) avisos.push("hora de início ambígua (mudança de hora): ficou a primeira");
  if (f.ambigua) avisos.push("hora de fim ambígua (mudança de hora): ficou a primeira");
  if (diaSeguinte) avisos.push("acaba no dia seguinte");
  return { inicio: new Date(i.ms).toISOString(), fim: new Date(f.ms).toISOString(), avisos };
}

export const novoId = (prefixo, agora = Date.now(), aleatorio = Math.random) =>
  `${prefixo}-${agora.toString(36)}-${Math.floor(aleatorio() * 36 ** 6).toString(36).padStart(6, "0")}`;

const texto = v => typeof v === "string";
const instanteValido = v => texto(v) && /T.*Z$/.test(v) && Number.isFinite(Date.parse(v));

// Validação completa de uma saída (formulário e importação). pesqueirosConhecidos: ids do config;
// um pesqueiro desconhecido (por exemplo, retirado do config) só dá aviso, não erro.
export function validarSaida(s, { pesqueirosConhecidos = null } = {}) {
  const erros = [];
  const avisos = [];
  if (!s || typeof s !== "object" || Array.isArray(s)) return { ok: false, erros: ["registo não é um objecto"], avisos };
  if (!texto(s.id) || !s.id.trim()) erros.push("id em falta");
  if (s.esquema !== ESQUEMA_SAIDA) erros.push(`esquema ${s.esquema} desconhecido (esperado ${ESQUEMA_SAIDA})`);
  if (!texto(s.pesqueiro) || !s.pesqueiro) erros.push("pesqueiro em falta");
  else if (pesqueirosConhecidos && !pesqueirosConhecidos.includes(s.pesqueiro)) avisos.push(`pesqueiro «${s.pesqueiro}» não está na configuração actual`);
  if (!instanteValido(s.inicio)) erros.push("início inválido");
  if (s.fim !== null && s.fim !== undefined) {
    if (!instanteValido(s.fim)) erros.push("fim inválido");
    else if (instanteValido(s.inicio)) {
      const h = (Date.parse(s.fim) - Date.parse(s.inicio)) / 3600000;
      if (h <= 0) erros.push("o fim tem de ser depois do início");
      else if (h > DURACAO_MAXIMA_HORAS) erros.push(`saída com mais de ${DURACAO_MAXIMA_HORAS} h`);
    }
  }
  if (!Array.isArray(s.especiesAlvo) || !s.especiesAlvo.length) erros.push("indicar pelo menos uma espécie (robalo, dourada ou outra)");
  else if (s.especiesAlvo.some(e => !ESPECIES_DIARIO.includes(e))) erros.push("espécie alvo desconhecida");
  if (s.especiesAlvo?.includes("outra") && !(texto(s.outraAlvo) && s.outraAlvo.trim())) erros.push("dizer qual é a outra espécie");
  if (!RESULTADOS.includes(s.resultado)) erros.push("resultado: «com capturas» ou «sem capturas»");
  if (!Array.isArray(s.capturas)) erros.push("capturas: lista em falta");
  else {
    if (s.resultado === "sem capturas" && s.capturas.length) erros.push("«sem capturas» mas com capturas registadas");
    if (s.resultado === "com capturas" && !s.capturas.length) erros.push("«com capturas» sem nenhuma captura registada");
    s.capturas.forEach((c, i) => {
      const n = `captura ${i + 1}`;
      if (!c || typeof c !== "object") { erros.push(`${n}: inválida`); return; }
      if (!ESPECIES_DIARIO.includes(c.especie)) erros.push(`${n}: espécie desconhecida`);
      if (c.especie === "outra" && !(texto(c.outra) && c.outra.trim())) erros.push(`${n}: dizer qual é a espécie`);
      if (!Number.isInteger(c.quantidade) || c.quantidade < 1 || c.quantidade > 999) erros.push(`${n}: quantidade inteira de 1 a 999`);
      if (c.tamanhoCm !== null && c.tamanhoCm !== undefined && !(typeof c.tamanhoCm === "number" && Number.isFinite(c.tamanhoCm) && c.tamanhoCm > 0 && c.tamanhoCm < 300)) {
        erros.push(`${n}: tamanho em cm entre 0 e 300 (ou em branco)`);
      }
      if (c.observacoes !== undefined && c.observacoes !== null && !texto(c.observacoes)) erros.push(`${n}: observações têm de ser texto`);
    });
  }
  if (s.observacoes !== undefined && s.observacoes !== null && !texto(s.observacoes)) erros.push("observações têm de ser texto");
  for (const k of ["criadoEm", "alteradoEm"]) if (s[k] !== undefined && !instanteValido(s[k])) erros.push(`${k} inválido`);
  return { ok: erros.length === 0, erros, avisos };
}

const LOJA = "diario";
const CONDICOES = "condicoes";

// Lista das saídas, a mais recente primeiro. Registos que não passam na validação ficam de fora,
// com a contagem (nunca se mostra um registo estragado como se estivesse certo).
export async function listarSaidas(armazem) {
  const todas = await armazem.listar(LOJA);
  const validas = todas.filter(s => validarSaida(s).ok);
  return { saidas: validas.sort((a, b) => Date.parse(b.inicio) - Date.parse(a.inicio)), invalidas: todas.length - validas.length };
}

export const obterSaida = (armazem, id) => armazem.obter(LOJA, id);
export const obterCondicoes = (armazem, saidaId) => armazem.obter(CONDICOES, `c-${saidaId}`);

// Guarda a saída e as suas condições numa só transacção. Só grava saídas válidas.
export async function guardarSaida(armazem, saida, condicoes = null, opcoes = {}) {
  const v = validarSaida(saida, opcoes);
  if (!v.ok) return { ok: false, erros: v.erros };
  const guardar = { [LOJA]: [{ ...saida, condicoesId: condicoes ? condicoes.id : saida.condicoesId ?? null }] };
  if (condicoes) guardar[CONDICOES] = [condicoes];
  try {
    await armazem.escrever({ guardar });
    return { ok: true, avisos: v.avisos };
  } catch (e) {
    return { ok: false, erros: [e?.name === "QuotaExceededError" ? "sem espaço no aparelho" : e?.message ?? String(e)] };
  }
}

// Apaga a saída e as condições associadas, juntas.
export async function apagarSaida(armazem, id) {
  try {
    await armazem.escrever({ apagar: { [LOJA]: [id], [CONDICOES]: [`c-${id}`] } });
    return { ok: true };
  } catch (e) {
    return { ok: false, erros: [e?.message ?? String(e)] };
  }
}
