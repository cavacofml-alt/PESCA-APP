// Notas de 1 a 5 (secção 6 do CLAUDE.md; tudo provisório). Função pura.
// Cada nota mostra TODAS as parcelas, com o estado: "aplicada", "não aplicada" (avaliada e a
// condição não se verificou) ou "não avaliada" (dado em falta: não soma nem subtrai, e a nota
// fica com completa=false). Limites obrigatórios sobrepõem-se à soma; um limite que já se
// aplica decide, mesmo que outro esteja por verificar; só se nenhum se aplica e algum está
// por verificar é que a nota fica n.d. (o limite podia aplicar-se).
import { CLASSE_MARE } from "./mares.js";

// POR_CONFIRMAR: há dados, mas a regra para o caso ainda não está decidida (mar de Sul).
export const ESTADO_NOTA = Object.freeze({ OK: "ok", ND: "n.d.", POR_CONFIRMAR: "por confirmar" });

function limitar(v, min, max) { return Math.min(max, Math.max(min, v)); }

export const ESTADO_PARCELA = Object.freeze({ APLICADA: "aplicada", NAO_APLICADA: "não aplicada", NAO_AVALIADA: "não avaliada" });

// fatores: [{ descricao, condicao: true|false|null, valor }]
function somar(base, fatores, { minimo = 1, maximo = 5 }) {
  const parcelas = [{ descricao: base.descricao, peso: base.valor, valor: base.valor, estado: ESTADO_PARCELA.APLICADA }];
  let soma = base.valor;
  const naoAvaliadas = [];
  for (const f of fatores) {
    if (f.condicao === null || f.condicao === undefined) {
      parcelas.push({ descricao: f.descricao, peso: f.valor, valor: null, estado: ESTADO_PARCELA.NAO_AVALIADA, motivo: f.motivo ?? null });
      naoAvaliadas.push(f.descricao);
    } else if (f.condicao) {
      parcelas.push({ descricao: f.descricao, peso: f.valor, valor: f.valor, estado: ESTADO_PARCELA.APLICADA });
      soma += f.valor;
    } else {
      parcelas.push({ descricao: f.descricao, peso: f.valor, valor: 0, estado: ESTADO_PARCELA.NAO_APLICADA });
    }
  }
  // Intervalo possível: as parcelas por avaliar podiam somar (positivas) ou subtrair (negativas).
  const porAvaliar = parcelas.filter(x => x.estado === ESTADO_PARCELA.NAO_AVALIADA).map(x => x.peso);
  const intervalo = {
    min: limitar(soma + porAvaliar.filter(v => v < 0).reduce((a, b) => a + b, 0), minimo, maximo),
    max: limitar(soma + porAvaliar.filter(v => v > 0).reduce((a, b) => a + b, 0), minimo, maximo)
  };
  return { nota: limitar(soma, minimo, maximo), parcelas, naoAvaliadas, completa: naoAvaliadas.length === 0, intervalo };
}

// intervalo: valores que a nota podia ter se as parcelas por avaliar fossem conhecidas. Um
// limite obrigatório aplicado fixa a nota (intervalo de um só valor); n.d. → null.
function resultado(estado, extra) {
  const r = { estado, nota: null, parcelas: [], limite: null, naoAvaliadas: [], completa: false, provisorio: true, ...extra };
  r.intervalo = r.nota === null ? null : r.limite ? { min: r.nota, max: r.nota } : (extra.intervalo ?? { min: r.nota, max: r.nota });
  return r;
}

