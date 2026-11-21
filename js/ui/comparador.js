// Comparador dos pesqueiros (plano de evolução, PR 2, 20/11/2026): para a espécie, o dia e o período
// escolhidos, põe lado a lado as notas que o motor (js/regras/) já calculou, com o que as explica.
// Não calcula notas nem cria outra classificação: a ordem «por nota» usa os critérios de «Onde e
// quando» (nota; alinhamento no período; nota da outra espécie; período mais cedo; ordem dos
// pesqueiros) e a ordem por omissão é a dos pesqueiros (nascente → poente), a do motor.
// Valores em falta ficam «n.d.» ou «?», nunca zero; uma nota incompleta nunca aparece como definitiva.
// Funções puras: devolvem dados ou HTML (texto escapado).
import { esc, num, rotuloDia, classeNota, textoNota, ESPECIES, NOME_ESPECIE, PERIODO_CURTO } from "./formato.js";
import { horasDosPeriodos, faixaDias, escolhaEspecie, parcelas, fontesEmFalta, agoraDe, linhaLeitura, avisoOrigem } from "./inicio.js";
import { ESTADO_NOTA } from "../regras/notas.js";
import { PERIODOS_PADRAO } from "../regras/periodos.js";
import { utcToLisbon, lisbonDate } from "../normalizacao.js";

export const ORDENS = { pesqueiros: "Nascente → poente", nota: "Por nota" };

const nomesPeriodos = config => (config.periodos ?? PERIODOS_PADRAO).map(p => p.nome);
// «dia» (a nota do dia, a do melhor período, como no motor) e os períodos do config.
export const vistas = config => ["dia", ...nomesPeriodos(config)];

// Períodos do dia escolhido que já acabaram à hora da leitura (só hoje; hora de Lisboa).
export function periodosPassados(dia, contexto) {
  const lido = agoraDe(contexto) ? new Date(Date.parse(agoraDe(contexto))) : null;
  if (!lido || Number.isNaN(lido.getTime()) || dia !== lisbonDate(lido)) return [];
  const agora = Number(utcToLisbon(lido).slice(11, 13));
  return Object.entries(horasDosPeriodos(contexto.config)).filter(([, [, fim]]) => fim <= agora).map(([nome]) => nome);
}

export function estadoDaNota(n) {
  if (!n) return "não se aplica";
  if (n.estado === ESTADO_NOTA.ND) return "sem nota";
  if (n.estado === ESTADO_NOTA.POR_CONFIRMAR) return "por confirmar";
  return n.completa ? "completa" : "incompleta";
}

const sinal = p => (p > 0 ? `+${p}` : `−${Math.abs(p)}`);

// O que explica a nota, a partir das parcelas e do limite que o motor devolve: as parcelas aplicadas,
// as que ficaram por avaliar (com o motivo) e o limite obrigatório. As não aplicadas não se repetem.
export function porque(n) {
  if (!n) return [];
  if (n.estado !== ESTADO_NOTA.OK) return [`${n.estado === ESTADO_NOTA.ND ? "sem nota" : "por confirmar"}: ${n.motivo ?? "dados em falta"}`];
  const out = [];
  for (const x of n.parcelas ?? []) {
    const motivo = x.motivo ? ` (${x.motivo})` : "";
    if (x.descricao.startsWith("base")) {
      const qual = x.descricao.replace(/^base:?\s*/, "");
      if (x.estado === "aplicada") out.push(`base ${x.peso}${qual ? ` (${qual})` : ""}`);
      else if (x.estado === "não avaliada") out.push(`base por avaliar${motivo}`);
    } else if (x.estado === "aplicada") out.push(`${sinal(x.peso)} ${x.descricao}`);
    else if (x.estado === "não avaliada") out.push(`${x.descricao}: por avaliar${motivo}`);
  }
  if (n.limite) out.push(`limite: ${n.limite.descricao} → ${n.limite.valor}`);
  if (n.periodosSemNota?.length) out.push(`sem nota: ${n.periodosSemNota.join(", ")}`);
  return out;
}

