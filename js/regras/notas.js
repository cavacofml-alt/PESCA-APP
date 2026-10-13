// Notas de 1 a 5 (secção 6 do CLAUDE.md; tudo provisório). Função pura.
// Cada nota mostra as parcelas. Ajuste cujo dado não foi obtido → parcela "não avaliada"
// (não soma nem subtrai) e a nota fica marcada como incompleta. Limite obrigatório cujo dado
// não foi obtido → nota n.d. (o limite podia aplicar-se). Limites sobrepõem-se à soma.
import { CLASSE_MARE } from "./mares.js";

export const ESTADO_NOTA = Object.freeze({ OK: "ok", ND: "n.d." });

function limitar(v, min, max) { return Math.min(max, Math.max(min, v)); }

// fatores: [{ descricao, condicao: true|false|null, valor }]
function somar(base, fatores, { minimo = 1, maximo = 5 }) {
  const parcelas = [{ descricao: base.descricao, valor: base.valor, avaliada: true }];
  let soma = base.valor;
  const naoAvaliadas = [];
  for (const f of fatores) {
    if (f.condicao === null || f.condicao === undefined) {
      parcelas.push({ descricao: f.descricao, valor: null, avaliada: false, motivo: f.motivo ?? null });
      naoAvaliadas.push(f.descricao);
    } else if (f.condicao) {
      parcelas.push({ descricao: f.descricao, valor: f.valor, avaliada: true });
      soma += f.valor;
    }
  }
  return { nota: limitar(soma, minimo, maximo), parcelas, naoAvaliadas };
}

function resultado(estado, extra) {
  return { estado, nota: null, parcelas: [], limite: null, naoAvaliadas: [], provisorio: true, ...extra };
}

// Limites: [{ descricao, aplica: true|false|null, valor }]. O primeiro que se aplica decide;
// um indeterminado (null) antes de algum aplicado torna a nota n.d.
function aplicarLimites(soma, limites) {
  for (const l of limites) {
    if (l.aplica === true) return { ...soma, nota: l.valor, limite: { descricao: l.descricao, valor: l.valor } };
    if (l.aplica === null || l.aplica === undefined) return { indeterminado: l };
  }
  return { ...soma, limite: null };
}

function fatoresComuns(f, pesos) {
  return [
    { descricao: "alinhamento reponto/Sol", condicao: f.alinhado, valor: pesos.alinhamentoRepontoSol, motivo: f.motivoAlinhamento },
    { descricao: "descida de pressão ≥ 5 hPa/24 h", condicao: f.descidaPressao, valor: pesos.descidaPressao, motivo: f.motivoPressao }
  ];
}

function fatoresDourada(f, pesos) {
  return [
    ...fatoresComuns(f, pesos),
    { descricao: "pressão alta e estável", condicao: f.altaEstavel, valor: pesos.pressaoAltaEstavel, motivo: f.motivoAltaEstavel },
    { descricao: "descida da água ≥ 2 ºC (vs. D−7)", condicao: f.aguaAfasta, valor: pesos.descidaTemperaturaAgua, motivo: f.motivoAgua },
    { descricao: "água turva por chuva", condicao: f.turva, valor: pesos.aguaTurvaChuva, motivo: f.motivoChuva }
  ];
}

const BASE_RIA = { [CLASSE_MARE.MORTA]: "morta", [CLASSE_MARE.INTERMEDIA]: "intermedia", [CLASSE_MARE.VIVA]: "viva" };

// Dourada na Ria: base pela amplitude (sem amplitude → n.d.).
export function notaDouradaRia(f, cfgPontuacao) {
  const pesos = cfgPontuacao.douradaRia;
  if (!f.classeMare) return resultado(ESTADO_NOTA.ND, { motivo: `amplitude não obtida${f.motivoMare ? `: ${f.motivoMare}` : ""}` });
  const base = { descricao: `base: maré ${f.classeMare}`, valor: pesos.baseAmplitude[BASE_RIA[f.classeMare]] };
  const s = somar(base, fatoresDourada(f, pesos), cfgPontuacao);
  return resultado(ESTADO_NOTA.OK, s);
}

