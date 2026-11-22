// Ecrã «Histórico de previsões» (plano de evolução, PR 7): leituras guardadas, previsão × medição da
// boia na zona da boia (só grandezas comparáveis), e as saídas do diário com a previsão que tinham.
// Distingue sempre previsão arquivada de observação. Função pura (HTML com texto escapado).
import { esc, num, hora, dataHora, idadeTexto } from "./formato.js";
import { COMPARACOES, TOLERANCIA_MIN } from "../historico/validacao.js";
import { textoResultado } from "./diario.js";

const sinal = (v, casas) => (v === null ? "—" : `${v > 0 ? "+" : ""}${num(v, casas)}`);

function tabelaResumo(resumo) {
  const comp = COMPARACOES.filter(c => c.comparavel);
  return `<div class="rolar"><table class="tabela-stats"><thead><tr><th>Antecedência</th>${comp.map(c =>
    `<th>${esc(c.nome)} (${esc(c.unidade)}): n</th><th>diferença média</th><th>diferença absoluta média</th>`).join("")}</tr></thead><tbody>${
    resumo.map(g => `<tr><th>${esc(g.nome)}</th>${comp.map(c => {
      const x = g.porCampo[c.campo];
      return x.n ? `<td>${x.n}</td><td>${sinal(x.media, 2)}</td><td>${num(x.mediaAbs, 2)}</td>` : `<td>0</td><td colspan="2" class="sem">sem pares${x.semMedicao ? ` (${x.semMedicao} sem medição)` : ""}</td>`;
    }).join("")}</tr>`).join("")}</tbody></table></div>`;
}

// Para cada hora válida, o par da leitura mais recente antes dela (a menor antecedência).
function tabelaDetalhe(pares, maximo = 48) {
  const porHora = new Map();
  for (const p of pares) if (!porHora.has(p.valido) || p.antecedenciaH < porHora.get(p.valido).antecedenciaH) porHora.set(p.valido, p);
  const linhas = [...porHora.values()].sort((a, b) => b.valido - a.valido).slice(0, maximo);
  const v = (p, c, casas) => p.valores[c];
  return `<div class="rolar"><table class="tabela-stats tabela-hist"><thead><tr><th>Hora</th><th title="tempo entre a leitura e a hora prevista">Antecedência</th>
    <th>Onda prevista (m)</th><th>Hm0 medido (m)</th><th>Dif.</th><th>Água prevista (°C)</th><th>Água medida (°C)</th><th>Dif.</th>
    <th>wave_period (s)</th><th>Tm02 (s)</th></tr></thead><tbody>${linhas.map(p => `<tr><th>${esc(dataHora(p.valido))}</th><td>${num(p.antecedenciaH, p.antecedenciaH < 10 ? 1 : 0)} h</td>
    <td>${num(v(p, "hs").previsto, 2)}</td><td>${p.medicao === null ? "sem medição" : num(v(p, "hs").observado, 2)}</td><td>${sinal(v(p, "hs").diferenca, 2)}</td>
    <td>${num(v(p, "agua").previsto, 1)}</td><td>${p.medicao === null ? "sem medição" : num(v(p, "agua").observado, 1)}</td><td>${sinal(v(p, "agua").diferenca, 1)}</td>
    <td>${num(v(p, "periodo").previsto, 1)}</td><td>${num(v(p, "periodo").observado, 1)}</td></tr>`).join("")}</tbody></table></div>`;
}

