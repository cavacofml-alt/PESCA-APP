// Ecrã «Mapa»: pesqueiros e fundo do mar (isóbatas, fundões e cabeços) sobre o mapa do
// OpenStreetMap ou a ortoimagem de satélite da DGT. O Leaflet vem de vendor/leaflet (window.L).
// Os URL dos fundos de mapa estão no config.json (fonte única).
import { loadTidesForWindow } from "./fontes/mares-locais.js";
import { validarFundos, corIsobata, descricaoForma, descricaoIsobata, periodoLevantamento, idadeLevantamento, mesAno,
  estimado } from "./fundos.js";
import { esc } from "./ui/formato.js";
import { registarServiceWorker } from "./registo-sw.js";

const L = globalThis.L;
const estado = document.querySelector("#estado-mapa");
const atalhos = document.querySelector("#atalhos-mapa");
const COR = { "fundão": "#1d4ed8", "cabeço": "#a16207" };
const REFERER = "strict-origin-when-cross-origin"; // o OpenStreetMap exige o Referer nos mosaicos

function lerPreferencia(chave) {
  try { return localStorage.getItem(chave); } catch { return null; }
}
function guardarPreferencia(chave, valor) {
  try { localStorage.setItem(chave, valor); } catch { /* sem armazenamento: fica só nesta visita */ }
}

function fundosDeMapa(config) {
  const b = config.mapa.fundosBase;
  const osm = L.tileLayer(b.osm.url, { maxZoom: b.osm.maxZoom, attribution: b.osm.atribuicao, referrerPolicy: REFERER });
  // Quadrados de 512 px: quatro vezes menos pedidos ao serviço da DGT, que corta a ligação
  // quando recebe muitos de uma vez.
  const orto = L.tileLayer.wms(b.ortofoto.wms, { layers: b.ortofoto.camada, format: "image/jpeg", version: "1.3.0",
    tileSize: 512, maxZoom: b.ortofoto.maxZoom, attribution: b.ortofoto.atribuicao, referrerPolicy: REFERER });
  // O primeiro é o fundo por omissão (o OpenStreetMap, mais rápido); a escolha fica lembrada.
  return { [b.osm.nome]: osm, [b.ortofoto.nome]: orto };
}

// F0 (22/11/2026): os pesqueiros têm um marcador próprio — alfinete escuro com miolo branco, no
// painel dos marcadores (por cima do canvas) —, que não se confunde com os pontos dos fundões (azul) e
// dos cabeços (castanho), redondos e desenhados no canvas. Antes era um círculo laranja, parecido com
// o dos cabeços. Focável pelo teclado; o nome vai no title.
const iconePesqueiro = () => L.divIcon({ className: "marcador-pesqueiro", html: '<span class="pino-pq"></span>',
  iconSize: [24, 30], iconAnchor: [12, 28], popupAnchor: [0, -26], tooltipAnchor: [0, -24] });

function camadaPesqueiros(config) {
  const grupo = L.layerGroup();
  for (const [id, pq] of Object.entries(config.pesqueiros)) {
    const p = config.locais[pq.mar];
    if (!p) continue; // a Ria não tem ponto próprio (ver CLAUDE.md §4)
    const marcador = L.marker([p.latitude, p.longitude], { icon: iconePesqueiro(), title: pq.nome, keyboard: true, riseOnHover: true })
      .bindTooltip(esc(pq.nomeCurto ?? pq.nome), { direction: "top" })
      .bindPopup(`<h3>${esc(pq.nome)}</h3><p>Ponto usado para a previsão do mar (Open-Meteo): ` +
        `${p.latitude.toFixed(5)}, ${p.longitude.toFixed(5)}.</p><p class="fonte-mapa">${esc(p.origem ?? "")}</p>` +
        `<p><a href="./pesqueiro.html?id=${encodeURIComponent(id)}">Página do pesqueiro ›</a></p>`)
      .addTo(grupo);
    marcador.pesqueiro = id;
  }
  return grupo;
}

