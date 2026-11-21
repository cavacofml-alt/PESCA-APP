// Armazém em memória com a mesma interface do de IndexedDB (js/armazenamento/indexeddb.js). Serve
// para os testes em Node (sem IndexedDB); a app usa sempre o de IndexedDB e, se o aparelho não deixar
// guardar, continua sem guardar.
//
// Interface comum (todas as operações são assíncronas):
//   guardar(loja, valor) · obter(loja, chave) · apagar(loja, chave) · chaves(loja) · listar(loja)
//   limpar(loja) · fechar()      — e as propriedades tipo ("memória" | "IndexedDB") e lojas.
// Cada loja tem uma chave (keyPath) definida no esquema (js/armazenamento/esquema.js).
import { ESQUEMA } from "./esquema.js";

const copia = v => (v === undefined ? undefined : structuredClone(v));

// limiteBytes: simula a quota do aparelho (testes): acima dele, guardar falha com QuotaExceededError.
export function armazemMemoria({ esquema = ESQUEMA, limiteBytes = Infinity } = {}) {
  const lojas = new Map(esquema.lojas.map(l => [l.nome, new Map()]));
  const loja = nome => {
    const l = lojas.get(nome);
    if (!l) throw new Error(`loja inexistente: ${nome}`);
    return l;
  };
  const chaveDe = nome => esquema.lojas.find(l => l.nome === nome).chave;
  const ocupado = () => [...lojas.values()].reduce((s, l) => s + [...l.values()].reduce((a, v) => a + JSON.stringify(v).length, 0), 0);
  return {
    tipo: "memória",
    lojas: esquema.lojas.map(l => l.nome),
    async guardar(nome, valor) {
      const l = loja(nome);
      const chave = valor?.[chaveDe(nome)];
      if (chave === undefined || chave === null) throw new Error(`${nome}: falta a chave «${chaveDe(nome)}»`);
      const antes = l.get(chave);
      l.set(chave, copia(valor));
      if (ocupado() > limiteBytes) {
        if (antes === undefined) l.delete(chave); else l.set(chave, antes);
        const e = new Error("sem espaço"); e.name = "QuotaExceededError"; throw e;
      }
      return chave;
    },
    async obter(nome, chave) { return copia(loja(nome).get(chave)); },
    async apagar(nome, chave) { loja(nome).delete(chave); },
    async chaves(nome) { return [...loja(nome).keys()].sort(); },
    async listar(nome) { return [...loja(nome).entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([, v]) => copia(v)); },
    async limpar(nome) { loja(nome).clear(); },
    async fechar() {}
  };
}
