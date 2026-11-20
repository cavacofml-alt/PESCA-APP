// Pedidos HTTP da recolha: limite de tempo, tentativas com espera progressiva (1 s, 2 s, 4 s…) e
// limite de pedidos em simultâneo. Erros de rede, 429 e 5xx repetem-se; os outros 4xx não (um 400
// do WMTS é um pedido errado, não uma falha passageira). Nunca lança: devolve sempre um resultado.

export async function pedir(url, {
  fetchImpl = fetch, tentativas = 4, timeoutMs = 30000, esperaBaseMs = 1000,
  dormir = ms => new Promise(r => setTimeout(r, ms)), formato = "json"
} = {}) {
  let falha = null;
  for (let n = 1; n <= tentativas; n++) {
    try {
      const r = await fetchImpl(url, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: { Accept: formato === "json" ? "application/json" : "application/xml, text/xml, */*" }
      });
      if (r.ok) {
        const texto = await r.text();
        if (formato !== "json") return { ok: true, status: r.status, tentativas: n, corpo: texto };
        try {
          return { ok: true, status: r.status, tentativas: n, corpo: JSON.parse(texto) };
        } catch {
          falha = { status: r.status, erro: "resposta não é JSON válido" };
        }
      } else {
        falha = { status: r.status, erro: `HTTP ${r.status}` };
        if (r.status !== 429 && r.status < 500) return { ok: false, tentativas: n, ...falha };
      }
    } catch (e) {
      const tempo = e?.name === "TimeoutError" || e?.name === "AbortError";
      falha = { status: null, erro: tempo ? `tempo limite excedido (${timeoutMs} ms)` : `falha de rede: ${e?.cause?.code ?? e?.message ?? e}` };
    }
    if (n < tentativas) await dormir(esperaBaseMs * 2 ** (n - 1));
  }
  return { ok: false, tentativas, ...falha };
}

// Corre fn sobre cada item com no máximo `limite` em simultâneo; os resultados ficam na ordem dos itens.
export async function emParalelo(itens, limite, fn) {
  const resultados = new Array(itens.length);
  let proximo = 0;
  const trabalhador = async () => {
    while (proximo < itens.length) {
      const k = proximo++;
      resultados[k] = await fn(itens[k], k);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limite, itens.length)) }, trabalhador));
  return resultados;
}
