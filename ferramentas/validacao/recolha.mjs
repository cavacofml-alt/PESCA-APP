// Recolha para a experiência de validação de previsões junto à boia de Faro (autorizada a 20/11/2026,
// com ensaio técnico antes dos 30 dias). Não faz parte da app: corre no GitHub Actions e os ficheiros
// ficam como artifacts. Não muda regras, limiares nem notas.
//
// Em cada recolha guarda, ANTES de os instantes chegarem:
// - Copernicus IBI WAV (VHM0, VTM02, VTM10) na célula da boia: hora a hora até +72 h e de 3 em 3 h até
//   ao fim da dimensão temporal (~+8 dias). Só horas certas (o serviço arredonda as outras sem aviso);
// - Open-Meteo Marine (wave_height, wave_period) no ponto da boia, 8 dias hora a hora;
// - as observações da boia das últimas 48 h, com o controlo de qualidade (QC) de cada valor.
//
// A antecedência é validAt − retrievedAt: um LIMITE INFERIOR da antecedência real, porque a corrida
// começou antes e nenhum dos serviços a identifica. O admp_updated_data das capacidades do WMTS é a
// actualização do conjunto de dados, nunca a hora da corrida.
//
// Uma recolha só é «completa» se TODOS os pedidos tiverem valor; senão fica «incompleta», com cada
// falha registada (erro de rede, HTTP, inválido, sem dados ou não pedido por falta de tempo).
//
// Uso: RECOLHA_ATE=2026-11-24T00:00:00Z node ferramentas/validacao/recolha.mjs --saida saida
import { createHash } from "node:crypto";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { lerCoberturaBoia } from "../../js/fontes/ih-boias.js";
import { WMTS_BASE, PRODUTO, VARIAVEIS, urlCapacidades, lerCapacidades, instantesPedidos, urlFeatureInfo, lerResposta } from "./wmts.mjs";
import { pedir, emParalelo } from "./rede.mjs";

export const ESQUEMA = 1;
export const BOIA = Object.freeze({ nome: "Boia de Faro (IH)", codigo: "CSA82/D", idEstacao: 20, lat: 36.9048, lon: -7.8984 });
export const URL_BOIA = "https://ogcapi.hidrografico.pt/collections/buoys_datawell/locations/";
export const URL_MARINE = "https://marine-api.open-meteo.com/v1/marine";
const HORA = 3600000;
const VARS = Object.keys(VARIAVEIS);

const iso = ms => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
const horas = ms => Math.round(ms / HORA * 100) / 100;
const sha256 = obj => createHash("sha256").update(JSON.stringify(obj)).digest("hex");
const arred6 = v => Math.round(v * 1e6) / 1e6;

export async function recolher({
  agora = new Date(), fetchImpl = fetch, dormir, concorrencia = 3, prazoMs = 20 * 60000,
  relogio = () => Date.now(), env = process.env
} = {}) {
  const t0 = relogio();
  const op = { fetchImpl, ...(dormir ? { dormir } : {}) };
  const falhas = [];
  const doc = {
    esquema: ESQUEMA,
    experiencia: "Validação de previsões junto à boia de Faro (IBI WAV e Open-Meteo contra a boia)",
    retrievedAt: iso(agora.getTime()),
    notas: [
      "Previsões guardadas antes dos instantes válidos. antecedenciaH = validAt − retrievedAt: limite inferior da antecedência real (a corrida não é identificada).",
      "ibi.actualizacaoConjunto = admp_updated_data das capacidades do WMTS: actualização do conjunto de dados, NÃO a hora da corrida.",
      "Open-Meteo best_match: modelo interno não identificado pela API.",
      "Dados experimentais: não entram nas notas da app nem são publicados no site."
    ],
    boiaReferencia: BOIA,
    ibi: null, openMeteo: null, boia: null, falhas, recolha: null
  };
  const dentroDoPrazo = () => relogio() - t0 <= prazoMs;
  doc.ibi = await recolherIbi({ agora, op, concorrencia, dentroDoPrazo, falhas });
  doc.openMeteo = await recolherOpenMeteo({ agora, op, falhas });
  doc.boia = await recolherBoia({ agora, op, falhas });
  const completa = doc.ibi.estado === "completa" && doc.openMeteo.estado === "obtido" && doc.boia.estado === "obtido";
  doc.recolha = {
    inicio: iso(t0), fim: iso(relogio()), duracaoS: Math.round((relogio() - t0) / 1000),
    completa, partes: { ibi: doc.ibi.estado, openMeteo: doc.openMeteo.estado, boia: doc.boia.estado },
    github: { runId: env.GITHUB_RUN_ID ?? null, tentativa: env.GITHUB_RUN_ATTEMPT ?? null }
  };
  return doc;
}

