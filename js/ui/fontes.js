// Página «Fontes»: de onde vem cada dado, de que tipo é e com que licença, e os créditos das
// fotografias (exigidos pelas licenças CC BY e CC BY-SA). Separada do diagnóstico técnico.
// Função pura: os textos e as ligações vêm do config.json (fonte única dos URL).
import { esc } from "./formato.js";

const ligacao = (url, texto) => `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(texto)}</a>`;

// Só a parte que é a licença leva a ligação (ex.: nas marés, «2026: © IH» não é CC BY-NC-ND).
function textoLicenca(f) {
  if (!f.licencaUrl) return esc(f.licenca);
  const parte = f.licencaLigada && f.licenca.includes(f.licencaLigada) ? f.licencaLigada : f.licenca;
  const i = f.licenca.indexOf(parte);
  return esc(f.licenca.slice(0, i)) + ligacao(f.licencaUrl, parte) + esc(f.licenca.slice(i + parte.length));
}

function cartaoFonte(f) {
  const licenca = textoLicenca(f);
  return `<article class="cartao-fonte">
      <h2>${esc(f.nome)}</h2>
      <p class="tipo-fonte">${esc(f.tipo)}</p>
      <p>${esc(f.uso)}</p>${f.nota ? `\n      <p class="motivo">${esc(f.nota)}</p>` : ""}
      <p class="licenca">Licença: ${licenca}</p>
      <p class="site">${ligacao(f.ligacao, new URL(f.ligacao).hostname.replace(/^www\./, ""))}</p>
    </article>`;
}

export function creditosFotos(config) {
  const linhas = Object.values(config.pesqueiros ?? {}).filter(pq => pq.foto).map(pq =>
    `<li>${esc(pq.nomeCurto ?? pq.nome)}: ${ligacao(pq.foto.pagina, pq.foto.autor)}, ${esc(pq.foto.licenca)} (Wikimedia Commons; recortada e reduzida)</li>`);
  return `<section class="creditos" id="creditos" aria-label="Créditos das fotografias">
    <h2>Créditos das fotografias</h2>
    <ul>${linhas.join("")}</ul>
  </section>`;
}

export function renderFontes(config) {
  const p = config.paginaFontes;
  if (!p?.fontes?.length) return `<p class="falha">Lista de fontes em falta no config.json.</p>`;
  return `<p class="aviso-fontes">${esc(p.aviso)}</p>
    <section class="lista-fontes" aria-label="Fontes de dados">
    ${p.fontes.map(cartaoFonte).join("\n    ")}
    </section>
    <p class="motivo">${esc(p.ligacoesExternas)}</p>
    ${creditosFotos(config)}
    <p class="ir-diagnostico"><a href="./guia.html">Guia: marés, ondulação, vento, fundos e como usar a app ›</a></p>
    <p class="ir-diagnostico"><a href="./historico.html">Histórico de previsões (guardadas neste aparelho) ›</a></p>
    <p class="ir-diagnostico"><a href="./diagnostico.html">Diagnóstico técnico das fontes ›</a></p>`;
}
