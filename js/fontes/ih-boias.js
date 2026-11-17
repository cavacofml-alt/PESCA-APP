// Boia ondógrafo do Instituto Hidrográfico (rede Datawell Waverider), OGC API EDR.
// Observações em UTC (ISO 8601 com Z), amostragem de 30 min, latência de 30 min, janela móvel de
// 15 dias (descrição da colecção buoys_datawell). Cada valor vem com um indicador de qualidade da
// SeaDataNet (vocabulário NVS L20): 1 bom, 2 provavelmente bom, 3 provavelmente mau, 4 mau,
// 9 em falta (vem com valores-sentinela como 99.99 ou 999). Valores observados: não entram nas notas.
import { fetchJson } from "./http.js";
import { sourceResult, parseUtc, ESTADO } from "../normalizacao.js";

// Parâmetro da API → nome, unidade e limites físicos (fora deles → inválido, mesmo com QC bom).
export const PARAMETROS_BOIA = Object.freeze({
  wave_hm0: { nome: "hm0", unidade: "m", min: 0, max: 30 },
  wave_hmax: { nome: "hmax", unidade: "m", min: 0, max: 50 },
  wave_tp: { nome: "tp", unidade: "s", min: 0.5, max: 30 },
  wave_tm02: { nome: "tm02", unidade: "s", min: 0.5, max: 30 },
  wave_thtp: { nome: "direcao", unidade: "°", min: 0, max: 360 },
  sea_water_temperature: { nome: "agua", unidade: "°C", min: -2, max: 40 }
});

const QC_ACEITE = new Set([1, 2]);
const QC_EM_FALTA = 9;

export async function getBoia({ baseUrl, idEstacao, horas = 24, fetchImpl = fetch, now = new Date() }) {
  const source = "Instituto Hidrográfico — boia ondógrafo";
  const readAt = now.toISOString();
  try {
    if (!baseUrl) throw new Error("Configuração em falta: URL das boias do IH");
    if (!Number.isInteger(idEstacao)) throw new Error("Configuração em falta: estação da boia");
    const inicio = new Date(now.getTime() - horas * 3600000).toISOString().slice(0, 19) + "Z";
    const fim = now.toISOString().slice(0, 19) + "Z";
    const url = `${baseUrl}${idEstacao}?datetime=${inicio}/${fim}&f=json`;
    const json = await fetchJson(url, { fetchImpl });
    return sourceResult({ source, readAt, data: lerCoberturaBoia(json) });
  } catch (error) {
    return sourceResult({ source, readAt, error });
  }
}

// CoverageJSON (PointSeries) → { latitude, longitude, observacoes: [{ instante, hm0, hmax, … }] },
// cada valor como { valor, qc, estado }. Lança erro se o formato não for o esperado.
export function lerCoberturaBoia(json) {
  const cob = json?.coverages?.[0];
  if (json?.type !== "CoverageCollection" || cob?.domain?.domainType !== "PointSeries") {
    throw new Error("Formato inesperado (esperava CoverageJSON PointSeries)");
  }
  const t = cob.domain.axes?.t?.values;
  if (!Array.isArray(t)) throw new Error("Resposta sem eixo do tempo");
  const n = t.length;
  for (const p of Object.keys(PARAMETROS_BOIA)) {
    for (const k of [p, `${p}_qc`]) {
      const v = cob.ranges?.[k]?.values;
      if (!Array.isArray(v) || v.length !== n) throw new Error(`Parâmetro ${k} em falta ou com tamanho errado`);
    }
  }
  const observacoes = [];
  for (let i = 0; i < n; i++) {
    // As horas vêm em UTC com Z; uma cadeia sem fuso também é lida como UTC (parseUtc).
    const data = parseUtc(t[i]);
    if (!data) throw new Error(`Instante inválido na posição ${i}: ${t[i]}`);
    if (i > 0 && data.getTime() <= observacoes[i - 1].instante) throw new Error(`Série fora de ordem na posição ${i}`);
    const obs = { instante: data.getTime() };
    for (const [p, def] of Object.entries(PARAMETROS_BOIA)) {
      obs[def.nome] = valorComQc(cob.ranges[p].values[i], cob.ranges[`${p}_qc`].values[i], def);
    }
    observacoes.push(obs);
  }
  const x = cob.domain.axes.x?.values?.[0];
  const y = cob.domain.axes.y?.values?.[0];
  return { latitude: Number.isFinite(y) ? y : null, longitude: Number.isFinite(x) ? x : null, observacoes };
}

function valorComQc(valor, qc, { min, max }) {
  if (qc === QC_EM_FALTA || valor === null || valor === undefined) return { valor: null, qc, estado: ESTADO.NAO_OBTIDO };
  if (!QC_ACEITE.has(qc) || typeof valor !== "number" || !Number.isFinite(valor) || valor < min || valor > max) {
    return { valor: null, qc, estado: ESTADO.INVALIDO };
  }
  return { valor, qc, estado: ESTADO.OBTIDO };
}

// Última observação com altura significativa válida, a mesma 3 h antes (tendência) e o mínimo e
// máximo da janela. Marca-a desactualizada se tiver mais de maxIdadeHoras. Função pura.
export function resumoBoia(dados, { agora, maxIdadeHoras = 3 } = {}) {
  const validas = (dados?.observacoes ?? []).filter(o => o.hm0.estado === ESTADO.OBTIDO);
  if (!validas.length) return null;
  const ultima = validas[validas.length - 1];
  const alvo = ultima.instante - 3 * 3600000;
  const antes = validas.filter(o => o.instante <= alvo + 10 * 60000).pop() ?? null;
  const alturas = validas.map(o => o.hm0.valor);
  // Relógio do aparelho atrasado em relação à boia: idade 0, nunca negativa.
  const idadeMs = Math.max(0, agora.getTime() - ultima.instante);
  return {
    ultima,
    tresHorasAntes: antes && alvo - antes.instante <= 40 * 60000 ? antes : null,
    minimo: Math.min(...alturas),
    maximo: Math.max(...alturas),
    idadeMin: Math.floor(idadeMs / 60000),
    desactualizada: idadeMs > maxIdadeHoras * 3600000
  };
}
