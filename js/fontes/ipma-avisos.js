import { fetchJson } from "./http.js";
import { sourceResult } from "../normalizacao.js";

export async function getWarnings({ url = "https://api.ipma.pt/open-data/forecast/warnings/warnings_www.json",
  fetchImpl = fetch, now = new Date() } = {}) {
  const source = "IPMA — avisos";
  const readAt = now.toISOString();
  try {
    const json = await fetchJson(url, { fetchImpl });
    if (!Array.isArray(json)) throw new Error("Formato de avisos inesperado");
    return sourceResult({ source, readAt, data: json });
  } catch (error) {
    return sourceResult({ source, readAt, error });
  }
}
