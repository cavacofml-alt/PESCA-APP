// Página de um pesqueiro (plano de evolução, PR 4): pesqueiro.html?id=<id>[&dia=<0..6>]. Lê as fontes
// e corre o motor como o ecrã inicial (js/carregar.js) e mostra só esse pesqueiro.
import { lerEAnalisar } from "./carregar.js";
import { renderPesqueiro } from "./ui/pesqueiro.js";
import { esc } from "./ui/formato.js";
import { registarServiceWorker } from "./registo-sw.js";

const raiz = document.querySelector("#app");
const parametros = new URLSearchParams(location.search);
const id = parametros.get("id") ?? "";
const diaPedido = Number.parseInt(parametros.get("dia") ?? "0", 10);
let estado = null;

function desenhar() {
  raiz.innerHTML = renderPesqueiro(estado);
  const nome = estado.config.pesqueiros[id]?.nome;
  document.title = nome ? `Surfcasting Algarve — ${nome}` : "Surfcasting Algarve — pesqueiro";
  raiz.querySelector("#actualizar")?.addEventListener("click", actualizar);
  for (const b of raiz.querySelectorAll(".dia")) {
    b.addEventListener("click", () => { estado = { ...estado, indice: Number(b.dataset.dia) }; desenhar(); });
  }
}

async function actualizar() {
  raiz.querySelector(".lido")?.replaceChildren("A ler as fontes…");
  try {
    const dados = await lerEAnalisar();
    const n = dados.analise.dias.length;
    estado = { ...dados, id, indice: estado?.indice ?? (Number.isInteger(diaPedido) && diaPedido >= 0 && diaPedido < n ? diaPedido : 0) };
    desenhar();
  } catch (erro) {
    raiz.innerHTML = `<header class="topo"><div><h1>Pesqueiro</h1><p class="lido">Erro: ${esc(erro.message ?? erro)}</p></div></header>`;
  }
}

// Sem rede, mostra-se a previsão arquivada (ou nada): quando a rede volta, actualiza sozinha.
window.addEventListener("online", () => { if (estado?.origem?.tipo !== "actual") actualizar(); });

registarServiceWorker();
actualizar();
