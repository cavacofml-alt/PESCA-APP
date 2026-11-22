// Ecrã «Estatísticas» (plano de evolução, PR 6): lê o diário deste aparelho e mostra as estatísticas
// com os filtros escolhidos. Funciona sem rede.
import { abrirArmazem } from "./armazenamento/indexeddb.js";
import { listarSaidas } from "./diario/saidas.js";
import { estatisticas } from "./diario/estatisticas.js";
import { renderEstatisticas } from "./ui/estatisticas.js";
import { esc } from "./ui/formato.js";
import { registarServiceWorker } from "./registo-sw.js";

const raiz = document.querySelector("#app");
let config = null;
let base = null;
let saidas = [];
let invalidas = 0;   // registos que não passam na validação: não entram nas contas, mas diz-se quantos são
let filtros = { periodo: "tudo", especie: "todas", pesqueiro: "todos" };

function desenhar() {
  const stats = base.ok ? estatisticas(saidas, config, filtros) : null;
  raiz.innerHTML = renderEstatisticas({ config, armazem: base, stats, filtros, invalidas });
  raiz.querySelector("#filtros")?.addEventListener("change", ev => {
    filtros = Object.fromEntries(new FormData(ev.currentTarget).entries());
    desenhar();
  });
}

async function iniciar() {
  try {
    const r = await fetch("./config.json");
    if (!r.ok) throw new Error(`config.json não obtido (HTTP ${r.status})`);
    config = await r.json();
    base = await abrirArmazem();
    if (base.ok) {
      ({ saidas, invalidas } = await listarSaidas(base.armazem));
      await base.armazem.fechar();
    }
    desenhar();
  } catch (erro) {
    raiz.innerHTML = `<header class="topo"><div><h1>Estatísticas</h1><p class="lido">Erro: ${esc(erro.message ?? erro)}</p></div></header>`;
  }
}

registarServiceWorker();
iniciar();
