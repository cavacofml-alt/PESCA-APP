// Estatísticas pessoais (plano de evolução, PR 6, 20/11/2026): só a partir das saídas do diário deste
// aparelho. São descritivas: cada valor diz quantos registos o sustentam (n); a falta de registos
// nunca vira zero capturas; não se fazem previsões nem se explicam causas. Não mexem no motor nem nas
// notas. Funções puras; horas e meses na hora legal de Portugal continental.
import { utcToLisbon, lisbonDate } from "../normalizacao.js";
import { PERIODOS_PADRAO } from "../regras/periodos.js";

export const AMOSTRA_PEQUENA = 10;   // abaixo disto, cada valor leva o aviso «amostra pequena»
export const PERIODOS_FILTRO = { tudo: "Tudo", "30d": "Últimos 30 dias", "90d": "Últimos 90 dias", "12m": "Últimos 12 meses", ano: "Este ano", intervalo: "Intervalo" };

const diaDe = iso => utcToLisbon(new Date(Date.parse(iso)))?.slice(0, 10) ?? null;
const horaDe = iso => Number(utcToLisbon(new Date(Date.parse(iso)))?.slice(11, 13));
const mesDe = iso => diaDe(iso)?.slice(0, 7) ?? null;
const somaQtd = capturas => capturas.reduce((a, c) => a + c.quantidade, 0);
const chaveEspecie = c => (c.especie === "outra" ? `outra:${(c.outra ?? "").trim().toLowerCase() || "?"}` : c.especie);

// Limites de datas (dias de Lisboa, inclusivos) de um filtro de período.
export function limitesPeriodo({ periodo = "tudo", desde = null, ate = null }, agora = new Date()) {
  const hoje = lisbonDate(agora);
  const menos = n => lisbonDate(agora, -n);
  switch (periodo) {
    case "30d": return { desde: menos(29), ate: hoje };
    case "90d": return { desde: menos(89), ate: hoje };
    case "12m": return { desde: menos(364), ate: hoje };
    case "ano": return { desde: `${hoje.slice(0, 4)}-01-01`, ate: hoje };
    case "intervalo": return { desde: desde || null, ate: ate || null };
    default: return { desde: null, ate: null };
  }
}

// Filtros: período (pelo dia de início), pesqueiro, espécie. Com espécie, entram as saídas que a
// tinham como alvo ou em que foi apanhada, e só se contam as capturas dessa espécie.
export function filtrar(saidas, filtros = {}, agora = new Date()) {
  const { desde, ate } = limitesPeriodo(filtros, agora);
  const esp = filtros.especie && filtros.especie !== "todas" ? filtros.especie : null;
  return saidas.filter(s => {
    const d = diaDe(s.inicio);
    if (desde && d < desde) return false;
    if (ate && d > ate) return false;
    if (filtros.pesqueiro && filtros.pesqueiro !== "todos" && s.pesqueiro !== filtros.pesqueiro) return false;
    if (esp && !s.especiesAlvo.includes(esp) && !s.capturas.some(c => c.especie === esp)) return false;
    return true;
  }).map(s => (esp ? { ...s, capturas: s.capturas.filter(c => c.especie === esp) } : s));
}

// Resumo de um conjunto de saídas. null nos valores que não existem (n = 0), nunca 0.
export function resumo(saidas) {
  const n = saidas.length;
  const com = saidas.filter(s => s.capturas.length > 0).length;
  const comFim = saidas.filter(s => s.fim);
  const capturas = saidas.reduce((a, s) => a + somaQtd(s.capturas), 0);
  return {
    n, comCapturas: com, semCapturas: n - com,
    proporcaoComCapturas: n ? com / n : null,
    capturas: n ? capturas : null,
    capturasPorSaida: n ? capturas / n : null,
    horas: comFim.length ? comFim.reduce((a, s) => a + (Date.parse(s.fim) - Date.parse(s.inicio)) / 3600000, 0) : null,
    nComHoras: comFim.length,
    pequena: n < AMOSTRA_PEQUENA
  };
}

