// PR 9 do plano de evolução (21/11/2026): modernização da interface. Só apresentação: a «melhor
// oportunidade», as notas dos cartões, a melhor janela e o «hora a hora» mostram as notas do motor tal
// como estão, dizem quando a escolha não é definitiva (empate, nota incompleta, comparação parcial) e
// nunca transformam um valor em falta em zero. Também: contraste das cores e ícones da barra. Sem rede.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { analisarDias } from "../js/regras/analise.js";
import { validateTides } from "../js/fontes/mares-locais.js";
import { pontosNecessarios } from "../js/pontos.js";
import { limitesDiaLisboa, lisbonDate } from "../js/normalizacao.js";
import { renderInicio, destaqueDoDia, notasDoCartao, restoDoDia, periodosPassados } from "../js/ui/inicio.js";
import { renderPesqueiro, janelasDoPesqueiro, condicoesDoDia, pontosDoPesqueiro, numerarPontos, atribuicaoSegura } from "../js/ui/pesqueiro.js";
import { conteudoHorario } from "../js/ui/horario.js";
import { porque, estadoDaNota } from "../js/ui/explicacao.js";
import { textoNota, NOME_ESPECIE } from "../js/ui/formato.js";

const ler = rel => JSON.parse(readFileSync(new URL(rel, import.meta.url), "utf8"));
const texto = rel => readFileSync(new URL(rel, import.meta.url), "utf8");
const SunCalc = createRequire(import.meta.url)("../vendor/suncalc.js");
const eventos = validateTides(ler("../mares/2026.json")).events;
const LIDO = "2026-10-14T09:46:00Z"; // 10:46 em Lisboa

function contexto(config = ler("../config.json"), { falharMar = false } = {}) {
  const ok = (tipo, f) => ({ ok: true, data: ler(`./reais/openmeteo_${tipo}_${f}_20261014_0946.json`), source: "teste", readAt: LIDO });
  const falha = { ok: false, data: null, source: "teste", readAt: LIDO, error: "HTTP 429" };
  const ladoDe = k => (/Quarteira|ForteNovo/i.test(k) ? "quarteira" : "faro");
  const pts = pontosNecessarios(config);
  const pontos = {
    mar: Object.fromEntries(pts.mar.map(k => [k, falharMar ? falha : ok("marine", ladoDe(k))])),
    terra: Object.fromEntries(pts.terra.map(k => [k, ok("forecast", ladoDe(k))]))
  };
  const dias = Array.from({ length: 7 }, (_, i) => lisbonDate(new Date("2026-10-14T12:00:00Z"), i));
  const sol = (dia, p) => {
    const t = SunCalc.getTimes(new Date(limitesDiaLisboa(dia).inicio + 12 * 3600000), config.locais[p].latitude, config.locais[p].longitude);
    return { nascer: t.sunrise.getTime(), por: t.sunset.getTime() };
  };
  const analise = analisarDias({ dias, mares: eventos, sol, config, pontos });
  return { analise, config, pontos, sol, lua: () => ({ fase: 0.5, fracao: 1 }), mares: { ok: true, data: eventos, anos: [2026] },
    lidoEm: LIDO, agora: LIDO, indice: 0 };
}
const base = contexto();
const IDS = Object.keys(base.config.pesqueiros);

// Dia sintético com a estrutura do motor (só o que a interface lê).
const nota = (n, extra = {}) => ({ estado: "ok", nota: n, completa: true, intervalo: { min: n, max: n }, parcelas: [], ...extra });
const per = (nome, robalo) => ({ nome, notas: { robalo }, alinhamento: { alinhado: false, alinhamentos: [] } });
const cfgSint = { pesqueiros: { a: { nomeCurto: "A" }, b: { nomeCurto: "B" } }, periodos: base.config.periodos };
const dia = pesqueiros => ({ dia: "2026-10-16", pesqueiros, amplitude: { amplitude: 2.5, classe: "intermédia" } });
const ctxSint = { config: cfgSint, lidoEm: LIDO, agora: LIDO };

