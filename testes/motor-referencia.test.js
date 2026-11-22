// O motor de notas não muda sem aprovação do utilizador (plano de evolução, 20/11/2026): com os dados
// reais de 14/10/2026, as notas por dia, pesqueiro, período e espécie têm de ser exactamente as da
// referência guardada. Se este teste falhar, ou o PR mudou as regras (não autorizado), ou a mudança
// foi aprovada e a referência regenera-se com «node ferramentas/referencia-motor.mjs».
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { projecaoMotor, FICHEIRO } from "../ferramentas/referencia-motor.mjs";

const referencia = JSON.parse(readFileSync(new URL(`../${FICHEIRO}`, import.meta.url), "utf8"));

test("motor: as notas com os dados reais de 14/10 são exactamente as da referência", () => {
  const actual = projecaoMotor();
  assert.equal(actual.dias.length, 7);
  for (const d of actual.dias) assert.equal(Object.keys(d.pesqueiros).length, 8, d.dia);
  assert.deepEqual(actual, referencia);
});

test("motor: a referência cobre os oito pesqueiros, as duas espécies e os quatro períodos", () => {
  const d0 = referencia.dias[0];
  assert.deepEqual(Object.keys(d0.pesqueiros).sort(),
    ["almargem", "ancao", "falesia", "molhe_quarteira", "molhe_vilamoura", "praia_faro", "ria", "vilamoura"]);
  let total = 0;
  const valores = new Set();
  for (const d of referencia.dias) for (const p of Object.values(d.pesqueiros)) for (const per of p.periodos) {
    assert.deepEqual(per.nome, ["madrugada", "manhã", "tarde", "noite"][p.periodos.indexOf(per)]);
    for (const n of Object.values(per.notas)) { total++; valores.add(n.nota); }
  }
  // 7 dias × (7 pesqueiros com 2 espécies + a Ria com 1) × 4 períodos = 420 notas por período.
  assert.equal(total, 420);
  // Com estes dados há notas de 1 a 5 (os estados n.d. e «por confirmar» são testados noutros ficheiros).
  assert.ok(valores.size >= 4, `a referência apanha várias notas (${[...valores].sort()})`);
});
