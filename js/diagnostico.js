import { getMarine } from "./fontes/open-meteo-marine.js";
import { getForecast } from "./fontes/open-meteo-forecast.js";
import { getSeaForecastDay } from "./fontes/ipma-mar.js";
import { loadLocalTides } from "./fontes/mares-locais.js";
import { getSunAndMoon } from "./fontes/suncalc.js";
import { pontosNecessarios } from "./pontos.js";

const $ = selector => document.querySelector(selector);
const resultRoot = $("#results");
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({
  "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
}[c]));
const showStatus = result => `<span class="status ${result.ok ? "ok" : "fail"}">${result.ok ? "Obtido" : "Não obtido"}</span>`;
function card(title, result, details = "") {
  return `<article class="card"><h2>${esc(title)}</h2>${showStatus(result)}<p>${esc(result.error ?? "Pedido concluído.")}</p>${details}</article>`;
}
// Créditos das fotografias dos cartões (exigidos pelas licenças CC BY e CC BY-SA).
function creditosFotos(config) {
  const linhas = Object.values(config.pesqueiros ?? {}).filter(pq => pq.foto).map(pq =>
    `<li>${esc(pq.nomeCurto ?? pq.nome)}: <a href="${esc(pq.foto.pagina)}" target="_blank" rel="noopener">${esc(pq.foto.autor)}</a>, ${esc(pq.foto.licenca)} (Wikimedia Commons; recortada e reduzida)</li>`);
  return `<article class="card" id="creditos"><h2>Créditos das fotografias</h2><ul>${linhas.join("")}</ul></article>`;
}
async function run() {
  $("#refresh").disabled = true;
  $("#updated").textContent = "A consultar fontes…";
  const cfgResponse = await fetch("./config.json").catch(() => null);
  if (!cfgResponse?.ok) {
    resultRoot.innerHTML = card("Configuração", { ok:false, error:"config.json não obtido" });
    $("#refresh").disabled = false;
    return;
  }
  const config = await cfgResponse.json();
  const { fontes, locais } = config;
  const pontos = pontosNecessarios(config);
  const pedidos = [
    ...pontos.mar.map(k => [`Open-Meteo Marine — ${k}`, getMarine({ ...locais[k], baseUrl: fontes.marineBase })]),
    ...pontos.terra.map(k => [`Open-Meteo Forecast — ${k}`, getForecast({ ...locais[k], baseUrl: fontes.forecastBase })]),
    ...[0, 1, 2].map(d => [`IPMA — estado do mar dia ${d}`, getSeaForecastDay(d, { baseUrl: fontes.ipmaSeaForecastBase })]),
    ["Marés locais — Faro-Olhão", loadLocalTides({ url: "./mares/2026.json",
      minIntervalMinutes: config.mares.intervaloEventoMinutos.minimo,
      maxIntervalMinutes: config.mares.intervaloEventoMinutos.maximo })]
  ];
  const tasks = await Promise.all(pedidos.map(([, p]) => p));
  const labels = pedidos.map(([nome]) => nome);
  resultRoot.innerHTML = tasks.map((r, i) => card(labels[i], r,
    r.ok && r.data ? `<details><summary>Ver metadados da resposta</summary><pre>${esc(JSON.stringify({
      fonte:r.source, leitura:r.readAt, tipo:"previsto", campos:Object.keys(r.data)
    }, null, 2))}</pre></details>` : "")).join("");
  const solar = getSunAndMoon(new Date(), config.locais.faroTerra.latitude, config.locais.faroTerra.longitude);
  resultRoot.insertAdjacentHTML("beforeend", card("Sol e Lua — SunCalc", solar));
  resultRoot.insertAdjacentHTML("beforeend", creditosFotos(config));
  $("#updated").textContent = `Última tentativa: ${new Date().toLocaleString("pt-PT", { timeZone: config.fusoHorario })}`;
  $("#refresh").disabled = false;
}
$("#refresh").addEventListener("click", run);
if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}
run();
