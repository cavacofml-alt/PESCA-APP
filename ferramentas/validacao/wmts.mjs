// Copernicus Marine, WMTS (GetFeatureInfo em JSON), para a experiência de validação de previsões.
// Funções puras: ponto → quadrícula e píxel, instantes a pedir, endereços, capacidades e respostas.
//
// Factos verificados a 20/11/2026 (CLAUDE.md, secção 9):
// - lat/lon não se pedem directamente: no conjunto EPSG:4326, cada quadrícula de 256 px do nível z
//   cobre 180/2^z graus, a contar de −180 (longitude) e de +90 (latitude);
// - a resposta traz variableId, datasetId, value e units, mas NÃO traz a hora;
// - uma hora fora da grelha é aceite sem aviso e arredondada à hora mais próxima (12:10 → 12:00,
//   12:30 → 13:00): por isso só se pedem horas certas;
// - fora do intervalo da dimensão temporal dá HTTP 400; intervalos de tempo também dão 400.

export const WMTS_BASE = "https://wmts.marine.copernicus.eu/teroWmts";
export const PRODUTO = "IBI_ANALYSISFORECAST_WAV_005_005";
export const PREFIXO_DATASET = "cmems_mod_ibi_wav_anfc_0.027deg_PT1H-i_";
// Variável → unidade esperada e limites físicos (fora deles → inválido).
export const VARIAVEIS = Object.freeze({
  VHM0: { unidade: "m", min: 0, max: 30 },
  VTM02: { unidade: "s", min: 0.5, max: 40 },
  VTM10: { unidade: "s", min: 0.5, max: 40 }
});
const HORA = 3600000;

export function quadricula(lat, lon, z = 8) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon >= 180) {
    throw new RangeError(`Coordenadas inválidas: ${lat}, ${lon}`);
  }
  const graus = 180 / 2 ** z;
  const fx = (lon + 180) / graus;
  const fy = (90 - lat) / graus;
  const col = Math.floor(fx);
  const lin = Math.floor(fy);
  return { z, lin, col, i: Math.floor((fx - col) * 256), j: Math.floor((fy - lin) * 256) };
}

export const horaCerta = ms => Number.isFinite(ms) && ms % HORA === 0;

// Instantes a pedir: horas certas depois de «agora», hora a hora até `horasHorario` de antecedência e
// depois de 3 em 3 h (horas UTC múltiplas de 3, para coincidirem entre recolhas), até ao fim da dimensão.
export function instantesPedidos({ agora, fim, horasHorario = 72, passoDepois = 3 }) {
  const t0 = agora.getTime();
  const limite = fim.getTime();
  if (!Number.isFinite(t0) || !Number.isFinite(limite)) return [];
  const lista = [];
  for (let t = Math.floor(t0 / HORA) * HORA + HORA; t <= limite; t += HORA) {
    if (t - t0 <= horasHorario * HORA || (t / HORA) % passoDepois === 0) lista.push(t);
  }
  return lista;
}

export function urlFeatureInfo({ dataset, variavel, estilo, lat, lon, instante, z = 8, base = WMTS_BASE }) {
  if (!horaCerta(instante)) throw new RangeError("Só horas certas: o serviço arredonda as outras sem aviso");
  const q = quadricula(lat, lon, z);
  const p = new URLSearchParams({
    SERVICE: "WMTS", REQUEST: "GetFeatureInfo", VERSION: "1.0.0",
    LAYER: `${PRODUTO}/${dataset}/${variavel}`, STYLE: estilo,
    TILEMATRIXSET: "EPSG:4326", TILEMATRIX: String(q.z), TILEROW: String(q.lin), TILECOL: String(q.col),
    I: String(q.i), J: String(q.j), INFOFORMAT: "application/json",
    TIME: new Date(instante).toISOString().replace(".000Z", "Z")
  });
  return `${base}?${p}`;
}

export const urlCapacidades = (base = WMTS_BASE) =>
  `${base}/${PRODUTO}?SERVICE=WMTS&REQUEST=GetCapabilities&VERSION=1.0.0`;

const primeiro = (re, txt) => re.exec(txt)?.[1] ?? null;

