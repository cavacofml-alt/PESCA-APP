// Diário (plano de evolução, PR 5): horas de Lisboa (mudança de hora, noite que passa a meia-noite),
// validação, guardar/editar/apagar com as condições numa só transacção, condições a partir de uma
// leitura guardada (previsão, nunca medição), cópia de segurança e importação (inválida não escreve
// nada; conflitos não substituem o que existe), lembrete. Sem rede, com o armazém em memória.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { armazemMemoria } from "../js/armazenamento/armazem-memoria.js";
import { leituraDe } from "../js/armazenamento/leituras.js";
import { lisboaParaUtc, utcParaLisboa, instantesDaSaida, validarSaida, guardarSaida, apagarSaida, listarSaidas, obterCondicoes, novoId }
  from "../js/diario/saidas.js";
import { leiturasCandidatas, condicoesDaSaida, associarCondicoes } from "../js/diario/condicoes.js";
import { validarCopia, importarCopia, exportarCopia, planoImportacao, precisaLembrete, registarCopia, criarCopia, FORMATO } from "../js/diario/copia.js";
import { lerFormulario, renderDiario, formularioSaida, textoResultado, resumoCondicoes } from "../js/ui/diario.js";
import { solDoDia } from "../js/dados.js";
import { validateTides } from "../js/fontes/mares-locais.js";
import { pontosNecessarios } from "../js/pontos.js";

const ler = rel => JSON.parse(readFileSync(new URL(rel, import.meta.url), "utf8"));
const config = ler("../config.json");
const IDS = Object.keys(config.pesqueiros);
const SunCalc = createRequire(import.meta.url)("../vendor/suncalc.js");
const mares = validateTides(ler("../mares/2026.json")).events;
const sol = solDoDia(SunCalc, config);

const saidaBase = (extra = {}) => ({
  id: "s-teste-1", esquema: 1, pesqueiro: "ancao", inicio: "2026-10-14T06:00:00.000Z", fim: "2026-10-14T09:30:00.000Z",
  especiesAlvo: ["robalo"], outraAlvo: null, resultado: "com capturas",
  capturas: [{ especie: "robalo", outra: null, quantidade: 2, tamanhoCm: 42.5, observacoes: "na rebentação" }],
  observacoes: "", criadoEm: "2026-10-14T10:00:00.000Z", alteradoEm: "2026-10-14T10:00:00.000Z", condicoesId: null, ...extra
});

// ---------- Horas de Lisboa ----------

test("horas: Lisboa → UTC no Verão e no Inverno, hora repetida e hora inexistente (qualquer fuso do aparelho)", () => {
  assert.deepEqual(lisboaParaUtc("2026-10-14", "07:00"), { ms: Date.parse("2026-10-14T06:00:00Z"), ambigua: false });
  assert.deepEqual(lisboaParaUtc("2026-12-01", "07:00"), { ms: Date.parse("2026-12-01T07:00:00Z"), ambigua: false });
  // 25/10/2026: às 02:00 volta à 01:00 → 01:30 acontece duas vezes; fica a primeira (00:30 UTC).
  assert.deepEqual(lisboaParaUtc("2026-10-25", "01:30"), { ms: Date.parse("2026-10-25T00:30:00Z"), ambigua: true });
  // 29/03/2026: às 01:00 passa a 02:00 → 01:30 não existe.
  assert.match(lisboaParaUtc("2026-03-29", "01:30").erro, /não existe/);
  for (const [d, h] of [["2026-02-30", "07:00"], ["2026-10-14", "24:00"], ["14/10/2026", "07:00"], ["2026-10-14", "7h"]]) {
    assert.match(lisboaParaUtc(d, h).erro, /inválida/, `${d} ${h}`);
  }
  assert.deepEqual(utcParaLisboa("2026-10-14T23:30:00.000Z"), { dia: "2026-10-15", hora: "00:30" });
});

