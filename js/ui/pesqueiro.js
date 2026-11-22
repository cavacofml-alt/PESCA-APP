// Página de um pesqueiro (plano de evolução, PR 4, 20/11/2026): tudo o que a app sabe de um pesqueiro
// num só ecrã, gerado a partir do config (pesqueiro.html?id=<id>): fotografia, localização e pontos
// de dados, notas por espécie e período, «hora a hora», marés, fundo, factores e parcelas, fontes e
// avisos. Reutiliza os componentes do ecrã inicial e do «hora a hora»; não calcula notas.
// Um pesqueiro novo no config tem página sem mudar código. Função pura (HTML com texto escapado).
import { esc, num, hora, rotuloDia, classeNota, textoNota, NOME_ESPECIE, NOME_MARE, rumo } from "./formato.js";
import { linhaEspecie, semEspecie, factos, detalhes, avisosDoCartao, ligacoes, fundoDoCartao, alinhamentosDoDia,
  textoAlinhamento, linhaLeitura, avisoOrigem, TIPO_LOCAL } from "./inicio.js";
import { conteudoHorario, janelasDoPesqueiro } from "./horario.js";
import { porque } from "./explicacao.js";

export { janelasDoPesqueiro };
const PAPEL = { terra: "vento, pressão e chuva", mar: "ondulação e potência", agua: "temperatura da água" };

export const urlPesqueiro = (id, dia) => `./pesqueiro.html?id=${encodeURIComponent(id)}${Number.isInteger(dia) && dia > 0 ? `&dia=${dia}` : ""}`;

// Pontos de dados do pesqueiro (config.locais), agrupados quando o mesmo ponto serve vários papéis.
export function pontosDoPesqueiro(pq, config) {
  const porPonto = new Map();
  for (const papel of ["terra", "mar", "agua"]) {
    const k = pq[papel];
    if (!k) continue;
    if (!porPonto.has(k)) porPonto.set(k, { chave: k, local: config.locais[k] ?? null, papeis: [] });
    porPonto.get(k).papeis.push(PAPEL[papel]);
  }
  return [...porPonto.values()];
}

// Os pontos com coordenadas recebem um número (1, 2, …), o mesmo no mini-mapa e na lista.
export const numerarPontos = pontos => {
  let n = 0;
  return pontos.map(x => ({ ...x, n: x.local ? ++n : null }));
};

// Atribuição do config (HTML com ligações) → HTML seguro: só ligações https (endereço e texto escapados); o resto é texto escapado.
export function atribuicaoSegura(html) {
  const txt = String(html ?? "");
  const re = /<a\s+href="(https:\/\/[^"]+)"[^>]*>([^<]*)<\/a>/gi;
  const partes = [];
  let i = 0;
  for (let m; (m = re.exec(txt));) {
    partes.push(esc(txt.slice(i, m.index).replace(/<[^>]*>/g, "")), `<a href="${esc(m[1])}">${esc(m[2])}</a>`);
    i = re.lastIndex;
  }
  partes.push(esc(txt.slice(i).replace(/<[^>]*>/g, "")));
  return partes.join("");
}

// Mini-mapa (revisão do PR 9, 22/11/2026): só ilustrativo. O mapa para explorar é o ecrã «Mapa»
// («Ver no mapa»). Por isso não tem controlos nem recebe o foco, fica fora da árvore de
// acessibilidade (aria-hidden; a lista numerada por baixo tem tudo o que ele mostra) e a atribuição
// do fundo vai na legenda, fora do mapa, com ligações acessíveis. Sem Leaflet, a figura esconde-se.
function miniMapa(pontos, config, { comLigacao = true } = {}) {
  const n = pontos.filter(x => x.local).length;
  if (!n) return "";
  const osm = config.mapa?.fundosBase?.osm?.atribuicao;
  const leaflet = config.mapa?.leaflet;
  return `<figure class="mini-mapa-fig" id="fig-mini-mapa">
        <div id="mini-mapa" class="mini-mapa" aria-hidden="true"></div>
        <figcaption>Mapa ilustrativo, sem zoom: ${n === 1 ? "o número é o ponto" : "os números são os pontos"} da lista abaixo.${comLigacao ? " Para explorar o mapa e o fundo do mar, use «Ver no mapa»." : ""}
          ${osm || leaflet ? `<span class="atrib-mapa">Fundo: ${[osm, leaflet].filter(Boolean).map(atribuicaoSegura).join(" · ")}</span>` : ""}</figcaption>
      </figure>`;
}

