// Página de um pesqueiro (plano de evolução, PR 4, 20/11/2026): tudo o que a app sabe de um pesqueiro
// num só ecrã, gerado a partir do config (pesqueiro.html?id=<id>): fotografia, localização e pontos
// de dados, notas por espécie e período, «hora a hora», marés, fundo, factores e parcelas, fontes e
// avisos. Reutiliza os componentes do ecrã inicial e do «hora a hora»; não calcula notas.
// Um pesqueiro novo no config tem página sem mudar código. Função pura (HTML com texto escapado).
import { esc, num, rotuloDia, classeNota, textoNota, NOME_ESPECIE } from "./formato.js";
import { linhaEspecie, semEspecie, factos, detalhes, avisosDoCartao, ligacoes, fundoDoCartao, alinhamentosDoDia,
  textoAlinhamento, linhaLeitura, avisoOrigem } from "./inicio.js";
import { conteudoHorario } from "./horario.js";

const TIPO = { praia: "praia (mar de fora)", molhe: "molhe", ria: "Ria (interior)" };
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
      <div class="foto-texto"><h2>${esc(pq.nomeCurto ?? pq.nome)}</h2><p>${esc(TIPO[pq.tipo] ?? pq.tipo)} · ${esc(especies.map(e => NOME_ESPECIE[e] ?? e).join(" e "))}</p></div>
    </div>
    <section class="bloco-pq onde-pq" aria-label="Localização">
      <h2>Onde</h2>
      <dl class="factos">${pontos.map(x => `<dt>${esc(x.papeis.join("; "))}</dt><dd>${x.local
        ? `lat. ${esc(num(x.local.latitude, 5))} · long. ${esc(num(x.local.longitude, 5))}${x.local.origem ? ` <small>· ${esc(x.local.origem)}</small>` : " <small>· ponto aproximado (sem ponto de pesca do utilizador)</small>"}`
        : "ponto em falta na configuração"}</dd>`).join("")}</dl>
      ${principal ? `<p><a href="./mapa.html?pesqueiro=${encodeURIComponent(id)}">Ver no mapa (e o fundo do mar) ›</a></p>` : ""}
      <p class="rodape">${ligacoes("Vento agora (Windguru)", pq.estacoes)}${ligacoes("Câmaras", pq.camaras)}</p>
    </section>
    ${faixaDiasPesqueiro(analise, indice, id)}
    <section class="bloco-pq" aria-label="Notas">
      <h2>Notas <small>· ${esc(rotuloDia(d.dia, indice))} · ${esc(d.dia.split("-").reverse().join("/"))}</small></h2>
      ${ali.length ? `<div class="alinhamento"><b>Alinhamento</b> ${ali.map(a => esc(textoAlinhamento(a))).join("; ")}</div>` : ""}
      ${especies.map(esp => (p.notas[esp] ? linhaEspecie(esp, p.notas[esp], p.periodos) : semEspecie(esp, pq))).join("")}
      ${factos(p, pq, fundo)}
      ${avisosDoCartao(p, pq, ctx)}
      <p class="ligacao-comp"><a href="./comparador.html?dia=${indice}">Comparar com os outros pesqueiros ›</a></p>
    </section>
    <section class="bloco-pq horas-pq" aria-label="Hora a hora">
      <h2>Hora a hora</h2>
      ${conteudoHorario(ctx, id)}
    </section>
    <section class="bloco-pq" aria-label="Dados, parcelas e fontes">
      ${detalhes(p, pq, d, ctx, fundo, { aberto: true })}
    </section>
    <section class="bloco-pq"><h2>Outros pesqueiros</h2>${lista(config, indice)}</section>
    <p class="legenda">Notas de 1 a 5 por período (madrugada 00–06, manhã 06–12, tarde 12–18, noite 18–24, hora de Portugal continental). <b class="mini nd">n.d.</b> sem dados suficientes · <b class="mini pc">?</b> por confirmar no terreno · contorno tracejado: nota incompleta. Todas as notas são provisórias.</p>`;
}
