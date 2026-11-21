// Histórico de previsões e validação pessoal (plano de evolução, PR 7, 20/11/2026). A partir das
// leituras guardadas neste aparelho (PR 3): a previsão do Open-Meteo que a app tinha, lida a uma dada
// hora, para horas que depois chegaram, ao lado do que a boia de Faro mediu a essas horas.
// - Só se compara o que é a mesma grandeza, na mesma unidade (COMPARACOES). O resto mostra-se lado a
//   lado, sem diferença.
// - Só se usam valores que eram previsão quando foram lidos (hora válida depois da leitura); os 7 dias
//   para trás de cada leitura (past_days) não contam.
// - A boia está ao largo; a previsão é a da célula do ponto indicado no config (boias.faro.
//   previsaoPonto). A distância entre as duas mostra-se sempre. Não vale para os outros pesqueiros.
// - Não muda o motor, as notas, os limiares nem as regras. Funções puras.
import { ESQUEMA_LEITURA } from "../armazenamento/leituras.js";

const H = 3600000;
export const TOLERANCIA_MIN = 15;   // a boia mede de 30 em 30 min: a medição a ±15 min da hora certa
export const GRUPOS_ANTECEDENCIA = [
  { nome: "até 24 h", de: 0, ate: 24 }, { nome: "24 a 48 h", de: 24, ate: 48 },
  { nome: "48 a 72 h", de: 48, ate: 72 }, { nome: "3 a 7 dias", de: 72, ate: 168 }
];

// O que se compara e o que não (decisões de CLAUDE.md §9).
export const COMPARACOES = [
  { campo: "hs", nome: "Altura da onda", unidade: "m", previsto: "wave_height", observado: "hm0", comparavel: true,
    nota: "altura significativa (Open-Meteo, wave_height) e Hm0 (boia): a mesma grandeza" },
  { campo: "agua", nome: "Água", unidade: "°C", previsto: "sea_surface_temperature", observado: "agua", comparavel: true,
    nota: "temperatura da água à superfície (modelo) e do sensor da boia: a mesma grandeza, medida de formas diferentes" },
  { campo: "periodo", nome: "Período", unidade: "s", previsto: "wave_period", observado: "tm02", comparavel: false,
    nota: "o wave_period do Open-Meteo não se identifica como Tm02: lado a lado, sem diferença" },
  { campo: "direcao", nome: "Direcção", unidade: "°", previsto: "wave_direction", observado: "direcao", comparavel: false,
    nota: "direcção média (Open-Meteo) e direcção no pico (boia): grandezas diferentes" }
];

const finito = v => (typeof v === "number" && Number.isFinite(v) ? v : null);
const obsValor = x => (x?.estado === "obtido" ? finito(x.valor) : null);

export function distanciaKm(a, b) {
  if (![a?.lat, a?.lon, b?.lat, b?.lon].every(Number.isFinite)) return null;
  const kx = 111.32 * Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180);
  return Math.hypot((a.lon - b.lon) * kx, (a.lat - b.lat) * 110.57);
}

// Série prevista de um ponto numa leitura: [{ valido (ms), hs, agua, periodo, direcao }], célula.
export function serieDoPonto(leitura, ponto) {
  const r = leitura?.fontes?.mar?.[ponto];
  const h = r?.ok ? r.data?.hourly : null;
  if (!h || !Array.isArray(h.time)) return { serie: [], celula: null, motivo: r ? (r.ok ? "resposta sem série horária" : `não obtido${r.error ? ` (${r.error})` : ""}`) : "ponto não guardado nesta leitura" };
  const serie = h.time.map((t, i) => ({ valido: t * 1000, hs: finito(h.wave_height?.[i]), agua: finito(h.sea_surface_temperature?.[i]),
    periodo: finito(h.wave_period?.[i]), direcao: finito(h.wave_direction?.[i]) }));
  const d = r.data;
  return { serie, celula: Number.isFinite(d.latitude) && Number.isFinite(d.longitude) ? { lat: d.latitude, lon: d.longitude } : null };
}

// Todas as medições da boia guardadas nas leituras (sem repetir instantes).
export function observacoesDasLeituras(leituras) {
  const porInstante = new Map();
  for (const l of leituras) {
    const b = l?.fontes?.boiaFaro;
    if (!b?.ok) continue;
    for (const o of b.data?.observacoes ?? []) if (Number.isFinite(o.instante)) porInstante.set(o.instante, o);
  }
  return [...porInstante.values()].sort((a, b) => a.instante - b.instante);
}

