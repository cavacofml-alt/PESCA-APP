// Referência do motor de notas (plano de evolução, PR 1, 20/11/2026): com as respostas reais de 14/10/2026
// guardadas em testes/reais/ e a tabela oficial de marés, calcula a projecção das notas de 7 dias × 8
// pesqueiros × 4 períodos × 2 espécies (estado, nota, completa, intervalo, limite) e os valores que as
// sustentam (potência máxima, limo, amplitude, alinhamento). O teste testes/motor-referencia.test.js
// compara o motor com testes/referencia/motor-20261014.json: garante que nenhum PR de interface,
// armazenamento ou diário muda as notas.
//
// Só se regenera quando o utilizador aprovar uma mudança de regras ou limiares:
//   node ferramentas/referencia-motor.mjs
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { analisarDias } from "../js/regras/analise.js";
import { validateTides } from "../js/fontes/mares-locais.js";
import { pontosNecessarios } from "../js/pontos.js";
import { limitesDiaLisboa, lisbonDate } from "../js/normalizacao.js";

const raiz = new URL("../", import.meta.url);
const ler = rel => JSON.parse(readFileSync(new URL(rel, raiz), "utf8"));
export const FICHEIRO = "testes/referencia/motor-20261014.json";

// Os mesmos dados do teste «motor completo com dados reais de 14/10» (testes/reais.test.js).
export function analiseDeReferencia(config = ler("config.json")) {
  const SunCalc = createRequire(import.meta.url)("../vendor/suncalc.js");
  const ponto = (tipo, f) => ({ ok: true, data: ler(`testes/reais/openmeteo_${tipo}_${f}_20261014_0946.json`), source: "teste", readAt: "2026-10-14T08:46:00Z" });
  const ladoDe = k => (/Quarteira|ForteNovo/i.test(k) ? "quarteira" : "faro");
  const pts = pontosNecessarios(config);
  const pontos = {
    mar: Object.fromEntries(pts.mar.map(k => [k, ponto("marine", ladoDe(k))])),
    terra: Object.fromEntries(pts.terra.map(k => [k, ponto("forecast", ladoDe(k))]))
  };
  const dias = Array.from({ length: 7 }, (_, i) => lisbonDate(new Date("2026-10-14T12:00:00Z"), i));
  const sol = (dia, p) => {
    const t = SunCalc.getTimes(new Date(limitesDiaLisboa(dia).inicio + 12 * 3600000), config.locais[p].latitude, config.locais[p].longitude);
    return { nascer: t.sunrise.getTime(), por: t.sunset.getTime() };
  };
  return analisarDias({ dias, mares: validateTides(ler("mares/2026.json")).events, sol, config, pontos });
}

const nota = n => n && {
  estado: n.estado, nota: n.nota ?? null, completa: n.completa ?? null,
  intervalo: n.intervalo ? [n.intervalo.min, n.intervalo.max] : null,
  limite: n.limite ? n.limite.valor : null, periodo: n.periodo ?? null
};

// Projecção estável (só os campos que definem as notas e o que as sustenta).
export function projecaoMotor(analise = analiseDeReferencia()) {
  return {
    descricao: "Referência do motor com as respostas reais de 14/10/2026 (testes/reais) e a tabela do IH de 2026. Regenerar só com aprovação do utilizador.",
    melhoresDias: analise.melhoresDias.map(d => d.dia ?? d),
    dias: analise.dias.map(d => ({
      dia: d.dia, amplitude: d.amplitude.amplitude, classe: d.amplitude.classe ?? null, alinhado: d.alinhado ?? null,
      pesqueiros: Object.fromEntries(Object.entries(d.pesqueiros).map(([id, p]) => [id, {
        notas: Object.fromEntries(Object.entries(p.notas).map(([e, n]) => [e, nota(n)])),
        periodos: p.periodos.map(per => ({ nome: per.nome,
          notas: Object.fromEntries(Object.entries(per.notas).map(([e, n]) => [e, nota(n)])),
          alinhado: per.alinhamento?.alinhado ?? null })),
        potencia: p.potencia ? { valor: p.potencia.valor, instante: p.potencia.instante ?? null } : null,
        limo: p.limo ? p.limo.limo : null
      }]))
    }))
  };
}

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  mkdirSync(new URL("testes/referencia/", raiz), { recursive: true });
  writeFileSync(new URL(FICHEIRO, raiz), JSON.stringify(projecaoMotor(), null, 1) + "\n");
  console.log(`Escrito ${FICHEIRO}`);
}
