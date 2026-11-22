// Ecrã «Comparar» (plano de evolução, PR 2, 20/11/2026): lê as fontes, corre o motor de regras e põe
// os pesqueiros lado a lado. O dia pode vir no endereço (comparador.html?dia=2, a partir do início).
import { lerEAnalisar, especieGuardada, guardarEspecie } from "./carregar.js";
import { renderComparador } from "./ui/comparador.js";
import { esc } from "./ui/formato.js";
import { registarServiceWorker } from "./registo-sw.js";

const raiz = document.querySelector("#app");
const parametros = new URLSearchParams(location.search);
const diaPedido = Number.parseInt(parametros.get("dia") ?? "0", 10);
let estado = null;

function desenhar() {
  raiz.innerHTML = renderComparador(estado);
  raiz.querySelector("#actualizar")?.addEventListener("click", actualizar);
  const ligar = (seletor, f) => { for (const b of raiz.querySelectorAll(seletor)) b.addEventListener("click", () => { f(b); desenhar(); }); };
  ligar(".dia", b => { estado = { ...estado, indice: Number(b.dataset.dia) }; });
  ligar(".especie-btn", b => { estado = { ...estado, especie: b.dataset.especie }; guardarEspecie(b.dataset.especie); });
  ligar(".vistas button", b => { estado = { ...estado, vista: b.dataset.valor }; });
  ligar(".ordens button", b => { estado = { ...estado, ordem: b.dataset.valor }; });
}

async function actualizar() {
  raiz.querySelector(".lido")?.replaceChildren("A ler as fontes…");
  try {
    const dados = await lerEAnalisar();
    const n = dados.analise.dias.length;
    estado = { ...dados, indice: estado?.indice ?? (Number.isInteger(diaPedido) && diaPedido >= 0 && diaPedido < n ? diaPedido : 0),
      especie: estado?.especie ?? especieGuardada(), vista: estado?.vista ?? "dia", ordem: estado?.ordem ?? "pesqueiros" };
    desenhar();
  } catch (erro) {
    raiz.innerHTML = `<header class="topo"><div><h1>Comparar pesqueiros</h1><p class="lido">Erro: ${esc(erro.message ?? erro)}</p></div></header>`;
  }
}

registarServiceWorker();
actualizar();