test("horas: fim antes do início = dia seguinte (pesca de noite); sem fim aceite", () => {
  const n = instantesDaSaida({ dia: "2026-10-14", horaInicio: "22:00", horaFim: "02:00" });
  assert.equal(n.inicio, "2026-10-14T21:00:00.000Z");
  assert.equal(n.fim, "2026-10-15T01:00:00.000Z");
  assert.deepEqual(n.avisos, ["acaba no dia seguinte"]);
  assert.deepEqual(instantesDaSaida({ dia: "2026-10-14", horaInicio: "07:00", horaFim: null }), { inicio: "2026-10-14T06:00:00.000Z", fim: null, avisos: [] });
  // Noite da mudança de hora: 23:00 de 24/10 (UTC+1) a 03:00 de 25/10 (UTC+0) = 5 h.
  const m = instantesDaSaida({ dia: "2026-10-24", horaInicio: "23:00", horaFim: "03:00" });
  assert.equal((Date.parse(m.fim) - Date.parse(m.inicio)) / 3600000, 5);
  assert.match(instantesDaSaida({ dia: "x", horaInicio: "07:00" }).erro, /início/);
});

// ---------- Validação ----------

test("validação: saída válida; erros de cada campo; pesqueiro desconhecido só dá aviso", () => {
  assert.deepEqual(validarSaida(saidaBase(), { pesqueirosConhecidos: IDS }), { ok: true, erros: [], avisos: [] });
  const casos = [
    [{ pesqueiro: "" }, /pesqueiro em falta/], [{ inicio: "ontem" }, /início inválido/], [{ fim: "2026-10-14T05:00:00.000Z" }, /depois do início/],
    [{ fim: "2026-10-16T06:00:00.000Z" }, /mais de 24 h/], [{ especiesAlvo: [] }, /pelo menos uma espécie/], [{ especiesAlvo: ["atum"] }, /desconhecida/],
    [{ especiesAlvo: ["outra"], outraAlvo: " " }, /qual é a outra espécie/], [{ resultado: "talvez" }, /resultado/],
    [{ resultado: "sem capturas" }, /«sem capturas» mas com capturas/], [{ capturas: [] }, /sem nenhuma captura/],
    [{ capturas: [{ especie: "robalo", quantidade: 0 }] }, /quantidade inteira/], [{ capturas: [{ especie: "robalo", quantidade: 1.5 }] }, /quantidade inteira/],
    [{ capturas: [{ especie: "robalo", quantidade: 1, tamanhoCm: -3 }] }, /tamanho/], [{ capturas: [{ especie: "outra", quantidade: 1 }] }, /qual é a espécie/],
    [{ esquema: 2 }, /esquema 2/], [{ id: "" }, /id em falta/]
  ];
  for (const [mudanca, erro] of casos) {
    const v = validarSaida(saidaBase(mudanca), { pesqueirosConhecidos: IDS });
    assert.equal(v.ok, false, JSON.stringify(mudanca));
    assert.ok(v.erros.some(e => erro.test(e)), `${JSON.stringify(mudanca)} → ${v.erros}`);
  }
  assert.deepEqual(validarSaida(saidaBase({ resultado: "sem capturas", capturas: [] })).erros, []);
  const fora = validarSaida(saidaBase({ pesqueiro: "antigo" }), { pesqueirosConhecidos: IDS });
  assert.deepEqual([fora.ok, fora.avisos], [true, ["pesqueiro «antigo» não está na configuração actual"]]);
  assert.equal(validarSaida(null).ok, false);
});