function medicaoPerto(obs, t, tolMin) {
  let melhor = null;
  for (const o of obs) {
    const d = Math.abs(o.instante - t);
    if (d <= tolMin * 60000 && (!melhor || d < Math.abs(melhor.instante - t))) melhor = o;
  }
  return melhor;
}

// Pares previsão × observação para as horas que já passaram. Cada par diz a leitura, a hora válida, a
// antecedência e, por campo, o previsto, o observado e (só nos comparáveis) a diferença previsto −
// observado. Sem medição perto: o par fica com «sem medição», nunca com um valor inventado.
export function paresPrevisaoObservacao(leituras, ponto, { agora = Date.now(), toleranciaMin = TOLERANCIA_MIN } = {}) {
  const validas = leituras.filter(l => l?.esquema === ESQUEMA_LEITURA && Number.isFinite(Date.parse(l.lidoEm)));
  const obs = observacoesDasLeituras(validas);
  const pares = [];
  for (const l of validas) {
    const lido = Date.parse(l.lidoEm);
    for (const p of serieDoPonto(l, ponto).serie) {
      if (p.valido <= lido || p.valido > agora) continue;   // só o que era previsão e já aconteceu
      const o = medicaoPerto(obs, p.valido, toleranciaMin);
      const valores = Object.fromEntries(COMPARACOES.map(c => {
        const previsto = p[c.campo];
        const observado = o ? obsValor(o[c.observado]) : null;
        return [c.campo, { previsto, observado, diferenca: c.comparavel && previsto !== null && observado !== null ? previsto - observado : null }];
      }));
      pares.push({ leitura: l.id, lidoEm: l.lidoEm, valido: p.valido, antecedenciaH: (p.valido - lido) / H,
        medicao: o ? o.instante : null, valores });
    }
  }
  return pares.sort((a, b) => a.valido - b.valido || a.antecedenciaH - b.antecedenciaH);
}

// Resumo por antecedência, só dos campos comparáveis: n (pares com os dois valores), diferença média
// (previsto − observado) e diferença absoluta média. Sem pares: null, nunca zero.
export function resumoValidacao(pares) {
  return GRUPOS_ANTECEDENCIA.map(g => {
    const doGrupo = pares.filter(p => p.antecedenciaH > g.de && p.antecedenciaH <= g.ate);
    const porCampo = Object.fromEntries(COMPARACOES.filter(c => c.comparavel).map(c => {
      const d = doGrupo.map(p => p.valores[c.campo].diferenca).filter(v => v !== null);
      return [c.campo, { n: d.length, media: d.length ? d.reduce((a, b) => a + b, 0) / d.length : null,
        mediaAbs: d.length ? d.reduce((a, b) => a + Math.abs(b), 0) / d.length : null,
        semMedicao: doGrupo.filter(p => p.valores[c.campo].previsto !== null && p.valores[c.campo].observado === null).length,
        semPrevisao: doGrupo.filter(p => p.valores[c.campo].previsto === null).length }];
    }));
    return { ...g, pares: doGrupo.length, porCampo };
  });
}

// Saídas do diário com as condições guardadas: a previsão da onda à hora mais perto do início e, se
// havia, a medição da boia (já guardada com a saída). Só para consulta: nenhuma estatística de
// capturas contra previsões (amostras pequenas; não se tiram conclusões).
export function saidasComPrevisao(saidas, condicoesPorSaida) {
  return saidas.map(s => {
    const c = condicoesPorSaida.get(s.id);
    if (!c?.disponivel) return { saida: s, motivo: c ? c.motivo : "sem condições guardadas" };
    const ini = Date.parse(s.inicio);
    const h = [...c.horas].sort((a, b) => Math.abs(a.instante - ini) - Math.abs(b.instante - ini))[0] ?? null;
    return { saida: s, lidoEm: c.leitura.lidoEm, relacao: c.leitura.relacao, hora: h?.instante ?? null, hsPrevista: h?.hs ?? null,
      boia: c.boia ? { instante: c.boia.instante, hm0: c.boia.hm0 } : null, periodos: c.periodos };
  });
}
