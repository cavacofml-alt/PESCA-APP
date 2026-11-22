// Condições associadas a uma saída do diário (plano de evolução, PR 5, 20/11/2026): quando há uma
// leitura guardada neste aparelho (PR 3) que cubra as horas da saída, guarda-se uma fotografia do que
// a app tinha: previsão hora a hora no pesqueiro, notas do motor nos períodos da saída, marés do dia
// (tabela do IH) e a medição da boia mais perto do início. É sempre a PREVISÃO dessa leitura (com a
// hora da leitura e se foi lida antes ou depois da saída), nunca uma medição no pesqueiro; só a boia é
// observação, e ao largo. As notas guardadas não mudam limiares nem regras (CLAUDE.md, Fase 5).
// O motor corre igual ao da app (analisarDias), sem nenhuma regra própria.
import { analisarDias } from "../regras/analise.js";
import { lisbonDate, limitesDiaLisboa } from "../normalizacao.js";
import { leituraValida } from "../armazenamento/leituras.js";
import { PERIODOS_PADRAO } from "../regras/periodos.js";
import { lisboaParaUtc } from "./saidas.js";

export const ESQUEMA_CONDICOES = 1;
export const JANELA_DIAS = 7;        // a leitura tem 7 dias para trás e 7 para a frente (past_days/forecast_days)
export const MAX_LEITURAS_A_TENTAR = 6;
const H = 3600000;

// Ordem de preferência: primeiro as lidas antes do início, a mais recente primeiro (a previsão que
// havia quando se foi pescar); depois as lidas depois, a mais antiga primeiro (para as horas já
// passadas, os valores dessas leituras são previsões arquivadas).
export function leiturasCandidatas(chaves, inicioMs, { janelaDias = JANELA_DIAS } = {}) {
  const janela = janelaDias * 86400000;
  const t = chaves.map(id => ({ id, t: Date.parse(id) })).filter(x => Number.isFinite(x.t));
  const antes = t.filter(x => x.t <= inicioMs && inicioMs - x.t <= janela).sort((a, b) => b.t - a.t);
  const depois = t.filter(x => x.t > inicioMs && x.t - inicioMs <= janela).sort((a, b) => a.t - b.t);
  return [...antes, ...depois].map(x => x.id);
}

// Limites [início, fim) de cada período de um dia de Lisboa (as horas do config são locais).
function limitesDosPeriodos(dia, config) {
  const cfg = config.periodos ?? PERIODOS_PADRAO;
  const fimDia = limitesDiaLisboa(dia)?.fim ?? null;
  return cfg.map((p, k) => {
    const ini = lisboaParaUtc(dia, `${String(p.inicioHora).padStart(2, "0")}:00`).ms ?? null;
    const prox = cfg[k + 1];
    const fim = prox ? lisboaParaUtc(dia, `${String(prox.inicioHora).padStart(2, "0")}:00`).ms ?? null : fimDia;
    return { nome: p.nome, inicio: ini, fim };
  });
}

const resumoNota = n => (n ? { estado: n.estado, nota: n.nota ?? null, completa: n.completa ?? null,
  intervalo: n.intervalo ? [n.intervalo.min, n.intervalo.max] : null, motivo: n.motivo ?? null, provisorio: n.provisorio ?? true } : null);
const finito = v => (typeof v === "number" && Number.isFinite(v) ? v : null);
const valorBoia = x => (x?.estado === "obtido" ? finito(x.valor) : null);

const semCondicoes = (saida, motivo, calculadoEm) => ({
  id: `c-${saida.id}`, saidaId: saida.id, esquema: ESQUEMA_CONDICOES, calculadoEm, disponivel: false, motivo });

