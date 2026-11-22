// Ecrã inicial (Fase 4; reorganizado na Fase 1 da evolução, 20/11/2026): «Onde e quando» no topo,
// escolha do dia e um cartão por pesqueiro. Só apresenta o que o motor calculou (js/regras/): não
// calcula notas nem cria outra classificação.
// Requisitos das revisões da Fase 3: nunca mostrar uma nota incompleta como definitiva —
// intervalo, períodos sem nota, parcelas por avaliar, n.d. e «por confirmar» sempre visíveis.
// Função pura: devolve HTML (texto escapado).
import { esc, hora, horaIso, dataHora, num, rotuloDia, classeNota, textoNota, ESPECIES, NOME_ESPECIE, PERIODO_CURTO, NOME_MARE, rumo, quandoLido, idadeTexto } from "./formato.js";
import { ordenarMelhoresDias } from "../regras/notas.js";
import { resumoBoia } from "../fontes/ih-boias.js";
import { DISTANCIAS_FUNDO } from "../fontes/fundo-tipico.js";
import { intervaloLat } from "../fundos.js";
import { utcToLisbon, lisbonDate } from "../normalizacao.js";
import { PERIODOS_PADRAO } from "../regras/periodos.js";
import { porque, estadoDaNota } from "./explicacao.js";

export { ESPECIES };

// Hora real desta abertura (sem rede, a hora da leitura arquivada é outra: contexto.lidoEm).
export const agoraDe = contexto => contexto.agora ?? contexto.lidoEm;

// Linha da hora de leitura no topo: actual, ou previsão arquivada com data, hora e idade.
export function linhaLeitura(contexto) {
  const o = contexto.origem;
  if (o?.tipo === "arquivo") {
    return `Previsão arquivada, lida ${esc(quandoLido(contexto.lidoEm, agoraDe(contexto)))} (${esc(idadeTexto(Date.parse(agoraDe(contexto)) - Date.parse(contexto.lidoEm)))}) · hora de Portugal continental · notas provisórias`;
  }
  if (o?.tipo === "indisponivel") return `Previsão não obtida (tentativa às ${esc(horaIso(contexto.lidoEm))}, hora de Portugal continental)`;
  return `Dados lidos às ${esc(horaIso(contexto.lidoEm))} (hora de Portugal continental) · notas provisórias`;
}

// Aviso de onde vêm os dados quando não são a previsão actual (PR 3): previsão arquivada ou
// indisponível; e, com dados actuais, quando não foi possível guardá-los para usar sem rede.
export function avisoOrigem(contexto) {
  const o = contexto.origem;
  if (!o) return "";
  if (o.tipo === "arquivo") {
    return `<section class="aviso-origem arquivo" role="status"><b>Previsão arquivada — não é a previsão actual.</b>
      Não foi possível obter a previsão agora (sem rede ou fonte indisponível). Mostra-se a última guardada neste aparelho,
      lida ${esc(quandoLido(contexto.lidoEm, agoraDe(contexto)))} (${esc(idadeTexto(Date.parse(agoraDe(contexto)) - Date.parse(contexto.lidoEm)))}):
      as notas são as dessa leitura e as condições podem ter mudado. Volta a actualizar quando houver rede.</section>`;
  }
  if (o.tipo === "indisponivel") {
    const porque = o.ultimaLidaEm
      ? `A última previsão guardada neste aparelho (lida ${esc(quandoLido(o.ultimaLidaEm, agoraDe(contexto)))}) é antiga demais para os dias mostrados.`
      : o.semArmazem ? `Este aparelho não deixa guardar dados (${esc(o.semArmazem)}).` : "Não há nenhuma previsão guardada neste aparelho.";
    return `<section class="aviso-origem indisponivel" role="status"><b>Previsão indisponível.</b>
      Não foi possível obter a previsão agora (sem rede ou fonte indisponível). ${porque} As notas que dependem da previsão ficam sem nota ou incompletas.</section>`;
  }
  if (o.guardado && !o.guardado.ok) {
    return `<p class="aviso-origem leve">Estes dados não ficaram guardados para usar sem rede (${esc(o.guardado.erro ?? "erro")}).</p>`;
  }
  return "";
}

// Melhor nota do dia para a espécie escolhida.
const melhorNotaDoDia = (d, esp) => {
  const v = esp === "dourada" ? d.melhorDourada : d.melhorRobalo;
  return typeof v === "number" ? v : null;
};

// Alinhamentos reponto/Sol do dia, sem repetir o mesmo reponto entre pesqueiros.
export function alinhamentosDoDia(d) {
  const vistos = new Map();
  for (const p of Object.values(d.pesqueiros)) {
    for (const a of p.alinhamento?.alinhamentos ?? []) {
      const chave = `${a.reponto}|${a.evento}`;
      if (!vistos.has(chave)) vistos.set(chave, a);
    }
  }
  return [...vistos.values()].sort((a, b) => a.reponto - b.reponto);
}

// «preia-mar 05:13 e 17:31 · baixa-mar 11:03 e 23:13» (por extenso, sem PM/BM).
function maresPorTipo(repontos) {
  return ["PM", "BM"].map(t => {
    const horas = repontos.filter(r => r.tipo === t).map(r => hora(r.instante));
    return horas.length ? `${NOME_MARE[t]} ${horas.join(" e ")}` : null;
  }).filter(Boolean).join(" · ");
}

export const textoAlinhamento = a =>
  `${a.tipo === "PM" ? "Preia-mar" : "Baixa-mar"} às ${hora(a.reponto)}, a ${a.minutos} min do ${a.evento}`;

// Horas de início e fim de cada período (config.periodos, hora de Lisboa).
export function horasDosPeriodos(config) {
  const cfg = config.periodos ?? PERIODOS_PADRAO;
  return Object.fromEntries(cfg.map((p, k) => [p.nome, [p.inicioHora, k + 1 < cfg.length ? cfg[k + 1].inicioHora : 24]]));
}
const hh = h => `${String(h).padStart(2, "0")}`;

