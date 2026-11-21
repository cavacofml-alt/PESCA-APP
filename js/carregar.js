// Lê a config e as fontes e corre o motor de regras: o mesmo para o ecrã inicial e o comparador
// (plano de evolução, PR 2, 20/11/2026). Não calcula nada além do que o motor (js/regras/) calcula.
//
// Sem rede (PR 3, 20/11/2026): cada leitura com pelo menos um ponto do Open-Meteo obtido fica guardada
// no aparelho (IndexedDB). Quando nenhum ponto do Open-Meteo responde, usa-se a última leitura
// guardada, desde que não seja mais antiga do que a política deixa (config.persistencia.leituras), e
// a app diz que é uma previsão arquivada, com a data e a hora da leitura. Sem leitura guardada que
// sirva, os dados ficam indisponíveis. origem.tipo: "actual" | "arquivo" | "indisponivel".
import { carregarDados } from "./dados.js";
import { analisarDias } from "./regras/analise.js";
import { ESPECIES } from "./ui/formato.js";
import { abrirArmazem } from "./armazenamento/indexeddb.js";
import { leituraDe, guardarLeitura, ultimaLeitura, politicaDe } from "./armazenamento/leituras.js";

// Espécie escolhida: lembrada só neste aparelho (conveniência; sem ela, robalo). A mesma chave no
// ecrã inicial e no comparador.
export function especieGuardada() {
  try { const e = localStorage.getItem("especie"); return ESPECIES.includes(e) ? e : "robalo"; } catch { return "robalo"; }
}
export function guardarEspecie(e) {
  try { localStorage.setItem("especie", e); } catch { /* sem armazenamento: fica só nesta sessão */ }
}

const pontosObtidos = pontos => [...Object.values(pontos?.mar ?? {}), ...Object.values(pontos?.terra ?? {})].filter(r => r?.ok).length;

// Decide de onde vêm os dados e guarda a leitura actual. Nunca lança: uma falha da base local só
// tira o uso sem rede. Devolve { dados (eventualmente com as fontes da leitura arquivada), origem }.
export async function origemDosDados(dados, config, { abrir = abrirArmazem, agora = Date.parse(dados.lidoEm) } = {}) {
  const politica = politicaDe(config);
  const base = await abrir().catch(e => ({ ok: false, erro: e?.message ?? String(e) }));
  try {
    if (pontosObtidos(dados.pontos) > 0) {
      const guardado = base.ok
        ? await guardarLeitura(base.armazem, leituraDe(dados), politica, agora).catch(e => ({ ok: false, erro: e?.message ?? String(e) }))
        : { ok: false, erro: base.erro };
      return { dados, origem: { tipo: "actual", guardado } };
    }
    const ultima = base.ok ? await ultimaLeitura(base.armazem) : null;
    const idadeHoras = ultima ? (agora - Date.parse(ultima.lidoEm)) / 3600000 : null;
    if (ultima && idadeHoras <= politica.arquivoMaxIdadeHoras) {
      // A boia da leitura arquivada só entra se a boia não respondeu agora (é sempre mostrada com a
      // hora da medição e a idade em relação a agora).
      const boiaFaro = dados.boiaFaro?.ok ? dados.boiaFaro : ultima.fontes.boiaFaro ?? dados.boiaFaro;
      return {
        dados: { ...dados, pontos: { mar: ultima.fontes.mar, terra: ultima.fontes.terra }, boiaFaro },
        origem: { tipo: "arquivo", lidoEm: ultima.lidoEm, idadeHoras }
      };
    }
    return { dados, origem: { tipo: "indisponivel", ultimaLidaEm: ultima?.lidoEm ?? null, semArmazem: base.ok ? null : base.erro } };
  } finally {
    if (base.ok) await base.armazem.fechar().catch(() => {});
  }
}

export async function lerEAnalisar({ fetchImpl = fetch, agora = new Date(), abrir = abrirArmazem } = {}) {
  const resposta = await fetchImpl("./config.json");
  if (!resposta.ok) throw new Error(`config.json não obtido (HTTP ${resposta.status})`);
  const config = await resposta.json();
  const lidos = await carregarDados({ config, fetchImpl, agora });
  const { dados, origem } = await origemDosDados(lidos, config, { abrir, agora: agora.getTime() });
  const analise = analisarDias({ dias: dados.dias, pontos: dados.pontos,
    mares: dados.mares.ok ? dados.mares.data : null, sol: dados.sol, config });
  return { analise, config, pontos: dados.pontos, mares: dados.mares, sol: dados.sol, lua: dados.lua,
    boiaFaro: dados.boiaFaro, fundoTipico: dados.fundoTipico,
    // lidoEm: a hora da leitura mostrada (a do arquivo, sem rede); agora: a hora real desta abertura.
    lidoEm: origem.tipo === "arquivo" ? origem.lidoEm : dados.lidoEm, agora: dados.lidoEm, origem };
}
