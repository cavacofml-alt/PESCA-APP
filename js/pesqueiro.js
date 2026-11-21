// Página de um pesqueiro (plano de evolução, PR 4): pesqueiro.html?id=<id>[&dia=<0..6>]. Lê as fontes
// e corre o motor como o ecrã inicial (js/carregar.js) e mostra só esse pesqueiro.
import { lerEAnalisar } from "./carregar.js";
import { renderPesqueiro, pontosDoPesqueiro } from "./ui/pesqueiro.js";
import { irParaAgora } from "./ui/horario.js";
import { esc } from "./ui/formato.js";
import { registarServiceWorker } from "./registo-sw.js";

const raiz = document.querySelector("#app");
const parametros = new URLSearchParams(location.search);
const id = parametros.get("id") ?? "";
const diaPedido = Number.parseInt(parametros.get("dia") ?? "0", 10);
let estado = null;
let mapa = null;

// Mini-mapa dos pontos de dados (PR 9): fundo do OpenStreetMap (URL e atribuição no config), sem
// rodar a página com a roda do rato nem arrastar com um dedo. Sem Leaflet ou sem rede, a lista de
// coordenadas por baixo continua a dizer tudo.
function miniMapa() {
  if (mapa) { mapa.remove(); mapa = null; }
  const el = raiz.querySelector("#mini-mapa");
  const L = globalThis.L;
  const pq = estado.config.pesqueiros[id];
  if (!el || !pq) return;
  if (!L) { el.hidden = true; return; }
  const pontos = pontosDoPesqueiro(pq, estado.config).filter(x => x.local);
  const osm = estado.config.mapa?.fundosBase?.osm;
  mapa = L.map(el, { scrollWheelZoom: false, dragging: !L.Browser.mobile, tap: false, zoomSnap: 0.5 });
  if (estado.config.mapa?.leaflet) mapa.attributionControl.setPrefix(estado.config.mapa.leaflet);
  if (osm) {
    L.tileLayer(osm.url, { maxZoom: osm.maxZoom, attribution: osm.atribuicao, referrerPolicy: "strict-origin-when-cross-origin" }).addTo(mapa);
  }
  const coords = pontos.map(x => [x.local.latitude, x.local.longitude]);
  pontos.forEach((x, k) => {
    L.circleMarker(coords[k], { radius: 8, color: "#fff", weight: 2, fillColor: k === 0 ? "#0b7a77" : "#0a3550", fillOpacity: 1 })
      .bindTooltip(esc(x.papeis.join("; ")), { direction: "top", offset: [0, -6] })
      .addTo(mapa);
  });
  if (coords.length === 1) mapa.setView(coords[0], 14);
  else mapa.fitBounds(L.latLngBounds(coords).pad(0.6), { maxZoom: 14 });
}

function desenhar() {
  raiz.innerHTML = renderPesqueiro(estado);
  try { miniMapa(); } catch { raiz.querySelector("#mini-mapa")?.setAttribute("hidden", ""); }
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
