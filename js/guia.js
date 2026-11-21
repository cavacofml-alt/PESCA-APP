// Ecrã «Guia» (plano de evolução, PR 8): conteúdo estático; os valores de «Nesta app» vêm do config.
import { renderGuia } from "./ui/guia.js";
import { esc } from "./ui/formato.js";
import { registarServiceWorker } from "./registo-sw.js";

const raiz = document.querySelector("#app");
async function iniciar() {
  try {
    const r = await fetch("./config.json");
    if (!r.ok) throw new Error(`config.json não obtido (HTTP ${r.status})`);
    raiz.innerHTML = renderGuia(await r.json());
    if (location.hash) document.querySelector(location.hash)?.scrollIntoView();
  } catch (erro) {
    raiz.innerHTML = `<header class="topo"><div><h1>Guia</h1><p class="lido">Erro: ${esc(erro.message ?? erro)}</p></div></header>`;
  }
}
registarServiceWorker();
iniciar();
