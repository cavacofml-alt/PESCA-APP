// Armazém em IndexedDB (plano de evolução, PR 3, 20/11/2026), com a mesma interface do armazém em
// memória (js/armazenamento/armazem-memoria.js). Só no aparelho: nada vai para servidores.
// Abrir a base aplica as migrações em falta (js/armazenamento/esquema.js). Uma falha (navegador sem
// IndexedDB, modo privado, base bloqueada por outro separador, erro de migração) nunca bloqueia a
// app: abrirArmazem devolve { ok: false, erro } e a app continua sem guardar.
import { ESQUEMA, MIGRACOES, NOME_BASE } from "./esquema.js";

const pedido = req => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error ?? new Error("pedido à base local falhou"));
});
// Só se dá por guardado quando a transacção termina (é aí que aparecem os erros de quota).
const fimTransacao = tx => new Promise((resolve, reject) => {
  tx.oncomplete = () => resolve();
  tx.onabort = () => reject(tx.error ?? new Error("transacção abortada"));
  tx.onerror = () => reject(tx.error ?? new Error("transacção falhou"));
});

function armazemIDB(db, esquema) {
  // Os erros que o IndexedDB lança de imediato (chave em falta, ligação fechada) também chegam como
  // promessa rejeitada, como no armazém em memória.
  const op = (loja, modo, f) => {
    try {
      const tx = db.transaction(loja, modo);
      return Promise.all([pedido(f(tx.objectStore(loja))), fimTransacao(tx)]).then(([v]) => v);
    } catch (e) {
      return Promise.reject(e);
    }
  };
  return {
    tipo: "IndexedDB",
    lojas: esquema.lojas.map(l => l.nome),
    guardar: (loja, valor) => op(loja, "readwrite", s => s.put(valor)),
    obter: (loja, chave) => op(loja, "readonly", s => s.get(chave)),
    apagar: (loja, chave) => op(loja, "readwrite", s => s.delete(chave)),
    chaves: loja => op(loja, "readonly", s => s.getAllKeys()),
    listar: loja => op(loja, "readonly", s => s.getAll()),
    limpar: loja => op(loja, "readwrite", s => s.clear()),
    // Várias lojas numa só transacção: um erro (chave em falta, quota) desfaz tudo.
    escrever({ guardar = {}, apagar = {} } = {}) {
      try {
        const nomes = [...new Set([...Object.keys(guardar), ...Object.keys(apagar)])];
        if (!nomes.length) return Promise.resolve();
        const tx = db.transaction(nomes, "readwrite");
        const fim = fimTransacao(tx);
        try {
          for (const [nome, chaves] of Object.entries(apagar)) for (const c of chaves) tx.objectStore(nome).delete(c);
          for (const [nome, valores] of Object.entries(guardar)) for (const v of valores) tx.objectStore(nome).put(v);
        } catch (e) {
          tx.abort();
          return fim.catch(() => {}).then(() => Promise.reject(e));
        }
        return fim;
      } catch (e) {
        return Promise.reject(e);
      }
    },
    fechar: async () => db.close()
  };
}

// migracoes e esquema só mudam nos testes (para experimentar uma migração futura).
export function abrirIndexedDB({ nome = NOME_BASE, migracoes = MIGRACOES, esquema = ESQUEMA, idb = globalThis.indexedDB, tempoLimiteMs = 4000 } = {}) {
  return new Promise((resolve, reject) => {
    if (!idb) { reject(new Error("este navegador não tem IndexedDB")); return; }
    let req;
    try { req = idb.open(nome, migracoes.length); } catch (e) { reject(e); return; }
    let acabou = false;
    const limite = setTimeout(() => {
      acabou = true;
      reject(new Error("a base local não respondeu (pode estar aberta noutro separador com outra versão)"));
    }, tempoLimiteMs);
    req.onupgradeneeded = ev => {
      for (let v = ev.oldVersion; v < migracoes.length; v++) migracoes[v](req.result, req.transaction);
    };
    req.onsuccess = () => {
      const db = req.result;
      if (acabou) { db.close(); return; }
      acabou = true;
      clearTimeout(limite);
      // Outro separador com uma versão nova da app quer migrar a base: fecha-se esta ligação.
      db.onversionchange = () => db.close();
      resolve(armazemIDB(db, esquema));
    };
    req.onerror = () => {
      if (acabou) return;
      acabou = true;
      clearTimeout(limite);
      reject(req.error ?? new Error("não foi possível abrir a base local"));
    };
  });
}

// Para a app: { ok: true, armazem } ou { ok: false, erro } — nunca lança.
export async function abrirArmazem(opcoes = {}) {
  try {
    return { ok: true, armazem: await abrirIndexedDB(opcoes) };
  } catch (e) {
    return { ok: false, erro: e?.message ?? String(e) };
  }
}
