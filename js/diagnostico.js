import { getMarine } from "./fontes/open-meteo-marine.js";
import { getForecast } from "./fontes/open-meteo-forecast.js";
import { loadTidesForWindow } from "./fontes/mares-locais.js";
import { getSunAndMoon } from "./fontes/suncalc.js";
import { getBoia } from "./fontes/ih-boias.js";
import { pontosNecessarios } from "./pontos.js";
import { registarServiceWorker } from "./registo-sw.js";
import { abrirArmazem } from "./armazenamento/indexeddb.js";
import { listarLeituras } from "./armazenamento/leituras.js";

const $ = selector => document.querySelector(selector);
const resultRoot = $("#results");
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({
  "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
}[c]));
const showStatus = result => `<span class="status ${result.ok ? "ok" : "fail"}">${result.ok ? "Obtido" : "Não obtido"}</span>`;
function card(title, result, details = "") {
  return `<article class="card"><h2>${esc(title)}</h2>${showStatus(result)}<p>${esc(result.error ?? (result.aviso ? `Obtido em parte: ${result.aviso}.` : "Pedido concluído."))}</p>${details}</article>`;
}
// Armazenamento neste aparelho (PR 3): leituras guardadas para usar sem rede e espaço usado.
async function cartaoArmazenamento(config) {
  const base = await abrirArmazem();
  if (!base.ok) return card("Armazenamento neste aparelho (IndexedDB)", { ok: false, error: `Não disponível: ${base.erro}. Sem rede não haverá previsão guardada.` });
  try {
    const leituras = await listarLeituras(base.armazem);
    const fmt = iso => new Date(iso).toLocaleString("pt-PT", { timeZone: config.fusoHorario });
    let espaco = "não indicado pelo navegador";
    try {
      const e = await navigator.storage?.estimate?.();
      if (e?.usage !== undefined) espaco = `${(e.usage / 1048576).toFixed(1).replace(".", ",")} MB usados${e.quota ? ` de ${(e.quota / 1048576).toFixed(0)} MB disponíveis` : ""}`;
    } catch { /* sem estimativa */ }
    const texto = leituras.length
      ? `${leituras.length} leitura(s) guardada(s); a mais recente de ${fmt(leituras[0].lidoEm)}, a mais antiga de ${fmt(leituras.at(-1).lidoEm)}. Espaço: ${espaco}.`
      : `Nenhuma leitura guardada. Espaço: ${espaco}.`;
    return `<article class="card"><h2>Armazenamento neste aparelho (IndexedDB)</h2><span class="status ok">Disponível</span><p>${esc(texto)}</p></article>`;
  } finally { await base.armazem.fechar(); }
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
    ["Marés locais — Faro-Olhão", loadTidesForWindow({ inicio: Date.now() - 2 * 86400000,
      fim: Date.now() + 9 * 86400000,
      minIntervalMinutes: config.mares.intervaloEventoMinutos.minimo,
      maxIntervalMinutes: config.mares.intervaloEventoMinutos.maximo })]
  ];
  const boia = config.boias?.faro;
  if (boia) pedidos.push([`Instituto Hidrográfico — ${boia.nome} (${boia.codigo}, observado; ${boia.licenca})`,
    getBoia({ baseUrl: fontes.boiasIhBase, idEstacao: boia.idEstacao, horas: boia.horas })]);
  const tasks = await Promise.all(pedidos.map(([, p]) => p));
  const labels = pedidos.map(([nome]) => nome);
  resultRoot.innerHTML = tasks.map((r, i) => card(labels[i], r,
    r.ok && r.data ? `<details><summary>Ver metadados da resposta</summary><pre>${esc(JSON.stringify({
      fonte:r.source, leitura:r.readAt, ...(r.data.observacoes
        ? { tipo:"observado", medicoes:r.data.observacoes.length,
            ultimaMedicao:r.data.observacoes.length
              ? new Date(r.data.observacoes.at(-1).instante).toLocaleString("pt-PT", { timeZone: config.fusoHorario }) : "sem medições" }
        : { tipo:"previsto", campos:Object.keys(r.data) })
    }, null, 2))}</pre></details>` : "")).join("");
  resultRoot.insertAdjacentHTML("beforeend", await cartaoArmazenamento(config));
  const solar = getSunAndMoon(new Date(), config.locais.faroTerra.latitude, config.locais.faroTerra.longitude);
  resultRoot.insertAdjacentHTML("beforeend", card("Sol e Lua — SunCalc", solar));
  $("#updated").textContent = `Última tentativa: ${new Date().toLocaleString("pt-PT", { timeZone: config.fusoHorario })}`;
  $("#refresh").disabled = false;
}
$("#refresh").addEventListener("click", run);
registarServiceWorker();
run();
