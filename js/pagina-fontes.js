// Ecrã «Fontes»: lê o config.json e desenha a lista de fontes e os créditos.
import { renderFontes } from "./ui/fontes.js";
import { esc } from "./ui/formato.js";
import { registarServiceWorker } from "./registo-sw.js";

const raiz = document.querySelector("#fontes");

async function desenhar() {
  try {
    const r = await fetch("./config.json");
    if (!r.ok) throw new Error(`config.json não obtido (HTTP ${r.status})`);
    raiz.innerHTML = renderFontes(await r.json());
  } catch (erro) {
    raiz.innerHTML = `<p class="falha">Erro: ${esc(erro.message ?? erro)}</p>`;
  }
}

registarServiceWorker();
desenhar();
