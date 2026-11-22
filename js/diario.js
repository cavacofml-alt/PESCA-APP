// Ecrã «Diário» (plano de evolução, PR 5): saídas de pesca guardadas só neste aparelho (IndexedDB).
// Funciona sem rede: não precisa de nenhuma fonte externa (as marés vêm dos ficheiros da app).
import { abrirArmazem } from "./armazenamento/indexeddb.js";
import { listarSaidas, obterSaida, guardarSaida, apagarSaida, validarSaida, novoId } from "./diario/saidas.js";
import { associarCondicoes } from "./diario/condicoes.js";
import { exportarCopia, importarCopia, registarCopia, precisaLembrete, validarCopia, nomeFicheiro, CHAVE_ULTIMA_COPIA } from "./diario/copia.js";
import { renderDiario, formularioSaida, lerFormulario, linhaCaptura } from "./ui/diario.js";
import { loadTidesForWindow } from "./fontes/mares-locais.js";
import { solDoDia } from "./dados.js";
import { lisbonDate } from "./normalizacao.js";
import { esc } from "./ui/formato.js";
import { registarServiceWorker } from "./registo-sw.js";

const raiz = document.querySelector("#app");
const dialogo = document.querySelector("#dialogo-saida");
let config = null;
let base = null;
let mensagem = null;

async function desenhar() {
  let estado = { config, armazem: base, mensagem };
  if (base.ok) {
    const { saidas, invalidas } = await listarSaidas(base.armazem);
    const condicoes = new Map((await base.armazem.listar("condicoes")).map(c => [c.saidaId, c]));
    const ultimaCopia = (await base.armazem.obter("meta", CHAVE_ULTIMA_COPIA))?.valor ?? null;
    const lembrete = precisaLembrete({ numeroSaidas: saidas.length, ultimaCopia, dias: config.persistencia?.lembreteCopiaSegurancaDias ?? 30 });
    estado = { ...estado, saidas, invalidas, condicoes, ultimaCopia, lembrete };
  }
  raiz.innerHTML = renderDiario(estado);
  raiz.querySelector("#nova-saida")?.addEventListener("click", () => abrirFormulario(null));
  raiz.querySelector("#exportar")?.addEventListener("click", exportar);
  raiz.querySelector("#importar")?.addEventListener("change", importar);
  for (const b of raiz.querySelectorAll(".editar")) b.addEventListener("click", async () => abrirFormulario(await obterSaida(base.armazem, b.dataset.id)));
  for (const b of raiz.querySelectorAll(".apagar")) b.addEventListener("click", () => apagar(b.dataset.id));
}

function avisar(texto, tipo = "ok") { mensagem = { texto, tipo }; }

function ligarFormulario(form, anterior) {
  const capturas = form.querySelector(".capturas");
  const mostrarOutra = () => {
    for (const fs of form.querySelectorAll(".captura")) fs.querySelector(".so-outra").hidden = fs.querySelector("select").value !== "outra";
    form.querySelector(".so-outra-alvo").hidden = !form.querySelector("[name=alvo-outra]").checked;
  };
  form.addEventListener("change", ev => {
    if (ev.target.name === "resultado") capturas.hidden = ev.target.value === "sem capturas";
    mostrarOutra();
  });
  form.querySelector("#mais-captura").addEventListener("click", () => {
    const i = Math.max(-1, ...[...form.querySelectorAll(".captura")].map(f => Number(f.dataset.i))) + 1;
    form.querySelector("#mais-captura").insertAdjacentHTML("beforebegin", linhaCaptura(i));
    mostrarOutra();
  });
  capturas.addEventListener("click", ev => {
    if (ev.target.classList.contains("remover-captura") && form.querySelectorAll(".captura").length > 1) ev.target.closest(".captura").remove();
  });
  form.querySelector("#cancelar").addEventListener("click", () => dialogo.close());
  form.addEventListener("submit", ev => { ev.preventDefault(); guardar(form, anterior); });
  mostrarOutra();
}

function abrirFormulario(saida, erros = [], avisos = []) {
  dialogo.innerHTML = formularioSaida({ config, saida, erros, avisos, hoje: lisbonDate(new Date()) });
  ligarFormulario(dialogo.querySelector("form"), saida);
  if (!dialogo.open) dialogo.showModal();
}

