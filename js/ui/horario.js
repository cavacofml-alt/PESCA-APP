// Painel «hora a hora» de um pesqueiro (Fase 4): Sol, Lua e marés
// no topo; uma coluna por hora do dia civil de Lisboa (23, 24 ou 25), com deslocamento lateral.
// Só apresenta o que o motor calculou (analise → pesqueiros[id].horas e .periodos). Função pura.
import { esc, hora, num, rotuloDia, classeNota, textoNota, NOME_ESPECIE, rumo, nomeFaseLua, NOME_MARE } from "./formato.js";
import { fontesDoCartao, horasDosPeriodos, periodosPassados, agoraDe } from "./inicio.js";

const LARGURA = 52; // px por coluna (igual ao CSS .tabela-horas td)

// Melhor e pior período de uma espécie no dia (PR 9 da evolução, 21/11/2026): só as notas por período
// que o motor calculou, sem outra classificação. Hoje, os períodos que já acabaram não contam.
// «definitiva» só quando o melhor período é único, completo e nenhum outro (incompleto com intervalo
// até lá, sem nota ou por confirmar) o podia igualar. Função pura.
export function janelasDoPesqueiro(p, d, contexto, esp) {
  const horas = horasDosPeriodos(contexto.config);
  const passados = periodosPassados(d.dia, contexto);
  const periodos = (p.periodos ?? []).map(per => ({ nome: per.nome, n: per.notas?.[esp] ?? null, horas: horas[per.nome] ?? null,
    passou: passados.includes(per.nome), alinhamentos: per.alinhamento?.alinhado === true ? per.alinhamento.alinhamentos ?? [] : [] }));
  const vivos = periodos.filter(x => !x.passou && x.n);
  const ok = vivos.filter(x => x.n.estado === "ok");
  const semNota = vivos.filter(x => x.n.estado !== "ok");
  if (!ok.length) return { melhor: [], pior: [], podemIgualar: semNota, semNota, passados, definitiva: false };
  const max = Math.max(...ok.map(x => x.n.nota));
  const min = Math.min(...ok.map(x => x.n.nota));
  const melhor = ok.filter(x => x.n.nota === max);
  const pior = max === min ? [] : ok.filter(x => x.n.nota === min);
  const podemIgualar = [...ok.filter(x => x.n.nota < max && !x.n.completa && (x.n.intervalo?.max ?? Infinity) >= max), ...semNota];
  return { melhor, pior, podemIgualar, semNota, passados, max, min,
    definitiva: melhor.length === 1 && melhor[0].n.completa === true && !podemIgualar.length };
}


// Curva da maré entre preia-mares e baixa-mares da tabela do IH. Entre dois eventos desenha-se
// uma meia onda de cosseno: é só a FORMA da curva (ilustrativa); os únicos valores são as horas
// e alturas dos eventos, marcados com pontos e etiquetas.
function curvaMare(esperados, eventos) {
  const n = esperados.length;
  const t0 = esperados[0];
  const x = t => ((t - t0) / 3600000 + 0.5) * LARGURA;
  const ini = t0 - 1800000;
  const fim = esperados[n - 1] + 1800000;
  const antes = eventos.filter(e => e.timestamp <= ini).slice(-1);
  const depois = eventos.filter(e => e.timestamp >= fim).slice(0, 1);
  const janela = [...antes, ...eventos.filter(e => e.timestamp > ini && e.timestamp < fim), ...depois];
  if (antes.length === 0 || depois.length === 0 || janela.length < 2) return null;
  const alturas = janela.map(e => e.heightM);
  const hMin = Math.min(...alturas);
  const hMax = Math.max(...alturas);
  const altura = 70;
  const y = h => 14 + (1 - (h - hMin) / (hMax - hMin || 1)) * (altura - 30);
  const pontos = [];
  for (let t = ini; t <= fim; t += 600000) {
    const i = janela.findIndex((e, k) => k < janela.length - 1 && e.timestamp <= t && janela[k + 1].timestamp > t);
    if (i < 0) continue;
    const a = janela[i];
    const b = janela[i + 1];
    const f = (1 - Math.cos(Math.PI * (t - a.timestamp) / (b.timestamp - a.timestamp))) / 2;
    pontos.push(`${x(t).toFixed(1)},${y(a.heightM + (b.heightM - a.heightM) * f).toFixed(1)}`);
  }
  const marcas = janela.filter(e => e.timestamp >= ini && e.timestamp <= fim).map(e => {
    const cx = x(e.timestamp);
    const cy = y(e.heightM);
    const ty = e.type === "PM" ? cy - 5 : cy + 12;
    return `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="3"/><text x="${cx.toFixed(1)}" y="${ty.toFixed(1)}" text-anchor="middle">${e.type === "PM" ? "▲" : "▼"} ${hora(e.timestamp)} · ${num(e.heightM, 1)} m</text>`;
  }).join("");
  return `<svg class="curva-mare" width="${n * LARGURA}" height="${altura}" viewBox="0 0 ${n * LARGURA} ${altura}" role="img" aria-label="Curva da maré (ilustrativa)">
    <polyline points="${pontos.join(" ")}"/>${marcas}</svg>`;
}

