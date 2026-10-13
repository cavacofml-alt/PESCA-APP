# Surfcasting Algarve — Fase 2

Módulos de consulta de dados e validação inicial, sem build e sem dependências de runtime obrigatórias.

## Executar localmente

Os módulos ES e `fetch()` não funcionam de forma fiável a partir de `file://`. Servir a pasta por HTTP, por exemplo através de GitHub Pages ou de um servidor estático local.

## Estado das fontes

- Open-Meteo Marine: consulta horária marinha.
- Open-Meteo Forecast: vento, rajadas, pressão e precipitação. **Não pede nascer/pôr do Sol.**
- Open-Meteo (Marine e Forecast): pedidos com `timeformat=unixtime` (instantes absolutos; a hora local repete-se a 25/10/2026). Consulta Faro e Quarteira.
- IPMA estado do mar: consulta `oceanography/daily/hp-daily-sea-forecast-day{0,1,2}.json`, filtra `globalIdLocal=1080526` e recusa ficheiros cujo `forecastDate` não seja o dia pedido (`não obtido (desactualizado)`).
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
- O `sw.js` serve a shell a partir da cache; `config.json` e marés (`*.json`) vão sempre primeiro à rede e só usam a cópia em cache sem ligação. Ao alterar a shell, subir a versão da cache em `sw.js`.
- O carregamento da biblioteca SunCalc local deve ser concluído antes de publicar.

## Tabela de marés

`mares/2026.json` foi gerado a partir da tabela oficial do Instituto Hidrográfico (Tabela de Marés 2026, Vol. I, Porto de Faro-Olhão, págs. 2-121 a 2-124). Horas em TU (UTC); alturas referidas ao zero hidrográfico (2,00 m abaixo do nível médio, Cascais 1938); resolução de 0,1 m. A tabela não indica PM/BM: o tipo é deduzido pela alternância das alturas e validado.

Para gerar o ano seguinte, com o PDF do IH e o `pdftotext` (poppler) instalado:

```
for p in <páginas de Faro-Olhão>; do pdftotext -f $p -l $p -bbox Tabela.pdf pasta/p$p.html; done
python3 ferramentas/mares_ih.py pasta mares/AAAA.json $(sha256sum Tabela.pdf | cut -d' ' -f1)
```

O script recusa escrever se alguma validação falhar (dias seguidos, dia da semana impresso, alternância, intervalos, 365/366 dias). Ajustar `PAGINAS` e o ano no script.
