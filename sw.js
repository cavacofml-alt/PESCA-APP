// Mudar a versão sempre que a shell mudar: a activação apaga as caches antigas.
const CACHE = "surfcasting-shell-v5";
const SHELL = [
  "./", "./index.html", "./manifest.webmanifest", "./css/base.css",
  "./js/app.js", "./js/normalizacao.js", "./js/pontos.js",
  "./js/fontes/http.js", "./js/fontes/open-meteo-tempo.js",
  "./js/fontes/open-meteo-marine.js", "./js/fontes/open-meteo-forecast.js",
  "./js/fontes/ipma-mar.js",
  "./js/fontes/mares-locais.js", "./js/fontes/suncalc.js",
  "./js/regras/serie.js", "./js/regras/sectores.js", "./js/regras/potencia.js",
  "./js/regras/componentes.js", "./js/regras/mares.js",
  "./js/regras/limo.js", "./js/regras/molhe.js", "./js/regras/pressao.js", "./js/regras/agua.js",
  "./js/regras/alinhamento.js", "./js/regras/anomalias.js", "./js/regras/chuva.js",
  "./js/regras/notas.js", "./js/regras/analise.js", "./js/regras/periodos.js",
  "./vendor/suncalc.js"
];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)));
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
// *.json (config, marés): rede primeiro; a cópia em cache só serve sem rede.
function redePrimeiro(request) {
  return fetch(request).then(response => guardar(request, response))
    .catch(() => caches.match(request).then(cached => cached || Response.error()));
}
// Shell: cache primeiro.
function cachePrimeiro(request) {
  return caches.match(request).then(cached => cached || fetch(request).then(response => guardar(request, response)));
}
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;
  event.respondWith(url.pathname.endsWith(".json") ? redePrimeiro(event.request) : cachePrimeiro(event.request));
});