// estado: { config, armazem, leituras: [{ id, lidoEm, resumo }], pares, resumo, celula, distanciaKm, saidas: saidasComPrevisao(), agora }
export function renderHistorico(e) {
  const topo = `<header class="topo"><div><h1>Histórico de previsões</h1><p class="lido">Previsões guardadas neste aparelho e o que a boia mediu · <a href="./fontes.html">voltar às fontes</a></p></div></header>`;
  if (e.armazem && !e.armazem.ok) return `${topo}<section class="aviso-origem indisponivel" role="alert"><b>Sem histórico neste aparelho.</b> O navegador não deixa guardar dados (${esc(e.armazem.erro)}).</section>`;
  const b = e.config.boias.faro;
  const pq = Object.values(e.config.pesqueiros).find(p => p.mar === b.previsaoPonto);
  const agora = Date.parse(e.agora);
  const explicacao = `<section class="aviso-origem leve"><b>Previsão arquivada ≠ observação.</b> A previsão é a do Open-Meteo como a app a leu (com a hora da leitura); a observação é a da ${esc(b.nome)} (${esc(b.codigo)}), ao largo, a ${esc(b.profundidadeM)} m de fundo. Compara-se só o que é a mesma grandeza: ${esc(COMPARACOES.filter(c => c.comparavel).map(c => c.nome.toLowerCase()).join(" e "))}. ${esc(COMPARACOES.filter(c => !c.comparavel).map(c => `${c.nome}: ${c.nota}`).join(". "))}. Vale para a zona da boia, não para cada pesqueiro, e não muda as notas nem as regras.</section>`;
  if (!e.leituras.length) return `${topo}${explicacao}<p class="motivo vazio">Ainda não há previsões guardadas neste aparelho. Cada abertura do início ou do comparador com rede guarda uma.</p>`;
  const celula = e.celula ? `célula lat. ${num(e.celula.lat, 3)} · long. ${num(e.celula.lon, 3)}` : "célula não indicada";
  return `${topo}${explicacao}
    <section class="bloco-pq" aria-label="Leituras guardadas"><h2>Leituras guardadas <small>· ${e.leituras.length}</small></h2>
      <p>A mais recente ${esc(dataHora(Date.parse(e.leituras[0].lidoEm)))} (${esc(idadeTexto(agora - Date.parse(e.leituras[0].lidoEm)))}); a mais antiga ${esc(dataHora(Date.parse(e.leituras.at(-1).lidoEm)))}.</p>
      <details><summary>Ver todas</summary><ul class="lista-leituras">${e.leituras.map(l => `<li>${esc(dataHora(Date.parse(l.lidoEm)))} · ${l.resumo ? `${l.resumo.pontosObtidos} de ${l.resumo.pontos} pontos${l.resumo.boia ? " · boia" : " · sem boia"}` : "—"}</li>`).join("")}</ul></details>
    </section>
    <section class="bloco-pq" aria-label="Previsão e medição"><h2>Previsão e medição na zona da boia</h2>
      <p>Previsão: Open-Meteo Marine no ponto de ${esc(pq?.nomeCurto ?? b.previsaoPonto)} (${esc(celula)})${e.distanciaKm === null ? "" : `, a <b>${num(e.distanciaKm, 0)} km</b> da boia (lat. ${esc(num(Number(b.latitude), 4))} · long. ${esc(num(Number(b.longitude), 4))})`}. Só horas que eram futuras quando a leitura foi feita; medição da boia até ${TOLERANCIA_MIN} min da hora certa. Diferença = previsto − medido.</p>
      ${e.pares.length ? `${tabelaResumo(e.resumo)}<h3>Hora a hora <small>· a leitura mais recente antes de cada hora; últimas 48 horas com pares</small></h3>${tabelaDetalhe(e.pares)}`
        : `<p class="motivo">Ainda nenhuma hora prevista numa leitura guardada chegou (ou não há medições da boia guardadas para essas horas).</p>`}
    </section>
    <section class="bloco-pq" aria-label="Saídas do diário"><h2>Saídas do diário <small>· a previsão que havia e o que a boia mediu</small></h2>
      ${e.saidas.length ? `<div class="rolar"><table class="tabela-stats"><thead><tr><th>Saída</th><th>Onda prevista (m)</th><th>Hm0 da boia (m)</th><th>Resultado</th></tr></thead><tbody>${
        e.saidas.map(x => `<tr><th>${esc(dataHora(Date.parse(x.saida.inicio)))}<small>${esc(e.config.pesqueiros[x.saida.pesqueiro]?.nomeCurto ?? x.saida.pesqueiro)}</small></th>${x.motivo
          ? `<td colspan="2" class="sem">${esc(x.motivo)}</td>`
          : `<td>${num(x.hsPrevista, 2)}<small>lida ${esc(dataHora(Date.parse(x.lidoEm)))}${x.relacao === "depois" ? " (depois)" : ""}</small></td><td>${x.boia ? `${num(x.boia.hm0, 2)}<small>às ${esc(hora(x.boia.instante))}</small>` : "sem medição"}</td>`}<td>${esc(textoResultado(x.saida))}</td></tr>`).join("")}</tbody></table></div>
        <p class="legenda">Só para consulta: com poucas saídas não se tiram conclusões sobre o que deu peixe.</p>`
        : `<p class="motivo">Sem saídas no diário.</p>`}
    </section>`;
}