async function recolherIbi({ agora, op, concorrencia, dentroDoPrazo, falhas }) {
  const ibi = { fonte: "Copernicus Marine IBI WAV (WMTS GetFeatureInfo)", produto: PRODUTO, servico: WMTS_BASE, estado: "erro", unidades: Object.fromEntries(VARS.map(v => [v, VARIAVEIS[v].unidade])) };
  const cap = await pedir(urlCapacidades(), { ...op, formato: "xml" });
  if (!cap.ok) {
    falhas.push({ fonte: "ibi", pedido: "capacidades", estado: "erro", erro: cap.erro, status: cap.status, tentativas: cap.tentativas });
    return { ...ibi, motivo: `capacidades não obtidas: ${cap.erro}` };
  }
  let c;
  try { c = lerCapacidades(cap.corpo); } catch (e) {
    falhas.push({ fonte: "ibi", pedido: "capacidades", estado: "inválido", erro: e.message });
    return { ...ibi, motivo: e.message };
  }
  ibi.dataset = c.dataset;
  ibi.outrasVersoes = c.outrasVersoes;
  ibi.actualizacaoConjunto = Object.fromEntries(VARS.map(v => [v, c.camadas[v].admpUpdatedData]));
  ibi.dimensaoTempo = Object.fromEntries(VARS.map(v => [v, c.camadas[v].tempo]));
  const fim = Math.min(...VARS.map(v => Date.parse(c.camadas[v].tempo.fim)));
  const instantes = instantesPedidos({ agora, fim: new Date(fim) });
  const pedidos = instantes.flatMap(t => VARS.map(v => ({ t, v, chave: `${t}|${v}` })));
  const res = new Map();
  const fazer = async ({ t, v, chave }) => {
    if (!dentroDoPrazo()) { res.set(chave, { estado: "não pedido", erro: "prazo da recolha esgotado" }); return; }
    const url = urlFeatureInfo({ dataset: c.dataset, variavel: v, estilo: c.camadas[v].estilo, lat: BOIA.lat, lon: BOIA.lon, instante: t });
    const r = await pedir(url, op);
    res.set(chave, r.ok ? { ...lerResposta(r.corpo, { dataset: c.dataset, variavel: v }), tentativas: r.tentativas }
      : { estado: "erro", erro: r.erro, status: r.status, tentativas: r.tentativas });
  };
  await emParalelo(pedidos, concorrencia, fazer);
  // Segunda passagem, um pedido de cada vez: só os que falharam por erro (rede, 429, 5xx).
  const repetir = pedidos.filter(p => res.get(p.chave).estado === "erro");
  for (const p of repetir) {
    const antes = res.get(p.chave).tentativas ?? 0;
    await fazer(p);
    const r = res.get(p.chave);
    r.tentativas = antes + (r.tentativas ?? 0);
    r.segundaPassagem = true;
  }
  const celulas = new Set();
  const conta = { total: pedidos.length, obtidos: 0, semDados: 0, invalidos: 0, erros: 0, naoPedidos: 0, comRepeticao: 0, segundaPassagem: repetir.length };
  for (const p of pedidos) {
    const r = res.get(p.chave);
    if (r.lat !== null && r.lat !== undefined) celulas.add(`${arred6(r.lat)},${arred6(r.lon)}`);
    if ((r.tentativas ?? 1) > 1) conta.comRepeticao++;
    if (r.estado === "obtido") { conta.obtidos++; continue; }
    conta[{ "sem dados": "semDados", "inválido": "invalidos", "erro": "erros", "não pedido": "naoPedidos" }[r.estado]]++;
    falhas.push({ fonte: "ibi", validAt: iso(p.t), variavel: p.v, estado: r.estado, erro: r.erro ?? r.motivo ?? null, status: r.status ?? null, tentativas: r.tentativas ?? 0 });
  }
  ibi.celulas = [...celulas].map(s => { const [lat, lon] = s.split(",").map(Number); return { lat, lon }; });
  ibi.valores = instantes.map(t => {
    const linha = { validAt: iso(t), antecedenciaH: horas(t - agora.getTime()) };
    for (const v of VARS) { const r = res.get(`${t}|${v}`); linha[v] = r.estado === "obtido" ? r.valor : null; }
    return linha;
  });
  ibi.pedidos = conta;
  ibi.estado = conta.obtidos === conta.total && conta.total > 0 && ibi.celulas.length === 1 ? "completa" : "incompleta";
  if (ibi.celulas.length > 1) falhas.push({ fonte: "ibi", estado: "inválido", erro: `respostas de ${ibi.celulas.length} células diferentes` });
  ibi.hashConteudo = sha256(ibi.valores.map(({ validAt, VHM0, VTM02, VTM10 }) => [validAt, VHM0, VTM02, VTM10]));
  return ibi;
}

