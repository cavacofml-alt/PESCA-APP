// Painel «hora a hora» de um pesqueiro (Fase 4): Sol, Lua e marés
// no topo; uma coluna por hora do dia civil de Lisboa (23, 24 ou 25), com deslocamento lateral.
// Só apresenta o que o motor calculou (analise → pesqueiros[id].horas e .periodos). Função pura.
import { esc, hora, num, rotuloDia, classeNota, textoNota, NOME_ESPECIE, rumo, nomeFaseLua, NOME_MARE } from "./formato.js";
import { fontesDoCartao } from "./inicio.js";

const LARGURA = 52; // px por coluna (igual ao CSS .tabela-horas td)

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
export function renderHorario(contexto, id) {
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

  const linhas = [];
  const linha = (rotulo, celulas, classe = "") => linhas.push(`<tr class="${classe}"><th scope="row">${rotulo}</th>${celulas}</tr>`);
  linha("Hora", horas.map(h => `<td class="h">${hora(h.instante)}</td>`).join(""), "cab");
  for (const esp of Object.keys(p.notas)) {
    linha(`Nota ${esc(NOME_ESPECIE[esp].toLowerCase())}`, gruposDePeriodo(horas).map(g => {
      const n = p.periodos.find(x => x.nome === g.periodo)?.notas[esp];
      return `<td colspan="${g.n}" class="nota-per ${classeNota(n)}" title="${esc(n?.motivo ?? "")}"><b>${esc(textoNota(n))}</b> <span>${esc(g.periodo)}</span></td>`;
    }).join(""), "notas");
  }
  const curva = eventos ? curvaMare(horas.map(h => h.instante), eventos) : null;
  linha("Maré", `<td colspan="${horas.length}" class="mare">${curva ?? "marés não obtidas"}</td>`);
  linha("Água (°C)", horas.map(h => `<td>${num(h.agua, 1)}</td>`).join(""));
  linha("Vento (nós)", horas.map(h => `<td class="${classeVento(h.vento?.velocidade ?? null)}">${num(h.vento?.velocidade ?? null, 0)}</td>`).join(""));
  linha("Rajada (nós)", horas.map(h => `<td class="${classeVento(h.vento?.rajada ?? null)}">${num(h.vento?.rajada ?? null, 0)}</td>`).join(""));
  linha("Vento de", horas.map(h => `<td>${rumo(h.vento?.direcao)}</td>`).join(""));
  if (pq.mar) {
    linha("Ondulação (m)", horas.map(h => `<td>${num(h.mar?.hs ?? null, 1)}</td>`).join(""));
    linha("Período (s)", horas.map(h => `<td>${num(h.mar?.periodo ?? null, 1)}</td>`).join(""));
    linha("Ondulação de", horas.map(h => `<td>${rumo(h.mar?.direcao)}</td>`).join(""));
    linha("Fundo", horas.map(h => `<td class="comp">${h.mar ? textoComp(h.mar.fundo, h.mar.semAltura, ["swell"]) : "—"}</td>`).join(""));
    linha("Vaga", horas.map(h => `<td class="comp">${h.mar ? textoComp(h.mar.vaga, h.mar.semAltura, ["wind_wave", "swell"]) : "—"}</td>`).join(""));
    linha("Potência (kW/m)", horas.map(h => {
      const v = h.mar?.potencia.valor ?? null;
      return `<td class="${classePotencia(v, cfgMar)}">${num(v, 2)}</td>`;
    }).join(""));
    if (pq.tipo !== "ria") {
      linha("Limo", horas.map(h => {
        const [t, c] = simNaoInd(h.limo?.limo ?? null);
        return `<td class="limo-${c}" title="${esc(h.limo?.motivo ?? "")}">${t}</td>`;
      }).join(""));
    }
    if (pq.tipo === "molhe") {
      linha("Lado do molhe", horas.map(h => `<td class="lado" title="${esc(h.lado?.motivo ?? "")}">${esc(h.lado?.lado ?? "?")}</td>`).join(""));
    }
  }
  linha("Pressão (hPa)", horas.map(h => `<td>${num(h.pressao, 0)}</td>`).join(""));
  linha("Chuva (mm)", horas.map(h => `<td>${num(h.chuva, 1)}</td>`).join(""));

  const n = analise.dias.length;
  return `<div class="painel-topo">
      <button type="button" class="nav-dia" data-dia="${indice - 1}" ${indice === 0 ? "disabled" : ""} aria-label="Dia anterior">‹</button>
      <div><h2>${esc(pq.nomeCurto ?? pq.nome)}</h2><p>${esc(rotuloDia(d.dia, indice))} · ${esc(d.dia.split("-").reverse().join("/"))}</p></div>
      <button type="button" class="nav-dia" data-dia="${indice + 1}" ${indice >= n - 1 ? "disabled" : ""} aria-label="Dia seguinte">›</button>
      <button type="button" class="fechar" aria-label="Fechar">×</button>
    </div>
    <div class="chips">${chips}</div>
    <div class="tabela-horas"><table><tbody>${linhas.join("")}</tbody></table></div>
    <p class="nota-mare">Marés: as horas e alturas de preia-mar e baixa-mar são da tabela oficial do Instituto Hidrográfico; a curva entre elas é só ilustrativa. Notas por período (provisórias). Vento e rajada em nós; direcções «de onde vem». «—» = não obtido.</p>
    <details class="detalhes"><summary>Fontes</summary>${fontesDoCartao(pq, contexto)}</details>`;
}