const classeVento = v => (v === null ? "" : v < 10 ? "v1" : v < 15 ? "v2" : v < 20 ? "v3" : v < 25 ? "v4" : "v5");
const classePotencia = (p, cfgMar) => (p === null ? "" : p < cfgMar.potenciaRobaloMinimaKWm ? "p1" : p < cfgMar.potenciaRobaloIntermediaKWm ? "p2" : "p3");
// Sem componente nessa hora → «nenhum» (o «—» fica reservado para «não obtido»).
// semAltura: componentes com a altura em falta; origens: as que podiam cair nesta linha (um swell
// sem altura tanto podia ser fundo como vaga). Nesse caso aparece «n.d.», nunca «nenhum».
const textoComp = (lista, semAltura = [], origens = []) => {
  const partes = lista.map(c => `${num(c.hs, 1)} m<br>${num(c.periodo, 0)} s ${rumo(c.direcao)}`);
  if ((semAltura ?? []).some(c => origens.includes(c.origem))) partes.push("n.d.");
  return partes.length ? partes.join("<hr>") : "nenhum";
};
const simNaoInd = v => (v === true ? ["sim", "sim"] : v === false ? ["não", "nao"] : ["?", "ind"]);

// Grupos de horas seguidas do mesmo período (para juntar as células da nota).
function gruposDePeriodo(horas) {
  const grupos = [];
  for (const h of horas) {
    const g = grupos[grupos.length - 1];
    if (g && g.periodo === h.periodo) g.n++;
    else grupos.push({ periodo: h.periodo, n: 1 });
  }
  return grupos;
}

