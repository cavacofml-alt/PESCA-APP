// Fundo do mar no ecrã «Mapa»: levantamentos do Programa COSMO (APA) tratados por
// ferramentas/fundos_cosmo.py (fundos/<id>.json). Validação do ficheiro e textos dos balões.
// Funções puras, sem rede nem DOM: o mapa (Leaflet) fica em js/mapa.js.
import { esc, hora, num, diaCurto } from "./ui/formato.js";
import { lisbonDate } from "./normalizacao.js";

const DATA = /^\d{4}-\d{2}-\d{2}$/;
const finito = v => typeof v === "number" && Number.isFinite(v);
// Portugal continental e mar próximo: um ponto fora disto é erro do ficheiro.
const pontoValido = p => Array.isArray(p) && p.length === 2 && finito(p[0]) && finito(p[1])
  && p[0] > -10.5 && p[0] < -6 && p[1] > 36 && p[1] < 42.5;
const linhaValida = (l, min) => Array.isArray(l) && l.length >= min && l.every(pontoValido);

// Confere a estrutura de fundos/<id>.json. Devolve { ok, erros }.
export function validarFundos(d) {
  const erros = [];
  if (!d || d.versao !== 1) return { ok: false, erros: ["versão do ficheiro desconhecida (esperada 1)"] };
  if (typeof d.id !== "string" || !d.id) erros.push("id em falta");
  if (typeof d.nome !== "string" || !d.nome) erros.push("nome em falta");
  const f = d.fonte ?? {};
  for (const k of ["nome", "produto", "url", "referenciaVertical", "utilizacao"]) {
    if (typeof f[k] !== "string" || !f[k]) erros.push(`fonte.${k} em falta`);
  }
  if (!DATA.test(f.levantamento ?? "")) erros.push("fonte.levantamento não é uma data AAAA-MM-DD");
  if (f.levantamentoFim !== undefined && (!DATA.test(f.levantamentoFim) || f.levantamentoFim <= f.levantamento)) {
    erros.push("fonte.levantamentoFim inválido");
  }
  if (!/^[0-9a-f]{64}$/.test(f.sha256 ?? "")) erros.push("fonte.sha256 inválido");
  if (!d.tratamento?.criterios) erros.push("tratamento.criterios em falta");
  if (!linhaValida(d.cobertura, 4)) erros.push("cobertura inválida");
  if (!Array.isArray(d.formas)) erros.push("formas em falta");
  else {
    const ids = new Set();
    d.formas.forEach((x, i) => {
      const onde = `formas[${i}]`;
      if (!/^[FC]\d+$/.test(x?.id ?? "") || ids.has(x.id)) erros.push(`${onde}: id inválido ou repetido`);
      ids.add(x?.id);
      if (!["fundão", "cabeço"].includes(x?.tipo) || (x.tipo === "fundão") !== x.id?.startsWith("F")) {
        erros.push(`${onde}: tipo inválido`);
      }
      if (!pontoValido(x?.ponto)) erros.push(`${onde}: ponto inválido`);
      if (!finito(x?.cota) || x.cota < -40 || x.cota > 15) erros.push(`${onde}: cota inválida`);
      for (const k of ["distancia", "distanciaMin", "distanciaMax", "eixoMaior", "eixoMenor", "area"]) {
        if (!finito(x?.[k]) || x[k] < 0) erros.push(`${onde}: ${k} inválido`);
      }
      if (!linhaValida(x?.contorno, 4)) erros.push(`${onde}: contorno inválido`);
    });
  }
  if (!Array.isArray(d.isobatas)) erros.push("isobatas em falta");
  else {
    d.isobatas.forEach((x, i) => {
      if (!finito(x?.cota)) erros.push(`isobatas[${i}]: cota inválida`);
      if (!Array.isArray(x?.linhas) || !x.linhas.every(l => linhaValida(l, 2))) erros.push(`isobatas[${i}]: linhas inválidas`);
    });
  }
  return { ok: erros.length === 0, erros };
}

// "17/06/2025" a partir de "2025-06-17".
export const dataCurta = iso => (DATA.test(iso ?? "") ? iso.split("-").reverse().join("/") : "—");

// Data do levantamento: um dia, ou o primeiro e o último quando durou vários.
export function periodoLevantamento(fonte) {
  const ini = dataCurta(fonte?.levantamento);
  return fonte?.levantamentoFim ? `${ini} a ${dataCurta(fonte.levantamentoFim)}` : ini;
}

// Mês e ano do levantamento (do último dia): «06/2025».
export function mesAno(fonte) {
  const fim = fonte?.levantamentoFim ?? fonte?.levantamento;
  return DATA.test(fim ?? "") ? `${fim.slice(5, 7)}/${fim.slice(0, 4)}` : "—";
}