function camadasFundos(fundos, mares) {
  const isobatas = L.layerGroup();
  for (const iso of fundos.isobatas) {
    const inteira = Math.abs(iso.cota - Math.round(iso.cota)) < 1e-9;
    for (const linha of iso.linhas) {
      L.polyline(linha.map(([lon, lat]) => [lat, lon]),
        { color: corIsobata(iso.cota), weight: inteira ? 2 : 1, opacity: 0.9 })
        .bindPopup(() => descricaoIsobata(iso.cota, fundos, new Date()))
        .addTo(isobatas);
    }
  }
  const formas = L.layerGroup();
  formas.rotulos = () => formas.getLayers().map(m => m.getTooltip?.()).filter(Boolean); // F0: para arrumar os rótulos
  // Estimativa por satélite: contorno tracejado, ponto oco e «sat.» no rótulo, para não se confundir
  // com os levantamentos medidos.
  const sat = estimado(fundos);
  for (const f of fundos.formas) {
    const balao = () => descricaoForma(f, fundos, mares, new Date());
    L.polygon(f.contorno.map(([lon, lat]) => [lat, lon]),
      { color: COR[f.tipo], weight: 1.5, fillColor: COR[f.tipo], fillOpacity: sat ? 0.1 : 0.25, dashArray: sat ? "4 3" : null })
      .bindPopup(balao).addTo(formas);
    L.circleMarker([f.ponto[1], f.ponto[0]], { radius: 5, color: sat ? COR[f.tipo] : "#fff", weight: sat ? 2 : 1.5,
      fillColor: sat ? "#fff" : COR[f.tipo], fillOpacity: 1 })
      .bindTooltip(esc(sat ? `${f.id} sat.` : f.id), { permanent: true, direction: "right", className: `rotulo-forma ${f.tipo === "fundão" ? "f" : "c"}${sat ? " sat" : ""}` })
      .bindPopup(balao).addTo(formas);
  }
  // Linha (não polígono): no Canvas um polígono sem preenchimento continua a apanhar os toques
  // dentro dele e taparia os fundões e cabeços.
  const cobertura = L.polyline(fundos.cobertura.map(([lon, lat]) => [lat, lon]),
    { color: "#37474f", weight: 1.5, dashArray: "6 5" })
    .bindPopup(() => (sat
      ? `<h3>Zona com estimativa — ${esc(fundos.nome)}</h3><p>Imagem Copernicus Sentinel-2 de ` +
        `${periodoLevantamento(fundos.fonte)} (${idadeLevantamento(fundos.fonte) ?? "data desconhecida"}). ` +
        "Fora desta linha a água era funda demais (ou havia espuma) para estimar o fundo.</p>"
      : `<h3>Zona levantada — ${esc(fundos.nome)}</h3><p>${/COSMO/.test(fundos.fonte.nome ?? "") ? "Levantamento do Programa COSMO de" : `${esc(fundos.fonte.nome)}, levantamento de`} ` +
        `${periodoLevantamento(fundos.fonte)} (${idadeLevantamento(fundos.fonte) ?? "data desconhecida"}). ` +
        "Fora desta linha não há dados do fundo.</p>"));
  return { cobertura, isobatas, formas }; // por esta ordem: os fundões e cabeços ficam por cima
}

function legenda() {
  const c = L.control({ position: "bottomleft" });
  c.onAdd = () => {
    const div = L.DomUtil.create("div", "legenda-mapa");
    const cotas = [0, -2, -4, -6, -8, -10, -12];
    div.innerHTML = "<b>Fundo (m ao zero hidrográfico)</b><div class=\"escala\">" +
      cotas.map(z => `<span style="--c:${corIsobata(z)}">${z === 0 ? "0" : `−${-z}`}</span>`).join("") +
      "</div><span class=\"leg-pino\" aria-hidden=\"true\"></span> pesqueiro (ponto da previsão do mar) · " +
      "<span class=\"f\">●</span> fundão · <span class=\"c\">●</span> cabeço · " +
      "ZH = 2 m abaixo do nível médio. LiDAR 2011: m à LAT (0 a 0,22 m acima do ZH)";
    L.DomEvent.disableClickPropagation(div);
    return div;
  };
  return c;
}