// Fotografia das condições a partir de uma leitura guardada (função pura).
export function condicoesDaSaida(saida, leitura, { config, mares = null, sol = null, calculadoEm = new Date().toISOString() }) {
  const pq = config.pesqueiros[saida.pesqueiro];
  if (!pq) return semCondicoes(saida, "o pesqueiro não está na configuração", calculadoEm);
  if (!leituraValida(leitura)) return semCondicoes(saida, "leitura guardada inválida", calculadoEm);
  const ini = Date.parse(saida.inicio);
  // Sem hora de fim (revisão de 21/11/2026): só a hora certa em que a saída começou (07:20 → só a
  // hora das 07:00), e os períodos que essa hora toca. A interface di-lo no formulário e no resumo.
  const fim = saida.fim ? Date.parse(saida.fim) : Math.floor(ini / H) * H + H;
  const dias = [...new Set([lisbonDate(new Date(ini)), lisbonDate(new Date(fim - 1))])];
  const analise = analisarDias({ dias, pontos: { mar: leitura.fontes.mar, terra: leitura.fontes.terra }, mares, sol, config });
  const desde = Math.floor(ini / H) * H;   // a hora certa em que a saída começou
  const horas = [];
  const periodos = [];
  const infoDias = [];
  for (const d of analise.dias) {
    const p = d.pesqueiros[saida.pesqueiro];
    if (!p) continue;
    infoDias.push({ dia: d.dia, amplitude: d.amplitude.amplitude ?? null, classe: d.amplitude.classe ?? null,
      repontos: (d.repontos ?? []).map(r => ({ tipo: r.tipo, instante: r.instante, alturaM: r.alturaM })) });
    for (const h of p.horas ?? []) {
      if (h.instante < desde || h.instante >= fim) continue;
      horas.push({ instante: h.instante, hs: finito(h.mar?.hs), periodo: finito(h.mar?.periodo), direcaoOnda: finito(h.mar?.direcao),
        potencia: finito(h.mar?.potencia?.valor), vento: finito(h.vento?.velocidade), rajada: finito(h.vento?.rajada),
        direcaoVento: finito(h.vento?.direcao), pressao: finito(h.pressao), agua: finito(h.agua), chuva: finito(h.chuva),
        limo: typeof h.limo?.limo === "boolean" ? h.limo.limo : null, lado: h.lado?.lado ?? null });
    }
    for (const lim of limitesDosPeriodos(d.dia, config)) {
      if (lim.inicio === null || lim.fim === null || lim.fim <= ini || lim.inicio >= fim) continue;
      const per = p.periodos.find(x => x.nome === lim.nome);
      if (per) periodos.push({ dia: d.dia, nome: lim.nome, notas: Object.fromEntries(Object.entries(per.notas).map(([e, n]) => [e, resumoNota(n)])) });
    }
  }
  const comValores = horas.filter(h => [h.hs, h.vento, h.pressao, h.agua, h.potencia].some(v => v !== null));
  if (!comValores.length) return semCondicoes(saida, "a leitura guardada não tem valores para as horas desta saída", calculadoEm);
  const lidoEm = Date.parse(leitura.lidoEm);
  // Boia de Faro (observado, ao largo): a medição com Hm0 válido mais perto do início, até 1 h.
  const obs = leitura.fontes.boiaFaro?.ok ? leitura.fontes.boiaFaro.data?.observacoes ?? [] : [];
  const perto = obs.filter(o => valorBoia(o.hm0) !== null && Math.abs(o.instante - ini) <= H)
    .sort((a, b) => Math.abs(a.instante - ini) - Math.abs(b.instante - ini))[0];
  return {
    id: `c-${saida.id}`, saidaId: saida.id, esquema: ESQUEMA_CONDICOES, calculadoEm, disponivel: true,
    pesqueiro: saida.pesqueiro,
    leitura: { id: leitura.id, lidoEm: leitura.lidoEm, relacao: lidoEm <= ini ? "antes" : "depois",
      horasEntreLeituraEInicio: Math.round(((ini - lidoEm) / H) * 10) / 10 },
    tipo: "previsão (Open-Meteo) da leitura guardada; notas calculadas pelas regras da app (provisórias)",
    dias: infoDias, periodos, horas,
    horasComValores: comValores.length,
    boia: perto ? { instante: perto.instante, hm0: valorBoia(perto.hm0), tm02: valorBoia(perto.tm02), agua: valorBoia(perto.agua),
      tipo: "observado (boia de Faro, ao largo)" } : null
  };
}

// Procura nas leituras guardadas a que serve à saída e devolve as condições (ou o motivo de não as
// haver). Nunca lança.
export async function associarCondicoes(armazem, saida, { config, mares = null, sol = null, agora = new Date().toISOString() }) {
  try {
    const chaves = await armazem.chaves("leituras");
    if (!chaves.length) return semCondicoes(saida, "ainda não há previsões guardadas neste aparelho", agora);
    const candidatas = leiturasCandidatas(chaves, Date.parse(saida.inicio)).slice(0, MAX_LEITURAS_A_TENTAR);
    let ultimo = null;
    for (const id of candidatas) {
      const c = condicoesDaSaida(saida, await armazem.obter("leituras", id), { config, mares, sol, calculadoEm: agora });
      if (c.disponivel) return c;
      ultimo = c.motivo;
    }
    return semCondicoes(saida, ultimo ?? `nenhuma previsão guardada neste aparelho foi lida até ${JANELA_DIAS} dias antes ou depois desta saída`, agora);
  } catch (e) {
    return semCondicoes(saida, `não foi possível ler as previsões guardadas (${e?.message ?? e})`, agora);
  }
}
