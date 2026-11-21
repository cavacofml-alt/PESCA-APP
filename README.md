# Surfcasting Algarve

App pessoal (PWA, para Android) com as condições de surfcasting para dourada e robalo em oito pesqueiros, da Ria Formosa (Faro) à Falésia. Sem build e sem dependências de runtime. O ecrã inicial (`index.html`) abre com «Onde e quando» (os melhores pesqueiros e períodos do dia escolhido, a partir das notas) e mostra um cartão por pesqueiro com as notas por período; `comparador.html` põe os oito pesqueiros lado a lado (ver «Comparador»); `pesqueiro.html?id=<id>` mostra tudo sobre um pesqueiro (ver «Página do pesqueiro»); `diario.html` é o diário de saídas (ver «Diário»); `mapa.html` mostra os pesqueiros e o fundo do mar; `fontes.html` diz de onde vem cada dado, de que tipo é e com que licença (e os créditos das fotografias); `diagnostico.html`, aberto a partir das «Fontes», mostra o estado técnico de cada pedido. Todos os ecrãs têm a mesma barra de navegação (Início, Comparar, Mapa, Diário, Fontes).

## Executar localmente

Os módulos ES e `fetch()` não funcionam a partir de `file://`. Servir a pasta por HTTP, por exemplo `python3 -m http.server` na raiz, e abrir `http://localhost:8000/`.

## Publicar (Cloudflare Workers)

O site está no Cloudflare Workers, como site estático (sem código no servidor), no plano gratuito. O repositório no GitHub é **público** e continua público (decisão do utilizador); o alojamento no Cloudflare vem do tempo em que era privado e mantém-se.