test("formulário: lê os campos (Lisboa, vírgula decimal, várias capturas, «sem capturas» ignora as linhas)", () => {
  const campos = { pesqueiro: "molhe_quarteira", dia: "2026-10-14", horaInicio: "19:00", horaFim: "23:30", "alvo-robalo": "on", "alvo-outra": "on",
    outraAlvo: " sargo ", resultado: "com capturas", "cap-especie-0": "robalo", "cap-quantidade-0": "1", "cap-tamanho-0": "45,5", "cap-obs-0": "lado poente",
    "cap-especie-3": "outra", "cap-outra-3": "Sargo", "cap-quantidade-3": "3", "cap-tamanho-3": "", observacoes: "  vento fraco " };
  const { saida, erros } = lerFormulario(campos, { id: "s-1", agora: "2026-10-15T08:00:00.000Z" });
  assert.deepEqual(erros, []);
  assert.equal(saida.inicio, "2026-10-14T18:00:00.000Z");
  assert.deepEqual(saida.especiesAlvo, ["robalo", "outra"]);
  assert.equal(saida.outraAlvo, "sargo");
  assert.deepEqual(saida.capturas.map(c => [c.especie, c.outra, c.quantidade, c.tamanhoCm]), [["robalo", null, 1, 45.5], ["outra", "Sargo", 3, null]]);
  assert.equal(saida.observacoes, "vento fraco");
  assert.ok(validarSaida(saida).ok);
  assert.equal(textoResultado(saida), "4 capturas: 1 robalo, 3 sargo");
  const sem = lerFormulario({ ...campos, resultado: "sem capturas" }, { id: "s-2" }).saida;
  assert.deepEqual([sem.capturas, textoResultado(sem)], [[], "sem capturas"]);
  assert.ok(validarSaida(sem).ok);
  const mal = lerFormulario({ ...campos, "cap-quantidade-0": "dois" }, { id: "s-3" }).saida;
  assert.match(validarSaida(mal).erros.join(), /quantidade inteira/);
  // Editar mantém a data de criação.
  const ed = lerFormulario(campos, { id: "s-1", agora: "2026-10-20T08:00:00.000Z", anterior: { criadoEm: "2026-10-15T08:00:00.000Z" } }).saida;
  assert.deepEqual([ed.criadoEm, ed.alteradoEm], ["2026-10-15T08:00:00.000Z", "2026-10-20T08:00:00.000Z"]);
  assert.match(formularioSaida({ config, saida: saidaBase(), hoje: "2026-10-14" }), /Editar saída/);
  assert.match(novoId("s", 1000, () => 0.5), /^s-rs-[0-9a-z]{6}$/);
});

// ---------- Armazém: guardar, editar, apagar ----------

test("guardar, listar (mais recente primeiro), editar e apagar; a saída e as condições andam juntas", async () => {
  const a = armazemMemoria();
  const c1 = { id: "c-s-teste-1", saidaId: "s-teste-1", esquema: 1, disponivel: false, motivo: "teste" };
  assert.equal((await guardarSaida(a, saidaBase(), c1)).ok, true);
  assert.equal((await guardarSaida(a, saidaBase({ id: "s-teste-2", inicio: "2026-10-20T06:00:00.000Z", fim: null }))).ok, true);
  const { saidas } = await listarSaidas(a);
  assert.deepEqual(saidas.map(s => s.id), ["s-teste-2", "s-teste-1"]);
  assert.equal(saidas[1].condicoesId, "c-s-teste-1");
  assert.equal((await obterCondicoes(a, "s-teste-1")).motivo, "teste");
  // Editar: as condições ficam se não se recalcularem.
  await guardarSaida(a, { ...saidas[1], observacoes: "editado" });
  assert.equal((await listarSaidas(a)).saidas[1].observacoes, "editado");
  assert.equal((await listarSaidas(a)).saidas[1].condicoesId, "c-s-teste-1");
  // Inválida: não se grava nada.
  const r = await guardarSaida(a, saidaBase({ id: "s-x", resultado: "?" }));
  assert.equal(r.ok, false);
  assert.equal((await a.chaves("diario")).length, 2);
  // Apagar leva as condições.
  assert.equal((await apagarSaida(a, "s-teste-1")).ok, true);
  assert.deepEqual(await a.chaves("diario"), ["s-teste-2"]);
  assert.deepEqual(await a.chaves("condicoes"), []);
  // Um registo estragado na base não aparece como se estivesse certo.
  await a.guardar("diario", { id: "estragado" });
  assert.deepEqual(Object.values(await listarSaidas(a)).map(v => (Array.isArray(v) ? v.length : v)), [1, 1]);
});

test("guardar sem espaço: nada fica a meio (nem a saída sem as condições)", async () => {
  const a = armazemMemoria({ limiteBytes: 900 });
  const grande = { id: "c-s-teste-1", saidaId: "s-teste-1", esquema: 1, disponivel: false, motivo: "x".repeat(2000) };
  const r = await guardarSaida(a, saidaBase(), grande);
  assert.deepEqual([r.ok, r.erros], [false, ["sem espaço no aparelho"]]);
  assert.deepEqual([await a.chaves("diario"), await a.chaves("condicoes")], [[], []]);
});

