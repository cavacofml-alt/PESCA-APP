export const TIME_ZONE = "Europe/Lisbon";

// Estados possíveis de um valor (secção 6 do CLAUDE.md).
export const ESTADO = Object.freeze({ OBTIDO: "obtido", NAO_OBTIDO: "não obtido", INVALIDO: "inválido" });

export function leitura(value, { unit = null, source, readAt = new Date().toISOString(),
  validAt = null, tipo, status = ESTADO.OBTIDO, provisional = false, note = null } = {}) {
  if (!["observado", "previsto", "calculado"].includes(tipo)) {
    throw new TypeError(`tipo inválido: ${tipo}`);
  }
  // Nenhum valor sem fonte identificada (secção 10), nem sequer um valor em falta.
  if (typeof source !== "string" || !source.trim()) {
    throw new TypeError("leitura() exige a fonte (source)");
  }
  // null/undefined → não obtido; número não finito (NaN, ±Infinity) → inválido.
  let estado = status;
  let valor = value;
  if (value === null || value === undefined) {
    estado = ESTADO.NAO_OBTIDO;
    valor = null;
  } else if (typeof value === "number" && !Number.isFinite(value)) {
    estado = ESTADO.INVALIDO;
    valor = null;
  }
  return {
    value: valor,
    unit,
    source,
    readAt,
    validAt,
    tipo,
    status: estado,
    provisional: Boolean(provisional),
    note
  };
}

export function sourceResult({ source, readAt = new Date().toISOString(), data = null, error = null }) {
  return { source, readAt, ok: !error, data, error: error ? String(error.message ?? error) : null };
}

// Instante ISO com data e hora; fuso opcional (Z ou ±hh:mm).
const ISO_INSTANTE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/;

// Lê um instante que a fonte garante estar em UTC. Se a cadeia não trouxer fuso
// (caso dos avisos IPMA, ex.: "2026-10-04T08:43:00"), acrescenta "Z" em vez de deixar
// o motor JavaScript interpretá-la como hora local do aparelho.
// Devolve Date ou null se a cadeia não for um instante válido.
export function parseUtc(value) {
  if (typeof value !== "string") return null;
  const m = value.match(ISO_INSTANTE);
  if (!m) return null;
  const [, y, mo, d, h, mi, s = "00", fuso] = m;
  if (+mo < 1 || +mo > 12 || +h > 23 || +mi > 59 || +s > 59) return null;
  // Data civil completa, com e sem fuso: o motor JavaScript "corrige" datas impossíveis
  // (31 de Fevereiro → 3 de Março) em vez de as rejeitar.
  const diasDoMes = new Date(Date.UTC(+y, +mo, 0)).getUTCDate();
  if (+d < 1 || +d > diasDoMes) return null;
  if (fuso && fuso !== "Z" && (+fuso.slice(1, 3) > 23 || +fuso.slice(4) > 59)) return null;
  const date = new Date(fuso ? value : `${value}Z`);
  return Number.isFinite(date.getTime()) ? date : null;
}

// Converte segundos Unix (Open-Meteo com timeformat=unixtime) num Date. null se inválido.
export function parseUnixSeconds(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const date = new Date(value * 1000);
  // Fora do intervalo suportado pelo Date (±8,64e15 ms) → Invalid Date.
  return Number.isFinite(date.getTime()) ? date : null;
}

function partesLisboa(date) {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"
  }).formatToParts(date);
  return Object.fromEntries(parts.map(x => [x.type, x.value]));
}

// Hora legal de Lisboa ("AAAA-MM-DDThh:mm:ss") para um instante UTC.
// Aceita Date ou cadeia; cadeias sem fuso são lidas como UTC (ver parseUtc).
export function utcToLisbon(utc) {
  const date = utc instanceof Date ? utc : parseUtc(utc);
  if (!date || !Number.isFinite(date.getTime())) return null;
  const p = partesLisboa(date);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
}

// Data civil em Lisboa ("AAAA-MM-DD") de um instante, opcionalmente deslocada de N dias.
export function lisbonDate(date, plusDays = 0) {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) return null;
  const p = partesLisboa(date);
  const civil = new Date(Date.UTC(+p.year, +p.month - 1, +p.day + plusDays));
  return civil.toISOString().slice(0, 10);
}

export function lisbonOffsetLabel(utc) {
  const date = utc instanceof Date ? utc : parseUtc(utc);
  if (!date || !Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat("pt-PT", {
    timeZone: TIME_ZONE, timeZoneName: "short", hour: "2-digit", minute: "2-digit",
    day: "2-digit", month: "2-digit", year: "numeric"
  }).format(date);
}

export function roundTo(value, digits = 2) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}
