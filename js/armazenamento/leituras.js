// Leituras guardadas (plano de evolução, PR 3, 20/11/2026): cada leitura das fontes da rede (previsões
// do Open-Meteo por ponto e boia de Faro), com a hora da leitura de cada fonte. A mais recente serve
// quando não há rede (sempre marcada como previsão arquivada, nunca como actual); as outras ficam para
// o histórico de previsões (PR 7). As marés e os fundos não se guardam aqui: são ficheiros da app, que
// o service worker guarda.
// Funções sobre a interface comum dos armazéns (memória ou IndexedDB). Não calculam notas.
import { lisbonDate } from "../normalizacao.js";

export const ESQUEMA_LEITURA = 1;
const LOJA = "leituras";

// Política de validade e limpeza (config.persistencia.leituras; estes são os valores por omissão):
// - todasHoras: todas as leituras das últimas N horas ficam;
// - umaPorDiaDias: das mais antigas, fica a última de cada dia (hora de Lisboa) até N dias;
// - maximo: nunca mais do que N leituras (saem as mais antigas);
// - substituirMinutos: uma leitura com menos de N minutos é substituída pela nova (as actualizações
//   seguidas não enchem a base);
// - arquivoMaxIdadeHoras: sem rede, só se usa a última leitura se tiver no máximo N horas (depois
//   disso a previsão guardada já não cobre os dias mostrados).
// A leitura mais recente nunca é apagada pela limpeza. O diário nunca é apagado automaticamente.
export const POLITICA_PADRAO = Object.freeze({ todasHoras: 48, umaPorDiaDias: 30, maximo: 60, substituirMinutos: 30, arquivoMaxIdadeHoras: 168 });
export const politicaDe = config => ({ ...POLITICA_PADRAO, ...(config?.persistencia?.leituras ?? {}) });

const resultado = r => (r ? { ok: Boolean(r.ok), data: r.ok ? r.data : null, source: r.source ?? null, readAt: r.readAt ?? null, error: r.error ?? null } : null);

// O que se guarda de uma leitura (dados = resultado de carregarDados).
export function leituraDe(dados) {
  const mapa = m => Object.fromEntries(Object.entries(m ?? {}).map(([k, r]) => [k, resultado(r)]));
  const mar = mapa(dados.pontos?.mar);
  const terra = mapa(dados.pontos?.terra);
  const todos = [...Object.values(mar), ...Object.values(terra)];
  return {
    id: dados.lidoEm, esquema: ESQUEMA_LEITURA, lidoEm: dados.lidoEm, diaLisboa: lisbonDate(new Date(dados.lidoEm)),
    fontes: { mar, terra, boiaFaro: resultado(dados.boiaFaro) },
    resumo: { pontosObtidos: todos.filter(r => r?.ok).length, pontos: todos.length, boia: dados.boiaFaro ? Boolean(dados.boiaFaro.ok) : null }
  };
}

// Uma leitura lida da base só se usa se tiver a forma esperada (base de outra versão, registo
// estragado → ignora-se, nunca se usa em parte).
export function leituraValida(r) {
  return Boolean(r && r.esquema === ESQUEMA_LEITURA && typeof r.lidoEm === "string" && Number.isFinite(Date.parse(r.lidoEm))
    && r.fontes && typeof r.fontes.mar === "object" && typeof r.fontes.terra === "object");
}

const instante = id => Date.parse(id);

// Chaves a apagar segundo a política (função pura). agora: ms.
export function aApagar(chaves, politica = POLITICA_PADRAO, agora = Date.now()) {
  const p = { ...POLITICA_PADRAO, ...politica };
  const invalidas = chaves.filter(id => !Number.isFinite(instante(id)));
  const lista = chaves.filter(id => Number.isFinite(instante(id))).map(id => ({ id, t: instante(id) })).sort((a, b) => b.t - a.t);
  const manter = [];
  const dias = new Set();
  lista.forEach((x, i) => {
    const idadeH = (agora - x.t) / 3600000;
    const dia = lisbonDate(new Date(x.t));
    if (i === 0 || idadeH <= p.todasHoras) { manter.push(x.id); dias.add(dia); return; }
    if (idadeH <= p.umaPorDiaDias * 24 && !dias.has(dia)) { manter.push(x.id); dias.add(dia); }
  });
  const ficam = new Set(manter.slice(0, Math.max(1, p.maximo)));
  return [...invalidas, ...lista.filter(x => !ficam.has(x.id)).map(x => x.id)];
}

const mensagem = e => (e?.name === "QuotaExceededError" ? "sem espaço no aparelho" : e?.message ?? String(e));

// Guarda a leitura e aplica a política. Nunca lança: devolve { ok, erro?, apagadas, aviso? }.
// Sem espaço (quota): apagam-se as leituras anteriores e tenta-se mais uma vez.
export async function guardarLeitura(armazem, leitura, politica = POLITICA_PADRAO, agora = Date.parse(leitura.lidoEm)) {
  const p = { ...POLITICA_PADRAO, ...politica };
  let chaves;
  try { chaves = await armazem.chaves(LOJA); } catch (e) { return { ok: false, erro: mensagem(e), apagadas: 0 }; }
  const anteriores = chaves.filter(id => id !== leitura.id);
  let aviso = null;
  try {
    await armazem.guardar(LOJA, leitura);
  } catch (e) {
    if (e?.name !== "QuotaExceededError") return { ok: false, erro: mensagem(e), apagadas: 0 };
    let apagadas = 0;
    for (const id of anteriores) { try { await armazem.apagar(LOJA, id); apagadas++; } catch { /* segue */ } }
    try {
      await armazem.guardar(LOJA, leitura);
    } catch (e2) { return { ok: false, erro: mensagem(e2), apagadas }; }
    return { ok: true, apagadas, aviso: "faltava espaço: as leituras anteriores foram apagadas" };
  }
  const novo = instante(leitura.id);
  const substituir = anteriores.filter(id => Number.isFinite(instante(id)) && instante(id) < novo && novo - instante(id) < p.substituirMinutos * 60000);
  const apagar = new Set([...substituir, ...aApagar([...anteriores, leitura.id], p, agora)]);
  apagar.delete(leitura.id);
  let apagadas = 0;
  for (const id of apagar) {
    try { await armazem.apagar(LOJA, id); apagadas++; } catch { aviso = "a limpeza das leituras antigas falhou em parte"; }
  }
  return { ok: true, apagadas, aviso };
}

// A leitura válida mais recente, ou null. Nunca lança.
export async function ultimaLeitura(armazem) {
  try {
    const chaves = (await armazem.chaves(LOJA)).filter(id => Number.isFinite(instante(id))).sort((a, b) => instante(a) - instante(b));
    for (let i = chaves.length - 1; i >= 0; i--) {
      const r = await armazem.obter(LOJA, chaves[i]);
      if (leituraValida(r)) return r;
    }
  } catch { /* base inacessível: como se não houvesse nada guardado */ }
  return null;
}

// Lista leve (só as chaves e o instante), para o diagnóstico e o histórico. Nunca lança.
export async function listarLeituras(armazem) {
  try {
    return (await armazem.chaves(LOJA)).filter(id => Number.isFinite(instante(id))).sort((a, b) => instante(b) - instante(a))
      .map(id => ({ id, lidoEm: id }));
  } catch { return []; }
}
