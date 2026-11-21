// Ecrã «Histórico de previsões» (plano de evolução, PR 7): lê as leituras e o diário guardados neste
// aparelho e mostra a previsão ao lado da medição da boia. Funciona sem rede.
import { abrirArmazem } from "./armazenamento/indexeddb.js";
import { listarSaidas } from "./diario/saidas.js";
import { paresPrevisaoObservacao, resumoValidacao, serieDoPonto, distanciaKm, saidasComPrevisao } from "./historico/validacao.js";
import { renderHistorico } from "./ui/historico.js";
import { esc } from "./ui/formato.js";
import { registarServiceWorker } from "./registo-sw.js";

const raiz = document.querySelector("#app");

// Só o que este ecrã usa de cada leitura (o ponto da boia e a boia): poupa memória no telemóvel.
async function lerLeituras(armazem, ponto) {
  const chaves = (await armazem.chaves("leituras")).filter(id => Number.isFinite(Date.parse(id))).sort((a, b) => Date.parse(b) - Date.parse(a));
  const leituras = [];
  for (const id of chaves) {
    const l = await armazem.obter("leituras", id);
    if (!l?.fontes) continue;
    leituras.push({ id: l.id, esquema: l.esquema, lidoEm: l.lidoEm, resumo: l.resumo ?? null,
      fontes: { mar: { [ponto]: l.fontes.mar?.[ponto] ?? null }, terra: {}, boiaFaro: l.fontes.boiaFaro ?? null } });
  }
  return leituras;
}

async function iniciar() {
  try {
    const r = await fetch("./config.json");
    if (!r.ok) throw new Error(`config.json não obtido (HTTP ${r.status})`);
    const config = await r.json();
    const base = await abrirArmazem();
    const agora = new Date().toISOString();
    if (!base.ok) { raiz.innerHTML = renderHistorico({ config, armazem: base, agora }); return; }
    const b = config.boias.faro;
    const leituras = await lerLeituras(base.armazem, b.previsaoPonto);
    const { saidas } = await listarSaidas(base.armazem);
    const condicoes = new Map((await base.armazem.listar("condicoes")).map(c => [c.saidaId, c]));
    await base.armazem.fechar();
    const pares = paresPrevisaoObservacao(leituras, b.previsaoPonto, { agora: Date.parse(agora) });
    const celula = leituras.map(l => serieDoPonto(l, b.previsaoPonto).celula).find(Boolean) ?? null;
    raiz.innerHTML = renderHistorico({ config, armazem: base, agora, leituras, pares, resumo: resumoValidacao(pares), celula,
      distanciaKm: distanciaKm(celula, { lat: Number(b.latitude), lon: Number(b.longitude) }), saidas: saidasComPrevisao(saidas, condicoes) });
  } catch (erro) {
    raiz.innerHTML = `<header class="topo"><div><h1>Histórico de previsões</h1><p class="lido">Erro: ${esc(erro.message ?? erro)}</p></div></header>`;
  }
}

registarServiceWorker();
iniciar();