// Dourada no molhe: base 3; limite obrigatório da regra 11 (P ≥ 1,5 ou água turva → 1).
export function notaDouradaMolhe(f, cfgPontuacao, cfgMar) {
  const pesos = cfgPontuacao.douradaMolhe;
  const lim = cfgPontuacao.limitesObrigatorios;
  const s = somar({ descricao: "base", valor: pesos.base }, fatoresDourada(f, pesos), cfgPontuacao);
  const p = f.potenciaMax;
  const r = aplicarLimites(s, [
    { descricao: `potência ≥ ${cfgMar.potenciaDouradaMolheMaximaKWm} kW/m`, valor: lim.douradaMolhePotencia15OuMais,
      aplica: p === null ? null : p >= cfgMar.potenciaDouradaMolheMaximaKWm },
    { descricao: "água turva por chuva", valor: lim.douradaMolheAguaTurva, aplica: f.turva }
  ]);
  if (r.indeterminado) return resultado(ESTADO_NOTA.ND, { motivo: `limite obrigatório por verificar: ${r.indeterminado.descricao}${r.indeterminado.descricao.includes("chuva") && f.motivoChuva ? ` (${f.motivoChuva})` : ""}` });
  return resultado(ESTADO_NOTA.OK, r);
}

// Robalo no mar. tipo: "praia" (Faro, Ancão, Almargem — limo força 1) ou "molhe".
export function notaRobalo(f, cfgPontuacao, cfgMar, { tipo = "praia" } = {}) {
  const pesos = cfgPontuacao.robaloMar;
  const lim = cfgPontuacao.limitesObrigatorios;
  const p = f.potenciaMax;
  if (p === null) return resultado(ESTADO_NOTA.ND, { motivo: "potência não obtida" });
  const fatores = fatoresComuns(f, pesos);
  // P < 1 → 1 obrigatório, independentemente do resto.
  if (p < cfgMar.potenciaRobaloMinimaKWm) {
    const s = somar({ descricao: "base: P < 1 kW/m", valor: pesos.potenciaAbaixo1 }, fatores, cfgPontuacao);
    return resultado(ESTADO_NOTA.OK, { ...s, nota: lim.robaloPotenciaAbaixo1,
      limite: { descricao: `potência < ${cfgMar.potenciaRobaloMinimaKWm} kW/m`, valor: lim.robaloPotenciaAbaixo1 } });
  }
  // Limo (só nas praias de mar de fora): força 1; indeterminado → n.d.
  if (tipo === "praia") {
    if (f.limo === true) {
      const s = somar({ descricao: "base", valor: p < cfgMar.potenciaRobaloIntermediaKWm ? pesos.potenciaDe1Abaixo15 : pesos.potencia15OuMaisSemLimo }, fatores, cfgPontuacao);
      return resultado(ESTADO_NOTA.OK, { ...s, nota: lim.robaloComLimoFaroAncaoAlmargem,
        limite: { descricao: "limo (Levante/Sudeste com mar mexido)", valor: lim.robaloComLimoFaroAncaoAlmargem } });
    }
    if (f.limo !== false) return resultado(ESTADO_NOTA.ND, { motivo: `limo por verificar${f.motivoLimo ? `: ${f.motivoLimo}` : ""}` });
  }
  if (p < cfgMar.potenciaRobaloIntermediaKWm) {
    return resultado(ESTADO_NOTA.OK, somar({ descricao: "base: 1 ≤ P < 1,5 kW/m", valor: pesos.potenciaDe1Abaixo15 }, fatores, cfgPontuacao));
  }
  // P ≥ 1,5: 4 com N/NO ou O/SO sem limo. No molhe, com limo (SE com mar mexido) a nota não
  // está definida na especificação (o lado abrigado decide-se à parte).
  if (tipo === "molhe") {
    if (f.limo === true) return resultado(ESTADO_NOTA.ND, { motivo: "regra não definida: robalo no molhe com P ≥ 1,5 kW/m e Levante/Sudeste com mar mexido" });
    if (f.limo !== false) return resultado(ESTADO_NOTA.ND, { motivo: `limo por verificar${f.motivoLimo ? `: ${f.motivoLimo}` : ""}` });
  }
  return resultado(ESTADO_NOTA.OK, somar({ descricao: "base: P ≥ 1,5 kW/m sem limo", valor: pesos.potencia15OuMaisSemLimo }, fatores, cfgPontuacao));
}

// Melhores dias: nota máxima do dia; desempate por alinhamento, depois nota da outra espécie,
// depois o dia mais próximo. Notas n.d. contam como ausentes (ficam no fim).
export function ordenarMelhoresDias(dias) {
  const chave = d => {
    const r = d.melhorRobalo ?? -Infinity;
    const g = d.melhorDourada ?? -Infinity;
    return { max: Math.max(r, g), outra: Math.min(r, g), alinhado: d.alinhado === true ? 1 : 0 };
  };
  return [...dias].sort((a, b) => {
    const ka = chave(a);
    const kb = chave(b);
    return (kb.max - ka.max) || (kb.alinhado - ka.alinhado) || (kb.outra - ka.outra) || (a.indice - b.indice);
  });
}
