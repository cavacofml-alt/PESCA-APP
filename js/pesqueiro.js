// Página de um pesqueiro (plano de evolução, PR 4): pesqueiro.html?id=<id>[&dia=<0..6>]. Lê as fontes
// e corre o motor como o ecrã inicial (js/carregar.js) e mostra só esse pesqueiro.
import { lerEAnalisar } from "./carregar.js";
import { renderPesqueiro, pontosDoPesqueiro, numerarPontos } from "./ui/pesqueiro.js";
import { irParaAgora } from "./ui/horario.js";
import { esc } from "./ui/formato.js";
import { registarServiceWorker } from "./registo-sw.js";

const raiz = document.querySelector("#app");
const parametros = new URLSearchParams(location.search);
const id = parametros.get("id") ?? "";
const diaPedido = Number.parseInt(parametros.get("dia") ?? "0", 10);
let estado = null;
let mapa = null;

// Mini-mapa dos pontos de dados (PR 9; revisto a 22/11/2026): só ilustrativo, sem controlos, sem foco
// e sem atribuição dentro do mapa (vai na legenda da figura). Marcadores numerados como a lista. Sem
// Leaflet, a figura esconde-se e a lista de coordenadas continua a dizer tudo.
function miniMapa() {
  if (mapa) { mapa.remove(); mapa = null; }
  const el = raiz.querySelector("#mini-mapa");
  const figura = raiz.querySelector("#fig-mini-mapa");
  const L = globalThis.L;
  const pq = estado.config.pesqueiros[id];
  if (!el || !pq) return;
  if (!L) { if (figura) figura.hidden = true; return; }
  const pontos = numerarPontos(pontosDoPesqueiro(pq, estado.config)).filter(x => x.local);
  const osm = estado.config.mapa?.fundosBase?.osm;
  mapa = L.map(el, { zoomControl: false, attributionControl: false, dragging: false, touchZoom: false, doubleClickZoom: false,
    scrollWheelZoom: false, boxZoom: false, keyboard: false, zoomSnap: 0.5 });
  if (osm) L.tileLayer(osm.url, { maxZoom: osm.maxZoom, referrerPolicy: "strict-origin-when-cross-origin" }).addTo(mapa);
  const coords = pontos.map(x => [x.local.latitude, x.local.longitude]);
  pontos.forEach((x, k) => {
    L.marker(coords[k], { interactive: false, keyboard: false,
      icon: L.divIcon({ className: "marca-ponto", html: String(x.n), iconSize: [24, 24], iconAnchor: [12, 12] }) }).addTo(mapa);
  });
  if (coords.length === 1) mapa.setView(coords[0], 14);
  else mapa.fitBounds(L.latLngBounds(coords).pad(0.6), { maxZoom: 14 });
}

function desenhar() {
  raiz.innerHTML = renderPesqueiro(estado);
  try { miniMapa(); } catch { raiz.querySelector("#fig-mini-mapa")?.setAttribute("hidden", ""); }
  irParaAgora(raiz.querySelector(".horas-pq"));
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
