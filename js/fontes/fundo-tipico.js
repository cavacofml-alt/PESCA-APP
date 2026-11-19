// Fundo típico das praias (fundos/tipico.json, gerado por ferramentas/fundo_tipico.py): cota mediana
// a 100, 150 e 200 m da linha de meia-maré, de um levantamento COSMO ou do LiDAR 2011 do IH.
// Só se mostra nos cartões; não entra nas notas.
import { sourceResult } from "../normalizacao.js";

export const DISTANCIAS_FUNDO = ["100", "150", "200"];
const finito = v => typeof v === "number" && Number.isFinite(v);

export function validarFundoTipico(d) {
  const erros = [];
  if (!d || d.versao !== 1) return { ok: false, erros: ["versão do ficheiro desconhecida (esperada 1)"] };
  if (!d.fontes || typeof d.fontes !== "object") erros.push("fontes em falta");
  else {
    for (const [k, f] of Object.entries(d.fontes)) {
      for (const c of ["nome", "rotulo", "produto", "levantamento", "url", "referenciaVertical"]) {
        if (typeof f?.[c] !== "string" || !f[c]) erros.push(`fontes.${k}.${c} em falta`);
      }
      if (!/^[0-9a-f]{64}$/.test(f?.sha256 ?? "")) erros.push(`fontes.${k}.sha256 inválido`);
    }
  }
  if (!d.praias || typeof d.praias !== "object") erros.push("praias em falta");
  else {
    for (const [k, p] of Object.entries(d.praias)) {
      if (p?.fonte === null) {
        if (typeof p.motivo !== "string") erros.push(`praias.${k}: sem fonte e sem motivo`);
        continue;
      }
      if (!d.fontes?.[p?.fonte]) erros.push(`praias.${k}: fonte desconhecida`);
      for (const dist of DISTANCIAS_FUNDO) {
        const v = p?.cotas?.[dist];
        if (!finito(v) || v < -30 || v > 10) erros.push(`praias.${k}: cota a ${dist} m inválida`);
      }
    }
  }
  return { ok: erros.length === 0, erros };
}

export async function carregarFundoTipico({ url = "./fundos/tipico.json", fetchImpl = fetch, now = new Date() } = {}) {
  const source = "Fundo típico das praias (COSMO / LiDAR 2011)";
  const readAt = now.toISOString();
  try {
    const r = await fetchImpl(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const d = await r.json();
    const v = validarFundoTipico(d);
    if (!v.ok) throw new Error(v.erros.slice(0, 3).join("; "));
    return sourceResult({ source, readAt, data: d });
  } catch (error) {
    return sourceResult({ source, readAt, error });
  }
}