function lista(config, indice) {
  return `<ul class="lista-pq">${Object.entries(config.pesqueiros).map(([id, pq]) =>
    `<li><a href="${esc(urlPesqueiro(id, indice))}">${esc(pq.nome)}</a></li>`).join("")}</ul>`;
}

// Dias com as notas deste pesqueiro (as de todas as espécies dele).
function faixaDiasPesqueiro(analise, indice, id) {
  return `<nav class="dias" aria-label="Dias">${analise.dias.map((d, i) => {
    const p = d.pesqueiros[id];
    const notas = Object.entries(p?.notas ?? {}).map(([esp, n]) =>
      `<b class="mini ${classeNota(n)}${n?.estado === "ok" && !n.completa ? " inc" : ""}" title="${esc(NOME_ESPECIE[esp])}">${esc(textoNota(n))}</b>`).join("");
    return `<button type="button" class="dia${i === indice ? " sel" : ""}" data-dia="${i}" aria-pressed="${i === indice}">
      <span>${esc(rotuloDia(d.dia, i))}</span><span class="notas-dia">${notas}</span>${p?.alinhamento?.alinhado ? '<i class="ponto-ali" title="alinhamento"></i>' : ""}</button>`;
  }).join("")}</nav>`;
}

const hh = h => String(h).padStart(2, "0");
const horasTexto = h => (h ? `${hh(h[0])}–${hh(h[1])} h` : "");