// contexto: o mesmo do ecrã inicial (+ lua). id: pesqueiro.
// Conteúdo do «hora a hora» (Sol, Lua e marés; tabela por hora; nota): o painel do início e a
// página do pesqueiro (PR 4 do plano de evolução) usam o mesmo.
export function conteudoHorario(contexto, id) {
  const { analise, config, indice = 0 } = contexto;
  const d = analise.dias[indice];
  const p = d.pesqueiros[id];
  const pq = config.pesqueiros[id];
  if (!p || !pq) return "";
  const horas = p.horas;
  const cfgMar = config.mar;
  const s = contexto.sol ? contexto.sol(d.dia, pq.terra) : null;
  const lua = contexto.lua ? contexto.lua(d.dia) : null;
  const eventos = contexto.mares?.ok && Array.isArray(contexto.mares.data) ? contexto.mares.data : null;

  const chips = [
    `<span class="chip">☀ nasce ${hora(s?.nascer)} · põe-se ${hora(s?.por)}</span>`,
    `<span class="chip">${esc(nomeFaseLua(lua?.fase))}${lua ? ` · ${Math.round(lua.fracao * 100)} % iluminada` : ""}</span>`,
    `<span class="chip">Maré ${d.amplitude.amplitude === null ? "não obtida" : `${num(d.amplitude.amplitude, 1)} m · ${esc(d.amplitude.classe)}`}</span>`,
    ...(d.repontos ?? []).length ? ["PM", "BM"].map(t => {
      const r = d.repontos.filter(x => x.tipo === t);
      return r.length ? `<span class="chip">${NOME_MARE[t]} ${r.map(x => `${hora(x.instante)} (${num(x.alturaM, 1)} m)`).join(" e ")}</span>` : "";
    }) : []
  ].join("");

  // PR 9 (21/11/2026): início de cada período marcado em todas as linhas; coluna da hora actual (hoje);
  // valores em falta com a classe «falta» (nunca zero); melhor e pior período de cada espécie pelas
  // notas do motor (janelasDoPesqueiro); previsão arquivada avisada no topo da tabela.
  const iniPer = new Set(horas.map((h, i) => (i > 0 && h.periodo !== horas[i - 1].periodo ? i : -1)).filter(i => i > 0));
  const agora = Date.parse(agoraDe(contexto) ?? "");
  const iAgora = Number.isFinite(agora) ? horas.findIndex((h, i) => h.instante <= agora && (i + 1 < horas.length ? horas[i + 1].instante : h.instante + 3600000) > agora) : -1;
  const passados = periodosPassados(d.dia, contexto);
  const cls = (i, extra = "") => {
    const c = [extra, iniPer.has(i) ? "ini-per" : "", i === iAgora ? "agora" : "", passados.includes(horas[i].periodo) ? "passou" : ""].filter(Boolean).join(" ");
    return c ? ` class="${c}"` : "";
  };
  const celula = (i, v, casas, extra = "") => (typeof v === "number" && Number.isFinite(v)
    ? `<td${cls(i, extra)}>${num(v, casas)}</td>`
    : `<td${cls(i, `${extra} falta`.trim())} title="não obtido">—</td>`);
  const texto = (i, t, extra = "", titulo = "") => {
    const falta = t === "—" || t === null || t === undefined;
    return `<td${cls(i, `${extra}${falta ? " falta" : ""}`.trim())}${falta ? ' title="não obtido"' : titulo ? ` title="${esc(titulo)}"` : ""}>${falta ? "—" : t}</td>`;
  };
  const linhas = [];
  const linha = (rotulo, celulas, classe = "", tipo = "") => linhas.push(`<tr class="${classe}"><th scope="row">${rotulo}${tipo ? ` <small class="tipo-linha">${tipo}</small>` : ""}</th>${celulas}</tr>`);
  linha("Hora", horas.map((h, i) => `<td${cls(i, "h")}>${hora(h.instante)}${i === iAgora ? '<span class="agora-rot">agora</span>' : ""}</td>`).join(""), "cab");
  for (const esp of Object.keys(p.notas)) {
    const r = janelasDoPesqueiro(p, d, contexto, esp);
    const melhor = new Set(r.melhor.map(x => x.nome));
    const pior = new Set(r.pior.map(x => x.nome));
    let i0 = 0;
    linha(`Nota ${esc(NOME_ESPECIE[esp].toLowerCase())}`, gruposDePeriodo(horas).map(g => {
      const n = p.periodos.find(x => x.nome === g.periodo)?.notas[esp];
      const marca = melhor.has(g.periodo) ? "melhor" : pior.has(g.periodo) ? "pior" : "";
      const inc = n?.estado === "ok" && !n.completa ? " inc" : "";
      const c = [`nota-per ${classeNota(n)}${inc}`, marca, iniPer.has(i0) ? "ini-per" : "", passados.includes(g.periodo) ? "passou" : ""].filter(Boolean).join(" ");
      i0 += g.n;
      const sinal = marca === "melhor" ? '<i class="marca" aria-label="melhor período">★</i>' : marca === "pior" ? '<i class="marca" aria-label="período mais fraco">▽</i>' : "";
      return `<td colspan="${g.n}" class="${c}" title="${esc(n?.motivo ?? "")}">${sinal}<b>${esc(textoNota(n))}</b> <span>${esc(g.periodo)}</span></td>`;
    }).join(""), "notas", "calc.");
  }
  const curva = eventos ? curvaMare(horas.map(h => h.instante), eventos) : null;
  linha("Maré", `<td colspan="${horas.length}" class="mare${curva ? "" : " falta"}">${curva ?? "marés não obtidas"}</td>`, "", "tabela");
  linha("Água (°C)", horas.map((h, i) => celula(i, h.agua, 1)).join(""));
  linha("Vento (nós)", horas.map((h, i) => celula(i, h.vento?.velocidade ?? null, 0, classeVento(h.vento?.velocidade ?? null))).join(""));
  linha("Rajada (nós)", horas.map((h, i) => celula(i, h.vento?.rajada ?? null, 0, classeVento(h.vento?.rajada ?? null))).join(""));
  linha("Vento de", horas.map((h, i) => texto(i, rumo(h.vento?.direcao))).join(""));
  if (pq.mar) {
    linha("Ondulação (m)", horas.map((h, i) => celula(i, h.mar?.hs ?? null, 1)).join(""));
    linha("Período (s)", horas.map((h, i) => celula(i, h.mar?.periodo ?? null, 1)).join(""));
    linha("Ondulação de", horas.map((h, i) => texto(i, rumo(h.mar?.direcao))).join(""));
    linha("Fundo", horas.map((h, i) => texto(i, h.mar ? textoComp(h.mar.fundo, h.mar.semAltura, ["swell"]) : "—", "comp")).join(""));
    linha("Vaga", horas.map((h, i) => texto(i, h.mar ? textoComp(h.mar.vaga, h.mar.semAltura, ["wind_wave", "swell"]) : "—", "comp")).join(""));
    linha("Potência (kW/m)", horas.map((h, i) => {
      const v = h.mar?.potencia.valor ?? null;
      return celula(i, v, 2, classePotencia(v, cfgMar));
    }).join(""), "", "calc.");
    if (pq.tipo !== "ria") {
      linha("Limo", horas.map((h, i) => {
        const [t, c] = simNaoInd(h.limo?.limo ?? null);
        return `<td${cls(i, `limo-${c}`)} title="${esc(h.limo?.motivo ?? "")}">${t}</td>`;
      }).join(""), "", "calc.");
    }
    if (pq.tipo === "molhe") {
      linha("Lado do molhe", horas.map((h, i) => `<td${cls(i, "lado")} title="${esc(h.lado?.motivo ?? "")}">${esc(h.lado?.lado ?? "?")}</td>`).join(""), "", "calc.");
    }
  }
  linha("Pressão (hPa)", horas.map((h, i) => celula(i, h.pressao, 0)).join(""));
  linha("Chuva (mm)", horas.map((h, i) => celula(i, h.chuva, 1)).join(""));

  const arquivo = contexto.origem?.tipo === "arquivo";
  const faltam = linhas.join("").includes('title="não obtido"');
  const legenda = [
    '<li><i class="sw melhor">★</i> melhor período (nota mais alta)</li>',
    '<li><i class="sw pior">▽</i> período mais fraco</li>',
    '<li><i class="sw inc"></i> nota incompleta</li>',
    `<li><i class="sw falta">—</i> não obtido${faltam ? " (há valores em falta neste dia)" : ""}</li>`,
    '<li><small class="tipo-linha">calc.</small> calculado pela app a partir das previsões</li>',
    '<li><small class="tipo-linha">tabela</small> tabela oficial de marés (a curva é ilustrativa)</li>',
    iAgora >= 0 ? '<li><i class="sw agora"></i> hora actual</li>' : "",
    arquivo ? '<li><i class="sw arquivo"></i> previsão arquivada</li>' : ""
  ].join("");
  return `<div class="chips">${chips}</div>
    ${arquivo ? `<p class="aviso-origem arquivo aviso-horas"><b>Previsão arquivada — não é a previsão actual</b>Os valores desta tabela são da última leitura guardada.</p>` : ""}
    <div class="tabela-horas${arquivo ? " arquivada" : ""}"><table><tbody>${linhas.join("")}</tbody></table></div>
    <ul class="legenda-horas" aria-label="Legenda do hora a hora">${legenda}</ul>
    <p class="nota-mare">Marés: as horas e alturas de preia-mar e baixa-mar são da tabela oficial do Instituto Hidrográfico; a curva entre elas é só ilustrativa. Notas por período (provisórias). Vento e rajada em nós; direcções «de onde vem». «—» = não obtido. Os valores previstos são de modelos com células de vários quilómetros, não medições no pesqueiro.</p>`;
}

