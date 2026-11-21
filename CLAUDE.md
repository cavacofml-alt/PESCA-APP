# Surfcasting Algarve — briefing para o Claude Code

> Ficheiro de arranque do projecto. Coloca-o na raiz do repositório como `CLAUDE.md`.
> Língua: **português europeu** em tudo o que o utilizador vê (interface, README, mensagens de commit, comentários de PR). Sem misturar inglês na interface.

---

## 1. O que é

PWA pessoal (instalável no telemóvel) que analisa as condições de pesca de **surfcasting** para **dourada** e **robalo** no Algarve (Faro → Quarteira) e mostra, para os próximos 7 dias:

- os dados lidos (com fonte e hora de leitura),
- notas de 1 a 5 por dia para cada espécie,
- o pesqueiro recomendado (e o lado do molhe, quando aplicável),
- um diário de saídas que grava as condições do momento.

**Princípio central:** análise **determinística**. As regras são funções JavaScript puras. Nenhum modelo de linguagem participa no cálculo de notas. **Nunca estimar nem inventar valores**: dado em falta → `não obtido`; dado inválido → `inválido`.

O utilizador é pescador experiente e exige rigor: verificar o significado de cada campo das APIs antes de o usar; preferir "não sei" a um valor plausível mas não confirmado.

---

## 2. Estado actual

