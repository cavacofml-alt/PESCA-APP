// Esquema da base local (IndexedDB) e as suas migrações (plano de evolução, PR 3, 20/11/2026).
// A versão da base é o número de migrações: para mudar o esquema acrescenta-se uma migração no fim
// (nunca se altera uma que já foi publicada). Cada migração recebe a base e a transacção de
// actualização e só pode criar ou alterar lojas e índices, ou transformar registos dessa transacção.
//
// Lojas:
//   leituras  — cada leitura das fontes (previsões do Open-Meteo e boia), para usar sem rede e para o
//               histórico de previsões. Chave: id = instante da leitura (ISO, UTC).
//   diario    — saídas de pesca (PR 5). Chave: id.
//   condicoes — condições guardadas com cada saída (PR 5). Chave: id; índice por saída.
//   meta      — valores de controlo (última limpeza, última cópia de segurança). Chave: chave.
export const NOME_BASE = "surfcasting-algarve";

export const MIGRACOES = [
  // 1 (20/11/2026): esquema inicial.
  db => {
    db.createObjectStore("leituras", { keyPath: "id" });
    const diario = db.createObjectStore("diario", { keyPath: "id" });
    diario.createIndex("porInicio", "inicio");
    diario.createIndex("porPesqueiro", "pesqueiro");
    const condicoes = db.createObjectStore("condicoes", { keyPath: "id" });
    condicoes.createIndex("porSaida", "saidaId");
    db.createObjectStore("meta", { keyPath: "chave" });
  }
];

export const ESQUEMA = {
  versao: MIGRACOES.length,
  lojas: [
    { nome: "leituras", chave: "id" },
    { nome: "diario", chave: "id" },
    { nome: "condicoes", chave: "id" },
    { nome: "meta", chave: "chave" }
  ]
};