// Uma linha por pesqueiro, na ordem do motor (a do config). vista: "dia" ou o nome de um período.
export function linhasComparador(d, contexto, especie, vista = "dia") {
  const ordemPq = Object.keys(contexto.config.pesqueiros);
  const periodosCfg = nomesPeriodos(contexto.config);
  const outraEsp = ESPECIES.find(e => e !== especie);
  return Object.entries(d.pesqueiros).map(([id, p]) => {
    const pq = contexto.config.pesqueiros[id] ?? {};
    const naVista = esp => (vista === "dia" ? p.notas[esp] : p.periodos.find(x => x.nome === vista)?.notas[esp]) ?? null;
    const n = naVista(especie);
    const nomePer = vista === "dia" ? n?.periodo ?? null : vista;
    const per = nomePer ? p.periodos.find(x => x.nome === nomePer) ?? null : null;
    const o = naVista(outraEsp);
    const ordem = ordemPq.indexOf(id);
    return {
      id, nome: pq.nomeCurto ?? pq.nome ?? id, tipo: pq.tipo ?? null, ordem: ordem < 0 ? Infinity : ordem,
      n, estado: estadoDaNota(n), periodo: nomePer, per,
      k: nomePer ? periodosCfg.indexOf(nomePer) : periodosCfg.length,
      alinhado: per?.alinhamento?.alinhado === true,
      outra: o?.estado === ESTADO_NOTA.OK ? o.nota : -1,
      periodos: p.periodos.map(x => ({ nome: x.nome, n: x.notas[especie] ?? null })),
      porque: porque(n), p, pq
    };
  });
}

// «pesqueiros»: a ordem do config (nascente → poente), com os pesqueiros sem regra para a espécie no
// fim, como no ecrã inicial (ordemDosCartoes). «nota»: primeiro as notas «ok», pela nota e, em empate,
// pelos critérios de «Onde e quando»; depois «por confirmar», «sem nota» e «não se aplica», na ordem
// dos pesqueiros (uma nota em falta nunca conta como zero nem fica à frente de outra).
export function ordenarLinhas(linhas, ordem = "pesqueiros") {
  const base = [...linhas].sort((a, b) => a.ordem - b.ordem);
  if (ordem !== "nota") return [...base.filter(l => l.n), ...base.filter(l => !l.n)];
  const ok = base.filter(l => l.n?.estado === ESTADO_NOTA.OK)
    .sort((a, b) => b.n.nota - a.n.nota || Number(b.alinhado) - Number(a.alinhado) || b.outra - a.outra || a.k - b.k || a.ordem - b.ordem);
  const grupo = estado => base.filter(l => l.n?.estado === estado);
  return [...ok, ...grupo(ESTADO_NOTA.POR_CONFIRMAR), ...grupo(ESTADO_NOTA.ND), ...base.filter(l => !l.n)];
}

// Resumo da comparação: a nota mais alta, quem a tem, empates e se a comparação é parcial. Só é
// «definitiva» quando um único pesqueiro tem a nota mais alta, com a nota completa, e nenhum outro a
// pode igualar (nota incompleta cujo intervalo lá chega, sem nota ou por confirmar).
export function resumoComparacao(linhas) {
  const aplica = linhas.filter(l => l.n);
  const ok = aplica.filter(l => l.n.estado === ESTADO_NOTA.OK);
  const topo = ok.length ? Math.max(...ok.map(l => l.n.nota)) : null;
  const noTopo = topo === null ? [] : ok.filter(l => l.n.nota === topo);
  const incompletas = ok.filter(l => !l.n.completa);
  const semNota = aplica.filter(l => l.n.estado === ESTADO_NOTA.ND);
  const porConfirmar = aplica.filter(l => l.n.estado === ESTADO_NOTA.POR_CONFIRMAR);
  const podemIgualar = topo === null ? [] : [
    ...ok.filter(l => l.n.nota < topo && !l.n.completa && (l.n.intervalo?.max ?? Infinity) >= topo),
    ...semNota, ...porConfirmar];
  return {
    topo, noTopo, empate: noTopo.length > 1, incompletas, semNota, porConfirmar, podemIgualar,
    naoSeAplica: linhas.filter(l => !l.n),
    parcial: incompletas.length + semNota.length + porConfirmar.length > 0,
    definitivo: noTopo.length === 1 && noTopo[0].n.completa && podemIgualar.length === 0
  };
}

