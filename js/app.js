import { getMarine } from "./fontes/open-meteo-marine.js";
import { getForecast } from "./fontes/open-meteo-forecast.js";
import { getSeaForecastDay } from "./fontes/ipma-mar.js";
import { loadLocalTides } from "./fontes/mares-locais.js";
import { getSunAndMoon } from "./fontes/suncalc.js";

const $ = selector => document.querySelector(selector);
const resultRoot = $("#results");
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({
  "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
}[c]));
const showStatus = result => `<span class="status ${result.ok ? "ok" : "fail"}">${result.ok ? "Obtido" : "Não obtido"}</span>`;
function card(title, result, details = "") {
  return `<article class="card"><h2>${esc(title)}</h2>${showStatus(result)}<p>${esc(result.error ?? "Pedido concluído.")}</p>${details}</article>`;
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
  const tasks = await Promise.all([
    getMarine({ ...locais.faroMar, baseUrl: fontes.marineBase }),
    getForecast({ ...locais.faroTerra, baseUrl: fontes.forecastBase }),
    getMarine({ ...locais.quarteiraMar, baseUrl: fontes.marineBase }),
    getForecast({ ...locais.quarteiraTerra, baseUrl: fontes.forecastBase }),
    getSeaForecastDay(0, { baseUrl: fontes.ipmaSeaForecastBase }),
    getSeaForecastDay(1, { baseUrl: fontes.ipmaSeaForecastBase }),
    getSeaForecastDay(2, { baseUrl: fontes.ipmaSeaForecastBase }),
    loadLocalTides({ url: "./mares/2026.json",
      minIntervalMinutes: config.mares.intervaloEventoMinutos.minimo,
      maxIntervalMinutes: config.mares.intervaloEventoMinutos.maximo })
  ]);
  const labels = ["Open-Meteo Marine — Faro", "Open-Meteo Forecast — Faro",
    "Open-Meteo Marine — Quarteira", "Open-Meteo Forecast — Quarteira",
    "IPMA — estado do mar dia 0", "IPMA — estado do mar dia 1", "IPMA — estado do mar dia 2",
    "Marés locais — Faro-Olhão"];
  resultRoot.innerHTML = tasks.map((r, i) => card(labels[i], r,
    r.ok && r.data ? `<details><summary>Ver metadados da resposta</summary><pre>${esc(JSON.stringify({
      fonte:r.source, leitura:r.readAt, tipo:"previsto", campos:Object.keys(r.data)
    }, null, 2))}</pre></details>` : "")).join("");
  const solar = getSunAndMoon(new Date(), config.locais.faroTerra.latitude, config.locais.faroTerra.longitude);
  resultRoot.insertAdjacentHTML("beforeend", card("Sol e Lua — SunCalc", solar));
  $("#updated").textContent = `Última tentativa: ${new Date().toLocaleString("pt-PT", { timeZone: config.fusoHorario })}`;
  $("#refresh").disabled = false;
}
$("#refresh").addEventListener("click", run);
if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}
run();
