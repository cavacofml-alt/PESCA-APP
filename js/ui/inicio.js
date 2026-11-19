// Ecrã inicial (Fase 4): resumo, escolha do dia e um cartão por pesqueiro, à maneira dos
// favoritos da Fizk. Só apresenta o que o motor calculou (js/regras/): não calcula notas.
// Requisitos das revisões da Fase 3: nunca mostrar uma nota incompleta como definitiva —
// intervalo, períodos sem nota, parcelas por avaliar, n.d. e «por confirmar» sempre visíveis.
// Função pura: devolve HTML (texto escapado).
import { esc, hora, horaIso, num, rotuloDia, classeNota, textoNota, NOME_ESPECIE, PERIODO_CURTO, NOME_MARE, rumo } from "./formato.js";
import { ordenarMelhoresDias } from "../regras/notas.js";
import { resumoBoia } from "../fontes/ih-boias.js";
import { DISTANCIAS_FUNDO } from "../fontes/fundo-tipico.js";

export const ESPECIES = ["robalo", "dourada"];

// Melhor nota do dia para a espécie escolhida.
const melhorNotaDoDia = (d, esp) => {
  const v = esp === "dourada" ? d.melhorDourada : d.melhorRobalo;
  return typeof v === "number" ? v : null;
};

// Melhor combinação pesqueiro/espécie de um dia (só notas "ok").
function melhorDoDia(d, config, especie) {
  let melhor = null;
  for (const [id, p] of Object.entries(d.pesqueiros)) {
    for (const [esp, n] of Object.entries(p.notas)) {
      if (esp !== especie || n?.estado !== "ok") continue;
      if (!melhor || n.nota > melhor.n.nota) melhor = { id, esp, n, nome: config.pesqueiros[id]?.nomeCurto ?? id };
    }
  }
  return melhor;
}