// Marés (ficheiros da app) e Sol para o dia da saída: para o motor calcular as notas dessa altura.
async function maresESol(saida) {
  const ini = Date.parse(saida.inicio);
  const fim = saida.fim ? Date.parse(saida.fim) : ini + 3600000;
  const mares = await loadTidesForWindow({ inicio: ini - 2 * 86400000, fim: fim + 2 * 86400000,
    minIntervalMinutes: config.mares.intervaloEventoMinutos.minimo, maxIntervalMinutes: config.mares.intervaloEventoMinutos.maximo });
  return { mares: mares.ok ? mares.data : null, sol: globalThis.SunCalc ? solDoDia(globalThis.SunCalc, config) : null };
}

async function guardar(form, anterior) {
  const campos = Object.fromEntries(new FormData(form).entries());
  const { saida, erros, avisos } = lerFormulario(campos, { id: anterior?.id ?? novoId("s"), anterior });
  const v = validarSaida(saida, { pesqueirosConhecidos: Object.keys(config.pesqueiros) });
  if (erros.length || !v.ok) { abrirFormulario({ ...anterior, ...saida }, [...erros, ...v.erros], avisos); return; }
  // As condições recalculam-se quando a saída é nova ou mudou de pesqueiro ou de horas.
  const mudou = !anterior || anterior.pesqueiro !== saida.pesqueiro || anterior.inicio !== saida.inicio || anterior.fim !== saida.fim;
  let condicoes = null;
  if (mudou) condicoes = await associarCondicoes(base.armazem, saida, { config, ...(await maresESol(saida)) });
  const r = await guardarSaida(base.armazem, saida, condicoes, { pesqueirosConhecidos: Object.keys(config.pesqueiros) });
  if (!r.ok) { abrirFormulario({ ...anterior, ...saida }, r.erros, avisos); return; }
  dialogo.close();
  avisar(`Saída guardada.${condicoes ? (condicoes.disponivel ? " Condições da previsão associadas." : ` Sem condições associadas: ${condicoes.motivo}.`) : ""}${avisos.length ? ` (${avisos.join("; ")})` : ""}`);
  await desenhar();
}

async function apagar(id) {
  if (!confirm("Apagar esta saída e as condições guardadas com ela? Não se pode desfazer.")) return;
  const r = await apagarSaida(base.armazem, id);
  avisar(r.ok ? "Saída apagada." : `Não foi possível apagar: ${r.erros.join("; ")}`, r.ok ? "ok" : "erro");
  await desenhar();
}

async function exportar() {
  const agora = new Date();
  const { texto, copia } = await exportarCopia(base.armazem, agora.toISOString());
  const url = URL.createObjectURL(new Blob([texto], { type: "application/json" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: nomeFicheiro(agora) });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  await registarCopia(base.armazem, agora.toISOString());
  avisar(`Cópia exportada: ${copia.saidas.length} saída(s). Guarde o ficheiro fora do telemóvel.`);
  await desenhar();
}

async function importar(ev) {
  const ficheiro = ev.target.files?.[0];
  if (!ficheiro) return;
  const texto = await ficheiro.text();
  // Os nomes dos períodos são os do config, os mesmos com que condicoes.js calcula as condições.
  const opcoes = { pesqueirosConhecidos: Object.keys(config.pesqueiros),
    ...(Array.isArray(config.periodos) ? { nomesPeriodos: config.periodos.map(p => p.nome) } : {}) };
  const v = validarCopia(texto, opcoes);
  if (!v.ok) {
    avisar(`Ficheiro recusado, nada foi importado: ${v.erros.slice(0, 5).join("; ")}${v.erros.length > 5 ? ` (e mais ${v.erros.length - 5})` : ""}`, "erro");
  } else if (confirm(`Importar ${v.saidas.length} saída(s) de «${ficheiro.name}»? As que já existem neste aparelho não são alteradas.`)) {
    const r = await importarCopia(base.armazem, texto, opcoes);
    avisar(r.ok ? `Importação: ${r.novas} nova(s), ${r.iguais} já existia(m)${r.conflitos.length ? `, ${r.conflitos.length} em conflito (ficou o registo do aparelho)` : ""}.${r.avisos.length ? ` Avisos: ${r.avisos.join("; ")}.` : ""}`
      : `Nada foi importado: ${r.erros.join("; ")}`, r.ok ? "ok" : "erro");
  }
  await desenhar();
}

async function iniciar() {
  try {
    const r = await fetch("./config.json");
    if (!r.ok) throw new Error(`config.json não obtido (HTTP ${r.status})`);
    config = await r.json();
    base = await abrirArmazem();
    await desenhar();
  } catch (erro) {
    raiz.innerHTML = `<header class="topo"><div><h1>Diário</h1><p class="lido">Erro: ${esc(erro.message ?? erro)}</p></div></header>`;
  }
}

registarServiceWorker();
iniciar();