// ---------- Condições a partir da leitura guardada ----------

function leituraReal(lidoEm) {
  const ok = (tipo, f) => ({ ok: true, data: ler(`./reais/openmeteo_${tipo}_${f}_20261014_0946.json`), source: "teste", readAt: lidoEm });
  const ladoDe = k => (/Quarteira|ForteNovo/i.test(k) ? "quarteira" : "faro");
  const pts = pontosNecessarios(config);
  return leituraDe({ lidoEm, pontos: { mar: Object.fromEntries(pts.mar.map(k => [k, ok("marine", ladoDe(k))])),
    terra: Object.fromEntries(pts.terra.map(k => [k, ok("forecast", ladoDe(k))])) },
  boiaFaro: { ok: true, readAt: lidoEm, data: { observacoes: [
    { instante: Date.parse("2026-10-14T06:20:00Z"), hm0: { valor: 0.9, estado: "obtido" }, tm02: { valor: 5.8, estado: "obtido" }, agua: { valor: 21.3, estado: "obtido" } },
    { instante: Date.parse("2026-10-14T08:20:00Z"), hm0: { valor: 99.99, estado: "não obtido" }, tm02: { valor: null, estado: "não obtido" }, agua: { valor: null, estado: "não obtido" } }] } } });
}

test("condições: leitura antes da saída primeiro (a mais recente), depois as lidas depois; só até 7 dias", () => {
  const ini = Date.parse("2026-10-14T06:00:00Z");
  const chaves = ["2026-10-14T05:00:00.000Z", "2026-10-13T20:00:00.000Z", "2026-10-14T12:00:00.000Z", "2026-10-15T09:00:00.000Z",
    "2026-10-01T00:00:00.000Z", "2026-10-25T00:00:00.000Z", "x"];
  assert.deepEqual(leiturasCandidatas(chaves, ini), ["2026-10-14T05:00:00.000Z", "2026-10-13T20:00:00.000Z", "2026-10-14T12:00:00.000Z", "2026-10-15T09:00:00.000Z"]);
});

test("condições: a previsão hora a hora no pesqueiro, as notas do motor nos períodos da saída, marés e boia", () => {
  const leitura = leituraReal("2026-10-14T05:00:00.000Z");
  const c = condicoesDaSaida(saidaBase(), leitura, { config, mares, sol, calculadoEm: "2026-10-14T10:00:00.000Z" });
  assert.equal(c.disponivel, true);
  assert.deepEqual(c.leitura, { id: "2026-10-14T05:00:00.000Z", lidoEm: "2026-10-14T05:00:00.000Z", relacao: "antes", horasEntreLeituraEInicio: 1 });
  assert.deepEqual(c.horas.map(h => new Date(h.instante).toISOString().slice(11, 16)), ["06:00", "07:00", "08:00", "09:00"]);
  assert.ok(c.horas.every(h => typeof h.hs === "number" && typeof h.vento === "number"));
  // 07:00–10:30 em Lisboa → madrugada (até às 06:00 locais) não; manhã sim.
  assert.deepEqual(c.periodos.map(p => p.nome), ["manhã"]);
  assert.deepEqual(Object.keys(c.periodos[0].notas).sort(), ["dourada", "robalo"]);
  assert.equal(c.dias[0].dia, "2026-10-14");
  assert.ok(c.dias[0].repontos.length >= 3);
  assert.deepEqual(c.boia, { instante: Date.parse("2026-10-14T06:20:00Z"), hm0: 0.9, tm02: 5.8, agua: 21.3, tipo: "observado (boia de Faro, ao largo)" });
  // As notas guardadas são as que o motor dá com a mesma leitura (nenhuma regra própria).
  const html = resumoCondicoes(c, saidaBase());
  assert.match(html, /previsão \(Open-Meteo\) lida 14\/10 às 06:00, 1,0 h antes do início/);
  assert.match(html, /Não são medições no pesqueiro/);
  // Saída a passar a meia-noite: períodos de dois dias.
  const noite = condicoesDaSaida(saidaBase({ inicio: "2026-10-14T20:00:00.000Z", fim: "2026-10-15T02:00:00.000Z" }), leitura, { config, mares, sol });
  assert.deepEqual(noite.periodos.map(p => `${p.dia} ${p.nome}`), ["2026-10-14 noite", "2026-10-15 madrugada"]);
});

