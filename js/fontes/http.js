export async function fetchJson(url, { timeoutMs = 12000, fetchImpl = fetch } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { signal: controller.signal, headers: { "Accept": "application/json" } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    if (error?.name === "AbortError") throw new Error(`Tempo limite excedido (${timeoutMs} ms)`);
    // fetch() rejeita com TypeError em falha de rede ou bloqueio CORS; mensagem do browser vem em inglês.
    if (error instanceof TypeError) throw new Error("Falha de rede (sem ligação ou pedido bloqueado)");
    if (error instanceof SyntaxError) throw new Error("Resposta não é JSON válido");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
export function makeUrl(base, params) {
  const url = new URL(base);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }
  return url.toString();
}
