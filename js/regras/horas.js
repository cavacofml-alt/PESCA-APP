// Série hora a hora de um pesqueiro, para o painel «hora a hora» (Fase 4). Junta, para cada
// hora esperada do dia civil de Lisboa (23, 24 ou 25), os valores lidos (vento, pressão, chuva,
// ondulação, água) e os resultados das regras dessa hora (potência, componentes, limo, lado do
// molhe). Hora sem registo → valores null (nunca estimados). Função pura.
import { classificarComponentes } from "./componentes.js";
import { potenciaDoRegisto } from "./potencia.js";
import { limoDaHora } from "./limo.js";
import { ladoDaHora } from "./molhe.js";
import { periodoDe, PERIODOS_PADRAO } from "./periodos.js";
import { valido } from "./serie.js";

const numero = v => (typeof v === "number" && Number.isFinite(v) ? v : null);
const naoNegativo = v => (valido(v) ? v : null);

// Direcção em graus [0, 360): números fora desse intervalo ou inválidos → null.
const direcao = v => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 360 ? v % 360 : null);

const componente = c => ({ hs: naoNegativo(c.hs), periodo: naoNegativo(c.periodo), direcao: direcao(c.direcao), nota: c.nota ?? null });

// esperados: instantes do dia; mar/terra/agua: registos do dia de cada ponto (ou null se o ponto
// não se aplica); cfgMar: config.mar com o coeficiente; tipo: "ria" | "praia" | "molhe".
export function horasDoPesqueiro({ esperados, mar, terra, agua, cfgMar, tipo, periodos = PERIODOS_PADRAO }) {
  const indice = registos => new Map((registos ?? []).map(r => [r.instante, r]));
  const M = indice(mar);
  const T = indice(terra);
  const A = indice(agua);
  return esperados.map(instante => {
    const rm = mar ? M.get(instante) : undefined;
    const rt = T.get(instante);
    const ra = agua ? A.get(instante) : undefined;
    const linha = {
      instante,
      periodo: periodoDe(instante, periodos),
      vento: rt ? { velocidade: naoNegativo(rt.wind_speed_10m), rajada: naoNegativo(rt.wind_gusts_10m),
        direcao: direcao(rt.wind_direction_10m) } : null,
      pressao: rt ? numero(rt.pressure_msl) : null,
      chuva: rt ? naoNegativo(rt.precipitation) : null,
      agua: ra ? numero(ra.sea_surface_temperature) : rm ? numero(rm.sea_surface_temperature) : null,
      mar: null, limo: null, lado: null
    };
    if (rm) {
      const p = potenciaDoRegisto(rm, cfgMar.coeficiente);
      const { fundo, vaga, porClassificar } = classificarComponentes(rm, cfgMar.periodoVagaVentoSegundos);
      linha.mar = {
        hs: naoNegativo(rm.wave_height), periodo: naoNegativo(rm.wave_period), direcao: direcao(rm.wave_direction),
        potencia: { valor: p.valor, status: p.status, aviso: p.aviso },
        fundo: fundo.map(componente), vaga: vaga.map(componente), porClassificar: porClassificar.map(componente)
      };
      if (tipo !== "ria") {
        const l = limoDaHora(rm, rt, cfgMar);
        linha.limo = { limo: l.limo, motivo: l.motivo ?? null };
      }
      if (tipo === "molhe") {
        const d = ladoDaHora(rm, rt, cfgMar);
        linha.lado = { lado: d.lado, motivo: d.motivo ?? null };
      }
    }
    return linha;
  });
}
