// Decisão B (opção C, escolhida pelo utilizador a 14/10/2026): notas por período do dia.
// Períodos pela hora legal de Lisboa (config.periodos, provisório): madrugada 00–06,
// manhã 06–12, tarde 12–18, noite 18–24. No dia de 25 horas, a hora repetida fica na
// madrugada. Função pura.
import { utcToLisbon } from "../normalizacao.js";

export const PERIODOS_PADRAO = Object.freeze([
  { nome: "madrugada", inicioHora: 0 }, { nome: "manhã", inicioHora: 6 },
  { nome: "tarde", inicioHora: 12 }, { nome: "noite", inicioHora: 18 }
]);

// Nome do período de um instante (ms), pela hora legal de Lisboa.
export function periodoDe(instante, periodos = PERIODOS_PADRAO) {
  const local = utcToLisbon(new Date(instante));
  if (!local) return null;
  const hora = Number(local.slice(11, 13));
  let escolhido = null;
  for (const p of periodos) if (hora >= p.inicioHora) escolhido = p.nome;
  return escolhido;
}

// Divide registos com "instante" pelos períodos, mantendo a ordem.
export function porPeriodo(registos, periodos = PERIODOS_PADRAO, campo = "instante") {
  const mapa = new Map(periodos.map(p => [p.nome, []]));
  for (const r of registos ?? []) {
    const nome = periodoDe(r[campo], periodos);
    if (nome) mapa.get(nome).push(r);
  }
  return mapa;
}
