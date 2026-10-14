// Ecrã inicial: lê as fontes, corre o motor de regras e desenha os cartões.
import { carregarDados } from "./dados.js";
import { analisarDias } from "./regras/analise.js";
import { renderInicio, ESPECIES } from "./ui/inicio.js";
import { renderHorario } from "./ui/horario.js";
import { esc } from "./ui/formato.js";

const raiz = document.querySelector("#app");
const painel = document.querySelector("#horario");
let estado = null;

// Espécie escolhida: lembrada só neste aparelho (conveniência; sem ela, robalo).
function especieGuardada() {
  try { const e = localStorage.getItem("especie"); return ESPECIES.includes(e) ? e : "robalo"; } catch { return "robalo"; }
}
function guardarEspecie(e) {
  try { localStorage.setItem("especie", e); } catch { /* sem armazenamento: fica só nesta sessão */ }
}

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
    const resposta = await fetch("./config.json");
    if (!resposta.ok) throw new Error(`config.json não obtido (HTTP ${resposta.status})`);
    const config = await resposta.json();
    const dados = await carregarDados({ config });
    const analise = analisarDias({ dias: dados.dias, pontos: dados.pontos,
      mares: dados.mares.ok ? dados.mares.data : null, sol: dados.sol, config });
    estado = { analise, config, pontos: dados.pontos, mares: dados.mares, sol: dados.sol, lua: dados.lua,
      lidoEm: dados.lidoEm, indice: estado?.indice ?? 0, especie: estado?.especie ?? especieGuardada() };
    desenhar();
  } catch (erro) {
    raiz.innerHTML = `<header class="topo"><div><h1>Surfcasting Algarve</h1><p class="lido">Erro: ${esc(erro.message ?? erro)}</p></div></header>`;
  }
}

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}
actualizar();
