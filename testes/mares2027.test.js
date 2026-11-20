// Tabela de marés de 2027 (IH, Faro-Olhão) e leitura das tabelas dos anos que a janela toca.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateTides, loadTidesForWindow, anosDaJanela } from "../js/fontes/mares-locais.js";
import { amplitudeDoDia, repontosDoDia } from "../js/regras/mares.js";

const lerJson = rel => JSON.parse(readFileSync(new URL(`../${rel}`, import.meta.url), "utf8"));
const config = lerJson("config.json");
const T2026 = lerJson("mares/2026.json");
const T2027 = lerJson("mares/2027.json");
const ev = (doc, dia) => validateTides(doc).events.filter(e => e.instant.startsWith(dia))
  .map(e => `${e.instant.slice(11, 16)} ${e.type} ${e.heightM}`);

test("marés 2027: ficheiro válido, 365 dias, fonte, páginas, SHA-256 e licença", () => {
  const v = validateTides(T2027);
  assert.deepEqual(v.errors, []);
  assert.equal(v.events.length, 1411);
  assert.equal(T2027.year, 2027);
  assert.equal(new Set(v.events.map(e => e.instant.slice(0, 10))).size, 365);
  assert.ok(v.events.every(e => e.instant.startsWith("2027-")));
  assert.equal(T2027.sourceSha256, "18352857e829b19a234a9431fff3ecc35ee77b046c9b0f80ae0896ea7ab432c4");
  assert.equal(T2027.sourcePages, "2-121 a 2-124 (páginas 143 a 146 do PDF)");
  assert.match(T2027.source, /Tabela de Marés 2027, Vol\. I, Porto de Faro-Olhão/);
  assert.match(T2027.licence, /CC BY-NC-ND 4\.0/);
  assert.equal(T2027.timezone, "UTC");
  assert.match(T2027.heightDatum, /zero hidrográfico/);
});

test("marés 2027: dias conferidos à mão na imagem do PDF (pág. 2-121) e extremos do Capítulo 3", () => {
  assert.deepEqual(ev(T2027, "2027-01-01"), ["02:42 BM 1.3", "09:21 PM 2.7", "15:30 BM 1.3", "21:58 PM 2.6"]);
  assert.deepEqual(ev(T2027, "2027-01-03"), ["05:17 BM 1.3", "11:34 PM 2.6", "17:39 BM 1.2"]);
  assert.deepEqual(ev(T2027, "2027-01-20"), ["00:17 PM 3", "06:28 BM 0.8", "12:48 PM 3", "18:47 BM 0.8"]);
  // Níveis característicos de 2027 (Faro-Olhão): PMmáx. 3,76 m a 22/02 às 03:23; BMmín. 0,22 m a
  // 01/09 às 20:56. A tabela imprime à décima: 3,7 e 0,2.
  assert.ok(ev(T2027, "2027-02-22").includes("03:23 PM 3.7"));
  assert.ok(ev(T2027, "2027-09-01").includes("20:56 BM 0.2"));
  const alturas = T2027.events.map(e => e.heightM);
  assert.equal(Math.max(...alturas), 3.7);
  assert.equal(Math.min(...alturas), 0.2);
});

test("marés: 2026 e 2027 seguem-se sem falhas na passagem de ano", () => {
  const juntos = validateTides({ schemaVersion: 1, events: [...T2026.events, ...T2027.events] });
  assert.deepEqual(juntos.errors, []);
  const ultimo = T2026.events.at(-1), primeiro = T2027.events[0];
  assert.notEqual(ultimo.type, primeiro.type);
  assert.equal((Date.parse(primeiro.instant) - Date.parse(ultimo.instant)) / 60000, 349);
});

test("anosDaJanela: um ano, dois anos, janela inválida", () => {
  assert.deepEqual(anosDaJanela(Date.parse("2026-11-20T00:00Z"), Date.parse("2026-11-29T00:00Z")), [2026]);
  assert.deepEqual(anosDaJanela(Date.parse("2026-12-25T00:00Z"), Date.parse("2027-01-03T00:00Z")), [2026, 2027]);
  assert.deepEqual(anosDaJanela(NaN, NaN), []);
  assert.deepEqual(anosDaJanela(Date.parse("2027-01-02Z"), Date.parse("2026-12-30Z")), []);
});

