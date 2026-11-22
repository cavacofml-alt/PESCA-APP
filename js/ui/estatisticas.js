// Ecrã «Estatísticas» (plano de evolução, PR 6): tabelas descritivas do diário deste aparelho, com o
// número de registos (n) em cada valor, «sem registos» em vez de zero, e o aviso de amostra pequena.
// Sem previsões nem conclusões. Função pura (HTML com texto escapado).
import { esc, num, NOME_ESPECIE } from "./formato.js";
import { PERIODOS_FILTRO, AMOSTRA_PEQUENA } from "../diario/estatisticas.js";

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const nomeMes = m => `${MESES[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
const pct = p => (p === null ? "—" : `${num(p * 100, 0)} %`);
const nomeEsp = n => NOME_ESPECIE[n] ?? n;
const pequena = n => (n > 0 && n < AMOSTRA_PEQUENA ? ' <span class="amostra" title="menos de 10 registos: não tirar conclusões">amostra pequena</span>' : "");

// Nas tabelas, «*» no n = amostra pequena (menos de AMOSTRA_PEQUENA saídas).
const nCelula = n => `<td${n < AMOSTRA_PEQUENA ? ' title="amostra pequena: não tirar conclusões"' : ""}>${n}${n < AMOSTRA_PEQUENA ? "*" : ""}</td>`;
function linhaResumo(r, rotulo) {
  if (!r.n) return `<tr class="sem"><th>${esc(rotulo)}</th><td>0</td><td colspan="3">sem registos</td></tr>`;
  return `<tr><th>${esc(rotulo)}</th>${nCelula(r.n)}<td>${r.comCapturas}/${r.n} (${pct(r.proporcaoComCapturas)})</td><td>${r.capturas}</td><td>${num(r.capturasPorSaida, 1)}</td></tr>`;
}
const cabecalho = primeira => `<thead><tr><th>${esc(primeira)}</th><th>Saídas</th><th>Com capturas</th><th>Capturas</th><th>Por saída</th></tr></thead>`;

function filtros(f, config) {
  const op = (v, t, sel) => `<option value="${esc(v)}"${v === sel ? " selected" : ""}>${esc(t)}</option>`;
  return `<form class="filtros" id="filtros">
    <label>Período <select name="periodo">${Object.entries(PERIODOS_FILTRO).map(([v, t]) => op(v, t, f.periodo ?? "tudo")).join("")}</select></label>
    <label class="so-intervalo"${f.periodo === "intervalo" ? "" : " hidden"}>De <input type="date" name="desde" value="${esc(f.desde ?? "")}"></label>
    <label class="so-intervalo"${f.periodo === "intervalo" ? "" : " hidden"}>Até <input type="date" name="ate" value="${esc(f.ate ?? "")}"></label>
    <label>Espécie <select name="especie">${[["todas", "Todas"], ["robalo", "Robalo"], ["dourada", "Dourada"], ["outra", "Outras"]].map(([v, t]) => op(v, t, f.especie ?? "todas")).join("")}</select></label>
    <label>Pesqueiro <select name="pesqueiro">${op("todos", "Todos", f.pesqueiro ?? "todos")}${Object.entries(config.pesqueiros).map(([id, pq]) => op(id, pq.nomeCurto ?? pq.nome, f.pesqueiro)).join("")}</select></label>
  </form>`;
}

// estado: { config, armazem: { ok, erro }, stats (de estatisticas(), só com as saídas válidas), filtros,
// invalidas (registos do diário que não passam na validação: ficam de fora e diz-se quantos, como no diário) }
export function renderEstatisticas({ config, armazem, stats, filtros: f = {}, invalidas = 0 }) {
  const cabeca = `<header class="topo"><div><h1>Estatísticas</h1><p class="lido">Só a partir do seu diário · registos deste aparelho · <a href="./diario.html">voltar ao diário</a></p></div></header>`;
  if (armazem && !armazem.ok) return `${cabeca}<section class="aviso-origem indisponivel" role="alert"><b>Sem diário neste aparelho.</b> O navegador não deixa guardar dados (${esc(armazem.erro)}).</section>`;
  const topo = `${cabeca}${invalidas ? `<p class="falha">${invalidas} registo(s) com formato inválido não entram nas estatísticas.</p>` : ""}`;
  if (!stats.total) {
    return `${topo}<p class="motivo vazio">${invalidas ? "Não há saídas válidas no diário: sem registos válidos, não há estatísticas."
      : "Ainda não há saídas no diário: sem registos, não há estatísticas."}</p>`;
  }
  const r = stats.resumo;
  const aviso = `<p class="aviso-origem leve">Descrição dos seus registos, não uma previsão: não diz porque é que se apanhou mais ou menos peixe. Cada valor tem o número de saídas que o sustenta (n); com menos de ${AMOSTRA_PEQUENA}, é uma amostra pequena.</p>`;
  if (!r.n) return `${topo}${filtros(f, config)}${aviso}<p class="motivo vazio">Nenhuma saída com estes filtros. Não quer dizer zero capturas: não há registos.</p>`;
  const especies = stats.porEspecie;
  return `${topo}${filtros(f, config)}${aviso}
    <section class="bloco-pq" aria-label="Resumo"><h2>Resumo <small>· n = ${r.n} saída(s)${stats.filtradas < stats.total ? ` de ${stats.total}` : ""}</small>${pequena(r.n)}</h2>
      <dl class="factos">
        <dt>Saídas</dt><dd>${r.n}</dd>
        <dt>Com capturas</dt><dd>${r.comCapturas} de ${r.n} (${pct(r.proporcaoComCapturas)})</dd>
        <dt>Sem capturas</dt><dd>${r.semCapturas} de ${r.n}</dd>
        <dt>Capturas</dt><dd>${r.capturas} (${num(r.capturasPorSaida, 1)} por saída)</dd>
        <dt>Horas de pesca</dt><dd>${r.horas === null ? "sem hora de fim registada" : `${num(r.horas, 1)} h (n = ${r.nComHoras} saída(s) com hora de fim)`}</dd>
      </dl></section>
    <section class="bloco-pq" aria-label="Por pesqueiro"><h2>Por pesqueiro</h2>
      <div class="rolar"><table class="tabela-stats">${cabecalho("Pesqueiro")}<tbody>${stats.porPesqueiro.map(p => linhaResumo(p, config.pesqueiros[p.id]?.nomeCurto ?? p.nome)).join("")}</tbody></table></div></section>
    <section class="bloco-pq" aria-label="Por espécie"><h2>Por espécie</h2>
      ${especies.length ? `<div class="rolar"><table class="tabela-stats"><thead><tr><th>Espécie</th><th title="saídas com ela como alvo">Alvo</th><th title="saídas em que foi apanhada">Apanhada</th><th>Qtd.</th><th>Tamanho (cm)</th></tr></thead><tbody>${
        especies.map(e => `<tr><th>${esc(nomeEsp(e.nome))}</th><td>${e.saidasComAlvo}</td><td>${e.saidasComCaptura}</td><td>${e.quantidade}</td><td>${!e.tamanhos.n ? "sem tamanhos registados"
          : e.tamanhos.n === 1 ? `${num(e.tamanhos.min, 1)} <small>(n = 1)</small>`
          : `${num(e.tamanhos.min, 1)} · <b>${num(e.tamanhos.mediana, 1)}</b> · ${num(e.tamanhos.max, 1)} <small>(mín. · mediana · máx.; n = ${e.tamanhos.n})</small>`}</td></tr>`).join("")}</tbody></table></div>`
        : `<p class="motivo">Sem espécies registadas.</p>`}</section>
    <section class="bloco-pq" aria-label="Por período do dia"><h2>Por período do dia <small>· pela hora de início</small></h2>
      <div class="rolar"><table class="tabela-stats">${cabecalho("Período")}<tbody>${stats.porPeriodo.map(p => linhaResumo(p, p.nome)).join("")}</tbody></table></div></section>
    <section class="bloco-pq" aria-label="Por mês"><h2>Por mês <small>· evolução</small></h2>
      <div class="rolar"><table class="tabela-stats">${cabecalho("Mês")}<tbody>${stats.porMes.map(m => (m.n ? linhaResumo(m, nomeMes(m.mes))
        : `<tr class="sem"><th>${esc(nomeMes(m.mes))}</th><td>0</td><td colspan="3">sem saídas registadas (não é zero capturas)</td></tr>`)).join("")}</tbody></table></div></section>
    <p class="legenda">Saídas = número de saídas (n) que sustenta cada linha; «*» = amostra pequena (menos de ${AMOSTRA_PEQUENA}). Alvo e Apanhada = número de saídas. Tamanho: um por linha de captura registada. Calculado no aparelho a partir do diário; não muda as notas, as regras nem os limiares da app.</p>`;
}
