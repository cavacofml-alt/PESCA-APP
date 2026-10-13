// Regra 9 — alinhamento prioritário: reponto de maré a ≤ ~1 h (60 min, provisório) do
// nascer ou do pôr do Sol. Sol calculado só com SunCalc (pelo chamador). Função pura.

// repontos: [{ instante, tipo }]; sol: { nascer: ms|null, por: ms|null }.
export function alinhamentosDoDia(repontos, sol, { distanciaMaximaSolRepontoMinutos = 60 } = {}) {
  if (!sol || (sol.nascer === null && sol.por === null)) {
    return { alinhado: null, alinhamentos: [], motivo: "nascer/pôr do Sol não obtidos" };
  }
  if (!Array.isArray(repontos)) return { alinhado: null, alinhamentos: [], motivo: "marés não obtidas" };
  const limite = distanciaMaximaSolRepontoMinutos * 60000;
  const alinhamentos = [];
  for (const [evento, t] of [["nascer do Sol", sol.nascer], ["pôr do Sol", sol.por]]) {
    if (t === null) continue;
    for (const r of repontos) {
      const diferenca = Math.abs(r.instante - t);
      if (diferenca <= limite) alinhamentos.push({ evento, sol: t, reponto: r.instante, tipo: r.tipo, minutos: Math.round(diferenca / 60000) });
    }
  }
  return { alinhado: alinhamentos.length > 0, alinhamentos };
}
