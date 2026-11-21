// Interface do diário (plano de evolução, PR 5, 20/11/2026): lista das saídas, formulário e resumo das
// condições guardadas com cada saída. Funções puras (HTML com texto escapado); o controlador está em
// js/diario.js. Sem fotografias.
import { esc, hora, num, dataHora, rumo, NOME_ESPECIE, NOME_MARE } from "./formato.js";
import { utcToLisbon } from "../normalizacao.js";
import { ESPECIES_DIARIO, RESULTADOS, instantesDaSaida, utcParaLisboa, ESQUEMA_SAIDA } from "../diario/saidas.js";

const NOME = { ...NOME_ESPECIE, outra: "Outra" };
const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

export function dataLonga(iso) {
  const l = utcToLisbon(new Date(Date.parse(iso)));
  if (!l) return "—";
  const [y, m, d] = l.slice(0, 10).split("-").map(Number);
  return `${DIAS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}, ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
}

const nomeEspecie = (e, outra) => (e === "outra" ? (outra?.trim() || "outra") : NOME[e] ?? e);

// «3 capturas: 2 robalos, 1 sargo» — a quantidade é a soma das capturas registadas.
export function textoResultado(s) {
  if (s.resultado === "sem capturas") return "sem capturas";
  const porEspecie = new Map();
  for (const c of s.capturas) {
    const k = nomeEspecie(c.especie, c.outra).toLowerCase();
    porEspecie.set(k, (porEspecie.get(k) ?? 0) + c.quantidade);
  }
  const total = [...porEspecie.values()].reduce((a, b) => a + b, 0);
  return `${total} ${total === 1 ? "captura" : "capturas"}: ${[...porEspecie].map(([k, n]) => `${n} ${k}`).join(", ")}`;
}

// ---------- Formulário ----------

// Lê os campos do formulário (objecto { nome: valor } de um FormData) e devolve a saída, ou os erros
// de leitura. A validação completa é validarSaida (js/diario/saidas.js).
export function lerFormulario(campos, { id, agora = new Date().toISOString(), anterior = null } = {}) {
  const erros = [];
  const t = instantesDaSaida({ dia: campos.dia, horaInicio: campos.horaInicio, horaFim: campos.horaFim || null });
  if (t.erro) erros.push(t.erro);
  const especiesAlvo = ESPECIES_DIARIO.filter(e => campos[`alvo-${e}`] === "on" || campos[`alvo-${e}`] === true);
  const indices = Object.keys(campos).map(k => k.match(/^cap-especie-(\d+)$/)?.[1]).filter(Boolean).map(Number).sort((a, b) => a - b);
  const capturas = indices.map(i => {
    const tam = String(campos[`cap-tamanho-${i}`] ?? "").trim().replace(",", ".");
    const qtd = String(campos[`cap-quantidade-${i}`] ?? "").trim();
    return {
      especie: campos[`cap-especie-${i}`],
      outra: campos[`cap-especie-${i}`] === "outra" ? String(campos[`cap-outra-${i}`] ?? "").trim() : null,
      quantidade: /^\d+$/.test(qtd) ? Number(qtd) : NaN,
      tamanhoCm: tam === "" ? null : Number(tam),
      observacoes: String(campos[`cap-obs-${i}`] ?? "").trim()
    };
  });
  const saida = {
    id, esquema: ESQUEMA_SAIDA, pesqueiro: campos.pesqueiro ?? "",
    inicio: t.inicio ?? null, fim: t.fim ?? null,
    especiesAlvo, outraAlvo: especiesAlvo.includes("outra") ? String(campos.outraAlvo ?? "").trim() : null,
    resultado: campos.resultado ?? null,
    capturas: campos.resultado === "sem capturas" ? [] : capturas,
    observacoes: String(campos.observacoes ?? "").trim(),
    criadoEm: anterior?.criadoEm ?? agora, alteradoEm: agora,
    condicoesId: anterior?.condicoesId ?? null
  };
  return { saida, erros, avisos: t.avisos ?? [] };
}

function linhaCaptura(i, c = {}) {
  return `<fieldset class="captura" data-i="${i}"><legend>Captura ${i + 1}</legend>
    <label>Espécie <select name="cap-especie-${i}">${ESPECIES_DIARIO.map(e => `<option value="${e}"${c.especie === e ? " selected" : ""}>${esc(NOME[e])}</option>`).join("")}</select></label>
    <label class="so-outra">Qual <input name="cap-outra-${i}" value="${esc(c.outra ?? "")}" maxlength="60" autocomplete="off"></label>
    <label>Quantidade <input name="cap-quantidade-${i}" type="number" min="1" max="999" step="1" inputmode="numeric" value="${esc(c.quantidade ?? 1)}" required></label>
    <label>Tamanho (cm) <input name="cap-tamanho-${i}" type="text" inputmode="decimal" value="${esc(c.tamanhoCm ?? "")}" placeholder="opcional"></label>
    <label class="largo">Observações <input name="cap-obs-${i}" value="${esc(c.observacoes ?? "")}" maxlength="300"></label>
    <button type="button" class="remover-captura" data-i="${i}">Retirar</button>
  </fieldset>`;
}
export { linhaCaptura };

export function formularioSaida({ config, saida = null, erros = [], avisos = [], hoje }) {
  const ini = saida?.inicio ? utcParaLisboa(saida.inicio) : null;
  const fim = saida?.fim ? utcParaLisboa(saida.fim) : null;
  const alvo = new Set(saida?.especiesAlvo ?? []);
  const capturas = saida?.capturas?.length ? saida.capturas : [{}];
  const resultado = saida?.resultado ?? "com capturas";
  return `<form id="form-saida" class="form-saida" novalidate>
    <h2>${saida?.id ? "Editar saída" : "Nova saída"}</h2>
    ${erros.length ? `<ul class="erros" role="alert">${erros.map(e => `<li>${esc(e)}</li>`).join("")}</ul>` : ""}
    ${avisos.length ? `<ul class="avisos-form">${avisos.map(e => `<li>${esc(e)}</li>`).join("")}</ul>` : ""}
    <label>Pesqueiro <select name="pesqueiro" required>${Object.entries(config.pesqueiros).map(([id, pq]) =>
      `<option value="${esc(id)}"${saida?.pesqueiro === id ? " selected" : ""}>${esc(pq.nome)}</option>`).join("")}</select></label>
    <div class="linha-campos">
      <label>Dia <input name="dia" type="date" value="${esc(ini?.dia ?? hoje)}" required></label>
      <label>Início <input name="horaInicio" type="time" value="${esc(ini?.hora ?? "")}" required></label>
      <label>Fim <input name="horaFim" type="time" value="${esc(fim?.hora ?? "")}"></label>
    </div>
    <p class="ajuda">Hora de Portugal continental. Se o fim for antes do início, a saída acaba no dia seguinte.</p>
    <fieldset class="alvo"><legend>Espécies</legend>
      ${ESPECIES_DIARIO.map(e => `<label class="opcao"><input type="checkbox" name="alvo-${e}"${alvo.has(e) || (!saida && e === "robalo") ? " checked" : ""}> ${esc(NOME[e])}</label>`).join("")}
      <label class="so-outra-alvo">Qual <input name="outraAlvo" value="${esc(saida?.outraAlvo ?? "")}" maxlength="60" autocomplete="off"></label>
    </fieldset>
    <fieldset class="resultado"><legend>Resultado</legend>
      ${RESULTADOS.map(r => `<label class="opcao"><input type="radio" name="resultado" value="${r}"${resultado === r ? " checked" : ""}> ${r === "com capturas" ? "Com capturas" : "Sem capturas"}</label>`).join("")}
    </fieldset>
    <div class="capturas"${resultado === "sem capturas" ? " hidden" : ""}>
      ${capturas.map((c, i) => linhaCaptura(i, c)).join("")}
      <button type="button" id="mais-captura">Acrescentar captura</button>
    </div>
    <label class="largo">Observações da saída <textarea name="observacoes" rows="3" maxlength="2000">${esc(saida?.observacoes ?? "")}</textarea></label>
    <div class="botoes-form"><button type="submit" class="principal">Guardar</button><button type="button" id="cancelar">Cancelar</button></div>
  </form>`;
}

// ---------- Condições guardadas ----------

const NOME_PER = { madrugada: "madrugada", "manhã": "manhã", tarde: "tarde", noite: "noite" };
const notaCurta = n => (!n ? "—" : n.estado === "ok" ? `${n.nota}${n.completa ? "" : " (incompleta)"}` : n.estado);

export function resumoCondicoes(c, saida) {
  if (!c) return `<p class="motivo">Condições: não associadas (saída anterior a esta versão ou registo importado sem elas).</p>`;
  if (!c.disponivel) return `<p class="motivo">Condições: não associadas — ${esc(c.motivo)}.</p>`;
  const l = c.leitura;
  const quando = l.relacao === "antes"
    ? `lida ${esc(dataHora(Date.parse(l.lidoEm)))}, ${num(Math.abs(l.horasEntreLeituraEInicio), 1)} h antes do início`
    : `lida ${esc(dataHora(Date.parse(l.lidoEm)))}, depois do início (para horas já passadas, valores de previsão arquivada)`;
  const especies = saida.especiesAlvo.filter(e => e !== "outra");
  const notas = c.periodos.map(p => `${NOME_PER[p.nome] ?? p.nome}${c.dias.length > 1 ? ` (${p.dia.slice(8, 10)}/${p.dia.slice(5, 7)})` : ""}: ${
    Object.entries(p.notas).filter(([e]) => !especies.length || especies.includes(e)).map(([e, n]) => `${(NOME_ESPECIE[e] ?? e).toLowerCase()} ${notaCurta(n)}`).join(", ") || "sem nota para estas espécies"}`);
  const mares = c.dias.map(d => `${d.amplitude === null ? "amplitude não obtida" : `${num(d.amplitude, 1)} m (${d.classe})`}${d.repontos.length ? ` · ${d.repontos.map(r => `${NOME_MARE[r.tipo]} ${hora(r.instante)}`).join(", ")}` : ""}`);
  const linhas = c.horas.map(h => `<tr><td>${hora(h.instante)}</td><td>${num(h.hs, 1)}</td><td>${num(h.periodo, 1)}</td><td>${num(h.potencia, 2)}</td><td>${num(h.vento, 0)}/${num(h.rajada, 0)} ${esc(rumo(h.direcaoVento))}</td><td>${num(h.pressao, 0)}</td><td>${num(h.agua, 1)}</td></tr>`).join("");
  return `<div class="condicoes">
    <p><b>Condições guardadas</b> · previsão (Open-Meteo) ${quando}. Não são medições no pesqueiro. Notas das regras da app, provisórias.</p>
    <p><span class="rot">Notas</span> ${esc(notas.join(" · ") || "sem períodos")}</p>
    <p><span class="rot">Maré</span> ${esc(mares.join(" | "))}</p>
    ${c.boia ? `<p><span class="rot">Boia de Faro</span> ${esc(`observado ao largo às ${hora(c.boia.instante)}: onda ${num(c.boia.hm0, 2)} m · período médio ${num(c.boia.tm02, 1)} s · água ${num(c.boia.agua, 1)} °C`)}</p>` : ""}
    <div class="rolar"><table class="horas-saida"><thead><tr><th>Hora</th><th>Onda (m)</th><th>Período (s)</th><th>P (kW/m)</th><th>Vento/rajada (nós)</th><th>Pressão</th><th>Água (°C)</th></tr></thead><tbody>${linhas}</tbody></table></div>
  </div>`;
}

// ---------- Lista ----------

function itemSaida(s, config, condicoes) {
  const pq = config.pesqueiros[s.pesqueiro];
  const ini = utcParaLisboa(s.inicio);
  const fim = s.fim ? utcParaLisboa(s.fim) : null;
  const horas = `${ini?.hora ?? "—"}${fim ? `–${fim.hora}${fim.dia !== ini?.dia ? " (dia seguinte)" : ""}` : ""}`;
  const alvo = s.especiesAlvo.map(e => nomeEspecie(e, s.outraAlvo)).join(", ");
  return `<li class="saida" id="saida-${esc(s.id)}">
    <details>
      <summary><span class="s-data">${esc(dataLonga(s.inicio))} · ${esc(horas)}</span>
        <span class="s-pq">${esc(pq?.nome ?? `${s.pesqueiro} (fora da configuração)`)}</span>
        <span class="s-res ${s.resultado === "sem capturas" ? "sem" : "com"}">${esc(textoResultado(s))}</span></summary>
      <p><span class="rot">Espécies</span> ${esc(alvo)}</p>
      ${s.capturas.length ? `<table class="tabela-capturas"><thead><tr><th>Espécie</th><th>Qtd.</th><th>Tamanho</th><th>Observações</th></tr></thead><tbody>${
        s.capturas.map(c => `<tr><td>${esc(nomeEspecie(c.especie, c.outra))}</td><td>${c.quantidade}</td><td>${c.tamanhoCm === null || c.tamanhoCm === undefined ? "—" : `${esc(num(c.tamanhoCm, c.tamanhoCm % 1 ? 1 : 0))} cm`}</td><td>${esc(c.observacoes ?? "")}</td></tr>`).join("")}</tbody></table>` : ""}
      ${s.observacoes ? `<p class="obs-saida">${esc(s.observacoes)}</p>` : ""}
      ${resumoCondicoes(condicoes, s)}
      <div class="botoes-saida"><button type="button" class="editar" data-id="${esc(s.id)}">Editar</button><button type="button" class="apagar" data-id="${esc(s.id)}">Apagar</button>
        ${pq ? `<a href="./pesqueiro.html?id=${encodeURIComponent(s.pesqueiro)}">Página do pesqueiro ›</a>` : ""}</div>
    </details>
  </li>`;
}

// estado: { config, armazem: { ok, erro }, saidas, invalidas, condicoes (Map saidaId → c), lembrete, ultimaCopia, mensagem }
export function renderDiario(estado) {
  const { config, saidas = [], invalidas = 0, condicoes = new Map(), lembrete = false, ultimaCopia = null, mensagem = null } = estado;
  const semBase = estado.armazem && !estado.armazem.ok;
  return `<header class="topo"><div><h1>Diário</h1><p class="lido">Saídas de pesca · registos só neste aparelho</p></div></header>
    ${semBase ? `<section class="aviso-origem indisponivel" role="alert"><b>O diário não funciona neste aparelho.</b> O navegador não deixa guardar dados (${esc(estado.armazem.erro)}).</section>` : ""}
    ${lembrete ? `<section class="aviso-origem arquivo" role="status"><b>Cópia de segurança.</b> Os registos só existem neste aparelho. ${ultimaCopia ? `Última cópia: ${esc(dataHora(Date.parse(ultimaCopia)))}.` : "Ainda não foi feita nenhuma cópia."} Use «Exportar cópia» e guarde o ficheiro noutro sítio.</section>` : ""}
    ${mensagem ? `<p class="mensagem ${esc(mensagem.tipo ?? "")}" role="status">${esc(mensagem.texto)}</p>` : ""}
    <div class="accoes-diario">
      <button type="button" id="nova-saida" class="principal"${semBase ? " disabled" : ""}>Nova saída</button>
      <button type="button" id="exportar"${semBase || !saidas.length ? " disabled" : ""}>Exportar cópia</button>
      <label class="botao${semBase ? " desactivado" : ""}">Importar cópia<input type="file" id="importar" accept="application/json,.json" hidden${semBase ? " disabled" : ""}></label>
      <a class="botao" href="./estatisticas.html">Estatísticas ›</a>
    </div>
    ${invalidas ? `<p class="falha">${invalidas} registo(s) com formato inválido não aparecem.</p>` : ""}
    ${saidas.length ? `<ol class="saidas">${saidas.map(s => itemSaida(s, config, condicoes.get(s.id))).join("")}</ol>`
      : `<p class="motivo vazio">Ainda não há saídas registadas.</p>`}
    <p class="legenda">${saidas.length} saída(s). Ao guardar, a app junta as condições da previsão guardada neste aparelho para as horas da saída, quando existe. Sem fotografias. Os registos não mudam as regras nem os limiares.</p>`;
}