test("melhor oportunidade: definitiva só com a nota mais alta única, completa e sem nada que a possa igualar", () => {
  const def = destaqueDoDia(dia({ a: { periodos: [per("manhã", nota(4)), per("tarde", nota(3))] }, b: { periodos: [per("manhã", nota(2))] } }), ctxSint, "robalo");
  assert.equal(def.janela.id, "a");
  assert.equal(def.janela.periodo, "manhã");
  assert.equal(def.definitivo, true);

  const emp = destaqueDoDia(dia({ a: { periodos: [per("manhã", nota(4))] }, b: { periodos: [per("tarde", nota(4))] } }), ctxSint, "robalo");
  assert.equal(emp.empate.length, 1, "empate explícito");
  assert.equal(emp.definitivo, false);

  const inc = destaqueDoDia(dia({ a: { periodos: [per("manhã", nota(4, { completa: false, intervalo: { min: 4, max: 5 } }))] } }), ctxSint, "robalo");
  assert.equal(inc.definitivo, false, "nota incompleta nunca é definitiva");

  // Outra combinação incompleta (3, pode chegar a 4) ou sem nota pode igualar → comparação parcial.
  const par = destaqueDoDia(dia({ a: { periodos: [per("manhã", nota(4))] }, b: { periodos: [per("manhã", nota(3, { completa: false, intervalo: { min: 3, max: 4 } })), per("tarde", { estado: "n.d.", nota: null })] } }), ctxSint, "robalo");
  assert.equal(par.podemIgualar.length, 2);
  assert.equal(par.definitivo, false);

  const sem = destaqueDoDia(dia({ a: { periodos: [per("manhã", { estado: "n.d.", nota: null })] } }), ctxSint, "robalo");
  assert.equal(sem.janela, null);
  assert.equal(sem.semNota.length, 1);
});

test("melhor oportunidade no início: no topo, as notas do motor, estado explícito e ligações ao pesqueiro e ao comparador", () => {
  for (const especie of ["robalo", "dourada"]) {
    for (const indice of [0, 2]) {
      const c = { ...base, indice, especie };
      const html = renderInicio(c);
      const bloco = html.split('<section class="destaque')[1]?.split("</section>")[0];
      assert.ok(bloco, `${especie} ${indice}`);
      assert.ok(html.indexOf('class="destaque') < html.indexOf('class="onde-quando'), "antes de «Onde e quando»");
      const r = destaqueDoDia(c.analise.dias[indice], c, especie);
      const estado = /data-estado="([a-z-]+)"/.exec(bloco)[1];
      if (!r.janela) { assert.equal(estado, "sem-notas"); continue; }
      // A nota mostrada é a do motor para esse pesqueiro e período.
      const motor = c.analise.dias[indice].pesqueiros[r.janela.id].periodos.find(p => p.nome === r.janela.periodo).notas[especie];
      assert.equal(r.janela.n, motor);
      assert.match(bloco, new RegExp(`>${motor.nota}<small>/5</small>`));
      assert.equal(estado, r.empate.length ? "empate" : !motor.completa ? "incompleta" : r.podemIgualar.length ? "parcial" : "definitiva");
      if (estado !== "definitiva") assert.doesNotMatch(bloco, /completa e sem empate/);
      assert.match(bloco, new RegExp(`href="\\./pesqueiro\\.html\\?id=${r.janela.id}${indice ? `&amp;dia=${indice}|&dia=${indice}` : ""}"`));
      assert.match(bloco, new RegExp(`href="\\./comparador\\.html\\?dia=${indice}"`));
      assert.doesNotMatch(bloco, /undefined|NaN/);
    }
  }
});

test("cartões: os oito pesqueiros com a fotografia, o tipo, as notas do motor de cada espécie, o estado e a ligação à página", () => {
  assert.equal(IDS.length, 8);
  for (const especie of ["robalo", "dourada"]) {
    const html = renderInicio({ ...base, especie });
    for (const id of IDS) {
      const pq = base.config.pesqueiros[id];
      const cartao = html.split(`id="pq-${id}"`)[1].split("</article>")[0];
      const p = base.analise.dias[0].pesqueiros[id];
      if (pq.foto) assert.ok(cartao.includes(pq.foto.ficheiro), `${id}: fotografia`);
      assert.match(cartao, /praia \(mar de fora\)|molhe|Ria \(interior\)/);
      const passados = periodosPassados(base.analise.dias[0].dia, base);
      for (const [esp, n] of Object.entries(p.notas)) {
        const bloco = cartao.split(`data-especie="${esp}"`)[1].split("</div>")[0];
        // F0 (22/11/2026): hoje, se a nota do dia é de um período que já acabou, o selo é a melhor nota do
        // resto do dia e a nota do dia fica escrita com «(já passou)»; nos outros casos, a nota do dia.
        const r = restoDoDia(p, esp, passados);
        if (r) {
          assert.ok(bloco.includes(`>${r.nota ?? "—"}</b>`), `${id} ${esp}: nota do resto do dia (motor)`);
          assert.ok(bloco.includes(`nota do dia ${textoNota(n)} · ${n.periodo} (já passou)`), `${id} ${esp}: nota do dia passada`);
        } else {
          assert.ok(bloco.includes(`>${textoNota(n)}</b>`), `${id} ${esp}: nota do motor`);
          assert.ok(bloco.includes(estadoDaNota(n)), `${id} ${esp}: estado`);
        }
      }
      assert.ok(cartao.includes(`href="./pesqueiro.html?id=${id}"`), `${id}: página`);
      const factores = /<ul class="factores-cartao"[^>]*>([\s\S]*?)<\/ul>/.exec(cartao)?.[1] ?? "";
      assert.ok((factores.match(/<li>/g) ?? []).length <= 3, `${id}: no máximo 3 factores`);
    }
  }
});