// Por pesqueiro: todos os do config aparecem; os que não têm saídas ficam «sem registos» (null).
export function porPesqueiro(saidas, config) {
  const ids = [...Object.keys(config.pesqueiros), ...new Set(saidas.map(s => s.pesqueiro).filter(id => !config.pesqueiros[id]))];
  return ids.map(id => {
    const doPq = saidas.filter(s => s.pesqueiro === id);
    return { id, nome: config.pesqueiros[id]?.nome ?? `${id} (fora da configuração)`, ...(doPq.length ? resumo(doPq) : { n: 0, semRegistos: true }) };
  });
}

function mediana(v) {
  if (!v.length) return null;
  const o = [...v].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
}

// Por espécie (das capturas e dos alvos): saídas com essa espécie como alvo, saídas em que foi
// apanhada, quantidade e tamanhos (só os registados: n de tamanhos à parte).
export function porEspecie(saidas) {
  const chaves = new Map();
  const nomear = (k, nome) => { if (!chaves.has(k)) chaves.set(k, nome); };
  for (const s of saidas) {
    for (const e of s.especiesAlvo) nomear(e === "outra" ? `outra:${(s.outraAlvo ?? "").trim().toLowerCase() || "?"}` : e, e === "outra" ? (s.outraAlvo?.trim() || "outra") : e);
    for (const c of s.capturas) nomear(chaveEspecie(c), c.especie === "outra" ? (c.outra?.trim() || "outra") : c.especie);
  }
  return [...chaves].map(([k, nome]) => {
    const alvo = saidas.filter(s => s.especiesAlvo.some(e => (e === "outra" ? `outra:${(s.outraAlvo ?? "").trim().toLowerCase() || "?"}` : e) === k));
    const caps = saidas.flatMap(s => s.capturas.filter(c => chaveEspecie(c) === k));
    const apanhada = saidas.filter(s => s.capturas.some(c => chaveEspecie(c) === k));
    // Um tamanho por linha de captura (com quantidade > 1, o tamanho escrito vale para a linha).
    const tamanhos = caps.filter(c => typeof c.tamanhoCm === "number").map(c => c.tamanhoCm);
    return { chave: k, nome, saidasComAlvo: alvo.length, saidasComCaptura: apanhada.length, quantidade: somaQtd(caps),
      tamanhos: { n: tamanhos.length, min: tamanhos.length ? Math.min(...tamanhos) : null, mediana: mediana(tamanhos), max: tamanhos.length ? Math.max(...tamanhos) : null } };
  }).sort((a, b) => b.quantidade - a.quantidade || b.saidasComAlvo - a.saidasComAlvo || a.nome.localeCompare(b.nome, "pt"));
}

// Por período do dia (pela hora de início, em Lisboa, com os períodos do config).
export function porPeriodo(saidas, config) {
  const cfg = config.periodos ?? PERIODOS_PADRAO;
  const nomeDe = h => [...cfg].reverse().find(p => h >= p.inicioHora)?.nome ?? cfg[0].nome;
  return cfg.map(p => {
    const doPer = saidas.filter(s => nomeDe(horaDe(s.inicio)) === p.nome);
    return { nome: p.nome, ...(doPer.length ? resumo(doPer) : { n: 0, semRegistos: true }) };
  });
}

// Por mês, do primeiro ao último mês com saídas (evolução): os meses do meio sem saídas aparecem como
// «sem saídas», não como zero capturas.
export function porMes(saidas) {
  const meses = saidas.map(s => mesDe(s.inicio)).filter(Boolean).sort();
  if (!meses.length) return [];
  const lista = [];
  let [y, m] = meses[0].split("-").map(Number);
  const [yf, mf] = meses.at(-1).split("-").map(Number);
  while (y < yf || (y === yf && m <= mf)) {
    const chave = `${y}-${String(m).padStart(2, "0")}`;
    const doMes = saidas.filter(s => mesDe(s.inicio) === chave);
    lista.push({ mes: chave, ...(doMes.length ? resumo(doMes) : { n: 0, semRegistos: true }) });
    m++; if (m > 12) { m = 1; y++; }
  }
  return lista;
}

export function estatisticas(saidas, config, filtros = {}, agora = new Date()) {
  const f = filtrar(saidas, filtros, agora);
  return { total: saidas.length, filtradas: f.length, limites: limitesPeriodo(filtros, agora),
    resumo: resumo(f), porPesqueiro: porPesqueiro(f, config), porEspecie: porEspecie(f), porPeriodo: porPeriodo(f, config), porMes: porMes(f) };
}
