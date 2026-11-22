// Ecrã inicial: lê as fontes, corre o motor de regras e desenha os cartões.
import { lerEAnalisar, especieGuardada, guardarEspecie } from "./carregar.js";
import { renderInicio } from "./ui/inicio.js";
import { renderHorario, irParaAgora } from "./ui/horario.js";
import { esc } from "./ui/formato.js";
import { registarServiceWorker } from "./registo-sw.js";

const raiz = document.querySelector("#app");
const painel = document.querySelector("#horario");
let estado = null;

function abrirHorario(id) {
  painel.innerHTML = renderHorario(estado, id);
  painel.dataset.pq = id;
  painel.querySelector(".fechar")?.addEventListener("click", () => painel.close());
  for (const b of painel.querySelectorAll(".nav-dia")) {
    b.addEventListener("click", () => {
      estado = { ...estado, indice: Number(b.dataset.dia) };
      desenhar();
      abrirHorario(id);
    });
  }
  if (!painel.open) painel.showModal();
  irParaAgora(painel);
}

function desenhar() {
  raiz.innerHTML = renderInicio(estado);
  raiz.querySelector("#actualizar")?.addEventListener("click", actualizar);
  for (const b of raiz.querySelectorAll(".dia")) {
    b.addEventListener("click", () => {
      estado = { ...estado, indice: Number(b.dataset.dia) };
      desenhar();
    });
  }
  for (const b of raiz.querySelectorAll(".especie-btn")) {
    b.addEventListener("click", () => {
      estado = { ...estado, especie: b.dataset.especie };
      guardarEspecie(b.dataset.especie);
      desenhar();
    });
  }
  for (const b of raiz.querySelectorAll(".btn-horas")) b.addEventListener("click", () => abrirHorario(b.dataset.pq));
}

async function actualizar() {
  raiz.querySelector(".lido")?.replaceChildren("A ler as fontes…");
  try {
    estado = { ...(await lerEAnalisar()), indice: estado?.indice ?? 0, especie: estado?.especie ?? especieGuardada() };
    desenhar();
  } catch (erro) {
    raiz.innerHTML = `<header class="topo"><div><h1>Surfcasting Algarve</h1><p class="lido">Erro: ${esc(erro.message ?? erro)}</p></div></header>`;
  }
}

// Sem rede, mostra-se a previsão arquivada (ou nada): quando a rede volta, actualiza sozinha.
window.addEventListener("online", () => { if (estado?.origem?.tipo !== "actual") actualizar(); });

registarServiceWorker();
actualizar();
