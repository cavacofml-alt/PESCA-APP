// Relatório do ensaio técnico da recolha de validação (antes dos 30 dias): estabilidade, tempos,
// falhas, tamanho, e se o admp_updated_data do WMTS acompanha as mudanças reais dos valores.
// Lê todos os recolha-*.json de uma pasta (com subpastas: uma por artifact) e escreve Markdown.
// Uso: node ferramentas/validacao/ensaio.mjs <pasta>
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export async function lerRecolhas(pasta) {
  const docs = [];
  for (const e of await readdir(pasta, { withFileTypes: true, recursive: true })) {
    if (!e.isFile() || !/^recolha-.*\.json$/.test(e.name)) continue;
    const caminho = join(e.parentPath ?? e.path, e.name);
    try {
      const doc = JSON.parse(await readFile(caminho, "utf8"));
      docs.push({ ...doc, _bytes: (await stat(caminho)).size, _ficheiro: e.name });
    } catch (err) {
      docs.push({ _ficheiro: e.name, _erro: `não foi possível ler: ${err.message}` });
    }
  }
  return docs.sort((a, b) => String(a.retrievedAt).localeCompare(String(b.retrievedAt)));
}

// Valores de duas recolhas para os mesmos instantes: quantos são comuns e quantos mudaram.
export function compararValores(antes, depois, campos) {
  const mapa = new Map((antes ?? []).map(l => [l.validAt, l]));
  let comuns = 0, mudaram = 0, maxDif = 0;
  for (const l of depois ?? []) {
    const a = mapa.get(l.validAt);
    if (!a) continue;
    for (const c of campos) {
      if (a[c] === null || l[c] === null || a[c] === undefined || l[c] === undefined) continue;
      comuns++;
      const d = Math.abs(a[c] - l[c]);
      if (d > 0) { mudaram++; maxDif = Math.max(maxDif, d); }
    }
  }
  return { comuns, mudaram, maxDif };
}

const mediana = v => { const s = [...v].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };
const n2 = v => (v === null || v === undefined ? "—" : Number(v).toFixed(2).replace(".", ","));

export function relatorio(docs) {
  const validos = docs.filter(d => !d._erro);
  const linhas = [`# Ensaio da recolha de validação`, ``,
    `Recolhas lidas: ${docs.length} (${docs.length - validos.length} ilegíveis). Completas: ${validos.filter(d => d.recolha?.completa).length}.`];
  if (!validos.length) return linhas.join("\n");
  const dur = validos.map(d => d.recolha?.duracaoS).filter(Number.isFinite);
  const kb = validos.map(d => d._bytes / 1024);
  linhas.push(`Duração: mín. ${Math.min(...dur)} s, mediana ${String(mediana(dur)).replace(".", ",")} s, máx. ${Math.max(...dur)} s. Tamanho: mediana ${n2(mediana(kb))} KB, total ${n2(kb.reduce((a, b) => a + b, 0) / 1024)} MB.`);
  const celIbi = new Set(validos.flatMap(d => (d.ibi?.celulas ?? []).map(c => `${c.lat}, ${c.lon}`)));
  const celOm = new Set(validos.map(d => d.openMeteo?.celula).filter(Boolean).map(c => `${c.lat}, ${c.lon}`));
  const datasets = new Set(validos.map(d => d.ibi?.dataset).filter(Boolean));
  linhas.push(`Células: IBI ${[...celIbi].join(" | ") || "—"}; Open-Meteo ${[...celOm].join(" | ") || "—"}. Conjuntos IBI: ${[...datasets].join(", ") || "—"}.`, ``);

  linhas.push(`## Recolhas`, ``, `| retrievedAt | Completa | Duração | IBI obtidos | Repetições | Falhas | Actualização do conjunto (VTM02) | IBI mudou | OM mudou |`, `|---|---|---|---|---|---|---|---|---|`);
  const coerencia = { actualizouEMudou: 0, actualizouSemMudar: 0, mudouSemActualizar: 0, nemUmNemOutro: 0 };
  validos.forEach((d, k) => {
    const ant = k > 0 ? validos[k - 1] : null;
    const ci = ant ? compararValores(ant.ibi?.valores, d.ibi?.valores, ["VHM0", "VTM02", "VTM10"]) : null;
    const co = ant ? compararValores(ant.openMeteo?.valores, d.openMeteo?.valores, ["wave_height", "wave_period"]) : null;
    const actAnt = ant?.ibi?.actualizacaoConjunto?.VTM02, act = d.ibi?.actualizacaoConjunto?.VTM02;
    if (ant && ci.comuns) {
      const actualizou = Boolean(actAnt && act && actAnt !== act), mudou = ci.mudaram > 0;
      coerencia[actualizou ? (mudou ? "actualizouEMudou" : "actualizouSemMudar") : (mudou ? "mudouSemActualizar" : "nemUmNemOutro")]++;
    }
    const p = d.ibi?.pedidos;
    linhas.push(`| ${d.retrievedAt} | ${d.recolha?.completa ? "sim" : "**não**"} | ${d.recolha?.duracaoS ?? "—"} s | ${p ? `${p.obtidos}/${p.total}` : "—"} | ${p?.comRepeticao ?? "—"} | ${d.falhas?.length ?? "—"} | ${act ?? "—"}${ant && act !== actAnt ? " (nova)" : ""} | ${ci ? `${ci.mudaram}/${ci.comuns} (máx. ${n2(ci.maxDif)})` : "—"} | ${co ? `${co.mudaram}/${co.comuns}` : "—"} |`);
  });
  linhas.push(``, `## O admp_updated_data acompanha as mudanças dos valores do IBI?`, ``,
    `Pares de recolhas seguidas: actualizou e os valores mudaram ${coerencia.actualizouEMudou}; actualizou sem mudarem ${coerencia.actualizouSemMudar}; **mudaram sem actualizar ${coerencia.mudouSemActualizar}**; nem um nem outro ${coerencia.nemUmNemOutro}.`,
    `Só se pode usar como detector se as duas casas do meio ficarem a zero. Até lá, cada recolha pede tudo.`, ``);

  const falhas = validos.flatMap(d => (d.falhas ?? []).map(f => ({ ...f, recolha: d.retrievedAt })));
  const porTipo = {};
  for (const f of falhas) { const c = `${f.fonte} · ${f.estado} · ${f.erro ?? ""}`; porTipo[c] = (porTipo[c] ?? 0) + 1; }
  linhas.push(`## Falhas`, ``, falhas.length ? Object.entries(porTipo).map(([c, n]) => `- ${n} × ${c}`).join("\n") : "Nenhuma.", ``);

  const obs = new Map();
  for (const d of validos) for (const o of d.boia?.observacoes ?? []) obs.set(o.instante, o);
  const qc = {};
  for (const o of obs.values()) { const c = `${o.hm0_qc}/${o.tm02_qc}`; qc[c] = (qc[c] ?? 0) + 1; }
  linhas.push(`## Boia`, ``, `Medições distintas acumuladas: ${obs.size}. QC Hm0/Tm02: ${Object.entries(qc).map(([c, n]) => `${c}: ${n}`).join(", ") || "—"}.`);
  return linhas.join("\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const pasta = process.argv[2] ?? "dados";
  lerRecolhas(pasta).then(docs => console.log(relatorio(docs))).catch(e => { console.error(e); process.exit(1); });
}