async function recolherOpenMeteo({ agora, op, falhas }) {
  const om = { fonte: "Open-Meteo Marine", modelo: "best_match (modelo interno não identificado pela API)", estado: "erro" };
  om.pedido = `${URL_MARINE}?latitude=${BOIA.lat}&longitude=${BOIA.lon}&hourly=wave_height,wave_period&forecast_days=8&timeformat=unixtime`;
  const r = await pedir(om.pedido, op);
  if (!r.ok) {
    falhas.push({ fonte: "openMeteo", estado: "erro", erro: r.erro, status: r.status, tentativas: r.tentativas });
    return { ...om, motivo: r.erro };
  }
  const j = r.corpo;
  const h = j?.hourly;
  const u = j?.hourly_units ?? {};
  const motivo = !Array.isArray(h?.time) ? "resposta sem horas"
    : u.time !== "unixtime" ? `tempo em «${u.time}»`
    : u.wave_height !== "m" || u.wave_period !== "s" ? `unidades inesperadas (${u.wave_height}, ${u.wave_period})`
    : !Number.isFinite(j.latitude) || !Number.isFinite(j.longitude) ? "resposta sem célula" : null;
  if (motivo) {
    falhas.push({ fonte: "openMeteo", estado: "inválido", erro: motivo });
    return { ...om, estado: "inválido", motivo };
  }
  const num = v => (typeof v === "number" && Number.isFinite(v) ? v : null);
  om.celula = { lat: j.latitude, lon: j.longitude };
  om.unidades = { wave_height: "m", wave_period: "s" };
  om.valores = h.time.map((t, k) => ({ t: t * 1000, k }))
    .filter(({ t }) => t > agora.getTime() && t % HORA === 0)
    .map(({ t, k }) => ({ validAt: iso(t), antecedenciaH: horas(t - agora.getTime()), wave_height: num(h.wave_height?.[k]), wave_period: num(h.wave_period?.[k]) }));
  om.horasSemValor = om.valores.filter(x => x.wave_height === null || x.wave_period === null).length;
  om.estado = om.valores.length ? "obtido" : "inválido";
  om.hashConteudo = sha256(om.valores.map(({ validAt, wave_height, wave_period }) => [validAt, wave_height, wave_period]));
  return om;
}