test("condições: sem leitura que sirva fica dito porquê (nunca valores inventados)", async () => {
  const vazio = await associarCondicoes(armazemMemoria(), saidaBase(), { config, mares, sol, agora: "2026-10-14T10:00:00.000Z" });
  assert.deepEqual([vazio.disponivel, vazio.motivo], [false, "ainda não há previsões guardadas neste aparelho"]);
  const a = armazemMemoria();
  await a.guardar("leituras", leituraReal("2026-10-14T05:00:00.000Z"));
  const longe = await associarCondicoes(a, saidaBase({ inicio: "2026-11-30T06:00:00.000Z", fim: null }), { config, mares, sol });
  assert.equal(longe.disponivel, false);
  assert.match(longe.motivo, /até 7 dias antes ou depois/);
  const perto = await associarCondicoes(a, saidaBase(), { config, mares, sol });
  assert.equal(perto.disponivel, true);
  assert.equal((await associarCondicoes(a, saidaBase({ pesqueiro: "antigo" }), { config })).motivo, "o pesqueiro não está na configuração");
  assert.match(resumoCondicoes(longe, saidaBase()), /não associadas — /);
});

// ---------- Cópia de segurança ----------

async function diarioCom(...saidas) {
  const a = armazemMemoria();
  for (const s of saidas) await guardarSaida(a, s, { id: `c-${s.id}`, saidaId: s.id, esquema: 1, disponivel: false, motivo: "teste" });
  return a;
}

test("cópia: exportar e importar noutro aparelho dá os mesmos registos", async () => {
  const a = await diarioCom(saidaBase(), saidaBase({ id: "s-2", resultado: "sem capturas", capturas: [] }));
  const { texto, copia } = await exportarCopia(a, "2026-11-20T10:00:00.000Z");
  assert.equal(copia.formato, FORMATO);
  assert.equal(copia.versao, 1);
  const b = armazemMemoria();
  const r = await importarCopia(b, texto, { pesqueirosConhecidos: IDS });
  assert.deepEqual([r.ok, r.novas, r.iguais, r.conflitos], [true, 2, 0, []]);
  assert.deepEqual(await b.listar("diario"), await a.listar("diario"));
  assert.deepEqual(await b.listar("condicoes"), await a.listar("condicoes"));
  // Importar outra vez: tudo igual, nada muda.
  const r2 = await importarCopia(b, texto);
  assert.deepEqual([r2.novas, r2.iguais], [0, 2]);
});

test("cópia inválida: nada é escrito e os registos que existem ficam intactos", async () => {
  const a = await diarioCom(saidaBase());
  const antes = JSON.stringify([await a.listar("diario"), await a.listar("condicoes")]);
  const valida = criarCopia({ saidas: [saidaBase({ id: "s-nova" })], condicoes: [] });
  const casos = [
    ["{ isto não é json", /não é JSON/],
    [JSON.stringify({ formato: "outro", versao: 1, saidas: [] }), /não é uma cópia do diário/],
    [JSON.stringify({ ...valida, versao: 9 }), /mais recente do que esta app/],
    [JSON.stringify({ ...valida, saidas: [saidaBase({ id: "s-nova" }), saidaBase({ id: "s-nova2", resultado: "?" })] }), /saída 2/],
    [JSON.stringify({ ...valida, saidas: [saidaBase({ id: "s-n" }), saidaBase({ id: "s-n" })] }), /repetido/],
    [JSON.stringify({ ...valida, condicoes: [{ id: "c-outra", saidaId: "outra", esquema: 1, disponivel: false }] }), /não pertence/]
  ];
  for (const [texto, erro] of casos) {
    const r = await importarCopia(a, texto, { pesqueirosConhecidos: IDS });
    assert.equal(r.ok, false, texto.slice(0, 40));
    assert.ok(r.erros.some(e => erro.test(e)), `${texto.slice(0, 40)} → ${r.erros}`);
    assert.equal(JSON.stringify([await a.listar("diario"), await a.listar("condicoes")]), antes, "nada mudou");
  }
  // Uma cópia válida mas sem espaço: também não escreve nada.
  const cheio = await diarioCom(saidaBase());
  const lim = armazemMemoria({ limiteBytes: JSON.stringify(await cheio.listar("diario")).length + 900 });
  await guardarSaida(lim, saidaBase());
  const r = await importarCopia(lim, JSON.stringify(criarCopia({ saidas: Array.from({ length: 5 }, (_, i) => saidaBase({ id: `s-${i}` })), condicoes: [] })));
  assert.equal(r.ok, false);
  assert.match(r.erros[0], /nada foi importado/);
  assert.deepEqual(await lim.chaves("diario"), ["s-teste-1"]);
});

