// Regra 2 (molhe de Quarteira) — lado do molhe, hora a hora. Função pura.
// Vaga/ondulação de Sudeste → lado poente (Vilamoura); de Oeste/Sudoeste → lado nascente
// (praia de Quarteira). Decide a componente de maior energia (Hs² × T) entre as que têm
// Hs ≥ 0,2 m (provisório); se nenhuma tiver, decide o vento. Norte/Noroeste → sem lado
// preferido (regra não definida para esse sector).
import { componentesDaHora } from "./limo.js";
import { energia } from "./componentes.js";
import { sectorDaDirecao } from "./sectores.js";
import { utcToLisbon } from "../normalizacao.js";
import { valido } from "./serie.js";

export const LADO = Object.freeze({ POENTE: "poente", NASCENTE: "nascente", SEM_LADO: "sem lado preferido" });
export const AVISO_LIMO_DERIVA = "O lado abrigado pode acumular limo à deriva.";

const LADO_POR_SECTOR = { levanteSudeste: LADO.POENTE, sulSudoesteOeste: LADO.NASCENTE, norteNoroeste: LADO.SEM_LADO };

export function ladoDaHora(regMar, regTerra, { hsMinimaDecisaoMolheM = 0.2, sectoresGraus, periodoVagaVentoSegundos = 6 }) {
  const comps = componentesDaHora(regMar, regTerra, periodoVagaVentoSegundos);
  const ondas = comps.filter(c => c.tipo !== "vento" && valido(c.hs) && c.hs >= hsMinimaDecisaoMolheM);
  if (ondas.length) {
    // Uma onda relevante sem período ou direcção impede decidir com segurança.
    if (ondas.some(c => energia(c) === null || sectorDaDirecao(c.direcao, sectoresGraus) === null)) {
      return { lado: null, decide: null, motivo: "componente relevante sem período ou direcção" };
    }
    const dominante = ondas.reduce((a, b) => (energia(b) > energia(a) ? b : a));
    return { lado: LADO_POR_SECTOR[sectorDaDirecao(dominante.direcao, sectoresGraus)], decide: dominante.tipo, componente: dominante };
  }
  if (regMar?.wave_height === null || regMar?.wave_height === undefined) {
    return { lado: null, decide: null, motivo: "ondulação não obtida" };
  }
  const vento = comps.find(c => c.tipo === "vento");
  if (!vento) return { lado: LADO.SEM_LADO, decide: "vento", motivo: "sem vaga relevante e sem vento" };
  const sector = sectorDaDirecao(vento.direcao, sectoresGraus);
  if (sector === null) return { lado: null, decide: "vento", motivo: "vento ou direcção do vento não obtidos" };
  return { lado: LADO_POR_SECTOR[sector], decide: "vento", componente: vento };
}

// Intervalos de horas consecutivas com o mesmo lado, em hora de Lisboa.
export function ladosDoDia(horasMar, horasTerra, cfg) {
  const terra = new Map(horasTerra.map(r => [r.instante, r]));
  const intervalos = [];
  for (const r of horasMar) {
    const h = ladoDaHora(r, terra.get(r.instante), cfg);
    const ultimo = intervalos[intervalos.length - 1];
    // Junta horas seguidas com o mesmo lado, mesmo que a componente que decide mude.
    if (ultimo && ultimo.lado === h.lado) {
      ultimo.ate = r.instante;
      if (h.decide && !ultimo.decide.includes(h.decide)) ultimo.decide.push(h.decide);
    } else {
      intervalos.push({ lado: h.lado, decide: h.decide ? [h.decide] : [], de: r.instante, ate: r.instante, motivo: h.motivo ?? null });
    }
  }
  for (const i of intervalos) {
    i.deLocal = utcToLisbon(new Date(i.de))?.slice(11, 16) ?? null;
    i.ateLocal = utcToLisbon(new Date(i.ate))?.slice(11, 16) ?? null;
  }
  return { intervalos, aviso: AVISO_LIMO_DERIVA };
}