// «Onde e quando» (Fase 1 da evolução, 20/11/2026): as melhores combinações pesqueiro × período do dia
// escolhido, só com as notas que o motor já calculou — sem outra classificação. Só entram notas «ok»
// (n.d. e «por confirmar» ficam nos cartões). Ordem: a nota; em empate, o período com alinhamento
// reponto/Sol, depois a nota da outra espécie no mesmo período (como no desempate dos melhores dias,
// CLAUDE.md §6), depois o período mais cedo e a ordem dos pesqueiros (nascente → poente). Hoje, os
// períodos que já acabaram à hora da leitura não entram. Função pura.
export function janelasDoDia(d, contexto, especie, { maximo = 3 } = {}) {
  const horas = horasDosPeriodos(contexto.config);
  const lido = agoraDe(contexto) ? new Date(Date.parse(agoraDe(contexto))) : null;
  const hoje = Boolean(lido && d.dia === lisbonDate(lido));
  const horaAgora = hoje ? Number(utcToLisbon(lido).slice(11, 13)) : null;
  const outra = ESPECIES.find(e => e !== especie);
  const ordem = Object.keys(contexto.config.pesqueiros);
  const lista = [];
  for (const [id, p] of Object.entries(d.pesqueiros)) {
    (p.periodos ?? []).forEach((per, k) => {
      const n = per.notas?.[especie];
      if (n?.estado !== "ok") return;
      const [inicio, fim] = horas[per.nome] ?? [null, null];
      if (hoje && fim !== null && fim <= horaAgora) return;
      const o = per.notas?.[outra];
      lista.push({ id, nome: contexto.config.pesqueiros[id]?.nomeCurto ?? id, periodo: per.nome, inicio, fim, n,
        alinhamentos: per.alinhamento?.alinhado === true ? per.alinhamento.alinhamentos ?? [] : [],
        k, outra: o?.estado === "ok" ? o.nota : -1, ordem: ordem.indexOf(id) });
    });
  }
  lista.sort((a, b) => b.n.nota - a.n.nota || (b.alinhamentos.length > 0) - (a.alinhamentos.length > 0)
    || b.outra - a.outra || a.k - b.k || a.ordem - b.ordem);
  const janelas = lista.slice(0, maximo);
  const topo = lista.length ? lista[0].n.nota : null;
  const mais = topo === null ? 0 : lista.filter(x => x.n.nota === topo).length - janelas.filter(x => x.n.nota === topo).length;
  return { janelas, maisComMesmaNota: mais, hoje };
}

// Períodos do dia escolhido que já acabaram à hora real (só hoje; hora de Lisboa).
export function periodosPassados(dia, contexto) {
  const lido = agoraDe(contexto) ? new Date(Date.parse(agoraDe(contexto))) : null;
  if (!lido || Number.isNaN(lido.getTime()) || dia !== lisbonDate(lido)) return [];
  const agora = Number(utcToLisbon(lido).slice(11, 13));
  return Object.entries(horasDosPeriodos(contexto.config)).filter(([, [, fim]]) => fim <= agora).map(([nome]) => nome);
}

// Melhor oportunidade do dia (PR 9 da evolução, 21/11/2026): a primeira janela de «Onde e quando» (as
// mesmas notas do motor e os mesmos critérios de desempate) e o que impede chamá-la «a melhor»:
// empate na nota, nota incompleta, ou outras combinações pesqueiro × período ainda por vir que a
// podiam igualar (incompletas com intervalo até lá, sem nota, por confirmar). Função pura.
export function destaqueDoDia(d, contexto, especie) {
  const { janelas, hoje } = janelasDoDia(d, contexto, especie, { maximo: Infinity });
  const passados = periodosPassados(d.dia, contexto);
  const semNota = [];
  for (const [id, p] of Object.entries(d.pesqueiros)) {
    for (const per of p.periodos ?? []) {
      const n = per.notas?.[especie];
      if (!n || n.estado === "ok" || passados.includes(per.nome)) continue;
      semNota.push({ id, nome: contexto.config.pesqueiros[id]?.nomeCurto ?? id, periodo: per.nome, n });
    }
  }
  const janela = janelas[0] ?? null;
  if (!janela) return { janela: null, empate: [], podemIgualar: semNota, semNota, definitivo: false, hoje };
  const empate = janelas.slice(1).filter(j => j.n.nota === janela.n.nota);
  const podemIgualar = [...janelas.filter(j => j.n.nota < janela.n.nota && !j.n.completa && (j.n.intervalo?.max ?? Infinity) >= janela.n.nota), ...semNota];
  return { janela, empate, podemIgualar, semNota, hoje, definitivo: !empate.length && janela.n.completa && !podemIgualar.length };
}

const listaNomes = (xs, max = 3) => (xs.length <= max ? xs.join(", ") : `${xs.slice(0, max).join(", ")} e mais ${xs.length - max}`);

