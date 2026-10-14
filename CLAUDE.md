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
- **Fase 4 (interface): em curso.** Parte 1 (PR #3, aprovada pelo utilizador sem revisão do ChatGPT): ecrã inicial com cartões por pesqueiro, publicação no Cloudflare. Falta: ecrã de cada pesqueiro (tabela hora a hora, curva de maré), mapa, «próxima semana».
- **Alojamento (14/10/2026): Cloudflare Workers** (site estático), projecto `pesca-app`, ramo de produção `main`, endereço **https://pesca-app.cavacofml.workers.dev/** (no ar desde o merge do PR #3). O domínio `workers.dev` está bloqueado na rede do ambiente do Claude Code, salvo se o utilizador o autorizar. `wrangler.jsonc` corre `ferramentas/publicar.mjs`, que publica só a app — **nunca a pasta `recolha/`** (o site é público; o repositório é privado por causa do material da Fizk).
- **Molhes (14/10/2026):** há dois — o do porto de pesca de Quarteira (pesqueiro 5) e o da marina de Vilamoura (favorito «Vilamoura» da Fizk; coordenadas do utilizador em `config.locais.vilamouraMolheOeste`). Por decidir: Vilamoura como pesqueiro à parte e com que regras; coordenadas exactas do molhe de Quarteira (proposta: farolim do molhe este, 37,0666, −8,1100, segundo o Wikimedia).
- **Objectivo alargado (14/10/2026):** o utilizador quer uma app **como a Fizk** (fizk.com), em português, melhorada e só para uso pessoal; **web app** (PWA) para **Android**. Ecrãs "iguais à Fizk" (cartões de favoritos com nota, mapa, meteograma hora a hora, curva de maré, comparador, diário…), mas com as regras e fontes deste projecto. Não copiar código, imagens, marca nem camadas pagas da Fizk; a pasta `recolha/` serve só de referência.

Estrutura actual (Fase 2):

```
index.html  manifest.webmanifest  sw.js  config.json  README.md
css/base.css
js/app.js  js/normalizacao.js
js/fontes/{http,open-meteo-marine,open-meteo-forecast,ipma-avisos,ipma-mar,mares-locais,suncalc}.js
mares/2026.json        (vazio de propósito — aguarda tabela oficial)
testes/dados-teste.js  (fixtures offline)
```

---

## 3. Primeiros passos (por esta ordem)

1. **Perguntar ao utilizador** o nome do repositório GitHub e se é público ou privado (GitHub Pages grátis exige público, salvo plano pago). Não criar nada sem confirmação.
2. Descompactar o zip da Fase 2 na raiz, fazer o commit inicial "Fase 2 — base entregue (ChatGPT), sem alterações".
3. Criar ramo `correcoes-fase2`, aplicar a secção 7 com testes, abrir PR.
4. Só depois avançar para a Fase 3.

Regras de trabalho:
- Commits pequenos e descritivos em português. Um PR por fase.
- Antes de assumir algo ambíguo numa regra: **perguntar**. Não escolher em silêncio.
- Sem dependências de runtime nem build. Testes com `node --test` (Node ≥ 20, sem pacotes) e um `testes/runner.html` opcional para o browser. Os testes têm de correr **sem Internet**.
- GitHub Actions: workflow que corre `node --test` em cada push/PR. Publicação: Cloudflare (secção 2), a cada merge para `main`.
- Bibliotecas de terceiros (ex.: SunCalc, licença BSD-2) ficam em `vendor/` com o ficheiro de licença.

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
| 2 | Praia de Faro (mar de fora) + bicos das barras | robalo | Ponto Fizk «Faro - Mar Poente» 37.0133, -8.00567 |
| 3 | Praia do Ancão (mar de fora, Loulé) + bico da barra do Ancão | robalo | Ponto Fizk «Ancão» 37.0322, -8.03852 |
| 4 | Praia do Almargem (mar de fora, Quarteira, Loulé) | robalo | Ponto Fizk «Forte Novo» 37.062, -8.09016 (a Fizk não tem Almargem). O utilizador pesca só do lado do mar. **Não** mostrar avisos sobre a reserva natural. |
| 5 | Molhe de Quarteira | robalo e dourada | Lado **poente** (Vilamoura) ou **nascente** (praia de Quarteira) |

Coordenadas (config, decisão C de 14/10/2026): **praias com os pontos da Fizk** (acima), o mesmo ponto para ondulação e vento. Ria e molhe não têm ponto na Fizk: ficam Faro terra 37.01,-7.93 (Ria; água de Faro mar 36.97,-7.98) e Quarteira mar 37.05,-8.10 / terra 37.07,-8.10 (molhe) até o utilizador dar coordenadas. Os bicos usam o ponto da sua praia (sem a regra de segurança, deixaram de ser pesqueiros separados).

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
5. **Potência** — hora a hora: `P ≈ 0,49 × Hs² × T` (kW/m), Hs total e T da **mesma hora**. Usar período médio (ou de energia); se não houver, período de pico com aviso. Mostrar máximo do dia e hora. **P < 1 kW/m → robalo obrigatoriamente 1/5.**
6. **Pressão** — descida ≥ 5 hPa em 24 h = peixe activo. Pressão alta e estável = menos actividade.
7. **Temperatura da água** — dourada prefere ~20 ºC. Comparar com a semana anterior (histórico da fonte). Sem histórico → "comparação não possível". Descida ≥ 2 ºC afasta a dourada.
8. **Água doce** — chuva forte nos dias anteriores → avisar Ria turva / excesso de água doce, mesmo em marés mortas; o mesmo na foz da ribeira do Almargem e no molhe. **Chuva forte = ≥ 20 mm nas 48 h antes do dia** (decisão 1a, 14/10/2026; provisório). No Open-Meteo, `precipitation` é a soma da hora anterior.
9. **Alinhamento prioritário** — reponto de maré a ≤ ~1 h do nascer ou pôr do Sol → destacar no topo.
10. **Valores anómalos** — ex.: rajada > 3× o vento médio → assinalar "confirmar antes de sair". **Só com vento médio ≥ 5 nós** (decisão 3b, 14/10/2026): com brisa fraca a razão dispara sem significado.
11. **Dourada no molhe** — viável só com P < 1,5 kW/m (*provisório*) e sem água turva por chuva forte; senão 1/5. A amplitude não bloqueia este pesqueiro; os repontos são as melhores janelas.

---

## 6. Decisões aprovadas na Fase 1

- **Período para a potência:** período médio total da mesma hora; se faltar, período de pico com aviso "calculado com período de pico"; se faltarem os dois → `não obtido`.
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

- **Fase 3 — Motor de regras** (`js/regras/*.js`, funções puras sem rede nem storage) + testes de fronteira: P 0,99/1,0/1,5; amplitude 1,99/2,00/3,00/3,01; período 5,9/6,0 s; sectores nos limites; rajada 3×; DST 25/10.
- **Fase 4 — Interface móvel** (obrigatório, pedido nas revisões da Fase 3: nunca mostrar uma nota incompleta como definitiva — mostrar `completa`, o `intervalo`, os `periodosSemNota`, as parcelas não avaliadas com o motivo, e os estados `n.d.` e «por confirmar»): resumo de 3 linhas (melhores dias/horas/pesqueiros) + alinhamentos; tabela "Mar e vento" (Faro e Quarteira: vento dir/vel/rajada; fundo e vaga separadas; potência máx. e hora); tabela "Marés e outros" (PM/BM, amplitude, nascer/pôr, pressão e tendência, água); análise por dia terminando em `[Robalo: X/5] | [Dourada: Y/5]`; "próxima semana" (Lua, próximas vivas/mortas). Cada valor com fonte e hora de leitura. Hora legal de Portugal continental. Deploy: decidir alojamento (repositório privado).
- **Fase 5 — Diário de saídas**: formulário (data, pesqueiro, hora, capturas, notas) que grava as condições do momento; ecrã que compara registos com condições e sugere ajustes aos valores provisórios, separando "confirmado pelos registos" de "hipótese". Os registos nunca alteram limiares automaticamente.
- **Fase 6 (opcional)** — proxy mínimo Cloudflare Worker só se alguma API bloquear CORS no browser (o proxy não calcula nada).

---

## 9. Fontes — factos verificados

| Fonte | Endpoint | Notas verificadas |
|---|---|---|
| Open-Meteo Marine | `https://marine-api.open-meteo.com/v1/marine` | Variáveis: `wave_height`, `wave_direction`, `wave_period`, `wind_wave_*`, `swell_wave_*`, `sea_surface_temperature`. `wave_peak_period` veio **null** nestes pontos. Confirmar na documentação que `wave_period` é o período médio. Componentes "swell" com T < 6 s são frequentes aqui → tratar como vaga (regra 3). `past_days` dá histórico para a regra 7. |
| Open-Meteo Forecast | `https://api.open-meteo.com/v1/forecast` | `wind_speed_10m`, `wind_direction_10m`, `wind_gusts_10m`, `pressure_msl`, `precipitation`; `wind_speed_unit=kn`. |
| IPMA avisos (**não usado**: regra 1 retirada) | `https://api.ipma.pt/open-data/forecast/warnings/warnings_www.json` | Array; filtrar `idAreaAviso=="FAR"` e `awarenessTypeName=="Agitação Marítima"`; níveis `green/yellow/orange/red`; horas UTC sem `Z`; alcance ~3 dias. |
| IPMA estado do mar | `https://api.ipma.pt/open-data/forecast/oceanography/daily/hp-daily-sea-forecast-day{0,1,2}.json` | Faro = `globalIdLocal 1080526` (lat 37.1933, lon -8.0). **Não há ponto em Quarteira.** Campos: `waveHighMin/Max`, `wavePeriodMin/Max`, `predWaveDir`, `sstMin/Max`, `totalSeaMin/Max`. Só referência diária. |
| Marés | `mares/2026.json` (local) | Fonte oficial: **Instituto Hidrográfico, Faro-Olhão** (Tabela de Marés 2026, Vol. I, págs. 2-121 a 2-124). Horas em **TU (UTC)**; alturas ao **zero hidrográfico** (2,00 m abaixo do NM, Cascais 1938); resolução 0,1 m; marégrafo no cais da Culatra (dentro da Ria). Convertida com `ferramentas/mares_ih.py`. O IH publica concordâncias para portos secundários (págs. 3-2/3-3): **Barra do Ancão** −0 h 03 a +0 h 13 em relação a Faro-Olhão → a tabela de Faro-Olhão serve para o mar de fora. (As marés da Fizk vêm do IHM espanhol e estão 40–55 min adiantadas: não usar.) Não usar `sea_level_height` do Open-Meteo. tabuademares.com (tem página de Quarteira) e MeteoConsult servem só para conferir; não fazer scraping. |
| Sol e Lua | SunCalc em `vendor/` | Cálculo local. |

Rede: no ambiente do Claude Code, o `fetch` do Node só passa pelo proxy com `NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt`. O Open-Meteo Forecast pode responder HTTP 429 (limite gratuito, partilhado pelo IP do ambiente).

Não usar como fonte de dados (decidido): Windguru (sem API pública; os cartões têm ligações «vento agora» às estações 3324 Praia de Faro, 3370 Quarteira e 15198 Vilamoura), Beachcam (só ligações às câmaras), Facebook.

---

## 10. Critérios de aceitação gerais

- Nenhum número na interface sem fonte, hora de leitura e `tipo`.
- Falha de uma fonte nunca bloqueia as outras.
- Todas as horas apresentadas em `Europe/Lisbon`; cálculos sobre instantes absolutos.
- `node --test` verde, offline, em CI.
- README em português: como publicar (Cloudflare), instalar no telemóvel, actualizar a tabela de marés e editar os limiares provisórios.
