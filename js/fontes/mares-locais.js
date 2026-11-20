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

// Anos (UTC) que a janela [inicio, fim] toca. As tabelas do IH vêm em TU, um ficheiro por ano
// (mares/<ano>.json): uma janela de 7 dias perto do fim do ano precisa de dois.
export function anosDaJanela(inicio, fim) {
  const a = new Date(inicio).getUTCFullYear();
  const b = new Date(fim).getUTCFullYear();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return [];
  return Array.from({ length: b - a + 1 }, (_, i) => a + i);
}

// Carrega a tabela de cada ano da janela e junta-as. Na passagem de ano confere-se a continuidade
// (ordem, alternância PM/BM e intervalo, com validateTides sobre a junção): se falhar, nada se
// junta às escondidas, dá erro. Um ano que não se obtém (ainda não convertido, rede) não apaga os
// outros: os dias que dele dependem ficam «tabela incompleta» no motor, e o motivo vai em «aviso».
export async function loadTidesForWindow({ inicio, fim, urlFor = ano => `./mares/${ano}.json`, fetchImpl = fetch,
  now = new Date(), minIntervalMinutes = 30, maxIntervalMinutes = 480 } = {}) {
  const anos = anosDaJanela(inicio, fim);
  const source = `Instituto Hidrográfico — tabela local (${anos.join(", ") || "sem anos"})`;
  const readAt = now.toISOString();
  if (!anos.length) return sourceResult({ source, readAt, error: "janela de datas inválida" });
  const res = await Promise.all(anos.map(ano => loadLocalTides({ url: urlFor(ano), fetchImpl, now, minIntervalMinutes, maxIntervalMinutes })));
  const falhas = anos.map((ano, i) => (res[i].ok ? null : `tabela de ${ano} não obtida (${res[i].error})`)).filter(Boolean);
  const bons = res.filter(r => r.ok);
  if (!bons.length) return sourceResult({ source, readAt, error: falhas.join("; ") });
  const juntos = validateTides({ schemaVersion: 1, events: bons.flatMap(r => r.data) }, { minIntervalMinutes, maxIntervalMinutes });
  if (!juntos.ok) return sourceResult({ source, readAt, error: `passagem de ano inconsistente: ${juntos.errors.slice(0, 2).join(" ")}` });
  const anosObtidos = anos.filter((_, i) => res[i].ok);
  return { ...sourceResult({ source, readAt, data: juntos.events }), anos: anosObtidos, aviso: falhas.length ? falhas.join("; ") : null };
}