// Capacidades (XML) → a versão mais recente do conjunto horário que tem as três variáveis, com o
// estilo por omissão, a unidade, a dimensão temporal e a data de actualização de cada camada.
// admp_updated_data é a ACTUALIZAÇÃO DO CONJUNTO DE DADOS, não a hora da corrida do modelo.
export function lerCapacidades(xml, { prefixo = PREFIXO_DATASET, variaveis = Object.keys(VARIAVEIS) } = {}) {
  if (typeof xml !== "string" || !xml.includes("<Capabilities")) throw new Error("Capacidades: resposta não é um documento WMTS");
  const porDataset = new Map();
  for (const m of xml.matchAll(/<Layer\b[^>]*>([\s\S]*?)<\/Layer>/g)) {
    const bloco = m[1];
    const id = primeiro(/<ows:Identifier>([^<]+)<\/ows:Identifier>/, bloco);
    const partes = id?.split("/");
    if (partes?.length !== 3 || partes[0] !== PRODUTO || !partes[1].startsWith(prefixo) || !variaveis.includes(partes[2])) continue;
    const dimTempo = /<Dimension>\s*<ows:Identifier>time<\/ows:Identifier>[\s\S]*?<Value>([^<]+)<\/Value>/.exec(bloco)?.[1];
    const [inicio, fim, passo] = dimTempo?.split("/") ?? [];
    const camada = {
      id,
      estilo: primeiro(/<Style isDefault="true">\s*<ows:Identifier>([^<]+)<\/ows:Identifier>/, bloco),
      unidade: primeiro(/<Unit>([^<]*)<\/Unit>/, bloco),
      tempo: { inicio: inicio ?? null, fim: fim ?? null, passo: passo ?? null },
      admpUpdatedData: primeiro(/<admp_updated_data>([^<]+)<\/admp_updated_data>/, bloco),
      admpUpdated: primeiro(/<admp_updated>([^<]+)<\/admp_updated>/, bloco)
    };
    if (!porDataset.has(partes[1])) porDataset.set(partes[1], {});
    porDataset.get(partes[1])[partes[2]] = camada;
  }
  const completos = [...porDataset.entries()].filter(([, c]) => variaveis.every(v => c[v])).map(([d]) => d).sort();
  if (!completos.length) throw new Error(`Capacidades: nenhum conjunto ${prefixo}* com ${variaveis.join(", ")}`);
  const dataset = completos.at(-1);
  const camadas = porDataset.get(dataset);
  for (const v of variaveis) {
    const c = camadas[v];
    if (!c.estilo) throw new Error(`Capacidades: ${v} sem estilo por omissão`);
    if (c.unidade !== VARIAVEIS[v].unidade) throw new Error(`Capacidades: ${v} em «${c.unidade}», esperava «${VARIAVEIS[v].unidade}»`);
    if (c.tempo.passo !== "PT1H" || !Number.isFinite(Date.parse(c.tempo.fim))) throw new Error(`Capacidades: dimensão temporal de ${v} inesperada`);
  }
  return { dataset, camadas, outrasVersoes: completos.slice(0, -1) };
}

// Resposta do GetFeatureInfo → { estado: "obtido" | "sem dados" | "inválido", valor, lat, lon, motivo }.
// «sem dados» = célula sem valor (terra ou fora do modelo); nunca se confunde com erro de rede.
export function lerResposta(json, { dataset, variavel }) {
  const f = json?.features;
  if (!Array.isArray(f) || f.length !== 1) return { estado: "inválido", motivo: "resposta sem exactamente um ponto" };
  const p = f[0]?.properties ?? {};
  const lat = Number.isFinite(p.lat) ? p.lat : null;
  const lon = Number.isFinite(p.lon) ? p.lon : null;
  const def = VARIAVEIS[variavel];
  if (p.variableId !== variavel) return { estado: "inválido", lat, lon, motivo: `variável ${p.variableId}, esperava ${variavel}` };
  if (p.datasetId !== `${PRODUTO}/${dataset}`) return { estado: "inválido", lat, lon, motivo: `conjunto ${p.datasetId}` };
  if (p.units !== def.unidade) return { estado: "inválido", lat, lon, motivo: `unidade «${p.units}», esperava «${def.unidade}»` };
  if (p.value === null || p.value === undefined) return { estado: "sem dados", lat, lon };
  if (typeof p.value !== "number" || !Number.isFinite(p.value) || p.value < def.min || p.value > def.max) {
    return { estado: "inválido", lat, lon, motivo: `valor fora dos limites físicos: ${p.value}` };
  }
  return { estado: "obtido", valor: p.value, lat, lon };
}
