// Regra 6 — pressão. Função pura.
// Descida ≥ 5 hPa em 24 h = peixe activo: compara cada hora do dia com a mesma hora 24 h antes
// (instantes absolutos). Pressão alta e estável = todas as horas do dia ≥ 1020 hPa e variação
// a 24 h < 2 hPa em todas, com dados completos; lacunas → indeterminado.
import { valido } from "./serie.js";

const DIA_MS = 24 * 3600 * 1000;

function variacoes(horasDoDia, porInstante) {
  return horasDoDia.map(r => {
    const antes = porInstante.get(r.instante - DIA_MS);
    const agora = r.pressure_msl;
    const a = antes?.pressure_msl;
    return { instante: r.instante, agora: valido(agora) ? agora : null,
      variacao: valido(agora) && valido(a) ? agora - a : null };
  });
}

// todasAsHoras: série completa do ponto (inclui dias anteriores, para as 24 h antes).
// esperados: instantes que o dia devia ter; uma hora ausente conta como sem comparação
// (nunca como "observada e sem descida").
export function pressaoDoDia(horasDoDia, todasAsHoras, {
  descidaAtiva24hHpa = 5, altaEstavelMinHpa = 1020, variacaoEstavelMaxExclusivaHpa = 2
} = {}, esperados = null) {
  const porInstante = new Map(todasAsHoras.map(r => [r.instante, r]));
  const doDia = esperados ? esperados.map(t => porInstante.get(t) ?? { instante: t, pressure_msl: null }) : horasDoDia;
  const v = variacoes(doDia, porInstante);
  const comVar = v.filter(x => x.variacao !== null);
  const completo = v.length > 0 && comVar.length === v.length;

  // Descida
  let descida;
  if (comVar.length === 0) descida = { activo: null, motivo: "pressão não obtida para comparar 24 h" };
  else {
    const maior = comVar.reduce((a, b) => (b.variacao < a.variacao ? b : a));
    const valorDescida = -maior.variacao;
    if (valorDescida >= descidaAtiva24hHpa) descida = { activo: true, descidaHpa: valorDescida, instante: maior.instante };
    else if (completo) descida = { activo: false, descidaHpa: valorDescida, instante: maior.instante };
    else descida = { activo: null, descidaHpa: valorDescida, motivo: `${v.length - comVar.length} hora(s) sem comparação a 24 h` };
  }

  // Alta e estável
  let altaEstavel;
  const contraExemplo = v.find(x => (x.agora !== null && x.agora < altaEstavelMinHpa) ||
    (x.variacao !== null && Math.abs(x.variacao) >= variacaoEstavelMaxExclusivaHpa));
  if (contraExemplo) altaEstavel = { valor: false };
  else if (completo) altaEstavel = { valor: true };
  else altaEstavel = { valor: null, motivo: "dados incompletos no dia ou nas 24 h anteriores" };

  return { descida, altaEstavel };
}
