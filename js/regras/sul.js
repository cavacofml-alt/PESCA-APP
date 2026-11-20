// Mar de Sul [157,5°; 202,5°[ — decisões do utilizador de 14/10/2026: a regra só fala de
// Oeste/Sudoeste, e o utilizador vai confirmar no terreno o que acontece com mar de Sul.
// Até lá: no molhe, lado «por confirmar»; nas praias, robalo com P ≥ 1,5 kW/m «por confirmar».
// "Mar de" = componente de onda dominante (maior Hs² × T entre as que têm Hs ≥ 0,2 m), como
// no lado do molhe (Fase 1). O vento não conta. Função pura.
import { componentesDaHora } from "./limo.js";
import { energia } from "./componentes.js";
import { potenciaHora } from "./potencia.js";
import { sectorDaDirecao, normalizarGraus, dentroDoSector } from "./sectores.js";
import { valido } from "./serie.js";

export const MOTIVO_SUL_PRAIA = "mar de Sul com P ≥ 1,5 kW/m: nota por confirmar no terreno";

// Direcção na faixa de Sul do config (mar.sulPorConfirmarGraus)?
export function eSul(direcao, { sulPorConfirmarGraus = null } = {}) {
  const g = normalizarGraus(direcao);
  return g !== null && Array.isArray(sulPorConfirmarGraus) && dentroDoSector(g, sulPorConfirmarGraus);
}

// Onda dominante de uma hora. { componente } ou { componente: null, motivo }; semOndas=true
// quando nenhuma componente de onda tem Hs ≥ mínimo (o molhe passa então a decidir pelo vento).
export function ondaDominante(regMar, { hsMinimaDecisaoMolheM = 0.2, sectoresGraus, periodoVagaVentoSegundos = 6 }) {
  const todas = componentesDaHora(regMar, null, periodoVagaVentoSegundos);
  // Uma componente com a altura em falta pode ser a dominante: não se decide (nem pelo vento).
  const semAltura = todas.filter(c => c.tipo === "altura não obtida");
  if (semAltura.length) {
    return { componente: null, motivo: `altura em falta: ${semAltura.map(c => c.origem).join(", ")}` };
  }
  const ondas = todas.filter(c => c.tipo !== "vento" && valido(c.hs) && c.hs >= hsMinimaDecisaoMolheM);
  if (!ondas.length) return { componente: null, semOndas: true, motivo: "sem onda relevante" };
  // Uma onda relevante sem período ou direcção impede decidir com segurança.
  if (ondas.some(c => energia(c) === null || sectorDaDirecao(c.direcao, sectoresGraus) === null)) {
    return { componente: null, motivo: "componente relevante sem período ou direcção" };
  }
  return { componente: ondas.reduce((a, b) => (energia(b) > energia(a) ? b : a)) };
}

// Praias: há alguma hora com P ≥ 1,5 kW/m e onda dominante fora do Sul? (a base 4 do robalo
// exige N/NO ou O/SO). true → sim; false → todas as horas fortes são de Sul (por confirmar);
// null → indeterminado (hora forte sem onda dominante, ou horas esperadas sem potência que
// podiam ser fortes e de outra direcção).
export function marForteForaDoSul(horasMar, cfg, esperados = null) {
  const porInstante = new Map(horasMar.map(r => [r.instante, r]));
  const registos = esperados ? esperados.map(t => porInstante.get(t) ?? { instante: t }) : horasMar;
  let semPotencia = 0;
  let indeterminadas = 0;
  const horasSul = [];
  for (const r of registos) {
    const p = potenciaHora({ hs: r.wave_height, periodoMedio: r.wave_period }, cfg.coeficiente).valor;
    if (p === null) { semPotencia++; continue; }
    if (p < cfg.potenciaRobaloIntermediaKWm) continue;
    const d = ondaDominante(r, cfg);
    if (!d.componente) { indeterminadas++; continue; }
    if (!eSul(d.componente.direcao, cfg)) return { valor: true, horasSul };
    horasSul.push(r.instante);
  }
  if (indeterminadas) return { valor: null, horasSul, motivo: `${indeterminadas} hora(s) com P ≥ 1,5 kW/m sem onda dominante determinada` };
  if (semPotencia && horasSul.length) return { valor: null, horasSul, motivo: `mar de Sul nas horas conhecidas; ${semPotencia} hora(s) sem potência` };
  if (!horasSul.length) return { valor: null, horasSul, motivo: "sem horas com P ≥ 1,5 kW/m" };
  return { valor: false, horasSul, motivo: MOTIVO_SUL_PRAIA };
}