const intervaloTxt = n => (n.intervalo && n.intervalo.min !== n.intervalo.max ? `pode ser ${n.intervalo.min} a ${n.intervalo.max}` : "");
const juntar = nomes => (nomes.length <= 1 ? nomes.join("") : `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`);

function textoResumo(r, vistaTxt) {
  const linhas = [];
  if (r.topo === null) linhas.push(`<p class="motivo">Nenhum pesqueiro tem nota para ${esc(vistaTxt)}.</p>`);
  else {
    linhas.push(`<p><b class="mini n${r.topo}">${r.topo}</b> Nota mais alta: ${esc(juntar(r.noTopo.map(l => l.nome)))}${r.empate ? " (empate)" : ""}</p>`);
    if (r.definitivo && !r.parcial) linhas.push(`<p class="motivo">Todas as notas comparadas estão completas.</p>`);
    else if (r.definitivo) linhas.push(`<p class="motivo">Há notas incompletas ou em falta, mas nenhuma pode chegar a ${r.topo}.</p>`);
    else if (r.parcial) linhas.push(`<p class="incompleta"><b>Comparação parcial:</b> não dá para dizer qual é o melhor.</p>`);
  }
  const lista = [];
  if (r.incompletas.length) lista.push(`Incompletas: ${r.incompletas.map(l => `${l.nome}${intervaloTxt(l.n) ? ` (${intervaloTxt(l.n)})` : ""}`).join("; ")}`);
  if (r.semNota.length) lista.push(`Sem nota: ${r.semNota.map(l => `${l.nome} (${l.n.motivo ?? "dados em falta"})`).join("; ")}`);
  if (r.porConfirmar.length) lista.push(`Por confirmar: ${r.porConfirmar.map(l => `${l.nome} (${l.n.motivo ?? ""})`).join("; ")}`);
  if (r.naoSeAplica.length) lista.push(`Sem regra para esta espécie: ${juntar(r.naoSeAplica.map(l => l.nome))}`);
  if (lista.length) linhas.push(`<ul class="resumo-lista">${lista.map(x => `<li>${esc(x)}</li>`).join("")}</ul>`);
  return linhas.join("");
}

function textoEstado(l) {
  if (l.estado === "não se aplica") return l.tipo === "ria" ? "não se aplica na Ria (interior)" : "sem regra para este pesqueiro";
  if (l.estado === "incompleta") return `incompleta${intervaloTxt(l.n) ? ` · ${intervaloTxt(l.n)}` : ""}`;
  return l.estado;
}