test("notas do cartão: incompleta, n.d. e por confirmar ditos por extenso; nunca um número inventado", () => {
  const p = { notas: {
    robalo: nota(4, { completa: false, intervalo: { min: 3, max: 4 }, periodo: "tarde" }),
    dourada: { estado: "por confirmar", nota: null, motivo: "mar de Sul" }
  } };
  const html = notasDoCartao(p, "robalo");
  assert.match(html, /class="mini n4 inc">4<\/b>/);
  assert.match(html, /incompleta · tarde/);
  assert.match(html, /class="mini pc">\?<\/b>/);
  assert.match(html, /por confirmar/);
  const nd = notasDoCartao({ notas: { robalo: { estado: "n.d.", nota: null, motivo: "potência não obtida" } } }, "robalo");
  assert.match(nd, /class="mini nd">n\.d\.<\/b>/);
  assert.match(nd, /sem nota/);
  assert.equal(estadoDaNota(undefined), "não se aplica");
  assert.deepEqual(porque(undefined), []);
});

test("melhor janela do pesqueiro: melhor e pior período pelas notas do motor; hoje sem os períodos que já acabaram", () => {
  const ctx = { config: cfgSint, lidoEm: LIDO, agora: LIDO };
  const d = { dia: "2026-10-14" }; // hoje: 10:46 em Lisboa, a madrugada já acabou
  const p = { periodos: [per("madrugada", nota(5)), per("manhã", nota(3)), per("tarde", nota(4)), per("noite", nota(2))] };
  const r = janelasDoPesqueiro(p, d, ctx, "robalo");
  assert.deepEqual(r.passados, ["madrugada"]);
  assert.deepEqual(r.melhor.map(x => x.nome), ["tarde"], "a madrugada (5) já passou");
  assert.deepEqual(r.pior.map(x => x.nome), ["noite"]);
  assert.equal(r.definitiva, true);
  // Empate e incompleta.
  const e = janelasDoPesqueiro({ periodos: [per("manhã", nota(4)), per("tarde", nota(4))] }, { dia: "2026-10-16" }, ctx, "robalo");
  assert.equal(e.melhor.length, 2);
  assert.equal(e.definitiva, false);
  const i = janelasDoPesqueiro({ periodos: [per("manhã", nota(4)), per("tarde", nota(3, { completa: false, intervalo: { min: 3, max: 5 } }))] }, { dia: "2026-10-16" }, ctx, "robalo");
  assert.deepEqual(i.podemIgualar.map(x => x.nome), ["tarde"]);
  assert.equal(i.definitiva, false);
  // Sem notas ok: não há janela a indicar.
  const s = janelasDoPesqueiro({ periodos: [per("manhã", { estado: "n.d.", nota: null })] }, { dia: "2026-10-16" }, ctx, "robalo");
  assert.deepEqual(s.melhor, []);
  assert.equal(s.semNota.length, 1);
});

