// Lê a config e as fontes e corre o motor de regras: o mesmo para o ecrã inicial e o comparador
// (plano de evolução, PR 2, 20/11/2026). Não calcula nada além do que o motor (js/regras/) calcula.
import { carregarDados } from "./dados.js";
import { analisarDias } from "./regras/analise.js";
import { ESPECIES } from "./ui/formato.js";

// Espécie escolhida: lembrada só neste aparelho (conveniência; sem ela, robalo). A mesma chave no
// ecrã inicial e no comparador.
export function especieGuardada() {
  try { const e = localStorage.getItem("especie"); return ESPECIES.includes(e) ? e : "robalo"; } catch { return "robalo"; }
}
export function guardarEspecie(e) {
  try { localStorage.setItem("especie", e); } catch { /* sem armazenamento: fica só nesta sessão */ }
}

export async function lerEAnalisar({ fetchImpl = fetch } = {}) {
  const resposta = await fetchImpl("./config.json");
  if (!resposta.ok) throw new Error(`config.json não obtido (HTTP ${resposta.status})`);
  const config = await resposta.json();
  const dados = await carregarDados({ config, fetchImpl });
  const analise = analisarDias({ dias: dados.dias, pontos: dados.pontos,
    mares: dados.mares.ok ? dados.mares.data : null, sol: dados.sol, config });
  return { analise, config, pontos: dados.pontos, mares: dados.mares, sol: dados.sol, lua: dados.lua,
    boiaFaro: dados.boiaFaro, fundoTipico: dados.fundoTipico, lidoEm: dados.lidoEm };
}