// F0 (22/11/2026): rótulos dos fundões e cabeços sem sobreposição. Há ~150 formas na costa: na vista
// geral tapavam-se todas. Abaixo de ZOOM_ROTULOS não há rótulos; daí para cima, um rótulo que tape
// outro já mostrado esconde-se (ficam primeiro os medidos, depois os estimados por satélite). O ponto
// e o balão de cada forma ficam sempre; só o texto se esconde.
// As caixas calculam-se em píxeis do mapa (project ao zoom pedido) com o tamanho do rótulo (offsetWidth,
// que as animações de zoom não alteram): o resultado não depende do momento em que se mede. Todos os
// rótulos ficam à direita do ponto com o mesmo desvio, que não muda quem tapa quem.
const ZOOM_ROTULOS = 12.5; // a vista geral fica em 11,5–12 num telemóvel; as zonas dos atalhos em 12,5–14
const FOLGA_ROTULO = 2; // px entre rótulos
function arrumarRotulos(mapa, tooltips) {
  const z = mapa.getZoom();
  const longe = z < ZOOM_ROTULOS;
  mapa.getContainer().classList.toggle("rotulos-longe", longe);
  const abertos = tooltips.filter(t => t.isOpen() && t.getElement());
  for (const t of abertos) t.getElement().classList.remove("rotulo-tapado");
  if (longe) return;
  const vistos = [];
  const sat = t => /(^|\s)sat(\s|$)/.test(t.options.className ?? "");
  for (const t of [...abertos.filter(t => !sat(t)), ...abertos.filter(sat)]) {
    const el = t.getElement();
    const w = el.offsetWidth, h = el.offsetHeight;
    if (!w) continue;
    const p = mapa.project(t.getLatLng(), z);
    const a = { l: p.x - FOLGA_ROTULO, r: p.x + w + FOLGA_ROTULO, t: p.y - h / 2 - FOLGA_ROTULO, b: p.y + h / 2 + FOLGA_ROTULO };
    if (vistos.some(b => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b)) el.classList.add("rotulo-tapado");
    else vistos.push(a);
  }
}