test("página do pesqueiro: secções pela ordem (janela, notas, hora a hora, marés, condições, onde, fontes) nos oito pesqueiros", () => {
  for (const id of IDS) {
    for (const indice of [0, 3]) {
      const html = renderPesqueiro({ ...base, id, indice });
      const ordem = ["Melhor janela", "Notas", "Hora a hora", "Marés", "Condições do dia", "Localização", "Dados, parcelas e fontes"]
        .map(r => html.indexOf(`aria-label="${r}"`));
      assert.ok(ordem.every(x => x > 0), `${id} ${indice}: ${ordem}`);
      for (let k = 1; k < ordem.length; k++) assert.ok(ordem[k - 1] < ordem[k], `${id}: ordem`);
      assert.match(html, /id="mini-mapa"/, `${id}: mini-mapa`);
      for (const esp of base.config.pesqueiros[id].especies ?? []) assert.ok(html.includes(`<div class="janela-esp" data-especie="${esp}"`), `${id} ${esp}`);
      assert.doesNotMatch(html, /undefined|NaN|\[object/);
    }
  }
});

test("mini-mapa: só ilustrativo, fora dos leitores de ecrã, numerado como a lista; a atribuição vai na legenda com ligações", () => {
  for (const id of IDS) {
    const html = renderPesqueiro({ ...base, id });
    const pontos = numerarPontos(pontosDoPesqueiro(base.config.pesqueiros[id], base.config));
    const n = pontos.filter(x => x.local).length;
    assert.ok(html.includes('<div id="mini-mapa" class="mini-mapa" aria-hidden="true"></div>'), id);
    assert.doesNotMatch(html, /id="mini-mapa"[^>]*role=/, `${id}: sem role no mapa (os controlos não ficam dentro de uma «imagem»)`);
    const fig = /<figure class="mini-mapa-fig"[\s\S]*?<\/figure>/.exec(html)?.[0] ?? "";
    assert.match(fig, /<figcaption>Mapa ilustrativo/);
    assert.match(fig, /<a href="https:\/\/www\.openstreetmap\.org\/copyright">colaboradores do OpenStreetMap<\/a>/, `${id}: atribuição OSM`);
    assert.equal((html.match(/<span class="num-ponto">/g) ?? []).length, n, `${id}: um número por ponto com coordenadas`);
    assert.deepEqual(pontos.filter(x => x.local).map(x => x.n), Array.from({ length: n }, (_, k) => k + 1));
  }
  // Atribuição vinda do config: só ligações https, o resto como texto.
  const a = atribuicaoSegura('© <a href="https://osm.org/c">OSM</a> <script>alert(1)</script><a href="javascript:alert(1)">x</a> <b>y</b>');
  assert.equal(a, '© <a href="https://osm.org/c">OSM</a> alert(1)x y');
  assert.equal(atribuicaoSegura(undefined), "");
  // Sem configuração do mapa: figura sem atribuição, sem erro.
  const cfg = structuredClone(base.config);
  delete cfg.mapa;
  assert.doesNotMatch(renderPesqueiro({ ...base, config: cfg, id: "ancao" }), /class="atrib-mapa"/);
});

test("condições do dia: valores lidos com o tipo; o que falta diz-se («não obtido»), nunca zero", () => {
  const d = base.analise.dias[0];
  const tiles = condicoesDoDia(d.pesqueiros.ancao, d, base.config.pesqueiros.ancao, base);
  assert.deepEqual(tiles.map(t => t.chave), ["potencia", "ondulacao", "vento", "pressao", "agua", "chuva", "sol"]);
  for (const t of tiles) {
    assert.ok(["previsto", "calculado"].includes(t.tipo), t.chave);
    assert.equal(t.falta, false, t.chave);
  }
  // A Ria não tem ponto do mar: sem potência nem ondulação.
  const ria = condicoesDoDia(d.pesqueiros.ria, d, base.config.pesqueiros.ria, base);
  assert.ok(!ria.some(t => t.chave === "potencia" || t.chave === "ondulacao"));
  // Sem o mar: potência e ondulação «não obtida», não 0.
  const sem = contexto(undefined, { falharMar: true });
  const ds = sem.analise.dias[0];
  const t2 = condicoesDoDia(ds.pesqueiros.ancao, ds, sem.config.pesqueiros.ancao, sem);
  for (const k of ["potencia", "ondulacao"]) {
    const t = t2.find(x => x.chave === k);
    assert.equal(t.falta, true, k);
    assert.match(t.valor, /não obtid/);
    assert.doesNotMatch(t.valor, /\b0[,.]?0*\b/);
  }
});

test("hora a hora: períodos marcados, hora actual só hoje, valores em falta assinalados, melhor e pior período do motor, arquivo avisado", () => {
  const html = conteudoHorario(base, "molhe_quarteira");
  const p = base.analise.dias[0].pesqueiros.molhe_quarteira;
  const cab = html.split('<tr class="cab">')[1].split("</tr>")[0];
  // Uma marca de início de período por mudança de período (00–06, 06–12, 12–18, 18–24 → 3).
  const mudancas = p.horas.filter((h, i) => i > 0 && h.periodo !== p.horas[i - 1].periodo).length;
  assert.equal((cab.match(/ini-per/g) ?? []).length, mudancas);
  assert.equal((cab.match(/<td class="[^"]*\bagora\b/g) ?? []).length, 1, "a hora actual (10:46 → 10:00)");
  assert.match(cab, /10:00<span class="agora-rot">agora<\/span>/);
  assert.doesNotMatch(conteudoHorario({ ...base, indice: 2 }, "molhe_quarteira"), /agora-rot/, "noutro dia não há «agora»");
  // Melhor (★) e pior (▽) período: os do motor.
  for (const esp of Object.keys(p.notas)) {
    const r = janelasDoPesqueiro(p, base.analise.dias[0], base, esp);
    const linha = html.split(`Nota ${NOME_ESPECIE[esp].toLowerCase()}`)[1].split("</tr>")[0];
    assert.equal((linha.match(/aria-label="melhor período"/g) ?? []).length, r.melhor.length, esp);
    assert.equal((linha.match(/aria-label="período mais fraco"/g) ?? []).length, r.pior.length, esp);
  }
  assert.match(html, /class="legenda-horas"/);
  // Valores em falta: «—» com a classe «falta», nunca 0.
  const c = contexto(); // contexto novo: as horas podem ser alteradas sem mexer nos outros testes
  const h0 = c.analise.dias[0].pesqueiros.ancao.horas[11];
  h0.agua = null; h0.pressao = null; h0.vento = { ...h0.vento, velocidade: null };
  const falta = conteudoHorario(c, "ancao");
  const linhaDe = rot => falta.split(`<th scope="row">${rot}</th>`)[1].split("</tr>")[0];
  for (const rot of ["Água (°C)", "Pressão (hPa)", "Vento (nós)"]) {
    const celulas = linhaDe(rot).match(/<td[^>]*>[^<]*<\/td>/g);
    assert.match(celulas[11], /falta[^>]*title="não obtido">—</, rot);
  }
  assert.match(falta, /há valores em falta neste dia/);
  // Previsão arquivada.
  const arq = conteudoHorario({ ...base, origem: { tipo: "arquivo", lidoEm: LIDO } }, "ancao");
  assert.match(arq, /Previsão arquivada — não é a previsão actual/);
  assert.match(arq, /class="tabela-horas arquivada"/);
});