- **Fase 1 (arquitectura): aprovada.** Decisões na secção 6.
- **Fase 2 (fontes de dados): entregue pelo ChatGPT** e corrigida (secção 7) no PR #1, já integrado no `main`.
- **Fase 3 (motor de regras): concluída** e integrada no `main` (PR #2, 14/10/2026, após três revisões do ChatGPT). Tabela de marés oficial de 2026 convertida (`mares/2026.json`); conferida com a Tábua de Marés a 14/10 (diferenças ≤ 6 min).
- **Fase 4 (interface): em curso.** Parte 1 (PR #3, aprovada pelo utilizador sem revisão do ChatGPT): ecrã inicial com cartões por pesqueiro, publicação no Cloudflare. Parte 2 (14/10/2026): escolha da espécie (robalo/dourada) e painel «hora a hora» por pesqueiro (a curva da maré entre preia-mar e baixa-mar é só ilustrativa; os valores são os da tabela). Dourada nas praias: regra 12 (14/10/2026). Mapa feito (19/11/2026). Falta: «próxima semana».
- **Alojamento (14/10/2026): Cloudflare Workers** (site estático), projecto `pesca-app`, ramo de produção `main`, endereço **https://pesca-app.cavacofml.workers.dev/** (no ar desde o merge do PR #3). O endereço responde a partir do ambiente do Claude Code (verificado a 20/11/2026; antes estava bloqueado). `wrangler.jsonc` corre `ferramentas/publicar.mjs`, que publica só a app — **nunca a pasta `recolha/`**.
- **Repositório público (20/11/2026, decisão do utilizador: deve continuar público).** O site e o repositório são públicos. A `recolha/` não vai para o site, mas vê-se no GitHub (Tabela de Marés do IH de 2026 em PDF, um PDF de outra ferramenta, respostas de APIs, relatórios), tal como o histórico dos commits. Retirar material ou reescrever o histórico é decisão do utilizador; o Claude Code não o faz por iniciativa própria (e o ambiente recusa force-push).
- **Molhes (14/10/2026):** há dois — o do porto de pesca de Quarteira (pesqueiro 5) e o da marina de Vilamoura (coordenadas do utilizador em `config.locais.vilamouraMolheOeste`). Decidido: Vilamoura é o pesqueiro 7, com as regras do molhe; o molhe de Quarteira usa o farolim do molhe este, 37,066552, −8,11001 (confirmado a 14/10/2026). Ver secção 4.
- **Windy (avaliado a 14/10/2026):** não serve de fonte de dados — a API de previsão com chave grátis devolve dados aleatórios (só para testes), a versão paga não tem preço público e dá intervalos de 3 h (o Open-Meteo dá hora a hora, grátis). As câmaras do Windy entram como ligações.
- **Boia de Faro (17/11/2026, pedido do utilizador):** o ecrã inicial mostra «Mar agora», com a última medição da boia ondógrafo do Instituto Hidrográfico (onda, onda máxima, períodos, direcção, água, tendência) ao lado da previsão do Open-Meteo para a mesma hora. É só observação: não entra nas notas. Fonte na secção 9.
- **Interface:** marés sempre por extenso (preia-mar, baixa-mar), nunca PM/BM (pedido do utilizador). Créditos das fotografias só na página «Fontes», não nos cartões (pedido do utilizador; as licenças CC exigem-nos algures na app).
- **Evolução, Fase 1 (aprovada a 20/11/2026; implementação fase a fase, cada uma só com autorização):** «Fontes» (`fontes.html`, textos e ligações em `config.paginaFontes`) separada do diagnóstico técnico (`diagnostico.html`, aberto a partir das Fontes); a mesma barra (Início, Mapa, Fontes) nos quatro ecrãs; início reorganizado: «Onde e quando» no topo (as melhores combinações pesqueiro × período do dia escolhido, só com as notas «ok» do motor, sem outra classificação; desempate como nos melhores dias: alinhamento no período, nota da outra espécie, período mais cedo, ordem dos pesqueiros; hoje sem os períodos já acabados; incompletas marcadas), alinhamento do dia uma vez (minutos em intervalo quando os pesqueiros diferem; «só em: …» quando não é em todos), «Mar agora» numa linha (fonte, tipo e hora) com o resto ao tocar, fotografias mais baixas e, para a espécie escolhida, os pesqueiros sem nota no fim (`js/ui/inicio.js`, `janelasDoDia`, `ondeQuando`, `ordemDosCartoes`). Decisões do utilizador: prioridade das regras inalterada (segurança continua retirada); nenhum limiar, classificação ou regra muda sem aprovação; IndexedDB para o modo sem rede e o diário (Fases 2 e 4); diário sem fotografias por agora; alertas adiados, sem serviços externos nem custos; os oito pesqueiros actuais, sem alargar a cobertura; interface e motor em PR separados.
- **Mapa e fundo do mar (19/11/2026, pedido do utilizador; opção b: mapa interactivo):** ecrã «Mapa» (`mapa.html`) com Leaflet 1.9.4 em `vendor/leaflet/`, fundo OpenStreetMap (por omissão) ou satélite DGT, pesqueiros e, onde há levantamento COSMO, isóbatas de 0,5 m, fundões e cabeços (`fundos/<id>.json`, gerados por `ferramentas/fundos_cosmo.py`; critérios **provisórios**, no cabeçalho da ferramenta). Balões com cota, distância à costa (linha de 2 m ZH) e água por cima na próxima preia-mar/baixa-mar (tabela de marés). Quatro levantamentos (`config.mapa.fundos`, cada um só é pedido quando a zona aparece no ecrã): Quarteira–Garrão (06/2025; aviso: esporões e molhe), Praia de Faro (06/2025), Barreta–Ilha do Farol (10/2020; aviso: barra) e Culatra–Armona (11/2020; aviso: barra). Os DEM originais não vão para o repositório (acesso com registo); SHA-256 nos ficheiros e nos testes.
- **Fundo típico das praias (19/11/2026, pedido do utilizador, opção B):** cada cartão de praia mostra a cota mediana a 100/150/200 m da linha de meia-maré (±500 m à volta do pesqueiro) e, nos detalhes, a água por cima na baixa-mar mais baixa e na preia-mar mais alta do dia. `fundos/tipico.json`, gerado por `ferramentas/fundo_tipico.py` (COSMO mais recente que cubra a praia; senão o LiDAR 2011 do IH, `ferramentas/lidar_emodnet.py`). Só informação, não entra nas notas. Almargem: COSMO 06/2025; Praia de Faro (o ponto de pesca fica fora do COSMO), Ancão, Vilamoura e Falésia: LiDAR 2011.
- **Fundões e cabeços por satélite (19/11/2026, pedido do utilizador, opção C):** camada «Satélite (04/11/2026)» no mapa (`fundos/satelite.json`, `ferramentas/batimetria_satelite.py`), **estimada, não medida**. Usa imagens Sentinel-2 L2A com o modelo de Lyzenga, calibrado com os COSMO 06/2025; só ficam as formas confirmadas na imagem de 15/09/2026 (72 formas, de Faro à Falésia). Validação na imagem de 14/06/2025, calibrando num COSMO e testando no outro: erro 0,70–0,79 m; anomalias com correlação 0,82–0,93 e sinal certo em 91–98 %. No mapa: contorno tracejado, rótulo «sat.» e balão «estimado por satélite». Cota com uma casa decimal. Sem isóbatas (têm ruído a mais).
- **Ria Formosa e Ancão no mapa (19/11/2026, pedido do utilizador: «da Armona ao Almargem, com a Ria e a barra do Farol»):** o COSMO não tem nada mais recente para essa faixa (Barreta–Farol e Culatra–Armona só até 2020) nem cobre a Ria nem o troço Garrão–Ancão. Camada «Ria Formosa e Ancão (LiDAR 2011)» (`fundos/ria_lidar2011.json`, `ferramentas/isobatas_lidar.py`): só linhas de fundo de 1 m (a partir de +1 m; 2 m abaixo de −6), cortadas onde há COSMO; sem fundões nem cabeços; aviso de que tem 15 anos. Data só com o ano (a app aceita «2011»).
- **Vilamoura e Falésia no mapa (19/11/2026; o utilizador não via nada no mapa da Falésia):** o satélite não confirmou fundões nem cabeços entre a Falésia e Vilamoura (os mais próximos da Falésia, F14/F15, ficam 0,7 km a poente). Segunda camada LiDAR 2011, «Vilamoura e Falésia» (`fundos/falesia_lidar2011.json`, de Olhos de Água a Vilamoura, −8,23 a −8,10), com os mesmos critérios da da Ria.
- **Experiência de validação de previsões (20/11/2026; revista pelo ChatGPT e integrada no `main` por squash, PR #21; ensaio a correr):** `ferramentas/validacao/` e `.github/workflows/recolha-validacao.yml` (de 6 em 6 h, aos :17 UTC; agendamento só a partir do `main`) guardam, **antes** de os instantes chegarem, o IBI WAV (`VHM0`, `VTM02`, `VTM10`) e o Open-Meteo na célula da boia de Faro, e as observações da boia (48 h, com QC). Ficam como artifacts do Actions (60 dias); nada vai para o `main` nem para o site. **Ensaio técnico até `RECOLHA_ATE` (~72 h)**: os 30 dias só começam com nova autorização do utilizador, depois de ver o relatório do ensaio. `analise-validacao.yml` (só a pedido) escreve o relatório no registo da execução, porque o ambiente do Claude Code não descarrega artifacts (anfitriões de armazenamento fora da lista). Uma recolha só é «completa» com todos os valores do IBI, o Open-Meteo e pelo menos uma medição da boia com Hm0 e Tm02 válidos (resposta recebida ≠ observações utilizáveis); as falhas ficam registadas uma a uma. Cada consulta tem a sua hora (`consultadoEm`; no IBI, por valor e variável) e a antecedência conta-se a partir dela; `retrievedAt` é só o início da recolha; a antecedência desde a corrida do modelo é maior ou igual e não se conhece. O `admp_updated_data` é a actualização do conjunto de dados de **cada camada** (analisada em separado: não está demonstrado que as três actualizam ao mesmo tempo), nunca a hora da corrida, e não serve de detector enquanto o ensaio não mostrar que acompanha as mudanças dos valores. A validação é na zona da boia: não vale automaticamente para os pesqueiros. Não entra nas notas. Na regra 5 fica o `wave_period` do Open-Meteo, como indicador provisório (definição espectral por confirmar): o `VTM02` não o substitui (é Tm02; a fórmula de 0,49 pede o período de energia, Te ≈ Tm−1,0, e com o Tm02 a potência desceria ~25 %); o `VTM10` é experimental (não há Te observado para o validar). A potência da regra 5 é um indicador de águas profundas, não a energia na rebentação.
- **Objectivo alargado (14/10/2026):** o utilizador quer uma app de previsão de pesca completa, em português e só para uso pessoal; **web app** (PWA) para **Android**. Ecrãs: cartões de favoritos com nota, mapa, meteograma hora a hora, curva de maré, comparador, diário…, com as regras e fontes deste projecto. Não copiar código, imagens, marca nem camadas pagas de outras apps; a pasta `recolha/` serve só de referência.
- **Tabela de marés de 2027 (20/11/2026, pedido do utilizador):** convertida com `ferramentas/mares_ih.py` (agora com `--ano`, `--paginas`, `--url`, `--licenca`; regenerar 2026 com as opções por omissão dá o mesmo ficheiro, byte a byte). Conferida à mão na imagem do PDF (10 dias de Janeiro) e nos extremos do Capítulo 3. A app lê os dois anos na passagem de ano. Licença CC BY-NC-ND 4.0 (o IH pede autorização para usos não previstos). Situação a 20/11/2026: os dois JSON (2026 e 2027) **estão publicados no site** (a app lê-os de `mares/`); autorização do IH **não pedida** (rascunho de e-mail por enviar pelo utilizador); manter ou retirar é decisão do utilizador (README, «Licenças e autorizações»).
- **Plano de evolução (20/11/2026, pedido do utilizador):** oito PR separados, sem merge sem autorização: 1 regularização técnica e documental; 2 comparador dos oito pesqueiros; 3 IndexedDB e funcionamento sem rede; 4 páginas individuais dos pesqueiros; 5 diário; 6 estatísticas pessoais (só do diário); 7 histórico de previsões e validação pessoal; 8 academia/guia estático. Nenhum muda regras, limiares, notas ou classificações. A prova está em `testes/motor-referencia.test.js` (notas de 14/10/2026 guardadas em `testes/referencia/`; regenerar com `node ferramentas/referencia-motor.mjs` só com aprovação do utilizador).
- **Comparador (plano de evolução, PR 2, 20/11/2026):** `comparador.html` com `js/ui/comparador.js` (funções puras: `linhasComparador`, `ordenarLinhas`, `resumoComparacao`, `porque`, `celulasFactores`) e o carregador comum `js/carregar.js` (o mesmo do ecrã inicial). Só mostra as notas do motor (o mesmo objecto); ordem por omissão nascente → poente com os sem regra no fim; «por nota» com os critérios de «Onde e quando»; «Comparação parcial» quando uma nota incompleta, sem nota ou por confirmar pode igualar a mais alta; dado em falta → «?», nunca zero. Barra: Início, Comparar, Mapa, Fontes.
- **Armazenamento local e sem rede (plano de evolução, PR 3, 20/11/2026):** `js/armazenamento/` (esquema com migrações, IndexedDB, leituras, armazém em memória para os testes). Cada leitura com rede guarda-se (loja `leituras`; política em `config.persistencia.leituras`). Sem nenhum ponto do Open-Meteo, `js/carregar.js` (`origemDosDados`) usa a última leitura até 7 dias, sempre com o aviso «Previsão arquivada — não é a previsão actual» e a hora dessa leitura (`origem.tipo` "actual" | "arquivo" | "indisponivel"; `contexto.agora` é a hora real, `contexto.lidoEm` a da leitura mostrada). A loja e o módulo chamam-se «leituras» e não «recolhas»: um teste recusa publicar qualquer caminho com «recolha».
- **Sem referências a apps de terceiros (19/11/2026, pedido do utilizador):** o nome da app comercial que serviu de referência no início foi tirado do repositório, do código, dos commits (histórico reescrito) e dos PR. Não o voltar a escrever em lado nenhum (código, comentários, commits, PR). Os pontos das praias são «pontos de pesca escolhidos pelo utilizador».

Estrutura actual (20/11/2026):

```
index.html  mapa.html  fontes.html  diagnostico.html  manifest.webmanifest  sw.js  config.json  _headers  wrangler.jsonc
css/app.css
js/app.js  js/dados.js  js/mapa.js  js/fundos.js  js/pagina-fontes.js  js/diagnostico.js  js/registo-sw.js  js/pontos.js  js/normalizacao.js
js/fontes/   (Open-Meteo, boias do IH, marés locais, fundo típico, SunCalc, …)
js/regras/   (motor de regras: funções puras)
js/ui/       (início, cartões, «hora a hora», Fontes, …)
mares/2026.json  mares/2027.json   (tabelas oficiais do IH)
fundos/        (COSMO, LiDAR 2011, satélite, fundo típico)
vendor/        (SunCalc, Leaflet)
ferramentas/   (publicar, versao-sw, conversão das marés e dos fundos, validação, referência do motor)
testes/  testes-browser/   (node --test; Playwright, só desenvolvimento)
recolha/       (material de trabalho: nunca publicado no site)
```

---

## 3. Arranque (feito) e regras de trabalho

O arranque (repositório, commit inicial da Fase 2, correcções da secção 7 no PR #1) ficou feito em Outubro de 2026.

Regras de trabalho:
- **Nunca fazer merge para `main` sem aprovação do utilizador.**
- Notas, fórmulas, pesos, limiares, regras, critérios de classificação e prioridades só mudam com aprovação do utilizador; `testes/motor-referencia.test.js` falha se alguma nota mudar.
- Commits pequenos e descritivos em português. Um PR por fase.
- Antes de assumir algo ambíguo numa regra: **perguntar**. Não escolher em silêncio.
- Sem dependências de runtime nem build. Testes com `node --test` (Node ≥ 20, sem pacotes). Os testes têm de correr **sem Internet**.
- Testes no browser (aprovado pelo utilizador a 20/11/2026): **Playwright só como dependência de desenvolvimento** (`package.json`, versão fixa), em `testes-browser/*.e2e.mjs` (`npm run test:browser`; o nome não apanha o `node --test` normal). App servida localmente a partir da pasta publicada, APIs simuladas com `testes/reais/`, relógio fixo, service worker bloqueado. Capturas em Pixel 7 emulado e a 360 px em `saida-browser/` (artifact do workflow «Testes no browser»). Nunca na app publicada (`publicar.mjs` recusa `node_modules`, `testes-browser`, `package-lock.json`).
- GitHub Actions: workflow que corre `node --test` em cada push/PR. Publicação: Cloudflare (secção 2), a cada merge para `main`.
- Bibliotecas de terceiros (ex.: SunCalc, licença BSD-2) ficam em `vendor/` com o ficheiro de licença.
- Ao mudar qualquer ficheiro da shell do `sw.js` (JS, CSS, HTML, fotos): `node ferramentas/versao-sw.mjs` antes do commit. Sem isso o telemóvel fica com o código antigo e a config nova (aconteceu no PR #6); um teste falha se for esquecido.
- Recarga automática (19/11/2026, aprovada pelo utilizador): `js/registo-sw.js` recarrega a página uma vez quando o service worker novo toma conta dela (evento `controllerchange`; não na primeira instalação). Antes, depois de cada publicação, a primeira abertura corria o código antigo com a config nova (a 19/11 o código antigo recusou a data «2011» da camada LiDAR e não a desenhou).

---

## 3-A. Colaboração com o ChatGPT

O projecto é feito a dois: **o Claude Code constrói, o ChatGPT revê.** O ChatGPT desenhou a arquitectura (Fase 1) e escreveu a Fase 2.

Fluxo em cada PR:
1. O Claude Code abre o PR com um resumo em português: o que mudou, decisões tomadas, dúvidas em aberto e como testar.
2. O utilizador cola esse resumo e o diff (ou o link do PR, se o repositório for público) no ChatGPT para revisão.
3. O utilizador traz os comentários do ChatGPT de volta para o Claude Code.
4. O Claude Code avalia cada comentário: aplica os correctos, justifica os que rejeita e responde a tudo no PR. Os comentários são sugestões a verificar, não ordens. Em caso de divergência sobre uma regra, decide o utilizador.

Para facilitar a revisão, manter os PR pequenos: uma fase ou um tema por PR.

---

## 4. Pesqueiros (nascente → poente)

| # | Pesqueiro | Espécie | Notas |
|---|---|---|---|
| 1 | Ria Formosa (interior, Faro) | dourada | |
| 2 | Praia de Faro (mar de fora) + bicos das barras | robalo | Ponto do utilizador 37.0133, −8.00567 (`faroMarPoente`) |
| 3 | Praia do Ancão (mar de fora, Loulé) + bico da barra do Ancão | robalo | Ponto do utilizador 37.0322, −8.03852 (`ancaoPraia`) |
| 4 | Praia do Almargem (mar de fora, Quarteira, Loulé) | robalo | Ponto do utilizador «Forte Novo» 37.062, −8.09016 (`forteNovo`; o mais perto do Almargem). O utilizador pesca só do lado do mar. **Não** mostrar avisos sobre a reserva natural. |
| 5 | Molhe de Quarteira | robalo e dourada | Lado **poente** (Vilamoura) ou **nascente** (praia de Quarteira). Farolim do molhe este, 37.066552, -8.11001 (confirmado a 14/10/2026) |
| 6 | Praia de Vilamoura (mar de fora, a nascente da marina) | robalo | Ponto do utilizador 37.0719, −8.11896 (`vilamouraPraia`). Regras das praias (decisão c, 14/10/2026) |
| 7 | Molhe de Vilamoura (molhe oeste da marina) | robalo e dourada | 37.0696033, -8.1243409 (link do utilizador, «Farol de Vilamoura Oeste»). Regras do molhe |
| 8 | Falésia Alfamar (mar de fora) | robalo | Ponto do utilizador 37.0834, −8.15912 (`falesiaAlfamar`; vento). Ondulação e água em `falesiaMar` 37.075, -8.15912, ~0,9 km ao largo (decisão do utilizador, 17/11/2026): no ponto da praia o Open-Meteo Marine dava uma célula com o centro em terra. Regras das praias (decisão de 14/10/2026) |

**Todas as praias têm nota de robalo e de dourada** (utilizador, 14/10/2026). A Ria só tem dourada.

Coordenadas (config, decisão C de 14/10/2026): **praias com os pontos de pesca do utilizador** (acima), o mesmo ponto para ondulação e vento, salvo a Falésia (ondulação e água ao largo, 17/11/2026); os molhes usam as coordenadas da tabela, também para ondulação, vento e água. A Ria não tem ponto próprio: fica Faro terra 37.01,-7.93 (água de Faro mar 36.97,-7.98) até o utilizador dar coordenadas. Os bicos usam o ponto da sua praia (sem a regra de segurança, deixaram de ser pesqueiros separados).

---

## 5. Regras (especificação do utilizador)

**Prioridade em conflito:** Limo > Marés > Potência > Pressão > Temperatura. (A segurança foi retirada da app: ver regra 1.)
Valores marcados *provisório* não estão validados no terreno: aplicar, mas mostrar sempre como provisórios na interface.

1. **Segurança — RETIRADA por decisão do utilizador (13/10/2026).** A app não consulta avisos do IPMA nem desaconselha pesqueiros: a avaliação de segurança é do utilizador. Bicos e molhe têm nota como os outros pesqueiros. Não reintroduzir sem pedido expresso do utilizador.
2. **Limo e mar mexido** — mar mexido = Hs ≥ 1,0 m **ou** potência ≥ 1,5 kW/m (*provisório*).
   - Faro, Ancão, Almargem: vento, ondulação de fundo ou vaga de vento de Sudeste/Levante **com mar mexido** = mar de fora impossível (limo) → robalo 1/5 nesses pesqueiros. Norte/Noroeste = mar limpo. Oeste/Sudoeste: avaliar pela intensidade e estado do mar, sem assumir limo.
   - Molhe: vaga/ondulação de Sudeste → lado poente; de Oeste/Sudoeste → lado nascente. O lado segue a direcção da vaga/ondulação; o vento só decide quando não há vaga relevante. Avisar sempre que o lado abrigado pode acumular limo à deriva. **Robalo no molhe com Sudeste e mar mexido: nota normal pela potência, para o lado poente, com o aviso de limo** (decisão 2b, 14/10/2026) — o limo não baixa a nota no molhe.
   - **Mar de Sul [157,5°, 202,5°): «por confirmar»** (14/10/2026; a regra só fala de Oeste/Sudoeste e o utilizador vai confirmar no terreno). Molhe: lado «por confirmar». Praias (decisão c): robalo com P ≥ 1,5 kW/m «por confirmar» se todas as horas com P ≥ 1,5 do período tiverem onda dominante de Sul; basta uma fora do Sul para a base 4. «Mar de» = onda dominante (maior Hs² × T, Hs ≥ 0,2 m); o vento não conta. Faixa em `config.json` (`mar.sulPorConfirmarGraus`): retirar quando houver decisão. Não muda o limo.
   - O limo só conta enquanto houver Sudeste com mar mexido; não persiste nos dias seguintes (decisão 4a, 14/10/2026). Vento a 0 nós não tem direcção e não conta como componente.
3. **Vento e ondulação** — analisar sempre separadamente vento local, ondulação de fundo e vaga de vento. **Qualquer componente com período < 6 s é vaga de vento**, mesmo que a fonte a classifique como swell.
4. **Marés (Ria Formosa)** — amplitude em metros (nunca coeficientes):
   - > 3 m (vivas): Ria inútil para dourada; apostar no robalo no mar/bicos nos repontos, se não houver limo.
   - 2–3 m (intermédia): dourada possível na Ria nos repontos; robalo viável no mar.
   - < 2 m (mortas): excelente para dourada na Ria.
5. **Potência** — hora a hora: `P ≈ 0,49 × Hs² × T` (kW/m), Hs total e T da **mesma hora**. Usar período médio (ou de energia). Na prática a app usa o `wave_period` do Open-Meteo: um período disponibilizado pela fonte, **com definição espectral por confirmar** (não se identifica como Tm02, Tm−1,0 nem período de energia), usado como **indicador provisório** (revisão de 20/11/2026); a fórmula e os limiares não mudam. Se não houver → `não obtido` (o período de pico **não** o substitui: decisão do utilizador de 20/11/2026). É um indicador de águas profundas, não a energia na rebentação. Mostrar máximo do dia e hora. **P < 1 kW/m → robalo obrigatoriamente 1/5.**
6. **Pressão** — descida ≥ 5 hPa em 24 h = peixe activo. Pressão alta e estável = menos actividade.
7. **Temperatura da água** — dourada prefere ~20 ºC. Comparar com a semana anterior (histórico da fonte). Sem histórico → "comparação não possível". Descida ≥ 2 ºC afasta a dourada.
8. **Água doce** — chuva forte nos dias anteriores → avisar Ria turva / excesso de água doce, mesmo em marés mortas; o mesmo na foz da ribeira do Almargem e no molhe. **Chuva forte = ≥ 20 mm nas 48 h antes do dia** (decisão 1a, 14/10/2026; provisório). No Open-Meteo, `precipitation` é a soma da hora anterior.
9. **Alinhamento prioritário** — reponto de maré a ≤ ~1 h do nascer ou pôr do Sol → destacar no topo.
10. **Valores anómalos** — ex.: rajada > 3× o vento médio → assinalar "confirmar antes de sair". **Só com vento médio ≥ 5 nós** (decisão 3b, 14/10/2026): com brisa fraca a razão dispara sem significado.
11. **Dourada no molhe** — viável só com P < 1,5 kW/m (*provisório*) e sem água turva por chuva forte; senão 1/5. A amplitude não bloqueia este pesqueiro; os repontos são as melhores janelas.
12. **Dourada nas praias** (decisão do utilizador, 14/10/2026, opção a) — as regras da dourada no molhe (base 3; +1 alinhamento; +1 descida de pressão; −1 pressão alta e estável; −1 descida da água; P ≥ 1,5 kW/m → 1, *provisório*) **mais o limo das praias** (Sudeste com mar mexido → 1). A água turva por chuva (−2 e limite → 1) só conta onde há foz de ribeira (`aguaDoce` no config: Almargem). A temperatura da água vem do ponto do mar de cada praia.

---

## 6. Decisões aprovadas na Fase 1

- **Período para a potência:** o `wave_period` do Open-Meteo da mesma hora (indicador provisório: a definição espectral não está confirmada; no código, `periodo` e `fontePeriodo: "wave_period (Open-Meteo)"`); se faltar → `não obtido`. (Até 20/11/2026 havia o recurso ao período de pico, com aviso; o utilizador retirou-o nessa data, por proposta da revisão do ChatGPT: um período de pico não é o período de energia que a fórmula de 0,49 pede.)
- **Amplitude:** arredondar a 0,01 m; < 2,00 morta; 2,00–3,00 inclusive intermédia; > 3,00 viva.
- **Notas (tudo provisório, em `config.json`, limitar a 1–5, mostrar as parcelas):**
  - Dourada Ria: base 4 (morta) / 3 (intermédia) / 1 (viva); +1 alinhamento; +1 descida de pressão ≥ 5 hPa/24 h; −1 pressão alta e estável (≥ 1020 hPa e variação < 2 hPa/24 h); −1 descida da água ≥ 2 ºC; −2 água turva por chuva.
  - Dourada molhe: base 3; mesmos ajustes; limite obrigatório da regra 11.
  - Robalo mar: P < 1 → 1; 1 ≤ P < 1,5 → 3; P ≥ 1,5 com N/NO ou O/SO sem limo → 4; +1 alinhamento; +1 descida de pressão ≥ 5 hPa.
  - Limites obrigatórios sobrepõem-se à soma.
- **Dados em falta:** potência não obtida → robalo `n.d.` (nunca 1/5 por defeito).
- **Avisos IPMA:** retirados (regra 1).
- **Mar mexido:** avaliado no mar **total**. Com mar mexido, há limo se **qualquer** componente (vento, fundo, vaga) vier do sector Levante/Sudeste.
- **Sectores (provisórios):** Levante/Sudeste [67,5°, 157,5°); Sul/Sudoeste/Oeste [157,5°, 292,5°); Norte/Noroeste [292,5°, 67,5°) atravessando 0°. Intervalos semi-abertos.
- **Lado do molhe com componentes em conflito:** decide a de maior energia (Hs² × T); se nenhuma tiver Hs ≥ 0,2 m (provisório), decide o vento.
- **Alcance:** cada fonte mostrada até onde existir; dias seguintes marcados "fora do alcance de <fonte>".
- **Marés vivas/mortas da "próxima semana":** mesmos limiares de amplitude, aplicados à tabela local.
- **Notas por período (decisão B, opção C, 14/10/2026):** potência, limo e alinhamento avaliados por período — madrugada 00–06, manhã 06–12, tarde 12–18, noite 18–24 (hora de Lisboa; provisório). Pressão, água e amplitude são diárias. A nota do dia é a do melhor período, com o nome do período.
- **Notas incompletas (revisões do ChatGPT, 14/10/2026):** a nota mostra todas as parcelas (aplicada / não aplicada / não avaliada), `completa` e o `intervalo` possível (o que as parcelas por avaliar podiam somar ou tirar). Um limite obrigatório já aplicado decide, mesmo com outro por verificar. Período `n.d.` → a nota do dia é a melhor conhecida, com `periodosSemNota` e intervalo até 5. A nota mais alta ganha mesmo incompleta (política da secção 6); a interface mostra sempre a incompletude.
- **Melhores dias:** ordenar pela nota máxima do dia; desempate por alinhamento, depois nota da outra espécie, depois o dia mais próximo.
- **Sol e Lua:** só SunCalc (local). Não usar sunrise/sunset do Open-Meteo.
- **Registos:** IndexedDB + exportar/importar JSON versionado + lembrete de cópia de segurança (30 dias).
- **Proveniência:** cada valor tem `value`, `unit`, `source`, `readAt`, `validAt`, `tipo` (observado/previsto/calculado), `status` (obtido/não obtido/inválido), `provisional`.

---

## 7. Correcções obrigatórias à Fase 2 (revisão já feita)

Críticos (verificados):
1. **Horas dos avisos IPMA**: `startTime`/`endTime` vêm **sem fuso** (ex.: `"2026-10-04T08:43:00"`) e são **UTC**. `new Date()` lê-os como hora local do aparelho. Testado: com `TZ=Europe/Lisbon`, `utcToLisbon("2026-10-04T08:43:00")` devolve 08:43 em vez de 09:43. → Parser próprio que acrescenta `Z` quando falta fuso + testes em vários `TZ`.
2. **URL do estado do mar IPMA errado** (em `ipma-mar.js` e `config.json`). Correcto: `https://api.ipma.pt/open-data/forecast/oceanography/daily/hp-daily-sea-forecast-day{0,1,2}.json`.

Importantes:
3. Open-Meteo: pedir `timeformat=unixtime` → instantes absolutos. A hora local é ambígua a 25/10/2026 (01:00–02:00 repete-se). Fixture com a hora repetida.
4. `leitura()`: NaN/Infinity ficam `value=null` mas `status="obtido"`. Devem ficar `inválido`; null/undefined → `não obtido`.
5. Fixture de avisos com formato real: `awarenessLevelID` = `green|yellow|orange|red`; horas sem `Z`. Mapear níveis num único sítio.
6. `sw.js`: network-first para `*.json` (config, marés); cache-first só para a shell; versionar o nome da cache.
7. `app.js`: consultar também Quarteira (marine + forecast).

Menores:
8. Remover `wind_gusts_unit` (não existe; rajadas seguem `wind_speed_unit`).
9. URLs numa só fonte (ler de `config.json` ou retirar do config).
10. Sectores semi-abertos com tratamento 360°/0° e testes nos limites 67,5 / 157,5 / 292,5.
11. IPMA estado do mar: validar `forecastDate` = dia pedido; senão `não obtido (desactualizado)`. (Observado: a 08/10 o `day0` ainda tinha `forecastDate` 07/10.)

---

## 8. Fases seguintes

Estado a 20/11/2026: Fases 3 e 4 feitas (falta a «próxima semana»); a Fase 5 corresponde aos PR 5 e 6 do plano de evolução (secção 2).

- **Fase 3 — Motor de regras** (`js/regras/*.js`, funções puras sem rede nem storage) + testes de fronteira: P 0,99/1,0/1,5; amplitude 1,99/2,00/3,00/3,01; período 5,9/6,0 s; sectores nos limites; rajada 3×; DST 25/10.
- **Fase 4 — Interface móvel** (obrigatório, pedido nas revisões da Fase 3: nunca mostrar uma nota incompleta como definitiva — mostrar `completa`, o `intervalo`, os `periodosSemNota`, as parcelas não avaliadas com o motivo, e os estados `n.d.` e «por confirmar»): resumo de 3 linhas (melhores dias/horas/pesqueiros) + alinhamentos; tabela "Mar e vento" (Faro e Quarteira: vento dir/vel/rajada; fundo e vaga separadas; potência máx. e hora); tabela "Marés e outros" (PM/BM, amplitude, nascer/pôr, pressão e tendência, água); análise por dia terminando em `[Robalo: X/5] | [Dourada: Y/5]`; "próxima semana" (Lua, próximas vivas/mortas). Cada valor com fonte e hora de leitura. Hora legal de Portugal continental. Alojamento: Cloudflare Workers (secção 2).
- **Fase 5 — Diário de saídas**: formulário (data, pesqueiro, hora, capturas, notas) que grava as condições do momento; ecrã que compara registos com condições e sugere ajustes aos valores provisórios, separando "confirmado pelos registos" de "hipótese". Os registos nunca alteram limiares automaticamente.
- **Fase 6 (opcional)** — proxy mínimo Cloudflare Worker só se alguma API bloquear CORS no browser (o proxy não calcula nada).

---

## 9. Fontes — factos verificados

| Fonte | Endpoint | Notas verificadas |
|---|---|---|
| Open-Meteo Marine | `https://marine-api.open-meteo.com/v1/marine` | Variáveis: `wave_height`, `wave_direction`, `wave_period`, `wind_wave_*`, `swell_wave_*`, `sea_surface_temperature`. `wave_peak_period` é aceite mas vem **null e sem unidade** (`undefined`; confirmado a 20/11/2026 em 336 h e 3 pontos). `swell_wave_peak_period` e `wind_wave_peak_period` têm valores só até ~3,8 dias à frente (depois `null`); o `wind_wave_peak_period` **não é constante** (1–6,3 s, cresce com a altura da vaga de vento; 1 s quando ela é ~0; a amostra de 4 h que parecia constante era de mar sem vaga de vento). A app **deixou de pedir** o `wave_peak_period` (20/11/2026): o utilizador retirou o recurso ao período de pico na potência (período de pico ≠ período médio ou de energia). `swell_wave_peak_period` e `wind_wave_peak_period` são de uma componente só: não servem para a potência. `wave_period` é «período entre as ondas» segundo a documentação, sem dizer que momento espectral: **não se identifica** como Tm02, Tm−1,0 nem período de energia (a comparação de 20/11/2026 com o IBI é só um indício); a regra 5 usa-o como indicador provisório. `past_days` são **previsões arquivadas, não medições** (a comparação da água da regra 7 usa-as; o cartão di-lo). Por confirmar na documentação que período é o `wave_period`. Componentes "swell" com T < 6 s são frequentes aqui → tratar como vaga (regra 3). `past_days` dá histórico para a regra 7. `cell_selection=sea` não muda nada: testado a 20/11/2026 nos 8 pontos de mar e no ponto antigo da Falésia, mesmas células e valores. Grelha de 1/12° (~9 km); células dos pontos (17/11/2026): Faro mar 36,958/−7,958; Praia de Faro e Ancão 36,958/−8,042; Forte Novo, molhes e Vilamoura 37,042/−8,125; Falésia ao largo 37,042/−8,125 (o ponto da praia, na costa, caía em 37,125/−8,125, centro em terra). |
| Open-Meteo Forecast | `https://api.open-meteo.com/v1/forecast` | `wind_speed_10m`, `wind_direction_10m`, `wind_gusts_10m`, `pressure_msl`, `precipitation`; `wind_speed_unit=kn`. |
| IPMA avisos (**não usado**: regra 1 retirada) | `https://api.ipma.pt/open-data/forecast/warnings/warnings_www.json` | Array; filtrar `idAreaAviso=="FAR"` e `awarenessTypeName=="Agitação Marítima"`; níveis `green/yellow/orange/red`; horas UTC sem `Z`; alcance ~3 dias. |
| IPMA estado do mar (**retirado a 20/11/2026**, decisão do utilizador: só aparecia no diagnóstico, sem informação útil; só volta como funcionalidade explícita, com atribuição e validação) | `https://api.ipma.pt/open-data/forecast/oceanography/daily/hp-daily-sea-forecast-day{0,1,2}.json` | Faro = `globalIdLocal 1080526` (lat 37.1933, lon -8.0). **Não há ponto em Quarteira.** Campos: `waveHighMin/Max`, `wavePeriodMin/Max`, `predWaveDir`, `sstMin/Max`, `totalSeaMin/Max`. Só referência diária. |
| Marés | `mares/2026.json` e `mares/2027.json` (local; a app lê os anos que a janela toca e confere a passagem de ano) | Fonte oficial: **Instituto Hidrográfico, Faro-Olhão** (Tabela de Marés 2026 e 2027, Vol. I, págs. 2-121 a 2-124 = páginas 143–146 do PDF). 2027: publicada a 05/11/2026 em loja.hidrografico.pt («Publicações digitais», grátis), SHA-256 `18352857…ab432c4`, licença **CC BY-NC-ND 4.0** (2026: «© Copyright IH»); PMmáx. 3,76 m (22/02 03:23), BMmín. 0,22 m (01/09 20:56); marégrafo da Culatra desactivado. Horas em **TU (UTC)**; alturas ao **zero hidrográfico** (2,00 m abaixo do NM, Cascais 1938); resolução 0,1 m; marégrafo no cais da Culatra (dentro da Ria). Convertida com `ferramentas/mares_ih.py`. O IH publica concordâncias para portos secundários (págs. 3-2/3-3): **Barra do Ancão** −0 h 03 a +0 h 13 em relação a Faro-Olhão → a tabela de Faro-Olhão serve para o mar de fora. (Não usar as marés do IHM espanhol: numa comparação de 15/10/2026 estavam 40–55 min adiantadas em relação ao IH.) Não usar `sea_level_height` do Open-Meteo. tabuademares.com (tem página de Quarteira) e MeteoConsult servem só para conferir; não fazer scraping. |
| COSMO (APA) — fundo do mar | Páginas `https://cosmo.apambiente.pt/prd/<produto>`; ficheiros só com conta (registo grátis) | Levantamentos topo-hidrográficos (multifeixe, feixe simples, LiDAR em baixa-mar, GNSS-RTK). DEM GeoTIFF COG, **EPSG:3763**, 0,30 m, cotas ao **zero hidrográfico** (2 m abaixo do NMM, a mesma referência da tabela de marés), sem dados = −9999. Ficha: acesso limitado (INSPIRE art. 13(1)(d)), utilização «Sem restrições», citar «Agência Portuguesa do Ambiente. Programa COSMO». Praia de Faro: `LTHFA1_20250617_DEM` (17/06/2025; 2,3 km de praia entre 37,0099/−7,9996 e 36,9969/−7,9798; o ponto de pesca fica ~0,7 km a NO, fora). Quarteira–Garrão: `LTHQUGA1_20250612_20250616_DEM` (12–16/06/2025, antes do enchimento de 2026; do molhe do porto de Quarteira, −8,1165, ao Garrão, −8,048: apanha o Almargem/Forte Novo e o molhe; o Ancão fica ~0,8 km a nascente, fora). Barreta–Ilha do Farol: `LTHBAIF1_20201023_20201029_DEM` (barra de Faro-Olhão e os dois molhes; cotas até −50 m; sem dados = −99999). Culatra–Armona: `LTHCUAR2_20201015_20201125_DEM` (barra da Armona). Sem levantamento: Ancão, Vilamoura, Falésia. |
| LiDAR 2011 do IH (EMODnet) | `https://downloads.emodnet-bathymetry.eu/high_resolution/590_HR_Lidar_Algarve.emo.zip` (ficha `SDN_CPRD_590_HR_Lidar_Algarve`) | Modelo de terreno costeiro do Algarve (−9,02 a −7,16), LiDAR de 2011 (projecto DGT/APA, IH). Grelha de 1/128 de minuto (~12 × 14 m); o `.emo` dá **profundidade** (positiva abaixo da referência), não cota; referência LAT segundo a ficha (IH, Tabela de Marés 2026, §1.06: o ZH fica abaixo da LAT; a LAT não passa da baixa-mar mínima de nenhum ano, em Faro-Olhão 0,34 m em 2026 e 0,22 m em 2027 → a LAT fica 0 a 0,22 m acima do ZH; a app mostra intervalos com este limite, `datum`/`latAcimaZhM` nos ficheiros, e nunca uma correcção constante); utilização pública, «DO NOT USE FOR NAVIGATION». O `.nc` do mesmo zip tem as cotas vazias: usar o `.emo`. A grelha tem de usar a origem dos próprios pontos (com outra origem aparecem colunas vazias). Confronto com o COSMO 2025 (células de 3 m): zonas fundas +0,08 m (Faro) e +0,25 m (Quarteira); junto à praia de Quarteira +0,8 a +1,5 m (a praia emagreceu). Na Praia de Faro não mostra a cava e o banco que o COSMO 2025 mede: serve para a profundidade geral, não para localizar bancos. Cobre Ancão, Vilamoura e Falésia (sem COSMO). |
| Sentinel-2 L2A (Copernicus, via Element84 Earth Search) | Catálogo STAC `https://earth-search.aws.element84.com/v1/search`; ficheiros COG em `https://sentinel-cogs.s3.us-west-2.amazonaws.com/sentinel-s2-l2a-cogs/<zona>/<banda>/<quadrícula>/<ano>/<mês>/<cena>/B0x.tif` | Quadrícula **29SNB** (cobre 36,95–37,95 N: toda a costa Faro–Falésia). A Element84 marca `earthsearch:boa_offset_applied`, mas o valor bruto **pode ainda trazer** a compensação de +1000 (cena de 14/06/2025: águas fundas ≈ 1000) ou não (cenas de 2026: ≈ 0): decidir pela mediana do infravermelho em águas fundas. A correcção atmosférica L2A sobre a água deixa reflectâncias negativas (ruído): a razão de Stumpf falhou; o modelo de Lyzenga com as águas fundas como referência funciona. Cena de 14/10/2026 sem dados nesta zona. Licença: uso livre, «contém dados Copernicus Sentinel modificados». |
| OpenStreetMap (mosaicos) | `https://tile.openstreetmap.org/{z}/{x}/{y}.png` | Política de uso: atribuição e **Referer obrigatório** (o `_headers` manda `Referrer-Policy: same-origin`, por isso o Leaflet usa `referrerPolicy: strict-origin-when-cross-origin`). |
| DGT OrtoSat 2023 (satélite) | WMS `https://ortos.dgterritorio.gov.pt/wms/ortosat2023`, camada `ortoSat2023-CorVerdadeira` | Capacidades (19/11/2026): EPSG:3857 aceite, «Fees: no conditions apply», «AccessConstraints: None». Respondeu às primeiras chamadas e depois passou a cortar as ligações deste ambiente (após ~32 pedidos seguidos): usar quadrados de 512 px e não o pôr por omissão. |
| Sol e Lua | SunCalc em `vendor/` | Cálculo local. |
| Boia de Faro (IH) | `https://ogcapi.hidrografico.pt/collections/buoys_datawell/locations/20` (OGC API EDR, `f=json`, `datetime=início/fim` em UTC) | Boia ondógrafo costeira CSA82/D (`id_est` 20), 36,9048 / −7,8984, 90 m de fundo, a ~6 km do Cabo de Santa Maria. CoverageJSON `PointSeries`; horas em UTC com `Z`; amostragem de 30 min; janela móvel de 15 dias. Campos: `wave_hm0` (Hs), `wave_hmax`, `wave_tp` (pico), `wave_tm02` (período médio espectral), `wave_thtp` (direcção no pico), `sea_water_temperature`, cada um com `_qc` (SeaDataNet L20: 1 bom, 2 provavelmente bom, 4 mau, 9 em falta com sentinela 99,99/999). A API aceita pedidos do browser (CORS). Licença das observações: CC BY-NC 4.0. **Observado: só se mostra («Mar agora»), não entra nas notas.** Comparada com o Open-Meteo (15–17/11/2026, 114 h): Hs igual (diferença média 0,07 m); o `wave_period` do Open-Meteo dá +2,2 s face ao Tm02 (grandezas diferentes e células diferentes: **não é erro do modelo**; «Mar agora» mostra-os lado a lado com o nome de cada um e a célula, sem diferença); água do Open-Meteo 1,1 °C abaixo. A boia oceânica de Faro (CSA81) está desligada desde 01/05/2026. |

**Avaliadas a 20/11/2026, não usadas** (relatório de viabilidade e revisão do ChatGPT; nenhuma muda as notas sem decisão do utilizador):
- **IH HYCOM** (`/collections/hycom/position`, CC BY 4.0, 3 h, 7 dias, `sst` em K): nos pontos de pesca a célula mais próxima é terra (−1×10³⁴); só há valores 2–7 km ao largo. Só informativo.
- **IH WW3** (`/collections/ww3/position`, CC BY 4.0, 6 h, 6 dias): só `hs`, `tp`, `dp` (sem período médio nem de energia). Não comparar o `tp` com o Tm02 da boia.
- **IH marégrafos** (`tide_obs_nrt`): nenhum activo em Faro-Olhão (o mais perto é VRSA).
- **IPMA observações** (`observation/meteorology/stations/observations.json`): 24 h, ~1 MB (todas as estações), chaves `AAAA-MM-DDThh:mi` **sem fuso** (não documentado; no Inverno não se distingue), −99 = sem dados, vento em classes. **Não dá 48 h**: não serve à regra 8. Termos (api.ipma.pt): uso sem fins lucrativos, citar a fonte, símbolo e ligação ao IPMA nas páginas, e-mail a webmaster@ipma.pt a informar do uso.
- **IPMA precipitação diária por concelho** (`observation/climate/precipitation/prec-p1d-continental-obssup-idw-concelhos-20d.csv`, testado a 20/11/2026): CSV de ~650 KB (278 concelhos × 20 dias), CORS `*`, actualizado de madrugada (03:10 UTC; último dia = ontem). Interpolação (IDW) das estações automáticas. `time` = `AAAA-MM-DD 00:00:00+00:00`, mas a documentação **não diz que período cobre** (00–24 UTC ou outro). `mean/std/min/max/percentis_tp` em mm: parecem estatísticas **espaciais** dentro do concelho (não confirmado); a 11/11/2026 Loulé ia de 31 a 49 mm. `maxprate` (mm/h) tem valores incoerentes com o total (até 117 mm/h; 171 casos com taxa > 1 mm/h e total < 0,1 mm): não usar. Concelhos: Faro (Ria, Praia de Faro), Loulé (Ancão a Vilamoura), Albufeira (Falésia), por conferir na CAOP. Só contexto: não entra na regra 8.
- **Copernicus Marine IBI WAV** (`IBI_ANALYSISFORECAST_WAV_005_005`, 0,027°, horário, até ~8 dias; testado a 20/11/2026 por WMTS `https://wmts.marine.copernicus.eu/teroWmts`, `GetFeatureInfo` em JSON, sem conta, CORS lido pela página publicada). Lat/lon não se pedem directamente: converter em quadrícula e píxel (EPSG:4326, nível z = 180/2^z graus por quadrícula de 256 px). A resposta traz `variableId`, `datasetId`, `value` e `units` (`s`, `m`), mas **não traz a hora**; uma hora fora da grelha é aceite **sem aviso** e arredondada à hora mais próxima (12:10 → 12:00; 12:30 → 13:00); fora do intervalo dá HTTP 400. As coordenadas do `geometry` vêm como [lat, lon]: usar `properties.lat/lon`. Um valor por pedido (~0,7 s; intervalos de tempo dão 400). **Todos os pontos de pesca caem em células de terra**; células de mar a 1,5–4,9 km. Junto à boia, 14 dias de 3 em 3 h (111 pares): `VTM02` − Tm02 +0,03 s (erro 0,53 s, correlação 0,90); `VHM0` − Hm0 −0,09 m (erro 0,30 m, correlação 0,97). O `wave_period` do Open-Meteo, nas mesmas horas, fica +0,43 s acima do `VTM10` (correlação 0,93) e +2,46 s acima do `VTM02`: **indício** de que é um período de energia (Tm−1,0), não prova. Segundo a revisão do ChatGPT, o QUID valida o Tm02 mas **não o Tm−1,0**: só experimental.
- CORS confirmado num Chromium a partir de `https://pesca-app.cavacofml.workers.dev` (20/11/2026): IH HYCOM, WW3, boias, IPMA observações e Open-Meteo respondem 200 e são lidos pela página.

Rede: no ambiente do Claude Code, o `fetch` do Node só passa pelo proxy com `NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt`. O Open-Meteo Forecast pode responder HTTP 429 (limite gratuito, partilhado pelo IP do ambiente).

Não usar como fonte de dados (decidido): Windguru (sem API pública; os cartões têm ligações «vento agora» às estações 3324 Praia de Faro, 3370 Quarteira e 15198 Vilamoura), Beachcam (só ligações às câmaras), Facebook.

---

## 10. Critérios de aceitação gerais

- Nenhum número na interface sem fonte, hora de leitura e `tipo`.
- Falha de uma fonte nunca bloqueia as outras.
- Todas as horas apresentadas em `Europe/Lisbon`; cálculos sobre instantes absolutos.
- `node --test` verde, offline, em CI.
- README em português: como publicar (Cloudflare), instalar no telemóvel, actualizar a tabela de marés e editar os limiares provisórios.