// Idade do levantamento (a contar do último dia): «há 5 meses», «há 6 anos».
export function idadeLevantamento(fonte, agora = new Date()) {
  const fim = fonte?.levantamentoFim ?? fonte?.levantamento;
  if (!DATA.test(fim ?? "")) return null;
  const [a, m, d] = fim.split("-").map(Number);
  const hoje = lisbonDate(agora);
  if (!hoje) return null;
  const [ah, mh, dh] = hoje.split("-").map(Number);
  const meses = (ah - a) * 12 + (mh - m) - (dh < d ? 1 : 0);
  if (meses < 0) return null;
  if (meses < 1) return "há menos de um mês";
  if (meses < 24) return meses === 1 ? "há 1 mês" : `há ${meses} meses`;
  return `há ${Math.floor(meses / 12)} anos`;
}

// Cor de uma isóbata: azul-claro junto à costa (2 m ZH), azul-escuro nos -12 m ou mais fundo.
export function corIsobata(cota) {
  if (!finito(cota)) return "#7a8a94";
  const t = Math.min(1, Math.max(0, (2 - cota) / 14));
  const de = [125, 211, 252], ate = [12, 35, 105];
  const c = de.map((v, i) => Math.round(v + (ate[i] - v) * t));
  return `#${c.map(v => v.toString(16).padStart(2, "0")).join("")}`;
}

// Próxima preia-mar e próxima baixa-mar da tabela, depois de "agora".
export function proximasMares(eventos, agora) {
  const t = agora instanceof Date ? agora.getTime() : agora;
  const prox = tipo => eventos?.find(e => e.type === tipo && e.timestamp > t) ?? null;
  return { BM: prox("BM"), PM: prox("PM") };
}

// Água por cima de um ponto do fundo com a maré a uma dada altura (ambas ao zero hidrográfico).
export function aguaPorCima(cota, alturaMare) {
  if (!finito(cota) || !finito(alturaMare)) return null;
  return Math.round((alturaMare - cota) * 10) / 10;
}

function textoMare(nome, ev, cota, agora) {
  if (!ev) return `${nome}: fora da tabela de marés carregada`;
  const agua = aguaPorCima(cota, ev.heightM);
  const dia = lisbonDate(new Date(ev.timestamp));
  const quando = dia === lisbonDate(agora) ? `hoje às ${hora(ev.timestamp)}` : `${diaCurto(dia)} às ${hora(ev.timestamp)}`;
  const valor = agua === null ? "—" : agua <= 0 ? "a descoberto" : `<b>${num(agua)} m</b> de água`;
  return `${valor} na próxima ${nome} (${quando}, ${num(ev.heightM)} m)`;
}

// Balão de um fundão ou cabeço. mares: eventos da tabela (ou null se não foi obtida).
export function descricaoForma(forma, fundos, mares, agora = new Date()) {
  const fundao = forma.tipo === "fundão";
  const linhas = [
    `<h3>${esc(forma.id)} · ${fundao ? "fundão" : "cabeço"}</h3>`,
    `<p>Ponto ${fundao ? "mais fundo" : "menos fundo"}: <b>${num(forma.cota, 2)} m</b> ao zero hidrográfico, ` +
      `a ${forma.distancia} m da costa.</p>`
  ];
  if (Array.isArray(mares)) {
    const p = proximasMares(mares, agora);
    linhas.push(`<p>${textoMare("baixa-mar", p.BM, forma.cota, agora)};<br>${textoMare("preia-mar", p.PM, forma.cota, agora)}.</p>`);
  } else {
    linhas.push("<p>Água por cima: tabela de marés não obtida.</p>");
  }
  linhas.push(`<p>Ocupa dos ${forma.distanciaMin} aos ${forma.distanciaMax} m da costa; ` +
    `mede cerca de ${forma.eixoMaior} × ${forma.eixoMenor} m (${forma.area.toLocaleString("pt-PT")} m²).</p>`);
  linhas.push(`<p>Coordenadas: ${forma.ponto[1].toFixed(5)}, ${forma.ponto[0].toFixed(5)}</p>`);
  linhas.push(`<p class="fonte-mapa">${rodapeFundos(fundos, agora)} Água por cima: calculada com a tabela de marés do ` +
    "Instituto Hidrográfico (Faro-Olhão).</p>");
  return linhas.join("");
}

// Balão de uma isóbata.
export function descricaoIsobata(cota, fundos, agora = new Date()) {
  return `<h3>${num(cota, 1)} m ao zero hidrográfico</h3>` +
    `<p>Linha de igual cota do fundo (${num(2 - cota, 1)} m abaixo do nível médio).</p>` +
    `<p class="fonte-mapa">${rodapeFundos(fundos, agora)}</p>`;
}

// Fonte, tipo e data, em todos os balões do fundo.
export function rodapeFundos(fundos, agora = new Date()) {
  const f = fundos.fonte;
  const idade = idadeLevantamento(f, agora);
  return `Medido: levantamento do Programa COSMO (APA) de ${periodoLevantamento(f)}` +
    `${idade ? ` (${idade})` : ""}, produto ${esc(f.produto)}; tratado nesta app (critérios provisórios). ` +
    "Costa = linha de 2 m ZH (nível médio). Os bancos mudam com os temporais." +
    (fundos.aviso ? ` <b>${esc(fundos.aviso)}</b>` : "");
}