// Limites: [{ descricao, aplica: true|false|null, valor }]. Um limite que se aplica decide
// (o de valor mais baixo, se houver vários), mesmo que outro esteja por verificar. Só quando
// nenhum se aplica e algum está por verificar é que o resultado fica indeterminado.
function aplicarLimites(soma, limites) {
  const aplicados = limites.filter(l => l.aplica === true);
  if (aplicados.length) {
    const l = aplicados.reduce((a, b) => (b.valor < a.valor ? b : a));
    return { ...soma, nota: l.valor, limite: { descricao: l.descricao, valor: l.valor } };
  }
  const porVerificar = limites.find(l => l.aplica === null || l.aplica === undefined);
  if (porVerificar) return { indeterminado: porVerificar };
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
  // Máximo com horas em falta só serve para confirmar que o limite se aplica (não pode descer).
  const aplicaPotencia = p === null ? null : p >= cfgMar.potenciaDouradaMolheMaximaKWm ? true : f.potenciaCompleta === false ? null : false;
  const r = aplicarLimites(s, [
    { descricao: `potência ≥ ${cfgMar.potenciaDouradaMolheMaximaKWm} kW/m`, valor: lim.douradaMolhePotencia15OuMais,
      aplica: aplicaPotencia },
    { descricao: "água turva por chuva", valor: lim.douradaMolheAguaTurva, aplica: f.turva }
  ]);
  if (r.indeterminado) return resultado(ESTADO_NOTA.ND, { motivo: `limite obrigatório por verificar: ${r.indeterminado.descricao}${r.indeterminado.descricao.includes("chuva") && f.motivoChuva ? ` (${f.motivoChuva})` : ""}` });
  return resultado(ESTADO_NOTA.OK, r);
}

// Dourada nas praias (decisão do utilizador, 14/10/2026, opção a): as regras da dourada no
// molhe — base 3, os mesmos ajustes e o limite da regra 11 (P ≥ 1,5 kW/m → 1) — mais o limo das
// praias (Sudeste com mar mexido → 1). A água turva por chuva (ajuste −2 e limite) só conta
// onde há foz de ribeira (config: pesqueiro.aguaDoce, hoje só o Almargem).
export function notaDouradaPraia(f, cfgPontuacao, cfgMar, { aguaDoce = false } = {}) {
  const pesos = cfgPontuacao.douradaPraia;
  const lim = cfgPontuacao.limitesObrigatorios;
  const fatores = fatoresDourada(f, pesos).filter(x => aguaDoce || x.descricao !== "água turva por chuva");
  const s = somar({ descricao: "base", valor: pesos.base }, fatores, cfgPontuacao);
  const p = f.potenciaMax;
  const maxP = cfgMar.potenciaDouradaPraiaMaximaKWm;
  const aplicaPotencia = p === null ? null : p >= maxP ? true : f.potenciaCompleta === false ? null : false;
  const r = aplicarLimites(s, [
    { descricao: "limo (Levante/Sudeste com mar mexido)", valor: lim.douradaPraiaLimo, aplica: f.limo },
    { descricao: `potência ≥ ${maxP} kW/m`, valor: lim.douradaPraiaPotencia15OuMais, aplica: aplicaPotencia },
    ...(aguaDoce ? [{ descricao: "água turva por chuva", valor: lim.douradaPraiaAguaTurva, aplica: f.turva }] : [])
  ]);
  if (r.indeterminado) {
    const d = r.indeterminado.descricao;
    const pormenor = d.startsWith("limo") ? f.motivoLimo : d.includes("chuva") ? f.motivoChuva : null;
    return resultado(ESTADO_NOTA.ND, { motivo: `limite obrigatório por verificar: ${d}${pormenor ? ` (${pormenor})` : ""}` });
  }
  return resultado(ESTADO_NOTA.OK, r);
}

