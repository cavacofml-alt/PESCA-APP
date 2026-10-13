import { sourceResult } from "../normalizacao.js";

const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})$/;

export function validateTides(document, { minIntervalMinutes = 30, maxIntervalMinutes = 480 } = {}) {
  const errors = [];
  if (!document || document.schemaVersion !== 1 || !Array.isArray(document.events)) {
    return { ok: false, errors: ["Estrutura inválida: esperado schemaVersion=1 e events[]."], events: [] };
  }
  let previous = null;
  const events = [];
  for (let i = 0; i < document.events.length; i++) {
    const event = document.events[i];
    if (!event || !ISO_WITH_OFFSET.test(event.instant ?? "")) {
      errors.push(`Evento ${i}: instante ISO deve incluir Z ou offset explícito.`);
      continue;
    }
    const timestamp = Date.parse(event.instant);
    if (!Number.isFinite(timestamp)) {
      errors.push(`Evento ${i}: instante inválido.`);
      continue;
    }
    if (!["PM", "BM"].includes(event.type)) errors.push(`Evento ${i}: tipo deve ser PM ou BM.`);
    if (!Number.isFinite(event.heightM) || event.heightM < -1 || event.heightM > 10) {
      errors.push(`Evento ${i}: altura ausente ou fora do intervalo plausível [-1, 10] m.`);
    }
    if (typeof event.source !== "string" || !event.source.trim()) errors.push(`Evento ${i}: fonte em falta.`);
    if (previous) {
      const deltaMin = (timestamp - previous.timestamp) / 60000;
      if (deltaMin <= 0) errors.push(`Evento ${i}: eventos fora de ordem ou instante duplicado.`);
      else if (deltaMin < minIntervalMinutes || deltaMin > maxIntervalMinutes) {
        errors.push(`Evento ${i}: intervalo anómalo de ${deltaMin.toFixed(1)} minutos desde o evento anterior.`);
      }
      if (event.type === previous.event.type) errors.push(`Evento ${i}: tipo repetido (${event.type}); esperava-se alternância PM/BM.`);
    }
    events.push({ ...event, timestamp });
    previous = { event, timestamp };
  }
  return { ok: errors.length === 0, errors, events };
}

export async function loadLocalTides({ url = "../../mares/2026.json", fetchImpl = fetch, now = new Date(),
  minIntervalMinutes = 30, maxIntervalMinutes = 480 } = {}) {
  const source = "Instituto Hidrográfico — tabela local";
  const readAt = now.toISOString();
  try {
    const response = await fetchImpl(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const document = await response.json();
    const validation = validateTides(document, { minIntervalMinutes, maxIntervalMinutes });
    if (!validation.ok) throw new Error(validation.errors.join(" "));
    return sourceResult({ source, readAt, data: validation.events });
  } catch (error) {
    return sourceResult({ source, readAt, error });
  }
}