async function lerJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function iniciar() {
  if (!L) {
    estado.textContent = "Não foi possível carregar o mapa (biblioteca Leaflet em falta).";
    return;
  }
  let config;
  try {
    config = await lerJson("./config.json");
  } catch (erro) {
    estado.textContent = `Configuração não obtida: ${erro.message}`;
    return;
  }
  const mapa = L.map("mapa", { preferCanvas: true, zoomSnap: 0.5 });
  // Com um balão aberto, a legenda (canto de baixo) esconde-se para não o tapar (PR 9, 21/11/2026).
  mapa.on("popupopen", () => mapa.getContainer().classList.add("com-balao"));
  mapa.on("popupclose", () => mapa.getContainer().classList.remove("com-balao"));
  mapa.attributionControl.setPrefix(config.mapa.leaflet);
  const bases = fundosDeMapa(config);
  const nomeBase = lerPreferencia("mapa-fundo");
  (bases[nomeBase] ?? Object.values(bases)[0]).addTo(mapa);
  mapa.on("baselayerchange", e => guardarPreferencia("mapa-fundo", e.name));

  const pesqueiros = camadaPesqueiros(config).addTo(mapa);
  const sobreposicoes = { Pesqueiros: pesqueiros };
  const limites = L.latLngBounds([]);
  pesqueiros.eachLayer(m => limites.extend(m.getLatLng()));
  mapa.fitBounds(limites.pad(0.15));
  // mapa.html?pesqueiro=<id> (a partir da página do pesqueiro): centra nele e abre o balão. A Ria não
  // tem marcador: centra no ponto de terra.
  const pedido = new URLSearchParams(location.search).get("pesqueiro");
  const pqPedido = pedido ? config.pesqueiros[pedido] : null;
  if (pqPedido) {
    const marcador = pesqueiros.getLayers().find(m => m.pesqueiro === pedido);
    const local = config.locais[pqPedido.mar ?? pqPedido.terra];
    if (marcador) { mapa.setView(marcador.getLatLng(), 15); marcador.openPopup(); }
    else if (local) mapa.setView([local.latitude, local.longitude], 14);
  }
  const controlo = L.control.layers(bases, sobreposicoes, { collapsed: true }).addTo(mapa);
  L.control.scale({ imperial: false }).addTo(mapa);
  legenda().addTo(mapa);
  // Depois de cada zoom ou deslocação, de ligar ou desligar uma camada e de carregar um levantamento (F0).
  // Vários pedidos seguidos dão uma só passagem, no frame seguinte.
  const gruposDeFormas = [];
  let pedidoRotulos = 0;
  const arrumar = () => {
    cancelAnimationFrame(pedidoRotulos);
    pedidoRotulos = requestAnimationFrame(() => arrumarRotulos(mapa, gruposDeFormas.flatMap(g => g.rotulos())));
  };
  mapa.on("zoomend moveend overlayadd overlayremove", arrumar);
  arrumar();

  const m = config.mares.intervaloEventoMinutos;
  // Próxima preia-mar e baixa-mar: chega a tabela de agora a 3 dias (dois anos na passagem de ano).
  const mares = loadTidesForWindow({ inicio: Date.now() - 86400000, fim: Date.now() + 3 * 86400000,
    minIntervalMinutes: m.minimo, maxIntervalMinutes: m.maximo });
  // Cada levantamento só é pedido quando a sua zona (config: limites) entra no ecrã: os ficheiros
  // somam vários MB e o telemóvel não precisa de todos.
  const situacao = new Map(config.mapa.fundos.map(f => [f.id, "por carregar"]));
  // Linha curta: só as zonas já pedidas (as outras estão nos botões por baixo).
  const mostrarSituacao = eventos => {
    const linhas = config.mapa.fundos.filter(f => situacao.get(f.id) !== "por carregar")
      .map(f => `${esc(f.nome)} ${esc(situacao.get(f.id))}`.trim());
    if (eventos === null) linhas.push("tabela de marés não obtida (sem água por cima nos balões)");
    estado.innerHTML = `Fundo do mar: ${linhas.join(" · ") || "escolha uma zona"}. Critérios provisórios.`;
  };
  mostrarSituacao();
  async function carregar(f) {
    situacao.set(f.id, "a carregar…");
    mostrarSituacao();
    const [r, d] = await Promise.all([mares, lerJson(`./${f.ficheiro}`).catch(erro => ({ erro }))]);
    const eventos = r.ok ? r.data : null;
    const v = d.erro ? null : validarFundos(d);
    if (d.erro || !v.ok) {
      situacao.set(f.id, `não obtido (${d.erro?.message ?? v.erros.slice(0, 3).join("; ")})`);
      mostrarSituacao(eventos);
      return;
    }
    d.aviso = f.aviso;
    const camadas = camadasFundos(d, eventos);
    for (const c of Object.values(camadas)) c.addTo(mapa);
    gruposDeFormas.push(camadas.formas);
    if (d.isobatas.length) controlo.addOverlay(camadas.isobatas, `Linhas de fundo — ${esc(f.nome)}`);
    controlo.addOverlay(camadas.formas, `Fundões e cabeços — ${esc(f.nome)}`);
    controlo.addOverlay(camadas.cobertura, `${estimado(d) ? "Zona com estimativa" : "Zona levantada"} — ${esc(f.nome)}`);
    // o nome do LiDAR já traz o ano
    situacao.set(f.id, estimado(d) ? "estimado" : d.fonte.rotulo ? "" : `COSMO ${mesAno(d.fonte)}`);
    mostrarSituacao(eventos);
    arrumar();
  }
  const verificar = () => {
    const vista = mapa.getBounds();
    for (const f of config.mapa.fundos) {
      if (situacao.get(f.id) === "por carregar" && vista.intersects(L.latLngBounds(f.limites))) carregar(f);
    }
  };
  for (const f of config.mapa.fundos) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "atalho";
    b.textContent = f.nome;
    b.addEventListener("click", () => mapa.fitBounds(L.latLngBounds(f.limites), { padding: [10, 10] }));
    atalhos.append(b);
  }
  mapa.on("moveend", verificar);
  verificar();
}

registarServiceWorker();
iniciar();