1. Criar conta em <https://dash.cloudflare.com/sign-up>.
2. **Workers e Pages → Criar → importar um repositório**, autorizar o GitHub e escolher este repositório (nome do projecto: `pesca-app`, ramo de produção `main`).
3. Não é preciso configurar mais nada: o `wrangler.jsonc` na raiz diz ao Cloudflare para correr `node ferramentas/publicar.mjs` e servir só a pasta `publicar/`. O comando de deploy fica o predefinido (`npx wrangler deploy`).
4. O endereço fica `https://pesca-app.<subdomínio>.workers.dev` (o desta app: <https://pesca-app.cavacofml.workers.dev/>). Cada merge para `main` volta a publicar sozinho; os outros ramos geram uma versão de pré-visualização com endereço próprio.

`ferramentas/publicar.mjs` copia só os ficheiros da app (lista explícita). **A pasta `recolha/` (material de trabalho) nunca é publicada no site**, nem os testes, as ferramentas, o Playwright e os documentos de trabalho. Um teste confirma-o.

**Atenção: o site não é o único sítio público.** Com o repositório público, tudo o que está no repositório se vê no GitHub, incluindo a pasta `recolha/` (respostas de APIs guardadas, relatórios de trabalho, a Tabela de Marés do IH de 2026 em PDF e um PDF de outra ferramenta) e o histórico dos commits. O que fazer com esse material é decisão do utilizador (ver «Tabela de marés → Licenças e autorizações»).

## Comparador

`comparador.html` (`js/comparador.js`, `js/ui/comparador.js`) mostra, para a espécie, o dia e o período escolhidos (o dia inteiro, que é a nota do melhor período, ou madrugada, manhã, tarde, noite), a nota de cada pesqueiro **tal como o motor a calculou**: não calcula notas nem cria outra classificação.

- Cada linha diz o estado da nota (completa, incompleta com o intervalo possível, sem nota com o motivo, por confirmar, não se aplica), as notas dos quatro períodos e o «porquê»: as parcelas aplicadas, as que ficaram por avaliar e o limite obrigatório. Em «Parcelas e avisos» estão a tabela das parcelas, as fontes que falharam e os avisos do motor.
- O resumo diz a nota mais alta e quem a tem, assinala empates e diz «Comparação parcial: não dá para dizer qual é o melhor» quando alguma nota incompleta, sem nota ou por confirmar a pode igualar.
- A tabela «Factores» põe lado a lado os valores do motor no período de cada pesqueiro (potência máxima, limo, alinhamento, pressão; para a dourada também pressão alta e estável, descida da água e água turva). Dado em falta → «?», nunca zero.
- Ordem: por omissão, nascente → poente (a do motor), com os pesqueiros sem regra para a espécie no fim, como no início. «Por nota» usa os critérios de «Onde e quando»: nota; em empate, alinhamento no período, nota da outra espécie, período mais cedo, ordem dos pesqueiros. As notas em falta ficam sempre depois das que existem.
- Hoje, os períodos que já acabaram ficam a cinzento, e a nota do dia diz «(já passou)» quando o seu período já acabou.
- O início liga ao comparador no dia escolhido («Comparar os 8 pesqueiros ›»).

## Página do pesqueiro

`pesqueiro.html?id=<id>[&dia=<0–6>]` (`js/pesqueiro.js`, `js/ui/pesqueiro.js`) é gerada a partir do `config.json`: um pesqueiro novo em `pesqueiros` (com os seus pontos em `locais`) tem página sem mudar código. Mostra:

- nome, fotografia, tipo e espécies;
- os pontos de dados (vento, ondulação, água), com as coordenadas e a origem de cada um; a ligação ao mapa (`mapa.html?pesqueiro=<id>` centra-se nele e abre o balão);
- os dias com as notas do pesqueiro;
- as notas por espécie e período, com incompletude, limites e motivos, e o alinhamento;
- o «hora a hora» completo, com as marés da tabela;
- os factos do dia (potência, limo, água, fundo típico nas praias), as parcelas, as fontes com a hora de leitura e os avisos;
- as câmaras e as estações de vento.

Reutiliza os componentes do ecrã inicial e do «hora a hora» (não há outra cópia do motor nem das regras). Chega-se a ela pelos cartões do início («Página do pesqueiro ›»), pelos nomes no comparador e pelos balões do mapa.

## Diário

`diario.html` (`js/diario.js`, `js/diario/`, `js/ui/diario.js`): saídas de pesca guardadas **só neste aparelho** (IndexedDB, lojas `diario` e `condicoes`). Funciona sem rede. Sem fotografias.

- **Saída:** pesqueiro, dia, hora de início e de fim (hora de Portugal continental; um fim antes do início acaba no dia seguinte; na hora repetida da mudança de hora fica a primeira e diz-se; a hora que não existe é recusada), espécies (robalo, dourada, outra com o nome), resultado «com capturas» ou «sem capturas» (nunca se confunde uma saída sem capturas com uma sem registo), capturas (espécie, quantidade, tamanho em cm opcional, observações) e observações.
- **Condições associadas:** ao guardar, a app procura a leitura guardada (ver «Armazenamento local») que cubra as horas da saída — primeiro a mais recente lida antes do início, depois as lidas depois, até 7 dias — e guarda a previsão hora a hora no pesqueiro, as notas do motor nos períodos da saída, as marés do dia (tabela do IH) e a medição da boia mais perto do início. É sempre a previsão dessa leitura, com a hora da leitura, nunca uma medição no pesqueiro; sem leitura que sirva, fica dito porquê. Sem hora de fim, ficam só as condições da hora em que a saída começou (o formulário e o resumo dizem-no). Ao editar, só se recalculam se mudar o pesqueiro ou as horas.
- **Editar, apagar** (a saída e as suas condições, juntas) e **consultar** (a mais recente primeiro).
- **Cópia de segurança:** «Exportar cópia» descarrega um JSON versionado (`formato: surfcasting-algarve-diario`, `versao: 1`). «Importar cópia» valida o ficheiro inteiro antes de escrever: um ficheiro inválido não escreve nada; um válido escreve numa só transacção; um registo que já existe igual é ignorado e um diferente com o mesmo id fica como conflito (fica o do aparelho). Lembrete quando há saídas e nunca se fez cópia, ou a última tem mais de 30 dias (`config.persistencia.lembreteCopiaSegurancaDias`).
- Os registos não mudam as regras, os limiares nem as notas.

## Instalar no telemóvel (Android)

Abrir o endereço no Chrome → menu ⋮ → **Instalar app** (ou «Adicionar ao ecrã principal»). A app abre em ecrã inteiro.

**Sem rede (o que está implementado):**

- A app abre: o service worker guarda a shell (HTML, CSS, JS, bibliotecas, fotografias) e a última cópia já descarregada da `config.json`, das tabelas de marés e dos fundos do mar. Os mosaicos do mapa (OpenStreetMap, DGT) não ficam guardados.
- Cada leitura com rede (previsões do Open-Meteo de todos os pontos e boia de Faro) fica guardada no aparelho, em IndexedDB (ver «Armazenamento local»).
- Quando nenhum ponto do Open-Meteo responde (sem rede ou fonte em baixo), o início e o comparador mostram a **última leitura guardada**, com o aviso «Previsão arquivada — não é a previsão actual», a data, a hora e a idade da leitura. As notas são as dessa leitura; os dias e os períodos já passados contam a partir da hora real. Nunca aparece como previsão actual.
- Sem leitura guardada, ou com uma mais antiga do que 7 dias: «Previsão indisponível». As notas que dependem da previsão ficam sem nota; a da Ria, que vem das marés (ficheiro local), fica incompleta.
- Quando a rede volta, a página actualiza sozinha.
- Ficam ainda no aparelho, em `localStorage`, a espécie escolhida e a camada escolhida no mapa.

## Armazenamento local

`js/armazenamento/` — camada independente da interface, só no aparelho (nada vai para servidores):

- `esquema.js`: base `surfcasting-algarve` em IndexedDB, com as lojas `leituras` (cada leitura das fontes), `diario` e `condicoes` (o diário) e `meta`. A versão da base é o número de migrações; para mudar o esquema acrescenta-se uma migração no fim, nunca se altera uma publicada.
- `indexeddb.js`: abre a base e aplica as migrações. Se o navegador não deixar (sem IndexedDB, modo privado, base aberta noutro separador com outra versão, erro na migração), a app continua sem guardar e o diagnóstico di-lo.
- `leituras.js`: guardar, ler a última e limpar. Política em `config.json` (`persistencia.leituras`): todas as leituras das últimas 48 h; das mais antigas, a última de cada dia (hora de Lisboa) até 30 dias; no máximo 60; uma leitura com menos de 30 min é substituída pela nova; sem rede, só se usa a última se tiver até 168 h (7 dias). A mais recente nunca é apagada pela limpeza. Sem espaço (quota), apagam-se só as leituras mais antigas, uma de cada vez, até a nova caber; a leitura válida mais recente nunca se apaga sozinha: no fim, só é trocada pela nova numa única transacção, que se desfaz se a nova não couber. Nunca se fica sem nenhuma leitura; se a nova não couber, a app continua e avisa que os dados não ficaram guardados.
- `armazem-memoria.js`: a mesma interface em memória, só para os testes em Node.
- Cada leitura ocupa cerca de 0,3 MB (16 pontos do Open-Meteo e a boia). As marés e os fundos não se guardam aqui (são ficheiros da app).
- O diagnóstico mostra quantas leituras há, as datas e o espaço usado.

## Estado das fontes

Cada dado tem um tipo, e a app di-lo: **medido** (observação de um instrumento), **previsto** (modelo ou previsão oficial), **estimado** (deduzido por um método indirecto, com erro conhecido mas não medido no local) ou **calculado** (feito pela app ou no aparelho a partir de outros dados).

| Fonte | Tipo | Onde aparece | Entra nas notas |
|---|---|---|---|
| Open-Meteo Marine e Forecast | previsto (os `past_days` são previsões arquivadas, não medições) | notas, cartões, «hora a hora», «Mar agora» (ao lado da boia) | sim (é a base das notas) |
| Tabela de Marés do IH, Faro-Olhão | previsto (previsão oficial) | notas, cartões, «hora a hora», mapa | sim (amplitude, repontos, alinhamento) |
| Boia ondógrafo de Faro (IH) | medido | «Mar agora» | não |
| SunCalc | calculado no aparelho | alinhamento, cartões | sim (nascer e pôr do Sol) |
| Potência das ondas, amplitude, notas | calculado pela app (a partir de dados previstos) | notas, cartões | são o resultado |
| COSMO (APA), 2025 e 2020 | medido (data do levantamento em cada balão) | mapa, fundo típico das praias | não |
| LiDAR 2011 do IH (EMODnet) | medido em 2011 | mapa, fundo típico das praias | não |
| Sentinel-2 (fundões e cabeços) | estimado | mapa (contorno tracejado, «sat.») | não |
| OpenStreetMap, DGT OrtoSat 2023 | mapa base | mapa | não |

Pormenores:

- Open-Meteo Marine: consulta horária marinha.
- Open-Meteo Forecast: vento, rajadas, pressão e precipitação. **Não pede nascer/pôr do Sol.**
- Open-Meteo (Marine e Forecast): pedidos com `timeformat=unixtime` (instantes absolutos; a hora local repete-se a 25/10/2026). Consulta os pontos de mar e de terra de cada pesqueiro (`config.locais`; hoje 8 de mar e 8 de terra).
- IPMA estado do mar: **deixou de ser consultado** (decisão do utilizador, 20/11/2026): só aparecia no diagnóstico e não dava informação útil. Só volta como funcionalidade explícita, com atribuição e validação.
- Boia de Faro (Instituto Hidrográfico, OGC API): última medição da onda e da água, com o indicador de qualidade de cada valor (1 e 2 aceites; 9 → `não obtido`; outros ou fora dos limites físicos → `inválido`). Mostrada em «Mar agora»; não entra nas notas.
- Marés locais: valida formato, ordem, alternância PM/BM e intervalos de 30 a 480 minutos. `mares/2026.json` tem a tabela oficial do IH de 2026 (ver «Tabela de marés»).
- SunCalc 1.9.0 (BSD-2) em `vendor/suncalc.js`: nascer e pôr do Sol e fases da Lua, calculados no aparelho. A aplicação não consulta outra fonte solar.

## Modelo de valor

Cada fonte devolve um resultado (`sourceResult` em `js/normalizacao.js`) com `ok`, `data`, `source`, `readAt` e o erro, quando há. O motor e a interface trabalham sobre esses resultados: um valor em falta fica `null` e aparece como «não obtido» ou `n.d.`, nunca como zero; um valor fora dos limites físicos fica «inválido». A interface mostra a fonte, o tipo e a hora de leitura por bloco (cartão, «Mar agora», página «Fontes»).

A função `leitura()` (no mesmo ficheiro) cria o envelope por valor previsto na arquitectura (`value`, `unit`, `source`, `readAt`, `validAt`, `tipo`, `status`, `provisional`, `note`) e tem testes, mas **a app ainda não a usa**.

Os URL das APIs estão só em `config.json` (`fontes`); os módulos em `js/` recebem-nos por parâmetro.

## Testes offline

Com Node ≥ 20, na raiz do projecto:

```
node --test
```

Não há dependências a instalar para estes testes. `testes/motor-referencia.test.js` compara as notas do motor com uma referência guardada (`testes/referencia/motor-20261014.json`: respostas reais de 14/10/2026, 7 dias × 8 pesqueiros × 4 períodos × 2 espécies): falha se alguma nota mudar. Só se regenera (`node ferramentas/referencia-motor.mjs`) quando o utilizador aprovar uma mudança de regras ou limiares. Os testes não usam a Internet: as respostas das APIs são simuladas com as fixtures de `testes/dados-teste.js` e com respostas reais guardadas em `testes/reais/`, que não são previsões actuais. O GitHub Actions corre os testes em cada push e PR, com Node 20 e 22 e quatro fusos horários (UTC, Europe/Lisbon, America/New_York, Asia/Tokyo).

### Testes no browser (Playwright)

O Playwright é **só de desenvolvimento** (aprovado pelo utilizador a 20/11/2026): nunca entra na app publicada. Os testes em `testes-browser/*.e2e.mjs` abrem a app num Chromium, servida localmente a partir da mesma pasta que se publica, com as APIs a responder com `testes/reais/` (sem Internet) e o relógio fixo. Verificam a navegação, as páginas e que não há deslocamento horizontal num Pixel 7 emulado e a 360 px, e guardam capturas em `saida-browser/`.

```
npm ci
npx playwright install chromium   # uma vez, se o Chromium ainda não estiver instalado
npm run test:browser
```

O GitHub Actions corre-os em cada push e PR (workflow «Testes no browser») e guarda as capturas como artifact.

## Limitações desta entrega

- Ainda não existem: estatísticas e o ecrã do histórico de previsões (as leituras já ficam guardadas). Estão no plano de evolução, um PR cada.
- Os avisos do IPMA não são consultados: a regra de segurança foi retirada por decisão do utilizador (13/10/2026).
- O `sw.js` serve a shell a partir da cache; `config.json` e marés (`*.json`) vão sempre primeiro à rede e só usam a cópia em cache sem ligação. Ao alterar um ficheiro da shell, correr `node ferramentas/versao-sw.mjs` (actualiza a impressão e sobe a versão da cache em `sw.js`); um teste falha se for esquecido.
- Quando há uma versão nova publicada, a página aberta recarrega sozinha uma vez, assim que o service worker novo toma conta dela (`js/registo-sw.js`). Sem isso ficava o código antigo com a `config.json` nova, que vem sempre da rede. Na primeira instalação não recarrega.

## Tabela de marés

`mares/2026.json` e `mares/2027.json` foram gerados a partir das tabelas oficiais do Instituto Hidrográfico (Tabela de Marés, Vol. I, Porto de Faro-Olhão, págs. 2-121 a 2-124, que são as páginas 143 a 146 do PDF nos dois anos). Horas em TU (UTC); alturas referidas ao zero hidrográfico (2,00 m abaixo do nível médio, Cascais 1938); resolução de 0,1 m. A tabela não indica PM/BM: o tipo é deduzido pela alternância das alturas e validado.

**Um ficheiro por ano.** A app lê os anos que a janela de 7 dias toca (`loadTidesForWindow` em `js/fontes/mares-locais.js`): perto do fim do ano lê os dois e confere a passagem de ano (ordem, alternância, intervalo). Se faltar o ano seguinte, os dias que dependem dele ficam «tabela incompleta» (nunca «sem repontos») e a página «Fontes» diz «obtido em parte».

**Licenças e autorizações (situação a 20/11/2026).**

- 2026: o PDF diz «© Copyright Instituto Hidrográfico», sem licença aberta. O `mares/2026.json` não tem campo `licence` (só a fonte e o SHA-256 do PDF).
- 2027: CC BY-NC-ND 4.0 (campo `licence` no `mares/2027.json`). Permite copiar e redistribuir **sem adaptações** e sem fins comerciais; o IH pede autorização para outros usos (formulário em hidrografico.pt). Não está esclarecido se uma transcrição para JSON conta como adaptação.
- **Os dois ficheiros estão publicados no site**: a app lê-os de `mares/` no próprio endereço, e o `publicar.mjs` inclui a pasta inteira. Uso pessoal e sem fins comerciais, com a fonte indicada na página «Fontes».
- **Autorização do IH: não pedida.** Há um rascunho de e-mail ao IH, ainda não enviado (cabe ao utilizador).
- O PDF de 2026 está em `recolha/2026-10-13/` e, com o repositório público, vê-se no GitHub (não no site).

Nenhum destes pontos muda os ficheiros de marés: retirar ou manter qualquer um deles é decisão do utilizador.

Para gerar o ano seguinte, com o PDF do IH (loja.hidrografico.pt, «Publicações digitais», gratuito) e o `pdftotext` (poppler) instalado:

```
for p in 143 144 145 146; do pdftotext -f $p -l $p -bbox Tabela.pdf pasta/p$p.html; done
python3 ferramentas/mares_ih.py pasta mares/AAAA.json $(sha256sum Tabela.pdf | cut -d' ' -f1) \
  --ano AAAA --paginas 143 144 145 146 --url <página de descarga> --licenca "<licença>"
```

Confirmar antes as páginas de Faro-Olhão no índice do PDF. O script recusa escrever se alguma validação falhar (dias seguidos, dia da semana impresso, alternância, intervalos, 365/366 dias do ano). Depois, conferir à mão alguns dias na imagem do PDF e os extremos com os níveis característicos do Capítulo 3 (PMmáx. e BMmín.).

## Mapa e fundo do mar

O ecrã «Mapa» (`mapa.html`, `js/mapa.js`) mostra os pesqueiros e, onde houver levantamento, o fundo do mar:
- **linhas de fundo** (isóbatas) de 0,5 em 0,5 m;
- **fundões e cabeços**, com balão. O balão mostra a cota e a distância à costa, e a água por cima na próxima preia-mar e baixa-mar, calculada com a tabela de marés;
- **zona levantada**, com contorno tracejado.

Os fundos de mapa e as fontes do fundo do mar:
- **Biblioteca:** [Leaflet](https://leafletjs.com) 1.9.4, em `vendor/leaflet/`.
- **Mapa:** OpenStreetMap. A política de uso deles exige atribuição e o cabeçalho Referer, que o Leaflet envia com `referrerPolicy`.
- **Satélite:** OrtoSat 2023 da Direção-Geral do Território (WMS; nas capacidades do serviço: «no conditions apply»).
- **Fundo do mar:** levantamentos topo-hidrográficos do Programa COSMO da APA. Os modelos digitais de elevação (DEM) têm 0,30 m de resolução e cotas ao zero hidrográfico. Na ficha: utilização «Sem restrições», com citação.

Há quatro levantamentos, em `config.mapa.fundos`:

| Zona | Produto COSMO | Levantamento |
|---|---|---|
| Quarteira–Garrão | `LTHQUGA1_20250612_20250616_DEM` | 12–16/06/2025 |
| Praia de Faro | `LTHFA1_20250617_DEM` | 17/06/2025 |
| Barreta–Ilha do Farol (barra de Faro-Olhão) | `LTHBAIF1_20201023_20201029_DEM` | 23–29/10/2020 |
| Culatra–Armona | `LTHCUAR2_20201015_20201125_DEM` | 15/10–25/11/2020 |

Cada zona só é pedida quando aparece no ecrã, porque os quatro ficheiros somam 3,2 MB. Os `limites` estão no config.

Três das zonas têm um `aviso` que aparece nos balões: esporões e molhe em Quarteira, e as barras nas outras duas. Aí os fundões e cabeços podem ser efeito das estruturas ou de canais que mudam muito.

Os DEM originais não entram no repositório (o COSMO exige registo para os descarregar). Só se guarda o resultado tratado em `fundos/<id>.json`, com o SHA-256 do DEM de onde saiu.

Para acrescentar ou refazer um levantamento:

1. Descarregar o DEM do COSMO.
2. Instalar as dependências da ferramenta, que são só para ela (a app não usa Python), por exemplo num `venv`: `pip install numpy scipy rasterio pyproj shapely scikit-image`.
3. Correr:

```
python3 -I ferramentas/fundos_cosmo.py LTHFA1_20250617_DEM.tif fundos/praia_faro.json \
  --id praia_faro --nome "Praia de Faro" --produto LTHFA1_20250617_DEM \
  --levantamento 2025-06-17 --url https://cosmo.apambiente.pt/prd/LTHFA1_20250617_DEM
```

Se o levantamento durou vários dias, acrescentar `--levantamento-fim AAAA-MM-DD`.

4. Acrescentar o levantamento a `config.mapa.fundos`, com `id`, `nome`, `ficheiro` e `limites` (sul/oeste e norte/este da zona levantada). Um teste confirma que os limites contêm a zona.

### Fundo típico das praias

Nos cartões das praias, a linha «Fundo a 100/150/200 m» mostra a cota mediana a 100, 150 e 200 m da linha de meia-maré, num troço de ±500 m à volta do pesqueiro. Nos detalhes do cartão aparece também a água por cima na baixa-mar mais baixa e na preia-mar mais alta do dia (altura da tabela − cota). É só informação: não entra nas notas.

Os valores estão em `fundos/tipico.json`, gerado por `ferramentas/fundo_tipico.py`. A fonte de cada praia escolhe-se assim:
- usa-se o levantamento COSMO mais recente que cubra a praia;
- se nenhum a cobrir, usa-se o **LiDAR 2011 do Instituto Hidrográfico**, publicado no EMODnet Bathymetry (`590_HR_Lidar_Algarve`):
  - utilização pública, «não usar para navegação»;
  - grelha de ~12 × 14 m;
  - cotas à baixa-mar astronómica mais baixa (LAT), segundo a ficha. Em Faro-Olhão a LAT fica 0 a 0,22 m acima do zero hidrográfico da tabela de marés: o IH diz que o ZH fica abaixo da LAT, e a LAT não passa da baixa-mar mínima de nenhum ano (0,34 m em 2026, 0,22 m em 2027). Por isso, nas praias com o LiDAR, a água por cima aparece como intervalo (por exemplo «2,0–2,3 m»), sem correcção constante. No confronto com o COSMO 2025, as cotas LiDAR das zonas fundas ficaram 0,1 a 0,25 m acima das do COSMO.

Para refazer:

```
# 590_HR_Lidar_Algarve.emo.zip: https://downloads.emodnet-bathymetry.eu/high_resolution/590_HR_Lidar_Algarve.emo.zip
python3 -I ferramentas/lidar_emodnet.py 590_HR_Lidar_Algarve.emo lidar2011.tif
python3 -I ferramentas/fundo_tipico.py fundos/tipico.json \
  --cosmo fundos/quarteira_garrao.json LTHQUGA1_20250612_20250616_DEM.tif \
  --cosmo fundos/praia_faro.json LTHFA1_20250617_DEM.tif \
  --lidar lidar2011.tif 590_HR_Lidar_Algarve.emo.zip
```

### Fundões e cabeços por satélite (estimativa)

A camada «Satélite» do mapa mostra fundões e cabeços **estimados** a partir de imagens Copernicus Sentinel-2. Cobre toda a costa de Faro à Falésia, incluindo o Ancão, Vilamoura e a Falésia, onde não há levantamento COSMO. Não é medição. No mapa aparece com contornos tracejados e com «sat.» no rótulo.

**Método** (`ferramentas/batimetria_satelite.py`):
- reflectância nas bandas azul, verde e vermelho a 10 m;
- modelo de Lyzenga, calibrado nas cotas dos COSMO de 06/2025 (0 a −6 m ZH);
- detecção dos fundões e cabeços com os critérios do COSMO;
- só ficam as formas que aparecem em duas imagens: 04/11/2026, confirmada com 15/09/2026.

**Validação** (imagem de 14/06/2025, a mesma data dos levantamentos; calibrar num COSMO e testar no outro):
- erro quadrático médio de 0,70–0,79 m entre 0 e −6 m;
- as anomalias (fundões e cabeços) com correlação de 0,82–0,93;
- onde o COSMO tem uma anomalia de 0,4 m ou mais, o satélite acerta o sinal em 91–98 % dos píxeis.

**Limites:**
- só até ~4,5 m de fundo;
- só em dias calmos e de água limpa;
- erro típico de 0,6 m na cota.

Para refazer com imagens mais recentes (as cenas procuram-se no catálogo Earth Search; `GDAL_HTTP_PROXY` se houver proxy):

```
python3 -I ferramentas/batimetria_satelite.py fundos/satelite.json \
  --cena S2C_29SNB_20261104_0_L2A --confirmar S2C_29SNB_20260915_0_L2A \
  --cosmo fundos/quarteira_garrao.json LTHQUGA1_20250612_20250616_DEM.tif \
  --cosmo fundos/praia_faro.json LTHFA1_20250617_DEM.tif
```

Depois, actualizar o nome e os `limites` da entrada `satelite` em `config.mapa.fundos`.

### Ria Formosa, Ancão, Vilamoura e Falésia (LiDAR 2011)

O COSMO não cobre o interior da Ria Formosa nem o troço Garrão–Ancão. Para essas zonas há a camada «Ria Formosa e Ancão (LiDAR 2011)», com o levantamento LiDAR de 2011 do Instituto Hidrográfico, publicado no EMODnet Bathymetry (utilização pública, «não usar para navegação»). Cobre os canais de Faro, de Olhão e da Armona, e o mar no Ancão e na Culatra.

Há uma segunda camada com o mesmo levantamento, «Vilamoura e Falésia (LiDAR 2011)», de Olhos de Água a Vilamoura: o COSMO também não cobre Vilamoura nem a Falésia. Cada camada só é pedida quando a zona aparece no ecrã.

Nas duas camadas:
- **O que mostra:** só linhas de fundo de 1 em 1 m a partir de +1 m (de 2 em 2 m abaixo de −6), sem fundões nem cabeços.
- **Corte:** as linhas são cortadas onde há levantamento COSMO; aí vale o COSMO.
- **Referência:** as cotas estão à LAT, que em Faro-Olhão fica 0 a 0,22 m acima do zero hidrográfico. O balão de cada linha diz «à LAT» e mostra o intervalo ao ZH.
- **Idade:** é de 2011, por isso os canais e os bancos já mudaram.

Para refazer:

```
python3 -I ferramentas/lidar_emodnet.py 590_HR_Lidar_Algarve.emo lidar2011_ria.tif -8.07 36.94 -7.74 37.07
python3 -I ferramentas/isobatas_lidar.py lidar2011_ria.tif fundos/ria_lidar2011.json 590_HR_Lidar_Algarve.emo.zip \
  --excluir fundos/praia_faro.json fundos/quarteira_garrao.json fundos/barreta_farol.json fundos/culatra_armona.json
python3 -I ferramentas/lidar_emodnet.py 590_HR_Lidar_Algarve.emo lidar2011_falesia.tif -8.23 37.02 -8.10 37.11
python3 -I ferramentas/isobatas_lidar.py lidar2011_falesia.tif fundos/falesia_lidar2011.json 590_HR_Lidar_Algarve.emo.zip \
  --id falesia_lidar2011 --nome "Vilamoura e Falésia (LiDAR 2011)" \
  --excluir fundos/praia_faro.json fundos/quarteira_garrao.json fundos/barreta_farol.json fundos/culatra_armona.json
```

Os critérios dos fundões e cabeços estão no cabeçalho da ferramenta e ficam gravados no ficheiro (`tratamento.criterios`). São provisórios. Os bancos mudam com os temporais: vale sempre a data do levantamento, que aparece em todos os balões.

## Motor de regras (Fase 3)

`js/regras/` — funções puras, sem rede nem armazenamento. `analisarDias()` (em `analise.js`) recebe os dados já obtidos (Open-Meteo por ponto, tabela de marés, nascer/pôr do Sol do SunCalc) e devolve, por dia e por pesqueiro: notas de robalo e dourada **por período** (madrugada, manhã, tarde, noite) com as parcelas, potência máxima e hora, limo, lado do molhe, pressão, água, chuva, alinhamentos e avisos. Dado em falta → `n.d.` com o motivo; nunca um valor por defeito.

Os limiares provisórios estão no `config.json` (`mar`, `pressao`, `temperaturaAgua`, `chuva`, `anomalias`, `alinhamento`, `periodos`, `pontuacao`). Os pesqueiros e os pontos de dados estão em `pesqueiros` e `locais`.

Para ver o resultado sem interface:

```
node ferramentas/analisar.mjs --rede            # vai buscar os dados agora (guarda em recolha/<dia>/apis/; o repositório é público: não fazer commit sem rever)
node ferramentas/analisar.mjs recolha/2026-10-14/apis 2026-10-14 7   # com ficheiros guardados
```
