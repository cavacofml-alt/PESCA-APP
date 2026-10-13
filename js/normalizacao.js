export const TIME_ZONE = "Europe/Lisbon";

export function leitura(value, { unit = null, source, readAt = new Date().toISOString(),
  validAt = null, tipo, status = "obtido", provisional = false, note = null } = {}) {
  if (!["observado", "previsto", "calculado"].includes(tipo)) {
    throw new TypeError(`tipo inválido: ${tipo}`);
  }
  const validValue = typeof value === "number" ? Number.isFinite(value) : value !== undefined;
  return {
    value: validValue ? value : null,
    unit,
    source: source ?? "não obtido",
    readAt,
    validAt,
    tipo,
    status: value === null || value === undefined ? "não obtido" : status,
    provisional: Boolean(provisional),
    note
  };
}

export function sourceResult({ source, readAt = new Date().toISOString(), data = null, error = null }) {
  return { source, readAt, ok: !error, data, error: error ? String(error.message ?? error) : null };
}

export function parseApiTime(value) {
  if (typeof value !== "string") return null;
  // Open-Meteo returns local wall-clock strings when timezone is supplied.
  // Keep these as explicit local timestamps; do not parse as UTC accidentally.
  const match = value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::(\d{2}))?$/);
  if (!match) return null;
  return { date: match[1], time: match[2], seconds: match[3] ?? "00", timeZone: TIME_ZONE, local: value };
}

export function utcToLisbon(utcString) {
  const date = new Date(utcString);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"
  }).formatToParts(date);
  const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
}

export function lisbonOffsetLabel(utcString) {
  const date = new Date(utcString);
  if (!Number.isFinite(date.getTime())) return null;
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