function destaque(analise, indice, contexto, especie) {
  const d = analise.dias[indice];
  const r = destaqueDoDia(d, contexto, especie);
  const rotulo = `<p class="rot">Melhor oportunidade · ${esc(rotuloDia(d.dia, indice))} · ${esc(NOME_ESPECIE[especie])}</p>`;
  const comparar = `<a class="btn sec" href="./comparador.html?dia=${indice}">Comparar pesqueiros ›</a>`;
  if (!r.janela) {
    return `<section class="destaque vazio" aria-label="Melhor oportunidade" data-estado="sem-notas">${rotulo}
      <p class="destaque-msg">Sem notas para ${r.hoje ? "o resto de hoje" : "este dia"}${r.semNota.length ? ` (${r.semNota.length} período(s) sem nota ou por confirmar)` : ""}: não há uma melhor oportunidade a indicar.</p>
      <div class="accoes">${comparar}</div></section>`;
  }
  const j = r.janela;
  const p = d.pesqueiros[j.id];
  const per = p.periodos.find(x => x.nome === j.periodo);
  const inc = j.n.completa ? "" : ` inc`;
  let estado;
  let tipo;
  if (r.empate.length) {
    tipo = "empate";
    estado = `Empate com ${j.n.nota}: ${listaNomes([j, ...r.empate].map(x => `${x.nome} (${x.periodo})`))}. Não há uma única melhor; a primeira é a do desempate de «Onde e quando».`;
  } else if (!j.n.completa) {
    tipo = "incompleta";
    estado = `Nota incompleta${j.n.intervalo && j.n.intervalo.min !== j.n.intervalo.max ? ` (pode ser ${j.n.intervalo.min} a ${j.n.intervalo.max})` : ""}: não é definitiva.`;
  } else if (r.podemIgualar.length) {
    tipo = "parcial";
    estado = `Comparação parcial: ${r.podemIgualar.length} período(s) incompletos, sem nota ou por confirmar podiam igualar esta nota.`;
  } else {
    tipo = "definitiva";
    estado = "A nota mais alta do dia, completa e sem empate.";
  }
  const ali = j.alinhamentos.length ? `<p class="destaque-ali"><span class="ic ic-sol" aria-hidden="true"></span>${esc(j.alinhamentos.map(textoAlinhamento).join("; "))}</p>` : "";
  const chips = [];
  const pot = per?.potencia;
  if (pot) chips.push(["onda", `P máx. ${pot.status === "obtido" ? `${num(pot.valor, 2)} kW/m` : "não obtida"}`]);
  if (per?.limo && contexto.config.pesqueiros[j.id]?.tipo !== "ria") chips.push(["limo", `Limo: ${per.limo.limo === true ? "sim" : per.limo.limo === false ? "não" : "por verificar"}`]);
  chips.push(["mare", d.amplitude.amplitude === null ? "Maré não obtida" : `Maré ${d.amplitude.classe} ${num(d.amplitude.amplitude, 1)} m`]);
  const linhas = porque(j.n).slice(0, 3);
  return `<section class="destaque" aria-label="Melhor oportunidade" data-estado="${tipo}">${rotulo}
    <div class="destaque-corpo">
      <b class="nota-grande ${classeNota(j.n)}${inc}" aria-label="nota ${j.n.nota} de 5${j.n.completa ? "" : ", incompleta"}">${j.n.nota}<small>/5</small></b>
      <div class="destaque-onde"><h2><a href="./pesqueiro.html?id=${encodeURIComponent(j.id)}${indice > 0 ? `&dia=${indice}` : ""}">${esc(j.nome)}</a></h2>
        <p class="destaque-janela"><span class="ic ic-relogio" aria-hidden="true"></span>${esc(j.periodo)}${j.inicio === null ? "" : ` · ${hh(j.inicio)}–${hh(j.fim)} h`}</p></div>
    </div>
    ${ali}
    <p class="destaque-estado e-${tipo}">${esc(estado)}</p>
    ${linhas.length ? `<ul class="porque-lista">${linhas.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
    <ul class="chips-condicoes">${chips.map(([ic, t]) => `<li><span class="ic ic-${ic}" aria-hidden="true"></span>${esc(t)}</li>`).join("")}</ul>
    <div class="accoes"><a class="btn" href="./pesqueiro.html?id=${encodeURIComponent(j.id)}${indice > 0 ? `&dia=${indice}` : ""}">Ver pesqueiro ›</a>${comparar}</div>
  </section>`;
}

function linhaJanela(j) {
  const inc = j.n.completa ? "" : ` · incompleta${j.n.intervalo && j.n.intervalo.min !== j.n.intervalo.max ? ` (pode ser ${j.n.intervalo.min} a ${j.n.intervalo.max})` : ""}`;
  const ali = j.alinhamentos.length ? ` · ${j.alinhamentos.map(textoAlinhamento).join("; ")}` : "";
  return `<li><b class="mini ${classeNota(j.n)}${j.n.completa ? "" : " inc"}">${j.n.nota}</b><span><a href="#pq-${esc(j.id)}">${esc(j.nome)}</a> · ${esc(j.periodo)}${j.inicio === null ? "" : ` ${hh(j.inicio)}–${hh(j.fim)} h`}${esc(inc)}${esc(ali)}</span></li>`;
}

export function ondeQuando(analise, indice, contexto, especie) {
  const d = analise.dias[indice];
  const { janelas, maisComMesmaNota, hoje } = janelasDoDia(d, contexto, especie);
  const melhoresDias = ordenarMelhoresDias(analise.dias, especie).slice(0, 3).map(dd => {
    const m = melhorNotaDoDia(dd, especie);
    return m === null ? null : `${rotuloDia(dd.dia, dd.indice)} (${m})`;
  }).filter(Boolean);
  // Alinhamento do dia, uma vez. Cada pesqueiro tem a sua hora do Sol: se os minutos diferem, mostra-se o
  // intervalo; se não acontece em todos os pesqueiros, diz-se em quais.
  const ali = alinhamentosDoDia(d).map(a => {
    const iguais = Object.entries(d.pesqueiros).map(([id, p]) => [id, (p.alinhamento?.alinhamentos ?? [])
      .find(x => x.reponto === a.reponto && x.evento === a.evento)]).filter(([, x]) => x);
    const mins = iguais.map(([, x]) => x.minutos);
    const minutos = Math.min(...mins) === Math.max(...mins) ? `${mins[0]}` : `${Math.min(...mins)}–${Math.max(...mins)}`;
    const texto = `${a.tipo === "PM" ? "Preia-mar" : "Baixa-mar"} às ${hora(a.reponto)}, a ${minutos} min do ${a.evento}`;
    return iguais.length === Object.keys(d.pesqueiros).length ? texto
      : `${texto} (só em: ${iguais.map(([id]) => contexto.config.pesqueiros[id]?.nomeCurto ?? id).join(", ")})`;
  });
  return `<section class="onde-quando" aria-label="Onde e quando">
    <h2>Onde e quando <small>· ${esc(rotuloDia(d.dia, indice))} · ${esc(NOME_ESPECIE[especie])}</small></h2>
    ${janelas.length ? `<ol class="janelas">${janelas.map(linhaJanela).join("")}</ol>`
      : `<p class="motivo">Sem notas para ${hoje ? "o resto de hoje" : "este dia"}.</p>`}
    ${maisComMesmaNota > 0 ? `<p class="motivo">E mais ${maisComMesmaNota} com a mesma nota (ver os cartões).</p>` : ""}
    <p><span class="rot">Melhores dias</span><span>${melhoresDias.length ? esc(melhoresDias.join(" · ")) : "sem notas"}</span></p>
    <p><span class="rot">Maré</span><span>${d.amplitude.amplitude === null ? `não obtida${d.amplitude.motivo ? ` (${esc(d.amplitude.motivo)})` : ""}`
      : `${num(d.amplitude.amplitude, 1)} m · ${esc(d.amplitude.classe)}`}${d.repontos ? `<br>${esc(maresPorTipo(d.repontos))}` : ""}</span></p>
    ${ali.length ? `<div class="alinhamento"><b>Alinhamento</b> ${ali.map(esc).join("; ")}</div>` : ""}
    <p class="ligacao-comp"><a href="./comparador.html?dia=${indice}">Comparar os ${Object.keys(d.pesqueiros).length} pesqueiros ›</a></p>
  </section>`;
}

// Valor da boia com o estado quando não há valor (nunca um número inventado).
const valorBoia = (x, casas, unidade) => (x.estado === "obtido" ? `${num(x.valor, casas)} ${unidade}` : x.estado);

// Previsão do Open-Meteo para a hora certa mais próxima da medição, no ponto indicado no config.
function previsaoParaHora(contexto, ponto, instante) {
  const h = contexto.pontos?.mar?.[ponto]?.data?.hourly;
  const i = h?.time?.indexOf(Math.round(instante / 3600000) * 3600) ?? -1;
  if (i < 0 || !Number.isFinite(h.wave_height?.[i])) return null;
  const d = contexto.pontos.mar[ponto].data;
  return { instante: h.time[i] * 1000, hs: h.wave_height[i], periodo: h.wave_period?.[i],
    celula: Number.isFinite(d.latitude) && Number.isFinite(d.longitude) ? { lat: d.latitude, lon: d.longitude } : null };
}

// Distância aproximada entre dois pontos (km), para dizer a que distância da boia está a célula.
function distanciaKm(a, b) {
  const kx = 111.32 * Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180);
  return Math.hypot((a.lon - b.lon) * kx, (a.lat - b.lat) * 110.57);
}

// Boia de Faro (Instituto Hidrográfico): o mar medido agora, ao lado da previsão para a mesma
// hora. Só para ver: não entra nas notas.
function marAgora(contexto) {
  const b = contexto.config.boias?.faro;
  const r = contexto.boiaFaro;
  if (!b || !r) return "";
  const topo = `<h3>Mar agora <small>· ${esc(b.nome)} · observado</small></h3>`;
  const titulo = `<span class="mar-titulo">Mar agora</span> <small>· ${esc(b.nome)} · observado</small>`;
  if (!r.ok) return `<section class="mar-agora" aria-label="Mar agora">${topo}<p class="falha">Não obtido${r.error ? ` — ${esc(r.error)}` : ""}</p></section>`;
  const s = resumoBoia(r.data, { agora: new Date(Date.parse(agoraDe(contexto))), maxIdadeHoras: b.maxIdadeHoras });
  if (!s) return `<section class="mar-agora" aria-label="Mar agora">${topo}<p class="falha">Sem medições válidas nas últimas ${esc(b.horas)} h</p></section>`;
  const u = s.ultima;
  const prev = previsaoParaHora(contexto, b.previsaoPonto, u.instante);
  const linhas = [
    ["Onda", `${valorBoia(u.hm0, 2, "m")}${u.hmax.estado === "obtido" ? ` (máx. ${num(u.hmax.valor, 2)} m)` : ""}${u.direcao.estado === "obtido" ? ` · de ${rumo(u.direcao.valor)} (${num(u.direcao.valor, 0)}°)` : ""}`],
    ["Período", `médio ${valorBoia(u.tm02, 1, "s")} · de pico ${valorBoia(u.tp, 1, "s")}`],
    ["Água", valorBoia(u.agua, 1, "°C")],
    ["Tendência", `${s.tresHorasAntes ? `3 h antes ${num(s.tresHorasAntes.hm0.valor, 2)} m · ` : ""}últimas ${b.horas} h: ${num(s.minimo, 2)}–${num(s.maximo, 2)} m`]
  ];
  const nomePonto = Object.values(contexto.config.pesqueiros).find(p => p.mar === b.previsaoPonto)?.nomeCurto ?? b.previsaoPonto;
  // Revisão do ChatGPT (20/11/2026): a previsão é de outra célula (a do pesqueiro), e o «wave_period» do
  // Open-Meteo não é o Tm02 da boia (a fonte não diz que momento espectral é): mostram-se lado a lado,
  // com o nome de cada grandeza e de onde vem, sem calcular diferenças.
  if (prev) {
    const km = prev.celula ? distanciaKm(prev.celula, { lat: Number(b.latitude), lon: Number(b.longitude) }) : null;
    const onde = prev.celula ? `célula ${num(prev.celula.lat, 3)}, ${num(prev.celula.lon, 3)} (${nomePonto})${km === null ? "" : `, a ${num(km, 0)} km da boia`}` : nomePonto;
    linhas.push(["Previsão", `Open-Meteo para ${dataHora(prev.instante)}, ${onde}: Hs ${num(prev.hs, 2)} m${Number.isFinite(prev.periodo) ? ` · «wave_period» ${num(prev.periodo, 1)} s (não é o Tm02 da boia)` : ""}`]);
  }
  const idade = s.idadeMin >= 60 ? `há ${Math.floor(s.idadeMin / 60)} h ${s.idadeMin % 60} min` : `há ${s.idadeMin} min`;
  // Fase 1 (20/11/2026): uma linha sempre visível, com a fonte, o tipo e a hora da medição; o resto
  // (tendência, previsão, fonte completa e licença) ao tocar.
  const curto = [`onda ${valorBoia(u.hm0, 2, "m")}${u.direcao.estado === "obtido" ? ` de ${rumo(u.direcao.valor)}` : ""}`,
    `período médio ${valorBoia(u.tm02, 1, "s")}`, `água ${valorBoia(u.agua, 1, "°C")}`].join(" · ");
  return `<section class="mar-agora" aria-label="Mar agora">
    <details><summary>${titulo}<span class="mar-curto">${esc(curto)} · medido a ${esc(dataHora(u.instante))} (${esc(idade)})</span></summary>
    <dl class="factos">${linhas.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>
    <p class="fonte-boia">Medido a ${esc(dataHora(u.instante))} (${esc(idade)}) ao largo, a ${esc(b.profundidadeM)} m de fundo: na praia a onda chega diferente. Não entra nas notas. Horas de Portugal continental.<br>
    Instituto Hidrográfico, boia ${esc(b.codigo)} (${esc(b.latitude)}, ${esc(b.longitude)}) · observado · lido ${esc(quandoLido(r.readAt, agoraDe(contexto)))} · <a href="${esc(b.licencaUrl)}" target="_blank" rel="noopener">${esc(b.licenca)}</a></p>
    </details>
    ${s.desactualizada ? `<p class="falha">Última medição ${esc(idade)}: desactualizada</p>` : ""}
  </section>`;
}

export function faixaDias(analise, indice, especie) {
  return `<nav class="dias" aria-label="Dias">${analise.dias.map((d, i) => {
    const m = melhorNotaDoDia(d, especie);
    return `<button type="button" class="dia${i === indice ? " sel" : ""}" data-dia="${i}" aria-pressed="${i === indice}">
      <span>${esc(rotuloDia(d.dia, i))}</span><b class="mini ${m === null ? "nd" : `n${m}`}">${m ?? "—"}</b>${d.alinhado ? '<i class="ponto-ali" title="alinhamento"></i>' : ""}</button>`;
  }).join("")}</nav>`;
}

// Linha de uma espécie: nota do dia, notas por período e incompletude.
// compacto (cartões do início, PR 9): sem a linha do nome e da nota, que já estão nas notas do cartão.
// passados (F0, 22/11/2026): períodos de hoje que já acabaram; ficam a cinzento com «já passou», e a
// nota do dia, quando é de um deles, diz «(já passou)» — como no comparador.
export function linhaEspecie(esp, n, periodos, { compacto = false, passados = [] } = {}) {
  if (!n) return "";
  const avisos = [];
  if (n.estado === "ok" && !n.completa) {
    const partes = [];
    if (n.intervalo && n.intervalo.min !== n.intervalo.max) partes.push(`pode ser ${n.intervalo.min} a ${n.intervalo.max}`);
    if (n.periodosSemNota?.length) partes.push(`sem nota: ${n.periodosSemNota.join(", ")}`);
    if (n.naoAvaliadas?.length) partes.push(`por avaliar: ${n.naoAvaliadas.join(", ")}`);
    avisos.push(`<p class="incompleta">Nota incompleta — ${esc(partes.join("; "))}</p>`);
  }
  if (n.estado === "n.d.") avisos.push(`<p class="motivo">Sem nota: ${esc(n.motivo ?? "dados em falta")}</p>`);
  if (n.estado === "por confirmar") avisos.push(`<p class="motivo pc-txt">Por confirmar: ${esc(n.motivo ?? "")}</p>`);
  if (n.limite) avisos.push(`<p class="limite">Limite: ${esc(n.limite.descricao)} → ${n.limite.valor}/5</p>`);
  if (n.observacao) avisos.push(`<p class="obs">${esc(n.observacao)}</p>`);
  return `<div class="especie${compacto ? " compacta" : ""}">
    ${compacto ? `<p class="rot">${esc(NOME_ESPECIE[esp] ?? esp)} por período</p>` : `<div class="esp-topo"><span class="esp-nome">${esc(NOME_ESPECIE[esp] ?? esp)}</span>
      <span class="nota ${classeNota(n)}">${esc(textoNota(n))}${n.estado === "ok" ? "<small>/5</small>" : ""}</span>
      ${n.estado === "ok" && n.periodo ? `<span class="per">${esc(n.periodo)}${passados.includes(n.periodo) ? " (já passou)" : ""}</span>` : ""}</div>`}
    <ol class="periodos" aria-label="${esc(NOME_ESPECIE[esp] ?? esp)}: notas por período">${periodos.map(p => {
      const pn = p.notas[esp];
      const passou = passados.includes(p.nome);
      return `<li class="${classeNota(pn)}${passou ? " passou" : ""}" title="${esc(`${p.nome}: ${pn?.estado === "ok" ? `${pn.nota}/5` : pn?.estado ?? "—"}${pn?.motivo ? ` — ${pn.motivo}` : ""}${passou ? " · já passou" : ""}`)}"><span>${esc(PERIODO_CURTO[p.nome] ?? p.nome)}</span><b>${esc(textoNota(pn))}</b></li>`;
    }).join("")}</ol>
    ${avisos.join("")}
  </div>`;
}

const simNao = v => (v === true ? "sim" : v === false ? "não" : "por verificar");

const dataPt = iso => (/^\d{4}-\d{2}-\d{2}$/.test(iso ?? "") ? iso.split("-").reverse().join("/") : iso ?? "—");

// Fundo típico de uma praia (fundos/tipico.json): cotas a 100/150/200 m da linha de meia-maré e a
// água por cima na baixa-mar mais baixa e na preia-mar mais alta do dia (altura da tabela − cota).
// null quando não se aplica (molhes, Ria) ou o ficheiro não foi pedido; { erro } quando falhou.
export function fundoDoCartao(id, d, contexto) {
  const pq = contexto.config.pesqueiros[id];
  const r = contexto.fundoTipico;
  if (pq?.tipo !== "praia" || !r) return null;
  if (!r.ok) return { erro: `não obtido${r.error ? ` (${r.error})` : ""}` };
  const p = r.data.praias?.[id];
  if (!p) return null;
  if (!p.fonte) return { erro: `sem levantamento (${p.motivo})` };
  const f = r.data.fontes[p.fonte];
  const cotas = DISTANCIAS_FUNDO.map(k => p.cotas[k]);
  const lista = vals => vals.map(v => num(v, 1)).join(" / ");
  // Cotas à LAT (LiDAR): ao zero hidrográfico da tabela ficam entre cota + lat[0] e cota + lat[1],
  // por isso a água por cima é um intervalo (revisão de 19/11/2026).
  const lat = intervaloLat(f);
  const curto = `${lista(cotas)} m (${f.rotulo}${lat ? ", à LAT" : ""})`;
  const partes = [`cota mediana a ${DISTANCIAS_FUNDO.join(" / ")} m da linha de meia-maré: ${curto}`];
  if (lat) {
    partes.push(`a LAT fica ${num(lat[0], 2)} a ${num(lat[1], 2)} m acima do zero hidrográfico da tabela de marés, ` +
      "por isso a água por cima vai em intervalo");
  }
  const rep = d?.repontos ?? [];
  const extremo = (tipo, pior) => rep.filter(x => x.tipo === tipo).reduce((a, x) => (!a || pior(x.alturaM, a.alturaM) ? x : a), null);
  const dec = v => Math.round(v * 10) / 10;
  const agua = x => cotas.map(c => {
    const max = dec(x.alturaM - c - (lat ? lat[0] : 0));
    if (max <= 0) return "a descoberto";
    if (!lat) return num(max, 1);
    const min = dec(x.alturaM - c - lat[1]);
    if (min <= 0) return `0–${num(max, 1)} (pode secar)`;
    return min === max ? num(max, 1) : `${num(min, 1)}–${num(max, 1)}`;
  }).join(" / ");
  const bm = extremo("BM", (a, b) => a < b), pm = extremo("PM", (a, b) => a > b);
  if (bm) partes.push(`água na baixa-mar mais baixa do dia (${hora(bm.instante)}, ${num(bm.alturaM, 1)} m): ${agua(bm)} m`);
  if (pm) partes.push(`na preia-mar mais alta (${hora(pm.instante)}, ${num(pm.alturaM, 1)} m): ${agua(pm)} m`);
  const periodo = f.levantamentoFim ? `${dataPt(f.levantamento)} a ${dataPt(f.levantamentoFim)}` : dataPt(f.levantamento);
  const fonte = `Fundo: ${f.nome}, ${f.produto} (${periodo}) · medido e tratado (mediana a ±500 m do pesqueiro; provisório) · cotas: ${f.referenciaVertical}`;
  return { curto, longo: partes.join("; "), fonte };
}

export function factos(p, pq, fundo) {
  const out = [];
  if (p.potencia) {
    out.push(["Potência máx.", p.potencia.valor === null ? "não obtida"
      : `${num(p.potencia.valor, 2)} kW/m às ${hora(p.potencia.instante)}${p.potencia.completa ? "" : " (horas em falta)"}`]);
  }
  if (p.limo && pq.tipo !== "ria") out.push(["Limo", simNao(p.limo.limo)]);
  if (p.lados) {
    out.push(["Lado do molhe", p.lados.intervalos.map(i => `${i.lado ?? "indeterminado"} ${i.deLocal}–${i.ateLocal}`).join(" · ")]);
  }
  if (p.agua) {
    out.push(["Água", p.agua.media === null ? "não obtida" : `${num(p.agua.media, 1)} °C${p.agua.variacao === undefined || p.agua.variacao === null ? "" : ` (${p.agua.variacao > 0 ? "+" : ""}${num(p.agua.variacao, 1)} vs. 7 dias antes)`}`]);
  }
  if (fundo) out.push(["Fundo a 100/150/200 m", fundo.curto ?? fundo.erro]);
  return `<dl class="factos">${out.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>`;
}

const ESTADO_PARCELA_TXT = { "aplicada": "aplicada", "não aplicada": "não aplicada", "não avaliada": "não avaliada" };

export function parcelas(esp, n) {
  if (!n?.parcelas?.length) return "";
  return `<h4>Parcelas — ${esc(NOME_ESPECIE[esp])} (${esc(n.periodo ?? "")})</h4><table class="parcelas"><tbody>${n.parcelas.map(x =>
    `<tr class="${x.estado === "aplicada" ? "ap" : x.estado === "não avaliada" ? "na" : ""}"><td>${esc(x.descricao)}</td><td>${x.descricao.startsWith("base") ? esc(x.peso) : x.peso > 0 ? `+${x.peso}` : `−${Math.abs(x.peso)}`}</td><td>${esc(ESTADO_PARCELA_TXT[x.estado] ?? x.estado)}${x.motivo ? ` — ${esc(x.motivo)}` : ""}</td></tr>`).join("")}</tbody></table>`;
}

// Fontes dos valores do cartão: fonte, tipo e hora de leitura (critério 10).
export function fontesDoCartao(pq, contexto, fundo = null) {
  const linhas = [];
  const ponto = (tipo, k, nomeFonte, nota = "") => {
    if (!k) return;
    const r = contexto.pontos[tipo]?.[k];
    const loc = contexto.config.locais[k];
    const onde = loc ? `${loc.latitude}, ${loc.longitude}` : k;
    const arquivada = contexto.origem?.tipo === "arquivo" ? " · arquivada (sem rede)" : "";
    linhas.push(r?.ok ? `${nomeFonte} (${onde}) · previsto${nota}${arquivada} · lido ${quandoLido(r.readAt, agoraDe(contexto))}`
      : `${nomeFonte} (${onde}) · não obtido${r?.error ? `: ${r.error}` : ""}`);
  };
  // Revisão do ChatGPT (20/11/2026): o histórico (past_days) são previsões arquivadas, não medições.
  const arquivo = " (os 7 dias anteriores, usados na comparação da água, são previsões arquivadas, não medições)";
  ponto("mar", pq.mar, "Open-Meteo Marine", arquivo);
  ponto("terra", pq.terra, "Open-Meteo Forecast");
  if (pq.agua && pq.agua !== pq.mar) ponto("mar", pq.agua, "Open-Meteo Marine (água)", arquivo);
  const anosMares = contexto.mares?.anos?.length ? ` ${contexto.mares.anos.join(" e ")}` : "";
  linhas.push(contexto.mares?.ok ? `Marés: Instituto Hidrográfico, Faro-Olhão${anosMares} (tabela oficial, horas TU)${contexto.mares.aviso ? ` · ${contexto.mares.aviso}` : ""}`
    : `Marés: não obtidas${contexto.mares?.error ? ` (${contexto.mares.error})` : ""}`);
  if (fundo) linhas.push(fundo.fonte ?? `Fundo: ${fundo.erro}`);
  linhas.push("Sol: SunCalc · calculado no aparelho");
  linhas.push("Notas: calculadas pelas regras da app · provisórias");
  return `<h4>Fontes</h4><ul class="fontes">${linhas.map(l => `<li>${esc(l)}</li>`).join("")}</ul>`;
}

export function detalhes(p, pq, d, contexto, fundo, { aberto = false, antes = "" } = {}) {
  const s = contexto.sol ? contexto.sol(d.dia, pq.terra) : null;
  const dados = [];
  if (p.limo && pq.tipo !== "ria") dados.push(["Limo", `${simNao(p.limo.limo)}${p.limo.motivo ? ` — ${p.limo.motivo}` : ""}${p.limo.horasComLimo?.length ? ` (${p.limo.horasComLimo.map(hora).join(", ")})` : ""}`]);
  if (p.pressao) {
    const de = p.pressao.descida;
    dados.push(["Pressão", `${de.activo === null ? `descida por verificar${de.motivo ? ` (${de.motivo})` : ""}` : `maior descida em 24 h: ${num(de.descidaHpa, 1)} hPa${de.activo ? " — peixe activo" : ""}`}; alta e estável: ${simNao(p.pressao.altaEstavel.valor)}`]);
  }
  if (p.chuva) dados.push(["Chuva 48 h", p.chuva.turva === null ? `por verificar${p.chuva.motivo ? ` (${p.chuva.motivo})` : ""}` : `${num(p.chuva.chuva48hMm, 1)} mm${p.chuva.turva ? " — água turva" : ""}`]);
  if (p.agua) dados.push(["Água", p.agua.media === null ? (p.agua.motivo ?? "não obtida") : `${num(p.agua.media, 1)} °C${p.agua.comparacao === null ? ` — ${p.agua.motivo ?? "comparação não possível"}` : ""}`]);
  if (d.repontos) dados.push(["Marés", d.repontos.map(r => `${NOME_MARE[r.tipo]} ${hora(r.instante)} (${num(r.alturaM, 1)} m)`).join(" · ")]);
  dados.push(["Sol", s ? `nasce ${hora(s.nascer)} · põe-se ${hora(s.por)}` : "não calculado"]);
  if (p.potencia?.avisos?.length) dados.push(["Potência", p.potencia.avisos.join("; ")]);
  if (fundo?.longo) dados.push(["Fundo típico", fundo.longo]);
  return `<details class="detalhes"${aberto ? " open" : ""}><summary>Dados, parcelas e fontes</summary>${antes}
    <dl class="factos">${dados.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>
    ${Object.entries(p.notas).map(([esp, n]) => parcelas(esp, n)).join("")}
    ${fontesDoCartao(pq, contexto, fundo)}
  </details>`;
}

// Fontes de um pesqueiro que não foram lidas (também no comparador).
export function fontesEmFalta(pq, contexto) {
  const falhas = [];
  const ver = (tipo, k, o) => {
    const r = k ? contexto.pontos[tipo]?.[k] : null;
    if (k && !r?.ok) falhas.push(`${o} não obtidos${r?.error ? ` — ${r.error}` : ""}`);
  };
  ver("mar", pq.mar, "Ondulação e potência (Open-Meteo Marine)");
  ver("terra", pq.terra, "Vento, pressão e chuva (Open-Meteo Forecast)");
  if (pq.agua && pq.agua !== pq.mar) ver("mar", pq.agua, "Temperatura da água (Open-Meteo Marine)");
  if (!contexto.mares?.ok) falhas.push(`Marés não obtidas${contexto.mares?.error ? ` — ${contexto.mares.error}` : ""}`);
  return falhas;
}

// Fontes em falta primeiro (o utilizador tem de saber o que não foi lido), depois os avisos do motor.
export function avisosDoCartao(p, pq, contexto) {
  const falhas = fontesEmFalta(pq, contexto);
  if (!falhas.length && !p.avisos.length) return "";
  return `<ul class="avisos">${falhas.map(a => `<li class="falha">${esc(a)}</li>`).join("")}${p.avisos.map(a => `<li>${esc(a)}</li>`).join("")}</ul>`;
}

// Ligações externas (câmaras, estações): só para o utilizador ver; a app não lê estes dados.
export const ligacoes = (titulo, lista) => (lista?.length
  ? `${esc(titulo)}: ${lista.map(c => `<a href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.nome)}</a>`).join(" · ")}<br>` : "");

// Pesqueiro sem nota para a espécie escolhida.
export function semEspecie(esp, pq) {
  const texto = pq.tipo === "ria" ? "não se aplica na Ria (interior)"
    : esp === "dourada" && pq.tipo === "praia" ? "regra para a dourada nas praias por decidir" : "sem regra para este pesqueiro";
  return `<div class="especie sem"><div class="esp-topo"><span class="esp-nome">${esc(NOME_ESPECIE[esp])}</span><span class="nota nd">—</span></div><p class="motivo">${esc(texto)}</p></div>`;
}

export const TIPO_LOCAL = { praia: "praia (mar de fora)", molhe: "molhe", ria: "Ria (interior)" };

// As notas do dia das espécies do pesqueiro, lado a lado, com o estado e o melhor período (PR 9).
// F0 (22/11/2026). Hoje, a nota do dia (a do melhor período, regra aprovada) pode ser de um período
// que já acabou. Nesse caso devolve-se a melhor nota dos períodos que ainda faltam: as mesmas notas
// do motor, sem outra classificação (como a «melhor janela» e «Onde e quando»). Os empatados vão
// todos; «sem nota» são os n.d. e «por confirmar» que faltam. Entre os períodos com nota mais baixa e
// incompletos (revisão de 22/11/2026): «pode subir» só quando o motor dá um limite superior numérico
// (intervalo.max) acima dessa nota; com limite exactamente igual a essa nota (pode empatar, não pode
// passar) ou sem limite superior conhecido, o período fica dito como «incompleta», sem se afirmar que
// pode subir; com limite abaixo dessa nota, não muda nada e não se diz nada. (Hoje o motor dá sempre
// um intervalo numérico às notas «ok», js/regras/notas.js; a verificação de «sem limite» é só para
// não afirmar sem limite.) Devolve null quando a nota do dia não é de um período passado. Função pura.
export function restoDoDia(p, esp, passados) {
  const n = p.notas?.[esp];
  if (!n || n.estado !== "ok" || !n.periodo || !passados.includes(n.periodo)) return null;
  const vivos = (p.periodos ?? []).filter(per => !passados.includes(per.nome))
    .map(per => ({ nome: per.nome, n: per.notas?.[esp] ?? null })).filter(x => x.n);
  const ok = vivos.filter(x => x.n.estado === "ok");
  const semNota = vivos.filter(x => x.n.estado !== "ok").map(x => x.nome);
  if (!ok.length) return { passou: n.periodo, nota: null, melhor: null, periodos: [], completa: false, podeSubir: [], incompletas: [], semNota };
  const nota = Math.max(...ok.map(x => x.n.nota));
  const melhores = ok.filter(x => x.n.nota === nota);
  const abaixoIncompletas = ok.filter(x => x.n.nota < nota && !x.n.completa);
  const temLimite = x => Number.isFinite(x.n.intervalo?.max);
  const podeSubir = abaixoIncompletas.filter(x => temLimite(x) && x.n.intervalo.max > nota).map(x => x.nome);
  const incompletas = abaixoIncompletas.filter(x => !temLimite(x) || x.n.intervalo.max === nota).map(x => x.nome);
  return { passou: n.periodo, nota, melhor: melhores[0].n, periodos: melhores.map(x => x.nome),
    completa: melhores.every(x => x.n.completa === true), podeSubir, incompletas, semNota };
}

function textoResto(r) {
  if (r.nota === null) return `resto de hoje sem nota${r.semNota.length ? ` (${r.semNota.join(", ")})` : ""}`;
  const extra = [r.podeSubir.length ? `pode subir: ${r.podeSubir.join(", ")}` : "",
    r.incompletas.length ? `incompleta: ${r.incompletas.join(", ")}` : "",
    r.semNota.length ? `sem nota: ${r.semNota.join(", ")}` : ""].filter(Boolean);
  return `resto de hoje · ${r.periodos.join(", ")} · ${r.completa ? "completa" : "incompleta"}${extra.length ? ` · ${extra.join(" · ")}` : ""}`;
}

export function notasDoCartao(p, especieEscolhida, passados = []) {
  return `<div class="notas-cartao">${Object.entries(p.notas).map(([esp, n]) => {
    const r = restoDoDia(p, esp, passados);
    const abre = `<div class="nota-esp${esp === especieEscolhida ? " sel" : ""}${r ? " resto" : ""}" data-especie="${esc(esp)}">
      <span class="esp">${esc(NOME_ESPECIE[esp] ?? esp)}</span>`;
    if (r) {
      // Não se mostra como actual a nota de um período que já acabou: o selo é o do resto do dia e a
      // nota do dia fica escrita ao lado, com «já passou» (como no comparador).
      const selo = r.nota === null ? `<b class="mini nd">—</b>`
        : `<b class="mini ${classeNota(r.melhor)}${r.completa ? "" : " inc"}">${r.nota}</b>`;
      return `${abre}${selo}
      <span class="estado-nota e-${r.nota === null ? "sem-nota" : r.completa ? "completa" : "incompleta"}">${esc(textoResto(r))}</span>
      <span class="nota-passou">nota do dia ${esc(textoNota(n))} · ${esc(n.periodo)} (já passou)</span></div>`;
    }
    const estado = estadoDaNota(n);
    const quando = n?.estado === "ok" && n.periodo ? ` · ${n.periodo}` : "";
    return `${abre}
      <b class="mini ${classeNota(n)}${n?.estado === "ok" && !n.completa ? " inc" : ""}">${esc(textoNota(n))}</b>
      <span class="estado-nota e-${esc(estado.replace(/\s+/g, "-"))}">${esc(estado)}${esc(quando)}</span></div>`;
  }).join("")}</div>`;
}

const chaveAlinhamentos = lista => lista.map(a => `${a.reponto}|${a.evento}`).join(";");

function cartao(id, p, d, contexto) {
  const pq = contexto.config.pesqueiros[id];
  const especies = Object.keys(p.notas);
  const esp = contexto.especie ?? "robalo";
  const nEsp = p.notas[esp];
  const melhor = nEsp?.estado === "ok" ? nEsp : null;
  const passados = periodosPassados(d.dia, contexto);
  const resto = restoDoDia(p, esp, passados);
  // Selo da fotografia: a nota do dia; hoje, se o período dela já acabou, a melhor do resto do dia (F0).
  const selo = resto
    ? { nota: resto.nota, completa: resto.completa, titulo: resto.nota === null ? `${NOME_ESPECIE[esp]}: resto de hoje sem nota (a nota do dia, da ${resto.passou}, já passou)`
      : `${NOME_ESPECIE[esp]}: ${resto.nota}/5 no resto de hoje (${resto.periodos.join(", ")}); a nota do dia, da ${resto.passou}, já passou` }
    : { nota: melhor?.nota ?? null, completa: melhor?.completa ?? false,
      titulo: melhor ? `${NOME_ESPECIE[esp]}: nota do dia ${melhor.nota}/5 (${melhor.periodo})` : `${NOME_ESPECIE[esp]}: sem nota do dia` };
  const foto = pq.foto;
  // Fase 1 (20/11/2026): o alinhamento do dia aparece uma vez, no topo; o cartão só o repete quando
  // é diferente (por exemplo, quando nem todos os pesqueiros o têm).
  const aliCartao = alinhamentosDoDia({ pesqueiros: { [id]: p } });
  const ali = aliCartao.length && chaveAlinhamentos(aliCartao) !== chaveAlinhamentos(alinhamentosDoDia(d)) ? aliCartao : [];
  const fundo = fundoDoCartao(id, d, contexto);
  const url = `./pesqueiro.html?id=${encodeURIComponent(id)}${contexto.indice > 0 ? `&dia=${contexto.indice}` : ""}`;
  const factores = nEsp ? porque(nEsp).slice(0, 3) : [];
  return `<article class="cartao" id="pq-${esc(id)}">
    <div class="foto"${foto ? ` style="background-image:url('${esc(foto.ficheiro)}')"` : ""}>
      <div class="foto-texto"><h2>${esc(pq.nomeCurto ?? pq.nome)}</h2><p>${esc(TIPO_LOCAL[pq.tipo] ?? pq.tipo)} · ${esc(especies.map(e => NOME_ESPECIE[e]).join(" e "))}</p></div>
      <div class="selo ${selo.nota !== null ? `n${selo.nota}` : "nd"}${selo.nota !== null && !selo.completa ? " inc" : ""}" title="${esc(selo.titulo)}">${selo.nota ?? "—"}</div>
    </div>
    <div class="corpo">
      ${notasDoCartao(p, esp, passados)}
      ${ali.length ? `<div class="alinhamento"><b>Alinhamento</b> ${ali.map(a => esc(textoAlinhamento(a))).join("; ")}</div>` : ""}
      ${nEsp ? linhaEspecie(esp, nEsp, p.periodos, { compacto: true, passados }) : semEspecie(esp, pq)}
      ${factores.length ? `<ul class="factores-cartao" aria-label="O que explica a nota">${factores.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
      <div class="accoes-cartao"><a class="ligacao-pq btn" href="${url}">Página do pesqueiro ›</a>
        <button type="button" class="btn-horas" data-pq="${esc(id)}">Hora a hora ›</button></div>
      ${avisosDoCartao(p, pq, contexto)}
      ${detalhes(p, pq, d, contexto, fundo, { antes: factos(p, pq, fundo) })}
      <p class="rodape">${ligacoes("Vento agora (Windguru)", pq.estacoes)}${ligacoes("Câmaras", pq.camaras)}</p>
    </div>
  </article>`;
}

// Ordem dos cartões: nascente → poente, mas os pesqueiros sem nota para a espécie escolhida (a Ria,
// para o robalo) vão para o fim (Fase 1, 20/11/2026). Só muda a ordem; nenhum cartão desaparece.
export function ordemDosCartoes(d, especie) {
  const lista = Object.entries(d.pesqueiros);
  return [...lista.filter(([, p]) => p.notas[especie]), ...lista.filter(([, p]) => !p.notas[especie])];
}

// contexto: { analise, config, pontos, mares, sol, lidoEm, indice }
// Escolha da espécie: as notas, a faixa de dias e o resumo seguem-na.
export function escolhaEspecie(especie) {
  return `<nav class="especies" aria-label="Espécie">${ESPECIES.map(e =>
    `<button type="button" class="especie-btn${e === especie ? " sel" : ""}" data-especie="${e}" aria-pressed="${e === especie}">${esc(NOME_ESPECIE[e])}</button>`).join("")}</nav>`;
}

export function renderInicio(contexto) {
  const { analise, indice = 0 } = contexto;
  const especie = contexto.especie ?? "robalo";
  const d = analise.dias[indice];
  return `<header class="topo"><div><h1>Surfcasting Algarve</h1>
      <p class="lido">${linhaLeitura(contexto)}</p></div>
      <button type="button" id="actualizar" class="btn-actualizar" aria-label="Actualizar dados">↻</button></header>
    ${avisoOrigem(contexto)}
    ${escolhaEspecie(especie)}
    ${faixaDias(analise, indice, especie)}
    ${destaque(analise, indice, contexto, especie)}
    ${ondeQuando(analise, indice, contexto, especie)}
    ${marAgora(contexto)}
    <section class="cartoes">${ordemDosCartoes(d, especie).map(([id, p]) => cartao(id, p, d, contexto)).join("")}</section>
    <p class="legenda">Créditos das fotografias na página <a href="./fontes.html">Fontes</a>.</p>
    <p class="legenda">Notas de 1 a 5 por período (madrugada 00–06, manhã 06–12, tarde 12–18, noite 18–24, hora de Portugal continental). <b class="mini nd">n.d.</b> sem dados suficientes · <b class="mini pc">?</b> por confirmar no terreno. Todas as notas são provisórias.</p>`;
}