function linha(l, especie, vista, passados, contexto) {
  const n = l.n;
  const marca = n?.estado === ESTADO_NOTA.OK && !n.completa ? " inc" : "";
  const periodos = l.periodos.map(x => {
    const sel = vista !== "dia" ? x.nome === vista : x.nome === l.periodo && n?.estado === ESTADO_NOTA.OK;
    const titulo = `${x.nome}: ${x.n?.estado === ESTADO_NOTA.OK ? `${x.n.nota}/5${x.n.completa ? "" : " (incompleta)"}` : x.n?.estado ?? "não se aplica"}${x.n?.motivo ? ` — ${x.n.motivo}` : ""}${passados.includes(x.nome) ? " · já passou" : ""}`;
    return `<li class="${classeNota(x.n)}${sel ? " sel" : ""}${passados.includes(x.nome) ? " passou" : ""}" title="${esc(titulo)}"><span>${esc(PERIODO_CURTO[x.nome] ?? x.nome)}</span><b>${x.n ? esc(textoNota(x.n)) : "—"}${x.n?.estado === ESTADO_NOTA.OK && !x.n.completa ? "*" : ""}</b></li>`;
  }).join("");
  const avisos = [...fontesEmFalta(l.pq, contexto).map(a => ["falha", a]), ...(l.p.avisos ?? []).map(a => ["", a])];
  const ndet = n ? { ...n, periodo: l.periodo ?? n.periodo } : null;
  return `<li class="linha-comp" id="cmp-${esc(l.id)}" data-estado="${esc(l.estado)}">
    <div class="lc-topo"><b class="nota ${n ? classeNota(n) : "nd"}${marca}">${n ? esc(textoNota(n)) : "—"}${n?.estado === ESTADO_NOTA.OK ? "<small>/5</small>" : ""}</b>
      <span class="lc-nome">${esc(l.nome)}<small>${esc(textoEstado(l))}${vista === "dia" && n?.estado === ESTADO_NOTA.OK && l.periodo ? ` · ${esc(l.periodo)}${passados.includes(l.periodo) ? " (já passou)" : ""}` : ""}</small></span></div>
    <ol class="periodos">${periodos}</ol>
    ${l.porque.length ? `<p class="porque">${esc(l.porque.join(" · "))}</p>` : ""}
    ${n?.observacao ? `<p class="obs">${esc(n.observacao)}</p>` : ""}
    ${n || avisos.length ? `<details class="detalhes"><summary>Parcelas e avisos</summary>
      ${ndet ? parcelas(especie, ndet) : ""}
      ${avisos.length ? `<ul class="avisos">${avisos.map(([c, a]) => `<li${c ? ` class="${c}"` : ""}>${esc(a)}</li>`).join("")}</ul>` : ""}
    </details>` : ""}
  </li>`;
}

// Factores lado a lado (valores que o motor calculou para o período de cada linha). «?» = por
// verificar (dado em falta ou fonte não obtida); «—» = não existe para o pesqueiro.
const simNao = v => (v === true ? "sim" : v === false ? "não" : "?");
const COLUNAS = {
  potencia: ["P máx.", "potência máxima no período, kW/m (* com horas em falta)", l => {
    if (!l.pq.mar) return "—";
    const pot = l.per?.potencia;
    return pot?.status === "obtido" ? `${num(pot.valor, 2)}${pot.completa ? "" : "*"}` : "?";
  }],
  limo: ["Limo", "Levante/Sudeste com mar mexido, no período", l => (l.tipo === "ria" || !l.per ? "—" : simNao(l.per.limo?.limo))],
  alinhamento: ["Alinh.", "reponto de maré perto do nascer ou pôr do Sol, no período", l => (l.per ? simNao(l.per.alinhamento?.alinhado) : "—")],
  descida: ["Pressão ↓", "descida de pressão em 24 h (regra 6)", l => simNao(l.p.pressao?.descida?.activo)],
  altaEstavel: ["Alta estável", "pressão alta e estável (regra 6)", l => simNao(l.p.pressao?.altaEstavel?.valor)],
  agua: ["Água ↓", "descida da água em relação à semana anterior (regra 7)", l => simNao(l.p.agua?.afastaDourada)],
  turva: ["Turva", "chuva forte nas 48 h antes do dia (regra 8)", l => simNao(l.p.chuva?.turva)]
};
export const COLUNAS_POR_ESPECIE = {
  robalo: ["potencia", "limo", "alinhamento", "descida"],
  dourada: ["potencia", "limo", "alinhamento", "descida", "altaEstavel", "agua", "turva"]
};
export function celulasFactores(l, especie) {
  return COLUNAS_POR_ESPECIE[especie].map(k => COLUNAS[k][2](l));
}