async function recolherBoia({ agora, op, falhas }) {
  const b = { fonte: "Instituto Hidrográfico, OGC API EDR buoys_datawell", estado: "erro", licenca: "CC BY-NC 4.0" };
  const inicio = iso(Math.floor((agora.getTime() - 48 * HORA) / 1000) * 1000);
  b.janela = { inicio, fim: iso(Math.floor(agora.getTime() / 1000) * 1000) };
  const r = await pedir(`${URL_BOIA}${BOIA.idEstacao}?datetime=${b.janela.inicio}/${b.janela.fim}&f=json`, op);
  if (!r.ok) {
    falhas.push({ fonte: "boia", estado: "erro", erro: r.erro, status: r.status, tentativas: r.tentativas });
    return { ...b, motivo: r.erro };
  }
  let dados;
  try { dados = lerCoberturaBoia(r.corpo); } catch (e) {
    falhas.push({ fonte: "boia", estado: "inválido", erro: e.message });
    return { ...b, estado: "inválido", motivo: e.message };
  }
  b.celula = { lat: dados.latitude, lon: dados.longitude };
  // Valor null quando o QC não é 1 ou 2, ou fora dos limites físicos; o QC fica sempre guardado.
  b.observacoes = dados.observacoes.map(o => ({
    instante: iso(o.instante),
    hm0: o.hm0.valor, hm0_qc: o.hm0.qc, tm02: o.tm02.valor, tm02_qc: o.tm02.qc,
    tp: o.tp.valor, tp_qc: o.tp.qc, hmax: o.hmax.valor, hmax_qc: o.hmax.qc
  }));
  b.estado = "obtido";
  return b;
}

export function resumoTexto(doc) {
  const i = doc.ibi, o = doc.openMeteo, b = doc.boia, p = i.pedidos;
  return [
    `Recolha ${doc.retrievedAt}: ${doc.recolha.completa ? "COMPLETA" : "INCOMPLETA"} em ${doc.recolha.duracaoS} s`,
    `IBI: ${i.estado}${i.dataset ? ` (${i.dataset}, actualização do conjunto ${i.actualizacaoConjunto?.VTM02})` : ""}` +
      (p ? ` · ${p.obtidos}/${p.total} valores · ${p.erros} erros · ${p.invalidos} inválidos · ${p.semDados} sem dados · ${p.naoPedidos} não pedidos · ${p.comRepeticao} com repetição` : "") +
      (i.celulas ? ` · célula ${i.celulas.map(c => `${c.lat}, ${c.lon}`).join(" | ")}` : ""),
    `Open-Meteo: ${o.estado}${o.valores ? ` · ${o.valores.length} h (${o.horasSemValor} sem valor) · célula ${o.celula.lat}, ${o.celula.lon}` : ` · ${o.motivo ?? ""}`}`,
    `Boia: ${b.estado}${b.observacoes ? ` · ${b.observacoes.length} medições (${b.janela.inicio} a ${b.janela.fim})` : ` · ${b.motivo ?? ""}`}`,
    `Falhas registadas: ${doc.falhas.length}`
  ].join("\n");
}

async function main() {
  const args = process.argv.slice(2);
  const k = args.indexOf("--saida");
  const saida = k >= 0 && args[k + 1] ? args[k + 1] : "saida";
  const ate = process.env.RECOLHA_ATE;
  if (!ate || !Number.isFinite(Date.parse(ate))) {
    console.error("RECOLHA_ATE em falta ou inválida: sem data de fim autorizada, não se recolhe nada.");
    process.exit(1);
  }
  if (Date.now() >= Date.parse(ate)) {
    console.log(`Recolha terminada: a data de fim autorizada (${ate}) já passou. Nada a fazer.`);
    return;
  }
  const doc = await recolher();
  doc.recolha.fimAutorizado = ate;
  await mkdir(saida, { recursive: true });
  const nome = `recolha-${doc.retrievedAt.replace(/[-:]/g, "")}.json`;
  await writeFile(join(saida, nome), JSON.stringify(doc));
  const texto = resumoTexto(doc);
  console.log(texto);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, "```\n" + texto + "\n```\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(e => { console.error(e); process.exit(1); });
}