// fetch simulado a partir dos ficheiros do repositório (os testes não usam a rede).
function fetchDe(ficheiros) {
  const pedidos = [];
  const f = async url => {
    pedidos.push(url);
    const doc = ficheiros[url];
    return doc ? { ok: true, status: 200, json: async () => structuredClone(doc) } : { ok: false, status: 404, json: async () => ({}) };
  };
  return { f, pedidos };
}
const urlFor = ano => `./mares/${ano}.json`;
const cfg = { minIntervalMinutes: 30, maxIntervalMinutes: 480 };

test("loadTidesForWindow: janela de Natal junta 2026 e 2027; 31/12 e 01/01 ficam com amplitude e repontos", async () => {
  const { f, pedidos } = fetchDe({ "./mares/2026.json": T2026, "./mares/2027.json": T2027 });
  const agora = new Date("2026-12-27T10:00:00Z");
  const r = await loadTidesForWindow({ inicio: agora.getTime() - 2 * 86400000, fim: agora.getTime() + 9 * 86400000,
    urlFor, fetchImpl: f, now: agora, ...cfg });
  assert.equal(r.ok, true);
  assert.equal(r.aviso, null);
  assert.deepEqual(pedidos, ["./mares/2026.json", "./mares/2027.json"]);
  assert.equal(r.data.length, 1411 * 2);
  assert.match(r.source, /tabela local \(2026, 2027\)/);
  for (const dia of ["2026-12-31", "2027-01-01"]) {
    const a = amplitudeDoDia(r.data, dia, config.mares);
    assert.ok(Number.isFinite(a.amplitude), `${dia}: ${a.motivo}`);
    assert.ok(Array.isArray(repontosDoDia(r.data, dia)), dia);
  }
  // Só com a tabela de 2026, o 31/12 fica «tabela incompleta»: era o que acontecia antes.
  const so2026 = validateTides(T2026).events;
  assert.match(amplitudeDoDia(so2026, "2026-12-31", config.mares).motivo, /tabela incompleta/);
});

test("loadTidesForWindow: ano em falta não apaga o outro (aviso); os dias dele ficam sem marés", async () => {
  const { f } = fetchDe({ "./mares/2027.json": T2027 });
  const agora = new Date("2027-12-28T10:00:00Z");
  const r = await loadTidesForWindow({ inicio: agora.getTime(), fim: agora.getTime() + 9 * 86400000, urlFor, fetchImpl: f, now: agora, ...cfg });
  assert.equal(r.ok, true);
  assert.match(r.aviso, /tabela de 2028 não obtida \(HTTP 404\)/);
  assert.match(amplitudeDoDia(r.data, "2027-12-31", config.mares).motivo, /tabela incompleta/);
  assert.equal(repontosDoDia(r.data, "2028-01-02"), null, "nunca «sem repontos»");
  // Nenhum ano obtido → erro.
  const nada = await loadTidesForWindow({ inicio: agora.getTime(), fim: agora.getTime(), urlFor, fetchImpl: fetchDe({}).f, now: agora, ...cfg });
  assert.equal(nada.ok, false);
});

test("loadTidesForWindow: passagem de ano inconsistente → erro, sem juntar às escondidas", async () => {
  const mau = structuredClone(T2027);
  // Sem a baixa-mar das 02:42 de 01/01: o ficheiro de 2027 continua válido sozinho (começa numa
  // preia-mar), mas a junção fica com duas preia-mares seguidas e 12 h de intervalo.
  mau.events.shift();
  assert.equal(validateTides(mau).ok, true);
  const { f } = fetchDe({ "./mares/2026.json": T2026, "./mares/2027.json": mau });
  const agora = new Date("2026-12-30T10:00:00Z");
  const r = await loadTidesForWindow({ inicio: agora.getTime(), fim: agora.getTime() + 5 * 86400000, urlFor, fetchImpl: f, now: agora, ...cfg });
  assert.equal(r.ok, false);
  assert.match(r.error, /passagem de ano inconsistente/);
});
