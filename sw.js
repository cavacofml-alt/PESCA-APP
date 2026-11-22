// Mudar a versão sempre que a shell mudar: a activação apaga as caches antigas.
// A impressão abaixo (SHA-256 dos ficheiros da SHELL) é conferida por um teste; para actualizar
// a impressão e a versão de uma vez: node ferramentas/versao-sw.mjs
const CACHE = "surfcasting-shell-v40";
// impressão da shell: b15679b5d5bc
const SHELL = [
  "./", "./index.html", "./diagnostico.html", "./mapa.html", "./fontes.html", "./comparador.html", "./pesqueiro.html", "./diario.html", "./estatisticas.html", "./historico.html", "./guia.html", "./manifest.webmanifest", "./css/app.css",
  "./js/app.js", "./js/diagnostico.js", "./js/dados.js", "./js/normalizacao.js", "./js/pontos.js",
  "./js/mapa.js", "./js/fundos.js", "./js/registo-sw.js", "./js/pagina-fontes.js", "./js/carregar.js", "./js/comparador.js", "./js/pesqueiro.js", "./js/diario.js", "./js/estatisticas.js", "./js/historico.js", "./js/guia.js", "./js/historico/validacao.js",
  "./js/diario/saidas.js", "./js/diario/condicoes.js", "./js/diario/copia.js", "./js/diario/estatisticas.js",
  "./js/armazenamento/esquema.js", "./js/armazenamento/armazem-memoria.js", "./js/armazenamento/indexeddb.js", "./js/armazenamento/leituras.js",
  "./js/ui/formato.js", "./js/ui/explicacao.js", "./js/ui/inicio.js", "./js/ui/horario.js", "./js/ui/fontes.js", "./js/ui/comparador.js", "./js/ui/pesqueiro.js", "./js/ui/diario.js", "./js/ui/estatisticas.js", "./js/ui/historico.js", "./js/ui/guia.js",
  "./assets/fotos/ria.jpg", "./assets/fotos/praia_faro.jpg", "./assets/fotos/ancao.jpg",
  "./assets/fotos/almargem.jpg", "./assets/fotos/molhe_quarteira.jpg",
  "./js/fontes/http.js", "./js/fontes/open-meteo-tempo.js",
  "./js/fontes/open-meteo-marine.js", "./js/fontes/open-meteo-forecast.js",
  "./js/fontes/ih-boias.js", "./js/fontes/fundo-tipico.js",
  "./js/fontes/mares-locais.js", "./js/fontes/suncalc.js",
  "./js/regras/serie.js", "./js/regras/sectores.js", "./js/regras/potencia.js",
  "./js/regras/componentes.js", "./js/regras/mares.js",
  "./js/regras/limo.js", "./js/regras/molhe.js",
  "./js/regras/sul.js", "./js/regras/horas.js", "./js/regras/pressao.js", "./js/regras/agua.js",
  "./js/regras/alinhamento.js", "./js/regras/anomalias.js", "./js/regras/chuva.js",
  "./js/regras/notas.js", "./js/regras/analise.js", "./js/regras/periodos.js",
  "./vendor/suncalc.js", "./vendor/leaflet/leaflet.js", "./vendor/leaflet/leaflet.css",
  "./vendor/leaflet/images/layers.png", "./vendor/leaflet/images/layers-2x.png"
];
// Dados de que a app precisa para abrir sem rede (revisão de 22/11/2026, D1): guardam-se já na
// instalação, para que a primeira visita com rede deixe a app pronta a abrir sem ela. Durante o uso
// continuam a vir primeiro da rede (redePrimeiro), e a cópia é actualizada a cada leitura.
// Não entram na impressão da shell (mudam com a configuração e as tabelas de marés). Um teste confere
// que estão aqui o config.json, o fundo típico e todas as tabelas de mares/.
const DADOS = ["./config.json", "./mares/2026.json", "./mares/2027.json", "./fundos/tipico.json"];
// Instalação tudo ou nada: a shell e os dados entram juntos (cache.addAll guarda tudo ou nada).
// Se algum ficheiro falhar, a instalação falha explicitamente: este service worker não fica activo,
// o anterior (se houver) continua a servir, e o browser volta a tentar na visita seguinte. Nunca
// fica uma versão activa sem a configuração ou as marés. A cache criada por esta instalação é
// apagada; uma cache com o mesmo nome que já existia (em uso pelo service worker activo) fica.
self.addEventListener("install", event => {
  event.waitUntil(caches.has(CACHE).then(existia => caches.open(CACHE)
    .then(cache => cache.addAll([...SHELL, ...DADOS]))
    .catch(erro => (existia ? Promise.resolve() : caches.delete(CACHE)).then(() => { throw erro; }))));
  self.skipWaiting();
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
// Devolve a resposta só depois de a cópia estar gravada, para ficar disponível sem rede
// logo a seguir. Uma falha a gravar não impede a resposta.
function guardar(request, response) {
  if (!response.ok) return Promise.resolve(response);
  const copy = response.clone();
  return caches.open(CACHE).then(cache => cache.put(request, copy)).catch(() => {}).then(() => response);
}
// *.json (config, marés, fundos do mar): rede primeiro; a cópia em cache só serve sem rede.
function redePrimeiro(request) {
  return fetch(request).then(response => guardar(request, response))
    .catch(() => caches.match(request).then(cached => cached || Response.error()));
}
// O Cloudflare redirecciona /x.html para /x e /index.html para /, e o cache.addAll guarda a
// resposta final marcada como redireccionada. O Chrome recusa servir uma resposta
// redireccionada a uma navegação («Não é possível aceder ao site»): serve-se uma cópia limpa,
// com o mesmo corpo, estado e cabeçalhos.
function semRedireccao(response) {
  if (!response || !response.redirected) return response;
  return response.blob().then(corpo => new Response(corpo,
    { status: response.status, statusText: response.statusText, headers: response.headers }));
}
// Shell: cache primeiro. Só nas navegações (páginas HTML) a procura ignora os parâmetros do endereço
// (revisão de 22/11/2026, D2): pesqueiro.html?id=…, comparador.html?dia=… e mapa.html?pesqueiro=… são
// a mesma página, que lê os parâmetros no browser. Os outros pedidos (scripts, estilos, imagens) e os
// *.json (redePrimeiro) continuam a procurar-se pelo endereço exacto, porque o conteúdo pode depender
// dos parâmetros.
function cachePrimeiro(request) {
  const opcoes = request.mode === "navigate" ? { ignoreSearch: true } : undefined;
  return caches.match(request, opcoes).then(cached => (cached ? semRedireccao(cached)
    : fetch(request).then(response => guardar(request, response))));
}
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;
  event.respondWith(url.pathname.endsWith(".json") ? redePrimeiro(event.request) : cachePrimeiro(event.request));
});
