# Surfcasting Algarve

App pessoal (PWA, para Android) com as condições de surfcasting para dourada e robalo entre Faro e Quarteira. Sem build e sem dependências de runtime. O ecrã inicial (`index.html`) mostra um cartão por pesqueiro com as notas por período; `diagnostico.html` mostra o estado de cada fonte.

## Executar localmente

Os módulos ES e `fetch()` não funcionam a partir de `file://`. Servir a pasta por HTTP, por exemplo `python3 -m http.server` na raiz, e abrir `http://localhost:8000/`.

## Publicar (Cloudflare Pages)

O repositório é privado, por isso o GitHub Pages grátis não serve. O Cloudflare Pages é grátis e lê repositórios privados.

1. Criar conta em <https://dash.cloudflare.com/sign-up>.
2. **Workers e Pages → Criar → importar um repositório**, autorizar o GitHub e escolher este repositório (nome do projecto: `pesca-app`, ramo de produção `main`).
3. Não é preciso configurar mais nada: o `wrangler.jsonc` na raiz diz ao Cloudflare para correr `node ferramentas/publicar.mjs` e servir só a pasta `publicar/`. O comando de deploy fica o predefinido (`npx wrangler deploy`).
4. O endereço fica `https://pesca-app.<subdomínio>.workers.dev` (o desta app: <https://pesca-app.cavacofml.workers.dev/>). Cada merge para `main` volta a publicar sozinho; os outros ramos geram uma versão de pré-visualização com endereço próprio.

`ferramentas/publicar.mjs` copia só os ficheiros da app. **A pasta `recolha/` (material da app de referência) nunca é publicada**, nem os testes e os documentos de trabalho: o site publicado é público, ao contrário do repositório. Um teste confirma-o.

## Instalar no telemóvel (Android)

Abrir o endereço no Chrome → menu ⋮ → **Instalar app** (ou «Adicionar ao ecrã principal»). A app abre em ecrã inteiro. Sem rede, abre na mesma, mas as previsões ainda não ficam guardadas: as fontes aparecem como «não obtidas».

## Estado das fontes

- Open-Meteo Marine: consulta horária marinha.
- Open-Meteo Forecast: vento, rajadas, pressão e precipitação. **Não pede nascer/pôr do Sol.**
- Open-Meteo (Marine e Forecast): pedidos com `timeformat=unixtime` (instantes absolutos; a hora local repete-se a 25/10/2026). Consulta Faro e Quarteira.
- IPMA estado do mar: consulta `oceanography/daily/hp-daily-sea-forecast-day{0,1,2}.json`, filtra `globalIdLocal=1080526` e recusa ficheiros cujo `forecastDate` não seja o dia pedido (`não obtido (desactualizado)`).
- Boia de Faro (Instituto Hidrográfico, OGC API): última medição da onda e da água, com o indicador de qualidade de cada valor (1 e 2 aceites; 9 → `não obtido`; outros ou fora dos limites físicos → `inválido`). Mostrada em «Mar agora»; não entra nas notas.
- Marés locais: valida formato, ordem, alternância PM/BM e intervalos de 30 a 480 minutos. `mares/2026.json` está vazio até chegar a tabela oficial.
- SunCalc: adaptador preparado; colocar uma distribuição local licenciada em `vendor/suncalc.js` e carregá-la antes de usar o adaptador. A aplicação não consulta outra fonte solar.

## Modelo de valor

A função `leitura()` em `js/normalizacao.js` cria o envelope comum com `value`, `unit`, `source`, `readAt`, `validAt`, `tipo`, `status`, `provisional` e `note`. Valores ausentes ficam `null` e estado `não obtido`.

Os URL das APIs estão só em `config.json` (`fontes`); os módulos em `js/` recebem-nos por parâmetro.

## Testes offline

Com Node ≥ 20, na raiz do projecto:

```
node --test
```

Não há dependências a instalar (o `package.json` só indica que os `.js` são módulos ES). Os testes não usam a Internet: as respostas das APIs são simuladas com as fixtures de `testes/dados-teste.js`, que não são previsões reais. O GitHub Actions corre os testes em cada push e PR, com Node 20 e 22 e quatro fusos horários (UTC, Europe/Lisbon, America/New_York, Asia/Tokyo).

## Limitações desta entrega

- Os avisos do IPMA não são consultados: a regra de segurança foi retirada por decisão do utilizador (13/10/2026).
- O `sw.js` serve a shell a partir da cache; `config.json` e marés (`*.json`) vão sempre primeiro à rede e só usam a cópia em cache sem ligação. Ao alterar um ficheiro da shell, correr `node ferramentas/versao-sw.mjs` (actualiza a impressão e sobe a versão da cache em `sw.js`); um teste falha se for esquecido.

## Tabela de marés

`mares/2026.json` foi gerado a partir da tabela oficial do Instituto Hidrográfico (Tabela de Marés 2026, Vol. I, Porto de Faro-Olhão, págs. 2-121 a 2-124). Horas em TU (UTC); alturas referidas ao zero hidrográfico (2,00 m abaixo do nível médio, Cascais 1938); resolução de 0,1 m. A tabela não indica PM/BM: o tipo é deduzido pela alternância das alturas e validado.

Para gerar o ano seguinte, com o PDF do IH e o `pdftotext` (poppler) instalado:

```
for p in <páginas de Faro-Olhão>; do pdftotext -f $p -l $p -bbox Tabela.pdf pasta/p$p.html; done
python3 ferramentas/mares_ih.py pasta mares/AAAA.json $(sha256sum Tabela.pdf | cut -d' ' -f1)
```

O script recusa escrever se alguma validação falhar (dias seguidos, dia da semana impresso, alternância, intervalos, 365/366 dias). Ajustar `PAGINAS` e o ano no script.

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
  - cotas à baixa-mar astronómica mais baixa (LAT). No confronto com o COSMO 2025 ficou 0,1 a 0,25 m acima do zero hidrográfico nas zonas fundas.

Para refazer:

```
# 590_HR_Lidar_Algarve.emo.zip: https://downloads.emodnet-bathymetry.eu/high_resolution/590_HR_Lidar_Algarve.emo.zip
python3 -I ferramentas/lidar_emodnet.py 590_HR_Lidar_Algarve.emo lidar2011.tif
python3 -I ferramentas/fundo_tipico.py fundos/tipico.json \
  --cosmo fundos/quarteira_garrao.json LTHQUGA1_20250612_20250616_DEM.tif \
  --cosmo fundos/praia_faro.json LTHFA1_20250617_DEM.tif \
  --lidar lidar2011.tif 590_HR_Lidar_Algarve.emo.zip
```

Os critérios dos fundões e cabeços estão no cabeçalho da ferramenta e ficam gravados no ficheiro (`tratamento.criterios`). São provisórios. Os bancos mudam com os temporais: vale sempre a data do levantamento, que aparece em todos os balões.

## Motor de regras (Fase 3)

`js/regras/` — funções puras, sem rede nem armazenamento. `analisarDias()` (em `analise.js`) recebe os dados já obtidos (Open-Meteo por ponto, tabela de marés, nascer/pôr do Sol do SunCalc) e devolve, por dia e por pesqueiro: notas de robalo e dourada **por período** (madrugada, manhã, tarde, noite) com as parcelas, potência máxima e hora, limo, lado do molhe, pressão, água, chuva, alinhamentos e avisos. Dado em falta → `n.d.` com o motivo; nunca um valor por defeito.

Os limiares provisórios estão no `config.json` (`mar`, `pressao`, `temperaturaAgua`, `chuva`, `anomalias`, `alinhamento`, `periodos`, `pontuacao`). Os pesqueiros e os pontos de dados estão em `pesqueiros` e `locais`.

Para ver o resultado sem interface:

```
node ferramentas/analisar.mjs --rede            # vai buscar os dados agora (guarda em recolha/<dia>/apis/)
node ferramentas/analisar.mjs recolha/2026-10-14/apis 2026-10-14 7   # com ficheiros guardados
```