// Contraste WCAG 2.x (texto normal ≥ 4,5:1) das cores definidas em :root (css/app.css).
const lum = hex => {
  const [r, g, b] = hex.match(/[0-9a-f]{2}/gi).map(x => parseInt(x, 16) / 255).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contraste = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

test("cores: texto com contraste ≥ 4,5:1 (notas com texto branco, texto suave, ligações, avisos)", () => {
  const css = texto("../css/app.css");
  const raiz = css.split(":root {")[1].split("\n}")[0];
  const cor = nome => {
    const m = new RegExp(`--${nome}:\\s*(#[0-9a-f]{6})`, "i").exec(raiz);
    assert.ok(m, `--${nome} em :root`);
    return m[1];
  };
  const pares = [
    ...["n1", "n2", "n3", "n4", "n5", "nd"].map(n => [`--${n} com texto branco`, cor(n), "#ffffff"]),
    ["--pc em fundo branco", cor("pc"), cor("superficie")],
    ["texto no fundo", cor("texto"), cor("fundo")],
    ["texto suave no fundo", cor("suave"), cor("fundo")],
    ["texto suave em branco", cor("suave"), cor("superficie")],
    ["ligações", cor("link"), cor("superficie")],
    ["turquesa em branco", cor("turquesa"), cor("superficie")],
    ["avisos", cor("aviso-texto"), cor("aviso-fundo")],
    ["barra activa", cor("mar"), cor("turquesa-claro")],
    ["texto branco no destaque", "#ffffff", cor("mar-3")]
  ];
  for (const [nome, a, b] of pares) assert.ok(contraste(a, b) >= 4.5, `${nome}: ${contraste(a, b).toFixed(2)}`);
});

test("barra: um ícone por secção (SVG local, sem pedidos externos) e o ecrã actual marcado também para leitores de ecrã", () => {
  const css = texto("../css/app.css");
  for (const [href, ic] of [["./", "inicio"], ["./comparador.html", "comparar"], ["./mapa.html", "mapa"], ["./diario.html", "diario"], ["./fontes.html", "fontes"]]) {
    assert.ok(css.includes(`.barra a[href="${href}"] { --ic: var(--ic-${ic}); }`), href);
    assert.match(css, new RegExp(`--ic-${ic}: url\\("data:image/svg\\+xml`), ic);
  }
  assert.doesNotMatch(css, /url\((["'])?https?:/, "nenhum recurso externo no CSS");
  for (const pagina of ["index.html", "comparador.html", "mapa.html", "diario.html", "fontes.html"]) {
    assert.match(texto(`../${pagina}`), /class="activo" aria-current="page"/, pagina);
  }
});
