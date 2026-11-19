// Registo do service worker (sw.js), comum aos três ecrãs.
//
// Depois de cada publicação, o sw.js novo instala-se e toma conta da página logo à primeira
// abertura (skipWaiting + clients.claim). Mas a página que já está aberta continua com os módulos
// antigos, enquanto a config.json e os fundos/*.json vêm novos da rede. Foi o que aconteceu a
// 19/11/2026: o código antigo não aceitava a data «2011» da camada LiDAR nova e não a desenhava.
// Por isso, quando o service worker muda, a página recarrega uma vez e fica toda da mesma versão.
// Na primeira instalação (ainda não havia service worker) não se recarrega: a página já é a actual.
export function registarServiceWorker(nav = globalThis.navigator, loc = globalThis.location) {
  if (!nav?.serviceWorker || !loc || loc.protocol === "file:") return false;
  const sw = nav.serviceWorker;
  const havia = Boolean(sw.controller);
  let recarregou = false;
  sw.addEventListener("controllerchange", () => {
    if (!havia || recarregou) return;
    recarregou = true;
    loc.reload();
  });
  sw.register("./sw.js").catch(() => {});
  return true;
}
