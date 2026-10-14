// Ecrã inicial: lê as fontes, corre o motor de regras e desenha os cartões.
import { carregarDados } from "./dados.js";
import { analisarDias } from "./regras/analise.js";
import { renderInicio } from "./ui/inicio.js";
import { esc } from "./ui/formato.js";

const raiz = document.querySelector("#app");
let estado = null;

function desenhar() {
  raiz.innerHTML = renderInicio(estado);
  raiz.querySelector("#actualizar")?.addEventListener("click", actualizar);
  for (const b of raiz.querySelectorAll(".dia")) {
    b.addEventListener("click", () => {
      estado = { ...estado, indice: Number(b.dataset.dia) };
      desenhar();
    });
  }
}

async function actualizar() {
  raiz.querySelector(".lido")?.replaceChildren("A ler as fontes…");
  try {
    const resposta = await fetch("./config.json");
    if (!resposta.ok) throw new Error(`config.json não obtido (HTTP ${resposta.status})`);
    const config = await resposta.json();
    const dados = await carregarDados({ config });
    const analise = analisarDias({ dias: dados.dias, pontos: dados.pontos,
      mares: dados.mares.ok ? dados.mares.data : null, sol: dados.sol, config });
    estado = { analise, config, pontos: dados.pontos, mares: dados.mares, sol: dados.sol,
      lidoEm: dados.lidoEm, indice: estado?.indice ?? 0 };
    desenhar();
  } catch (erro) {
    raiz.innerHTML = `<header class="topo"><div><h1>Surfcasting Algarve</h1><p class="lido">Erro: ${esc(erro.message ?? erro)}</p></div></header>`;
  }
}

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}
actualizar();