// Robalo no mar. tipo: "praia" (Faro, Ancão, Almargem — limo força 1) ou "molhe".
export function notaRobalo(f, cfgPontuacao, cfgMar, { tipo = "praia" } = {}) {
  const pesos = cfgPontuacao.robaloMar;
  const lim = cfgPontuacao.limitesObrigatorios;
  const p = f.potenciaMax;
  const limiteLimo = { descricao: "limo (Levante/Sudeste com mar mexido)", valor: lim.robaloComLimoFaroAncaoAlmargem };
  // Limo confirmado nas praias decide (prioridade Limo > Potência), mesmo com a potência
  // desconhecida ou incompleta: o limite aplica-se de qualquer forma.
  if (tipo === "praia" && f.limo === true && (p === null || (f.potenciaCompleta === false && p < cfgMar.potenciaRobaloIntermediaKWm))) {
    return resultado(ESTADO_NOTA.OK, { nota: lim.robaloComLimoFaroAncaoAlmargem, limite: limiteLimo,
      naoAvaliadas: ["potência"], motivo: p === null ? "potência não obtida" : "potência incompleta" });
  }
  if (p === null) return resultado(ESTADO_NOTA.ND, { motivo: "potência não obtida" });
  // Com horas sem potência, o máximo pode estar subestimado: abaixo de 1,5 kW/m uma hora em
  // falta pode mudar a base (1 → 3 ou 3 → 4), por isso a nota fica n.d.
  if (f.potenciaCompleta === false && p < cfgMar.potenciaRobaloIntermediaKWm) {
    return resultado(ESTADO_NOTA.ND, { motivo: `potência incompleta (máximo conhecido ${Math.round(p * 100) / 100} kW/m, com horas sem valor)` });
  }
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
      return resultado(ESTADO_NOTA.OK, { ...s, nota: lim.robaloComLimoFaroAncaoAlmargem, limite: limiteLimo });
    }
    if (f.limo !== false) return resultado(ESTADO_NOTA.ND, { motivo: `limo por verificar${f.motivoLimo ? `: ${f.motivoLimo}` : ""}` });
  }
  if (p < cfgMar.potenciaRobaloIntermediaKWm) {
    return resultado(ESTADO_NOTA.OK, somar({ descricao: "base: 1 ≤ P < 1,5 kW/m", valor: pesos.potenciaDe1Abaixo15 }, fatores, cfgPontuacao));
  }
  // P ≥ 1,5: 4 com N/NO ou O/SO sem limo. No molhe (decisão 2b do utilizador, 14/10/2026), o
  // limo não baixa a nota: com Sudeste e mar mexido pesca-se do lado poente (abrigado), com
  // o aviso de limo à deriva.
  if (tipo === "molhe") {
    const s = somar({ descricao: "base: P ≥ 1,5 kW/m (molhe)", valor: pesos.potencia15OuMaisSemLimo }, fatores, cfgPontuacao);
    const observacao = f.limo === true
      ? "Sudeste com mar mexido: pescar do lado poente (abrigado); o lado abrigado pode acumular limo à deriva."
      : null;
    return resultado(ESTADO_NOTA.OK, { ...s, observacao });
  }
  // Praias: a base 4 exige mar de N/NO ou O/SO (onda dominante numa hora com P ≥ 1,5). Mar de
  // Sul → por confirmar (decisão do utilizador, 14/10/2026); direcção indeterminada → n.d.
  if (f.marForaDoSul === false) return resultado(ESTADO_NOTA.POR_CONFIRMAR, { motivo: f.motivoSul ?? "mar de Sul: nota por confirmar no terreno" });
  if (f.marForaDoSul !== true) return resultado(ESTADO_NOTA.ND, { motivo: `direcção do mar por verificar${f.motivoSul ? `: ${f.motivoSul}` : ""}` });
  return resultado(ESTADO_NOTA.OK, somar({ descricao: "base: P ≥ 1,5 kW/m, N/NO ou O/SO, sem limo", valor: pesos.potencia15OuMaisSemLimo }, fatores, cfgPontuacao));
}

// Melhores dias: nota máxima do dia; desempate por alinhamento, depois nota da outra espécie,
// depois o dia mais próximo. Notas n.d. contam como ausentes (ficam no fim).
// Com «especie» (escolha da espécie no ecrã), a nota máxima é a dessa espécie e a «outra» é a
// da outra espécie; sem ela, a maior das duas.
export function ordenarMelhoresDias(dias, especie = null) {
  const chave = d => {
    const r = d.melhorRobalo ?? -Infinity;
    const g = d.melhorDourada ?? -Infinity;
    const alinhado = d.alinhado === true ? 1 : 0;
    if (especie === "robalo") return { max: r, outra: g, alinhado };
    if (especie === "dourada") return { max: g, outra: r, alinhado };
    return { max: Math.max(r, g), outra: Math.min(r, g), alinhado };
  };
  return [...dias].sort((a, b) => {
    const ka = chave(a);
    const kb = chave(b);
    return (kb.max - ka.max) || (kb.alinhado - ka.alinhado) || (kb.outra - ka.outra) || (a.indice - b.indice);
  });
}