// Única função com DOM deste módulo: abre a tabela na hora actual (hoje), com a hora anterior à vista.
export function irParaAgora(raiz) {
  const t = raiz?.querySelector(".tabela-horas");
  const c = t?.querySelector("tr.cab td.agora");
  if (!t || !c) return;
  const th = t.querySelector("th");
  t.scrollLeft = Math.max(0, c.offsetLeft - (th?.offsetWidth ?? 0) - c.offsetWidth);
}

export function renderHorario(contexto, id) {
  const { analise, config, indice = 0 } = contexto;
  const d = analise.dias[indice];
  const pq = config.pesqueiros[id];
  if (!d?.pesqueiros[id] || !pq) return "";
  const n = analise.dias.length;
  return `<div class="painel-topo">
      <button type="button" class="nav-dia" data-dia="${indice - 1}" ${indice === 0 ? "disabled" : ""} aria-label="Dia anterior">‹</button>
      <div><h2>${esc(pq.nomeCurto ?? pq.nome)}</h2><p>${esc(rotuloDia(d.dia, indice))} · ${esc(d.dia.split("-").reverse().join("/"))}</p></div>
      <button type="button" class="nav-dia" data-dia="${indice + 1}" ${indice >= n - 1 ? "disabled" : ""} aria-label="Dia seguinte">›</button>
      <button type="button" class="fechar" aria-label="Fechar">×</button>
    </div>
    ${conteudoHorario(contexto, id)}
    <details class="detalhes"><summary>Fontes</summary>${fontesDoCartao(pq, contexto)}</details>`;
}