// Alinhamentos reponto/Sol do dia, sem repetir o mesmo reponto entre pesqueiros.
function alinhamentosDoDia(d) {
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

const textoAlinhamento = a =>
  `${a.tipo === "PM" ? "Preia-mar" : "Baixa-mar"} às ${hora(a.reponto)}, a ${a.minutos} min do ${a.evento}`;

function resumo(analise, indice, config, especie) {
  const d = analise.dias[indice];
  const melhoresDias = ordenarMelhoresDias(analise.dias, especie).slice(0, 3).map(dd => {
    const m = melhorNotaDoDia(dd, especie);
    return m === null ? null : `${rotuloDia(dd.dia, dd.indice)} (${m})`;
  }).filter(Boolean);
  const m = melhorDoDia(d, config, especie);
  const ali = alinhamentosDoDia(d);
  return `<section class="resumo" aria-label="Resumo">
    <p><span class="rot">Melhores dias</span><span>${melhoresDias.length ? esc(melhoresDias.join(" · ")) : "sem notas"}</span></p>
    <p><span class="rot">${esc(rotuloDia(d.dia, indice))}</span><span>${m
      ? `${esc(m.nome)} · ${esc(NOME_ESPECIE[m.esp])} <b class="mini ${classeNota(m.n)}">${m.n.nota}</b> ${esc(m.n.periodo)}${m.n.completa ? "" : " · incompleta"}`
      : "sem notas para este dia"}</span></p>
    <p><span class="rot">Maré</span><span>${d.amplitude.amplitude === null ? `não obtida${d.amplitude.motivo ? ` (${esc(d.amplitude.motivo)})` : ""}`
      : `${num(d.amplitude.amplitude, 1)} m · ${esc(d.amplitude.classe)}`}${d.repontos ? `<br>${esc(maresPorTipo(d.repontos))}` : ""}</span></p>
    ${ali.length ? `<div class="alinhamento"><b>Alinhamento</b> ${ali.map(a => esc(textoAlinhamento(a))).join("; ")}</div>` : ""}
  </section>`;
}

// Valor da boia com o estado quando não há valor (nunca um número inventado).
const valorBoia = (x, casas, unidade) => (x.estado === "obtido" ? `${num(x.valor, casas)} ${unidade}` : x.estado);

// Previsão do Open-Meteo para a hora certa mais próxima da medição, no ponto indicado no config.
function previsaoParaHora(contexto, ponto, instante) {
  const h = contexto.pontos?.mar?.[ponto]?.data?.hourly;
  const i = h?.time?.indexOf(Math.round(instante / 3600000) * 3600) ?? -1;
  if (i < 0 || !Number.isFinite(h.wave_height?.[i])) return null;
  return { instante: h.time[i] * 1000, hs: h.wave_height[i], periodo: h.wave_period?.[i] };
}

// Boia de Faro (Instituto Hidrográfico): o mar medido agora, ao lado da previsão para a mesma
// hora. Só para ver: não entra nas notas.
function marAgora(contexto) {
  const b = contexto.config.boias?.faro;
  const r = contexto.boiaFaro;
  if (!b || !r) return "";
  const topo = `<h3>Mar agora <small>· ${esc(b.nome)} · observado</small></h3>`;
  if (!r.ok) return `<section class="mar-agora" aria-label="Mar agora">${topo}<p class="falha">Não obtido${r.error ? ` — ${esc(r.error)}` : ""}</p></section>`;
  const s = resumoBoia(r.data, { agora: new Date(Date.parse(contexto.lidoEm)), maxIdadeHoras: b.maxIdadeHoras });
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
  if (prev) linhas.push(["Previsão", `Open-Meteo às ${hora(prev.instante)} (${nomePonto}): ${num(prev.hs, 2)} m${Number.isFinite(prev.periodo) ? `, período ${num(prev.periodo, 1)} s` : ""}`]);
  const idade = s.idadeMin >= 60 ? `há ${Math.floor(s.idadeMin / 60)} h ${s.idadeMin % 60} min` : `há ${s.idadeMin} min`;
  return `<section class="mar-agora" aria-label="Mar agora">${topo}
    ${s.desactualizada ? `<p class="falha">Última medição ${esc(idade)}: desactualizada</p>` : ""}
    <dl class="factos">${linhas.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>
    <p class="fonte-boia">Medido às ${esc(hora(u.instante))} (${esc(idade)}) ao largo, a ${esc(b.profundidadeM)} m de fundo: na praia a onda chega diferente. Não entra nas notas.<br>
    Instituto Hidrográfico, boia ${esc(b.codigo)} (${esc(b.latitude)}, ${esc(b.longitude)}) · observado · lido às ${esc(horaIso(r.readAt))} · <a href="${esc(b.licencaUrl)}" target="_blank" rel="noopener">${esc(b.licenca)}</a></p>
  </section>`;
}

function faixaDias(analise, indice, especie) {
  return `<nav class="dias" aria-label="Dias">${analise.dias.map((d, i) => {
    const m = melhorNotaDoDia(d, especie);
    return `<button type="button" class="dia${i === indice ? " sel" : ""}" data-dia="${i}" aria-pressed="${i === indice}">
      <span>${esc(rotuloDia(d.dia, i))}</span><b class="mini ${m === null ? "nd" : `n${m}`}">${m ?? "—"}</b>${d.alinhado ? '<i class="ponto-ali" title="alinhamento"></i>' : ""}</button>`;
  }).join("")}</nav>`;
}

// Linha de uma espécie: nota do dia, notas por período e incompletude.
function linhaEspecie(esp, n, periodos) {
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
  return `<div class="especie">
    <div class="esp-topo"><span class="esp-nome">${esc(NOME_ESPECIE[esp] ?? esp)}</span>
      <span class="nota ${classeNota(n)}">${esc(textoNota(n))}${n.estado === "ok" ? "<small>/5</small>" : ""}</span>
      ${n.estado === "ok" && n.periodo ? `<span class="per">${esc(n.periodo)}</span>` : ""}</div>
    <ol class="periodos">${periodos.map(p => {
      const pn = p.notas[esp];
      return `<li class="${classeNota(pn)}" title="${esc(`${p.nome}: ${pn?.estado === "ok" ? `${pn.nota}/5` : pn?.estado ?? "—"}${pn?.motivo ? ` — ${pn.motivo}` : ""}`)}"><span>${esc(PERIODO_CURTO[p.nome] ?? p.nome)}</span><b>${esc(textoNota(pn))}</b></li>`;
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
  const curto = `${lista(cotas)} m (${f.rotulo})`;
  const partes = [`cota mediana a ${DISTANCIAS_FUNDO.join(" / ")} m da linha de meia-maré: ${curto}`];
  const rep = d?.repontos ?? [];
  const extremo = (tipo, pior) => rep.filter(x => x.tipo === tipo).reduce((a, x) => (!a || pior(x.alturaM, a.alturaM) ? x : a), null);
  const agua = x => cotas.map(c => {
    const v = Math.round((x.alturaM - c) * 10) / 10;
    return v <= 0 ? "a descoberto" : num(v, 1);
  }).join(" / ");
  const bm = extremo("BM", (a, b) => a < b), pm = extremo("PM", (a, b) => a > b);
  if (bm) partes.push(`água na baixa-mar mais baixa do dia (${hora(bm.instante)}, ${num(bm.alturaM, 1)} m): ${agua(bm)} m`);
  if (pm) partes.push(`na preia-mar mais alta (${hora(pm.instante)}, ${num(pm.alturaM, 1)} m): ${agua(pm)} m`);
  const periodo = f.levantamentoFim ? `${dataPt(f.levantamento)} a ${dataPt(f.levantamentoFim)}` : dataPt(f.levantamento);
  const fonte = `Fundo: ${f.nome}, ${f.produto} (${periodo}) · medido e tratado (mediana a ±500 m do pesqueiro; provisório) · cotas: ${f.referenciaVertical}`;
  return { curto, longo: partes.join("; "), fonte };
}

function factos(p, pq, fundo) {
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

function parcelas(esp, n) {
  if (!n?.parcelas?.length) return "";
  return `<h4>Parcelas — ${esc(NOME_ESPECIE[esp])} (${esc(n.periodo ?? "")})</h4><table class="parcelas"><tbody>${n.parcelas.map(x =>
    `<tr class="${x.estado === "aplicada" ? "ap" : x.estado === "não avaliada" ? "na" : ""}"><td>${esc(x.descricao)}</td><td>${x.descricao.startsWith("base") ? esc(x.peso) : x.peso > 0 ? `+${x.peso}` : `−${Math.abs(x.peso)}`}</td><td>${esc(ESTADO_PARCELA_TXT[x.estado] ?? x.estado)}${x.motivo ? ` — ${esc(x.motivo)}` : ""}</td></tr>`).join("")}</tbody></table>`;
}

// Fontes dos valores do cartão: fonte, tipo e hora de leitura (critério 10).
export function fontesDoCartao(pq, contexto, fundo = null) {
  const linhas = [];
  const ponto = (tipo, k, nomeFonte) => {
    if (!k) return;
    const r = contexto.pontos[tipo]?.[k];
    const loc = contexto.config.locais[k];
    const onde = loc ? `${loc.latitude}, ${loc.longitude}` : k;
    linhas.push(r?.ok ? `${nomeFonte} (${onde}) · previsto · lido às ${horaIso(r.readAt)}`
      : `${nomeFonte} (${onde}) · não obtido${r?.error ? `: ${r.error}` : ""}`);
  };
  ponto("mar", pq.mar, "Open-Meteo Marine");
  ponto("terra", pq.terra, "Open-Meteo Forecast");
  if (pq.agua && pq.agua !== pq.mar) ponto("mar", pq.agua, "Open-Meteo Marine (água)");
  linhas.push(contexto.mares?.ok ? "Marés: Instituto Hidrográfico, Faro-Olhão 2026 (tabela oficial, horas TU)" : `Marés: não obtidas${contexto.mares?.error ? ` (${contexto.mares.error})` : ""}`);
  if (fundo) linhas.push(fundo.fonte ?? `Fundo: ${fundo.erro}`);
  linhas.push("Sol: SunCalc · calculado no aparelho");
  linhas.push("Notas: calculadas pelas regras da app · provisórias");
  return `<h4>Fontes</h4><ul class="fontes">${linhas.map(l => `<li>${esc(l)}</li>`).join("")}</ul>`;
}

function detalhes(p, pq, d, contexto, fundo) {
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
  return `<details class="detalhes"><summary>Dados, parcelas e fontes</summary>
    <dl class="factos">${dados.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>
    ${Object.entries(p.notas).map(([esp, n]) => parcelas(esp, n)).join("")}
    ${fontesDoCartao(pq, contexto, fundo)}
  </details>`;
}

// Fontes em falta primeiro (o utilizador tem de saber o que não foi lido), depois os avisos do motor.
function avisosDoCartao(p, pq, contexto) {
  const falhas = [];
  const ver = (tipo, k, o) => {
    const r = k ? contexto.pontos[tipo]?.[k] : null;
    if (k && !r?.ok) falhas.push(`${o} não obtidos${r?.error ? ` — ${r.error}` : ""}`);
  };
  ver("mar", pq.mar, "Ondulação e potência (Open-Meteo Marine)");
  ver("terra", pq.terra, "Vento, pressão e chuva (Open-Meteo Forecast)");
  if (pq.agua && pq.agua !== pq.mar) ver("mar", pq.agua, "Temperatura da água (Open-Meteo Marine)");
  if (!contexto.mares?.ok) falhas.push(`Marés não obtidas${contexto.mares?.error ? ` — ${contexto.mares.error}` : ""}`);
  if (!falhas.length && !p.avisos.length) return "";
  return `<ul class="avisos">${falhas.map(a => `<li class="falha">${esc(a)}</li>`).join("")}${p.avisos.map(a => `<li>${esc(a)}</li>`).join("")}</ul>`;
}

// Ligações externas (câmaras, estações): só para o utilizador ver; a app não lê estes dados.
const ligacoes = (titulo, lista) => (lista?.length
  ? `${esc(titulo)}: ${lista.map(c => `<a href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.nome)}</a>`).join(" · ")}<br>` : "");

// Pesqueiro sem nota para a espécie escolhida.
function semEspecie(esp, pq) {
  const texto = pq.tipo === "ria" ? "não se aplica na Ria (interior)"
    : esp === "dourada" && pq.tipo === "praia" ? "regra para a dourada nas praias por decidir" : "sem regra para este pesqueiro";
  return `<div class="especie sem"><div class="esp-topo"><span class="esp-nome">${esc(NOME_ESPECIE[esp])}</span><span class="nota nd">—</span></div><p class="motivo">${esc(texto)}</p></div>`;
}

function cartao(id, p, d, contexto) {
  const pq = contexto.config.pesqueiros[id];
  const especies = Object.keys(p.notas);
  const esp = contexto.especie ?? "robalo";
  const nEsp = p.notas[esp];
  const melhor = nEsp?.estado === "ok" ? nEsp : null;
  const foto = pq.foto;
  const ali = alinhamentosDoDia({ pesqueiros: { [id]: p } });
  const fundo = fundoDoCartao(id, d, contexto);
  return `<article class="cartao" id="pq-${esc(id)}">
    <div class="foto"${foto ? ` style="background-image:url('${esc(foto.ficheiro)}')"` : ""}>
      <div class="foto-texto"><h2>${esc(pq.nomeCurto ?? pq.nome)}</h2><p>${esc(especies.map(e => NOME_ESPECIE[e]).join(" e "))}</p></div>
      <div class="selo ${melhor ? `n${melhor.nota}` : "nd"}${melhor && !melhor.completa ? " inc" : ""}">${melhor ? melhor.nota : "—"}</div>
    </div>
    <div class="corpo">
      ${ali.length ? `<div class="alinhamento"><b>Alinhamento</b> ${ali.map(a => esc(textoAlinhamento(a))).join("; ")}</div>` : ""}
      ${nEsp ? linhaEspecie(esp, nEsp, p.periodos) : semEspecie(esp, pq)}
      <button type="button" class="btn-horas" data-pq="${esc(id)}">Hora a hora ›</button>
      ${factos(p, pq, fundo)}
      ${avisosDoCartao(p, pq, contexto)}
      ${detalhes(p, pq, d, contexto, fundo)}
      <p class="rodape">${ligacoes("Vento agora (Windguru)", pq.estacoes)}${ligacoes("Câmaras", pq.camaras)}</p>
    </div>
  </article>`;
}

// contexto: { analise, config, pontos, mares, sol, lidoEm, indice }
// Escolha da espécie, como na Fizk: as notas, a faixa de dias e o resumo seguem-na.
function escolhaEspecie(especie) {
  return `<nav class="especies" aria-label="Espécie">${ESPECIES.map(e =>
    `<button type="button" class="especie-btn${e === especie ? " sel" : ""}" data-especie="${e}" aria-pressed="${e === especie}">${esc(NOME_ESPECIE[e])}</button>`).join("")}</nav>`;
}

export function renderInicio(contexto) {
  const { analise, indice = 0, lidoEm } = contexto;
  const especie = contexto.especie ?? "robalo";
  const d = analise.dias[indice];
  return `<header class="topo"><div><h1>Surfcasting Algarve</h1>
      <p class="lido">Dados lidos às ${esc(horaIso(lidoEm))} · notas provisórias</p></div>
      <button type="button" id="actualizar" class="btn-actualizar" aria-label="Actualizar dados">↻</button></header>
    ${escolhaEspecie(especie)}
    ${faixaDias(analise, indice, especie)}
    ${resumo(analise, indice, contexto.config, especie)}
    ${marAgora(contexto)}
    <section class="cartoes">${Object.entries(d.pesqueiros).map(([id, p]) => cartao(id, p, d, contexto)).join("")}</section>
    <p class="legenda">Créditos das fotografias na página <a href="./diagnostico.html">Fontes</a>.</p>
    <p class="legenda">Notas de 1 a 5 por período (madrugada 00–06, manhã 06–12, tarde 12–18, noite 18–24, hora de Portugal continental). <b class="mini nd">n.d.</b> sem dados suficientes · <b class="mini pc">?</b> por confirmar no terreno. Todas as notas são provisórias.</p>`;
}
