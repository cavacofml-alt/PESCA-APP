# Verificação final dos PR #25–#32 (21–22/11/2026)

Material de trabalho para revisão (a pasta `recolha/` nunca é publicada no site). Verificação **só de leitura**: sem merge, commits, pushes nem alterações aos PR #25–#32.

## Ficheiros

| Ficheiro | O que é |
|---|---|
| `registos-verificacao-25-32.txt` | Registos completos: SHA dos heads, números das execuções da CI do GitHub, testes locais por SHA (Node em UTC e Europe/Lisbon; no #32 também America/New_York, Asia/Tokyo e Node 20; browser), diffs por PR, comparação do `config.json` por chave, árvores de `js/regras`, `mares` e `fundos`, simulação do empilhamento (`git merge-tree`), arranque sem rede com o service worker activo, largura real dos ecrãs e tentativa de quota real do IndexedDB. |
| `offline2.mjs` | Arranque sem rede com o service worker **activo**, em dois cenários: (A) uma só visita com rede; (B) duas visitas e algumas páginas abertas. Sem rede = APIs recusadas **e** servidor da app desligado. Cada página abre num separador novo. |
| `largura-real.mjs` | Largura do conteúdo contra a largura real do ecrã emulado (Pixel 7 e 360 px) em todos os ecrãs, incluindo o diário com uma saída aberta. |
| `quota2.mjs` | Tenta limitar a quota do IndexedDB no Chromium (`Storage.overrideQuotaForOrigin`) e mostra se o limite é aplicado. |

Os resultados são do ambiente do Claude Code (contentor com Node 22.23.4 e o Chromium do Playwright 1.63.0). A CI do GitHub é uma fonte independente: os números das execuções estão nos registos.

## Como reproduzir

```
git worktree add --detach /tmp/pr32 b0794027744623c623cdf7c29b8f41a94e4edf93   # ou outro SHA
ln -s "$PWD/node_modules" /tmp/pr32/node_modules                                # depois de npm ci no repositório
node recolha/verificacao-25-32/offline2.mjs /tmp/pr32
node recolha/verificacao-25-32/largura-real.mjs /tmp/pr32
node recolha/verificacao-25-32/quota2.mjs /tmp/pr32
```

Se o Chromium não estiver em `/opt/pw-browsers`, correr `npx playwright install chromium` e retirar `PLAYWRIGHT_BROWSERS_PATH`.

## Defeitos encontrados (resumo)

- **D1**: sem rede, a app não arranca depois de uma só visita com rede (`config.json` e marés não estão na shell do service worker; só ficam guardados numa segunda visita).
- **D2**: sem rede, `pesqueiro.html?id=…`, `comparador.html?dia=…` e `mapa.html?pesqueiro=…` não abrem se esse endereço exacto não foi aberto com rede (o `caches.match` compara o endereço com a query).
- **D3**: o diário com uma saída aberta alarga a página (570 px em ecrãs de 412 e 360 px), do #29 em diante; corrigido só no #33.
- **D4**: o `larguras()` dos testes do browser compara com `innerWidth`, que em emulação de telemóvel cresce com o conteúdo; não detecta páginas mais largas do que o ecrã.
- **Não verificado**: quota real do IndexedDB (o Chromium aceita o comando mas não o aplica); reconhecimento da pilha como pilha nativa do GitHub; publicação no Cloudflare.