function matriz(linhas, especie, vista) {
  const cols = COLUNAS_POR_ESPECIE[especie];
  const comNota = linhas.filter(l => l.n);
  if (!comNota.length) return "";
  return `<section class="factores" aria-label="Factores lado a lado">
    <h2>Factores <small>· ${vista === "dia" ? "no melhor período de cada pesqueiro" : `de ${esc(vista)}`}</small></h2>
    <div class="rolar"><table><thead><tr><th>Pesqueiro</th>${cols.map(k => `<th title="${esc(COLUNAS[k][1])}">${esc(COLUNAS[k][0])}</th>`).join("")}</tr></thead>
    <tbody>${comNota.map(l => `<tr><th>${esc(l.nome)}${vista === "dia" && l.periodo ? `<small>${esc(PERIODO_CURTO[l.periodo] ?? l.periodo)}</small>` : ""}</th>${celulasFactores(l, especie).map(v => `<td class="${v === "?" ? "falta" : ""}">${esc(v)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>
    <p class="legenda">${cols.map(k => `${esc(COLUNAS[k][0])}: ${esc(COLUNAS[k][1])}`).join(" · ")}. «?» por verificar (dado em falta ou fonte não obtida; as fontes em falta estão em «Parcelas e avisos») · «—» não existe neste pesqueiro. Nem todos os factores contam em todos os pesqueiros: o que contou para cada nota está na linha de cada um.</p>
  </section>`;
}

function botoes(classe, lista, actual, rotulo) {
  return `<nav class="opcoes ${classe}" aria-label="${esc(rotulo)}">${lista.map(([v, t]) =>
    `<button type="button" data-valor="${esc(v)}" class="${v === actual ? "sel" : ""}" aria-pressed="${v === actual}">${esc(t)}</button>`).join("")}</nav>`;
}

// contexto: { analise, config, pontos, mares, lidoEm, indice, especie, vista, ordem }
export function renderComparador(contexto) {
  const { analise } = contexto;
  const indice = Math.min(Math.max(contexto.indice ?? 0, 0), analise.dias.length - 1);
  const especie = ESPECIES.includes(contexto.especie) ? contexto.especie : "robalo";
  const vista = vistas(contexto.config).includes(contexto.vista) ? contexto.vista : "dia";
  const ordem = ORDENS[contexto.ordem] ? contexto.ordem : "pesqueiros";
  const d = analise.dias[indice];
  const passados = periodosPassados(d.dia, contexto);
  const horas = horasDosPeriodos(contexto.config);
  const linhas = ordenarLinhas(linhasComparador(d, contexto, especie, vista), ordem);
  const r = resumoComparacao(linhas);
  const vistaTxt = vista === "dia" ? "o dia (melhor período)" : `${vista} (${String(horas[vista]?.[0]).padStart(2, "0")}–${String(horas[vista]?.[1]).padStart(2, "0")} h)`;
  const opcoesVista = vistas(contexto.config).map(v => [v, v === "dia" ? "Dia" : PERIODO_CURTO[v] ?? v]);
  return `<header class="topo"><div><h1>Comparar pesqueiros</h1>
      <p class="lido">${linhaLeitura(contexto)}</p></div>
      <button type="button" id="actualizar" class="btn-actualizar" aria-label="Actualizar dados">↻</button></header>
    ${avisoOrigem(contexto)}
    ${escolhaEspecie(especie)}
    ${faixaDias(analise, indice, especie)}
    ${botoes("vistas", opcoesVista, vista, "Período")}
    ${botoes("ordens", Object.entries(ORDENS), ordem, "Ordem")}
    <section class="resumo-comp" aria-label="Resumo da comparação">
      <h2>${esc(rotuloDia(d.dia, indice))} · ${esc(NOME_ESPECIE[especie])} <small>· ${esc(vistaTxt)}</small></h2>
      <p class="mare"><span class="rot">Maré do dia</span> ${d.amplitude.amplitude === null ? `não obtida${d.amplitude.motivo ? ` (${esc(d.amplitude.motivo)})` : ""}` : `${num(d.amplitude.amplitude, 1)} m · ${esc(d.amplitude.classe)}`}</p>
      ${textoResumo(r, vistaTxt)}
    </section>
    <ol class="comparacao">${linhas.map(l => linha(l, especie, vista, passados, contexto)).join("")}</ol>
    ${matriz(linhas, especie, vista)}
    <p class="legenda">Só notas calculadas pelas regras da app, todas provisórias. <b class="mini n4 inc">4</b> e «*» nota incompleta (há parcelas por avaliar ou períodos sem nota) · <b class="mini nd">n.d.</b> sem nota (dados em falta; nunca conta como zero) · <b class="mini pc">?</b> por confirmar no terreno.${passados.length ? " Períodos de hoje já passados a cinzento." : ""} Períodos em hora de Portugal continental.</p>`;
}
