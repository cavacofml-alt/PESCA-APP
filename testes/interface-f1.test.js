// F1 da interface (24/11/2026): sistema visual. Só apresentação: tokens de cor, escala de letra e pesos,
// botões com área de toque de 44 × 44 px e a barra superior azul. As cores das notas não mudam. Sem rede.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const texto = rel => readFileSync(new URL(rel, import.meta.url), "utf8");
const css = texto("../css/app.css");
const ini = css.indexOf(":root {");
const fim = css.indexOf("\n}", ini) + 2;
const raiz = css.slice(ini, fim);
const resto = css.slice(fim);
const token = nome => {
  const m = new RegExp(`--${nome}:\\s*([^;]+);`).exec(raiz);
  assert.ok(m, `--${nome} em :root`);
  return m[1].trim();
};

const lum = hex => {
  const [r, g, b] = hex.match(/[0-9a-f]{2}/gi).map(x => parseInt(x, 16) / 255).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contraste = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

test("F1: os tokens existem no primeiro :root (cores, escala de letra, pesos, área de toque)", () => {
  for (const n of ["mar", "mar-2", "mar-3", "turquesa", "turquesa-claro", "turquesa-escuro", "fundo", "fundo-suave", "superficie", "branco", "cinza",
    "linha", "linha-suave", "linha-forte", "campo-borda", "tracejado", "texto", "suave", "link", "sobre-escuro-suave",
    "aviso-fundo", "aviso-texto", "aviso-borda", "aviso-forte", "erro", "erro-fundo", "erro-texto", "erro-borda", "sucesso-fundo", "sucesso-texto",
    "sol", "borda-botao"]) assert.match(token(n), /^#[0-9a-f]{6}$/i, n);
  const escala = ["2xs", "xs", "s", "m", "corpo", "base", "l", "xl", "2xl", "3xl"].map(t => parseFloat(token(`t-${t}`)));
  assert.deepEqual(escala.map(v => v * 16), [11, 12, 13, 14, 15, 16, 18, 20, 22, 28], "escala em px");
  assert.deepEqual(["normal", "medio", "forte", "nota"].map(p => token(`p-${p}`)), ["400", "600", "700", "750"]);
  assert.equal(token("toque"), "2.75rem", "44 px");
  assert.match(raiz, /font-family: var\(--familia\)/);
});

test("F1: o significado das cores das notas não muda (os mesmos valores de antes)", () => {
  assert.deepEqual(["n1", "n2", "n3", "n4", "n5", "nd", "pc"].map(token), ["#b3261e", "#b04a0a", "#8a6200", "#3b7a1f", "#1d6638", "#66757e", "#7a5800"]);
});

test("F1: fora do :root só ficam as cores das escalas de dados do «hora a hora» e do mapa; letra e pesos sempre por token", () => {
  // Regras com cores escritas à mão permitidas: escalas de vento/rajada (.v1–.v5), potência (.p1–.p3), limo e
  // as cores dos fundões e cabeços do mapa (fases F3 e F4).
  const permitidas = /^(\.v[1-5]|\.p[1-3]|\.limo-sim|\.rotulo-forma\.[fc]|\.legenda-mapa \.[fc])\b/;
  const semComentarios = resto.replace(/\/\*[\s\S]*?\*\//g, "");
  const regras = [...semComentarios.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(m => ({ sel: m[1].trim(), corpo: m[2] }));
  const hex = regras.filter(r => /#[0-9a-f]{3,6}\b/i.test(r.corpo) && !r.sel.startsWith(":root"));
  for (const r of hex) for (const parte of r.sel.split(/\s*}\s*/)) assert.match(parte, permitidas, `cor escrita à mão em «${r.sel}»`);
  assert.doesNotMatch(semComentarios, /\bwhite\b(?!-space)/, "sem «white»: --superficie ou --branco");
  assert.doesNotMatch(semComentarios, /rgb\(11 59 83/, "sem o azul antigo nas sombras");
  assert.doesNotMatch(semComentarios, /var\(--azul2?\)/, "sem os nomes antigos --azul e --azul2");
  const tamanhos = [...semComentarios.matchAll(/font-size:\s*([^;}]+)/g)].map(m => m[1].trim());
  for (const t of tamanhos) assert.ok(/^var\(--t-[a-z0-9]+\)( !important)?$/.test(t) || t === "clamp(.72rem, 3.2vw, .8rem)" || t === "10px", `tamanho fora da escala: ${t}`);
  for (const m of semComentarios.matchAll(/font-weight:\s*([^;}]+)/g)) assert.match(m[1].trim(), /^var\(--p-[a-z]+\)$/, `peso fora dos tokens: ${m[1]}`);
});

test("F1: contraste das cores novas (texto ≥ 4,5:1; contorno dos botões e foco ≥ 3:1)", () => {
  const pares = [
    ["título e texto na barra superior", token("branco"), token("mar")],
    ["hora da leitura na barra superior", token("sobre-escuro-suave"), token("mar")],
    ["texto claro no tom mais claro da «melhor oportunidade»", token("sobre-escuro-suave"), token("mar-3")],
    ["avisos", token("aviso-texto"), token("aviso-fundo")],
    ["erros", token("erro-texto"), token("erro-fundo")],
    ["erro em branco", token("erro"), token("superficie")],
    ["mensagens de sucesso", token("sucesso-texto"), token("sucesso-fundo")],
    ["botão desactivado", token("suave"), token("cinza")],
    ["texto no turquesa claro", token("turquesa-escuro"), token("turquesa-claro")],
    ["botão primário", token("branco"), token("mar")],
    ["botão primário ao passar o rato", token("branco"), token("mar-2")],
    ["botão secundário", token("mar"), token("superficie")]
  ];
  for (const [nome, a, b] of pares) assert.ok(contraste(a, b) >= 4.5, `${nome}: ${contraste(a, b).toFixed(2)}`);
  for (const [nome, a, b] of [["contorno do botão secundário no branco", token("borda-botao"), token("superficie")],
    ["contorno do botão secundário no fundo", token("borda-botao"), token("fundo")], ["foco branco na barra", token("branco"), token("mar")]]) {
    assert.ok(contraste(a, b) >= 3, `${nome}: ${contraste(a, b).toFixed(2)}`);
  }
});

test("F1: uma só família de botões com área de toque de 44 px; símbolos 44 × 44; desactivado plano e cinzento", () => {
  const base = /\.btn, \.btn-horas, \.especie-btn, \.opcoes button, \.atalho, \.accoes-diario button, \.accoes-diario \.botao,\s*\.botoes-form button, \.botoes-saida button, #mais-captura, \.remover-captura, \.pagina-diag #refresh \{([^}]*)\}/.exec(css);
  assert.ok(base, "regra comum dos botões");
  assert.match(base[1], /min-height: var\(--toque\)/);
  assert.match(base[1], /box-shadow: inset 0 0 0 1\.5px var\(--borda-botao\)/, "secundário com contorno");
  for (const sel of [".nav-dia, .fechar", ".btn-actualizar"]) {
    const r = new RegExp(`${sel.replace(/[.]/g, "\\.")} \\{([^}]*)\\}`).exec(css);
    assert.ok(r, sel);
    assert.match(r[1], /width: var\(--toque\); height: var\(--toque\)/, sel);
  }
  assert.match(css, /\.painel-topo \{[^}]*grid-template-columns: var\(--toque\) 1fr var\(--toque\) var\(--toque\)/);
  const desact = /\):disabled,\s*\.accoes-diario \.botao\.desactivado \{([^}]*)\}/.exec(css);
  assert.ok(desact, "regra do desactivado");
  assert.match(desact[1], /background: var\(--cinza\); color: var\(--suave\); box-shadow: none;/);
  assert.match(desact[1], /cursor: not-allowed/);
  assert.doesNotMatch(css, /min-height: 2\.6rem/, "nenhum botão com 41,6 px");
  // Ao passar o rato, os casos próprios (botões sobre o azul) mandam: :where() sem especificidade.
  assert.match(css, /@media \(hover: hover\) \{\s*(\/\*[\s\S]*?\*\/\s*)?:where\(/);
});

test("F1: barra superior azul de lado a lado, título e hora a branco, foco branco; a cor do tema acompanha", () => {
  const topo = /\n\.topo \{([^}]*)\}/.exec(css);
  assert.ok(topo);
  assert.match(topo[1], /background: var\(--mar\)/);
  assert.match(topo[1], /box-shadow: 0 0 0 100vmax var\(--mar\); clip-path: inset\(0 -100vmax\)/, "fundo de lado a lado sem deslocamento");
  assert.match(topo[1], /env\(safe-area-inset-top\)/);
  assert.match(css, /\.topo h1 \{[^}]*color: var\(--branco\)/);
  assert.match(css, /\.topo \.lido \{[^}]*color: var\(--sobre-escuro-suave\)/);
  assert.match(css, /\.topo :focus-visible \{ outline-color: var\(--branco\); \}/);
  assert.match(css, /\.destaque :focus-visible \{ outline-color: var\(--branco\); \}/);
  const mar = token("mar");
  for (const p of ["index", "comparador", "pesqueiro", "mapa", "diario", "estatisticas", "historico", "guia", "fontes", "diagnostico"]) {
    const html = texto(`../${p}.html`);
    assert.ok(html.includes(`<meta name="theme-color" content="${mar}">`), `${p}.html: theme-color = --mar`);
    assert.match(html, /<header class="topo/, `${p}.html: o cabeçalho é o mesmo`);
  }
  assert.equal(JSON.parse(texto("../manifest.webmanifest")).theme_color, mar);
});