function blocoJanelas(p, pq, d, contexto) {
  const especies = pq.especies ?? Object.keys(p.notas);
  const linhas = especies.map(esp => {
    const n = p.notas[esp];
    const nome = esc(NOME_ESPECIE[esp] ?? esp);
    if (!n) return `<div class="janela-esp" data-especie="${esc(esp)}"><p class="janela-topo"><span class="esp">${nome}</span><b class="mini nd">—</b></p><p class="motivo">sem regra para esta espécie aqui</p></div>`;
    const r = janelasDoPesqueiro(p, d, contexto, esp);
    if (!r.melhor.length) {
      return `<div class="janela-esp" data-especie="${esc(esp)}" data-estado="sem-notas"><p class="janela-topo"><span class="esp">${nome}</span><b class="mini ${classeNota(n)}">${esc(textoNota(n))}</b></p>
        <p class="motivo">Sem nota ${r.passados.length ? "nos períodos que faltam de hoje" : "em nenhum período"}${r.semNota.length ? ` (${esc(r.semNota.map(x => `${x.nome}: ${x.n.estado}`).join("; "))})` : ""}: não há janela a indicar.</p></div>`;
    }
    const [m] = r.melhor;
    const todos = r.melhor.length > 1 && !r.pior.length;
    const estado = todos ? `Todos os períodos${r.passados.length ? " que faltam" : ""} com ${r.max}/5: não há um período melhor.`
      : r.melhor.length > 1 ? `Empate com ${r.max} em ${r.melhor.map(x => x.nome).join(", ")}: não há um só período melhor.`
      : !m.n.completa ? `Nota incompleta${m.n.intervalo && m.n.intervalo.min !== m.n.intervalo.max ? ` (pode ser ${m.n.intervalo.min} a ${m.n.intervalo.max})` : ""}: não é definitiva.`
        : r.podemIgualar.length ? `Comparação parcial: ${r.podemIgualar.map(x => x.nome).join(", ")} (incompleto, sem nota ou por confirmar) podia igualar.`
          : `O período com a nota mais alta ${r.passados.length ? "dos que faltam hoje" : "do dia"}, completa e sem empate.`;
    const tipo = r.melhor.length > 1 ? "empate" : !m.n.completa ? "incompleta" : r.podemIgualar.length ? "parcial" : "definitiva";
    const quando = r.melhor.map(x => `${x.nome} ${horasTexto(x.horas)}`.trim()).join(" · ");
    const ali = r.melhor.flatMap(x => x.alinhamentos);
    const motivos = porque(m.n).slice(0, 3);
    return `<div class="janela-esp" data-especie="${esc(esp)}" data-estado="${tipo}">
      <p class="janela-topo"><span class="esp">${nome}</span><b class="mini ${classeNota(m.n)}${m.n.completa ? "" : " inc"}" aria-label="nota ${r.max} de 5">${r.max}</b>
        <span class="janela-quando"><span class="ic ic-relogio" aria-hidden="true"></span>${esc(quando)}</span></p>
      ${ali.length ? `<p class="janela-ali"><span class="ic ic-sol" aria-hidden="true"></span>${esc(ali.map(textoAlinhamento).join("; "))}</p>` : ""}
      <p class="destaque-estado e-${tipo}">${esc(estado)}</p>
      ${motivos.length ? `<ul class="factores-cartao">${motivos.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
      ${r.pior.length ? `<p class="janela-pior">Período mais fraco: ${esc(r.pior.map(x => `${x.nome} ${horasTexto(x.horas)}`.trim()).join(" · "))} (${r.min}/5)</p>` : ""}
      ${r.passados.length ? `<p class="motivo">Já passaram: ${esc(r.passados.join(", "))}.</p>` : ""}
    </div>`;
  });
  return `<section class="bloco-pq janela-pq" aria-label="Melhor janela">
    <h2>Melhor janela <small>· ${esc(rotuloDia(d.dia, contexto.indice))}</small></h2>
    ${linhas.join("")}
  </section>`;
}

// Resumo das condições do dia (PR 9; as marés têm bloco próprio): só valores que a app já leu ou calculou; o que falta diz-se
// («não obtido»), nunca zero. tipo: previsto | calculado | tabela oficial. Função pura.
export function condicoesDoDia(p, d, pq, contexto) {
  const horas = p.horas ?? [];
  const tiles = [];
  const maximo = (f) => {
    const com = horas.filter(h => typeof f(h) === "number" && Number.isFinite(f(h)));
    if (!com.length) return { h: null, faltam: horas.length };
    return { h: com.reduce((a, h) => (f(h) > f(a) ? h : a)), faltam: horas.length - com.length };
  };
  const faltamTxt = n => (n ? ` · ${n} h sem valor` : "");
  if (pq.mar) {
    const pot = p.potencia;
    tiles.push({ chave: "potencia", icone: "onda", rotulo: "Potência máx.", tipo: "calculado",
      valor: !pot || pot.valor === null ? "não obtida" : `${num(pot.valor, 2)} kW/m`,
      detalhe: !pot || pot.valor === null ? "sem ondulação ou período" : `às ${hora(pot.instante)}${pot.completa ? "" : " · horas em falta"}`,
      falta: !pot || pot.valor === null });
    const { h, faltam } = maximo(x => x.mar?.hs);
    tiles.push({ chave: "ondulacao", icone: "onda", rotulo: "Ondulação máx.", tipo: "previsto",
      valor: h ? `${num(h.mar.hs, 1)} m` : "não obtida",
      detalhe: h ? `às ${hora(h.instante)} · ${num(h.mar.periodo ?? null, 1)} s · de ${rumo(h.mar.direcao)}${faltamTxt(faltam)}` : "Open-Meteo Marine sem valores",
      falta: !h });
  }
  const v = maximo(x => x.vento?.velocidade);
  const r = maximo(x => x.vento?.rajada);
  tiles.push({ chave: "vento", icone: "vento", rotulo: "Vento máx.", tipo: "previsto",
    valor: v.h ? `${num(v.h.vento.velocidade, 0)} nós` : "não obtido",
    detalhe: v.h ? `às ${hora(v.h.instante)} · de ${rumo(v.h.vento.direcao)} · rajada máx. ${r.h ? `${num(r.h.vento.rajada, 0)} nós` : "não obtida"}${faltamTxt(v.faltam)}` : "Open-Meteo Forecast sem valores",
    falta: !v.h });
  const pr = horas.map(h => h.pressao).filter(x => typeof x === "number" && Number.isFinite(x));
  const de = p.pressao?.descida;
  tiles.push({ chave: "pressao", icone: "pressao", rotulo: "Pressão", tipo: "previsto",
    valor: pr.length ? `${num(Math.min(...pr), 0)}–${num(Math.max(...pr), 0)} hPa` : "não obtida",
    detalhe: !de ? "" : de.activo === null ? "descida em 24 h por verificar" : `maior descida em 24 h: ${num(de.descidaHpa, 1)} hPa${de.activo ? " — peixe activo" : ""}`,
    falta: !pr.length });
  if (p.agua) {
    tiles.push({ chave: "agua", icone: "termometro", rotulo: "Água", tipo: "previsto",
      valor: p.agua.media === null ? "não obtida" : `${num(p.agua.media, 1)} °C`,
      detalhe: p.agua.media === null ? (p.agua.motivo ?? "") : p.agua.variacao === undefined || p.agua.variacao === null ? (p.agua.motivo ?? "comparação não possível")
        : `${p.agua.variacao > 0 ? "+" : ""}${num(p.agua.variacao, 1)} °C vs. 7 dias antes (previsões arquivadas)`,
      falta: p.agua.media === null });
  }
  if (p.chuva) {
    tiles.push({ chave: "chuva", icone: "chuva", rotulo: "Chuva 48 h antes", tipo: "previsto",
      valor: p.chuva.turva === null || p.chuva.chuva48hMm === null || p.chuva.chuva48hMm === undefined ? "por verificar" : `${num(p.chuva.chuva48hMm, 1)} mm`,
      detalhe: p.chuva.turva ? "água turva" : p.chuva.turva === null ? (p.chuva.motivo ?? "") : "",
      falta: p.chuva.turva === null });
  }
  const s = contexto.sol ? contexto.sol(d.dia, pq.terra) : null;
  tiles.push({ chave: "sol", icone: "sol", rotulo: "Sol", tipo: "calculado",
    valor: s ? `${hora(s.nascer)} – ${hora(s.por)}` : "não calculado", detalhe: "nascer e pôr", falta: !s });
  return tiles;
}

function blocoCondicoes(p, d, pq, contexto) {
  const arquivo = contexto.origem?.tipo === "arquivo";
  return `<section class="bloco-pq" aria-label="Condições do dia">
    <h2>Condições do dia <small>· ${esc(rotuloDia(d.dia, contexto.indice))}</small></h2>
    <ul class="condicoes-pq">${condicoesDoDia(p, d, pq, contexto).map(c => `<li class="tile${c.falta ? " falta" : ""}" data-chave="${c.chave}">
      <span class="tile-rot"><span class="ic ic-${c.icone}" aria-hidden="true"></span>${esc(c.rotulo)}</span>
      <b class="tile-valor">${esc(c.valor)}</b>
      ${c.detalhe ? `<span class="tile-det">${esc(c.detalhe)}</span>` : ""}
      <span class="tile-tipo">${esc(c.tipo)}${arquivo && c.tipo === "previsto" ? " · arquivado" : ""}</span></li>`).join("")}</ul>
  </section>`;
}

function blocoMares(d, contexto) {
  const rep = d.repontos ?? [];
  const a = d.amplitude;
  return `<section class="bloco-pq mares-pq" aria-label="Marés">
    <h2><span class="ic ic-mare" aria-hidden="true"></span>Marés <small>· Faro-Olhão (Instituto Hidrográfico)</small></h2>
    ${rep.length ? `<ol class="lista-mares">${rep.map(x => `<li class="${x.tipo === "PM" ? "pm" : "bm"}"><b>${esc(NOME_MARE[x.tipo])}</b> ${hora(x.instante)} · ${esc(num(x.alturaM, 1))} m</li>`).join("")}</ol>`
      : `<p class="motivo">Marés não obtidas${contexto.mares?.error ? ` (${esc(contexto.mares.error)})` : ""}.</p>`}
    <p class="motivo">Amplitude: ${!a || a.amplitude === null ? "não obtida" : `${esc(num(a.amplitude, 2))} m (${esc(a.classe)})`}. Horas da tabela oficial convertidas para a hora de Portugal continental; alturas ao zero hidrográfico.</p>
  </section>`;
}

// contexto: o mesmo do ecrã inicial (analise, config, pontos, mares, sol, lua, lidoEm, agora, origem) + id e indice.
export function renderPesqueiro(contexto) {
  const { analise, config, id } = contexto;
  const indice = Math.min(Math.max(contexto.indice ?? 0, 0), analise.dias.length - 1);
  const pq = config.pesqueiros[id];
  const d = analise.dias[indice];
  const p = d?.pesqueiros[id];
  if (!pq || !p) {
    return `<header class="topo"><div><h1>Pesqueiro não encontrado</h1><p class="lido">${id ? `«${esc(id)}» não está na configuração.` : "Nenhum pesqueiro indicado."}</p></div></header>
      <section class="bloco-pq"><h2>Pesqueiros</h2>${lista(config, indice)}</section>`;
  }
  const ctx = { ...contexto, indice };
  const fundo = fundoDoCartao(id, d, ctx);
  const ali = alinhamentosDoDia({ pesqueiros: { [id]: p } });
  const especies = pq.especies ?? Object.keys(p.notas);
  const pontos = pontosDoPesqueiro(pq, config);
  const principal = config.locais[pq.mar ?? pq.terra];
  return `<header class="topo"><div><h1>${esc(pq.nome)}</h1>
      <p class="lido">${linhaLeitura(ctx)}</p></div>
      <button type="button" id="actualizar" class="btn-actualizar" aria-label="Actualizar dados">↻</button></header>
    ${avisoOrigem(ctx)}
    <div class="foto foto-pq"${pq.foto ? ` style="background-image:url('${esc(pq.foto.ficheiro)}')"` : ""}>
      <div class="foto-texto"><h2>${esc(pq.nomeCurto ?? pq.nome)}</h2><p>${esc(TIPO_LOCAL[pq.tipo] ?? pq.tipo)} · ${esc(especies.map(e => NOME_ESPECIE[e] ?? e).join(" e "))}</p></div>
    </div>
    ${faixaDiasPesqueiro(analise, indice, id)}
    ${blocoJanelas(p, pq, d, ctx)}
    <section class="bloco-pq" aria-label="Notas">
      <h2>Notas por período <small>· ${esc(rotuloDia(d.dia, indice))} · ${esc(d.dia.split("-").reverse().join("/"))}</small></h2>
      ${ali.length ? `<div class="alinhamento"><b>Alinhamento</b> ${ali.map(a => esc(textoAlinhamento(a))).join("; ")}</div>` : ""}
      ${especies.map(esp => (p.notas[esp] ? linhaEspecie(esp, p.notas[esp], p.periodos) : semEspecie(esp, pq))).join("")}
      ${avisosDoCartao(p, pq, ctx)}
      <p class="ligacao-comp"><a href="./comparador.html?dia=${indice}">Comparar com os outros pesqueiros ›</a></p>
    </section>
    <section class="bloco-pq horas-pq" aria-label="Hora a hora">
      <h2><span class="ic ic-relogio" aria-hidden="true"></span>Hora a hora</h2>
      ${conteudoHorario(ctx, id)}
    </section>
    ${blocoMares(d, ctx)}
    ${blocoCondicoes(p, d, pq, ctx)}
    ${fundo ? `<section class="bloco-pq fundo-pq" aria-label="Fundo do mar">
      <h2><span class="ic ic-fundo" aria-hidden="true"></span>Fundo típico</h2>
      <dl class="factos"><dt>Cota a 100/150/200 m</dt><dd>${esc(fundo.curto ?? fundo.erro)}</dd></dl>
      ${fundo.longo ? `<p class="motivo">${esc(fundo.longo)}</p>` : ""}
      ${fundo.fonte ? `<p class="rodape">${esc(fundo.fonte)}</p>` : ""}
    </section>` : ""}
    <section class="bloco-pq onde-pq" aria-label="Localização">
      <h2><span class="ic ic-local" aria-hidden="true"></span>Onde <small>· pontos de dados</small></h2>
      ${miniMapa(pontos, config, { comLigacao: Boolean(principal) })}
      <dl class="factos">${numerarPontos(pontos).map(x => `<dt>${x.n ? `<span class="num-ponto">${x.n}</span>` : ""}${esc(x.papeis.join("; "))}</dt><dd>${x.local
        ? `lat. ${esc(num(x.local.latitude, 5))} · long. ${esc(num(x.local.longitude, 5))}${x.local.origem ? ` <small>· ${esc(x.local.origem)}</small>` : " <small>· ponto aproximado (sem ponto de pesca do utilizador)</small>"}`
        : "ponto em falta na configuração"}</dd>`).join("")}</dl>
      <p class="rodape">Os valores do mar e do vento são de modelos com células de vários quilómetros: não são medições no pesqueiro.</p>
      ${principal ? `<p><a href="./mapa.html?pesqueiro=${encodeURIComponent(id)}">Ver no mapa (e o fundo do mar) ›</a></p>` : ""}
      <p class="rodape">${ligacoes("Vento agora (Windguru)", pq.estacoes)}${ligacoes("Câmaras", pq.camaras)}</p>
    </section>
    <section class="bloco-pq" aria-label="Dados, parcelas e fontes">
      ${detalhes(p, pq, d, ctx, fundo, { aberto: true, antes: factos(p, pq, fundo) })}
    </section>
    <section class="bloco-pq"><h2>Outros pesqueiros</h2>${lista(config, indice)}</section>
    <p class="legenda">Notas de 1 a 5 por período (madrugada 00–06, manhã 06–12, tarde 12–18, noite 18–24, hora de Portugal continental). <b class="mini nd">n.d.</b> sem dados suficientes · <b class="mini pc">?</b> por confirmar no terreno · contorno tracejado: nota incompleta. Todas as notas são provisórias.</p>`;
}