test("cópia: um registo diferente com o mesmo id não substitui o do aparelho (conflito)", async () => {
  const a = await diarioCom(saidaBase());
  const outra = criarCopia({ saidas: [saidaBase({ observacoes: "versão de outro aparelho" }), saidaBase({ id: "s-nova" })], condicoes: [] });
  const r = await importarCopia(a, JSON.stringify(outra));
  assert.deepEqual([r.novas, r.iguais, r.conflitos.map(c => c.id)], [1, 0, ["s-teste-1"]]);
  assert.equal((await a.obter("diario", "s-teste-1")).observacoes, "");
  assert.deepEqual(planoImportacao({ saidas: [], condicoes: [] }, { saidas: [], condicoes: [] }), { novas: [], iguais: 0, conflitos: [], condicoesNovas: [] });
  assert.equal(validarCopia(outra).avisos.length, 0);
  assert.deepEqual(validarCopia(criarCopia({ saidas: [saidaBase({ pesqueiro: "antigo" })], condicoes: [] }), { pesqueirosConhecidos: IDS }).avisos,
    ["pesqueiro «antigo» não está na configuração actual"]);
});

test("lembrete de cópia: com saídas e sem cópia, ou com a última há mais de 30 dias", async () => {
  const agora = Date.parse("2026-11-20T10:00:00Z");
  assert.equal(precisaLembrete({ numeroSaidas: 0, agora }), false);
  assert.equal(precisaLembrete({ numeroSaidas: 3, agora }), true);
  assert.equal(precisaLembrete({ numeroSaidas: 3, ultimaCopia: "2026-11-01T00:00:00.000Z", agora }), false);
  assert.equal(precisaLembrete({ numeroSaidas: 3, ultimaCopia: "2026-10-01T00:00:00.000Z", agora }), true);
  assert.equal(precisaLembrete({ numeroSaidas: 3, ultimaCopia: "2026-11-01T00:00:00.000Z", agora, dias: 7 }), true);
  const a = armazemMemoria();
  await registarCopia(a, "2026-11-20T10:00:00.000Z");
  assert.equal((await a.obter("meta", "ultimaCopia")).valor, "2026-11-20T10:00:00.000Z");
});

test("ecrã: lista, vazio, lembrete e aparelho sem armazenamento", () => {
  const s = saidaBase();
  const html = renderDiario({ config, armazem: { ok: true }, saidas: [s], condicoes: new Map(), lembrete: true });
  assert.match(html, /quarta, 14\/10\/2026 · 07:00–10:30/);
  assert.match(html, /Ancão/);
  assert.match(html, /2 capturas: 2 robalo/);
  assert.match(html, /42,5 cm/);
  assert.match(html, /Ainda não foi feita nenhuma cópia/);
  assert.match(html, /Condições: não associadas/);
  assert.match(renderDiario({ config, armazem: { ok: true }, saidas: [] }), /Ainda não há saídas registadas/);
  const semBase = renderDiario({ config, armazem: { ok: false, erro: "este navegador não tem IndexedDB" } });
  assert.match(semBase, /O diário não funciona neste aparelho/);
  assert.match(semBase, /id="nova-saida" class="principal" disabled/);
  assert.doesNotMatch(html, /undefined|NaN/);
});
