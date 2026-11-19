# Open-Meteo lido a 01/11/2026 (22:00–22:53)

Só referência: a app não lê estes ficheiros (e `recolha/` nunca é publicada).

- Previsão da semana de 02 a 07/11 para todos os pesqueiros (16 ficheiros; o dia 08/11 fica fora do
  alcance). O limite de pedidos do Open-Meteo (HTTP 429) obrigou a ler os pontos um a um, com pausas,
  entre as 22:00 e as 22:53.
- Ver: `node ferramentas/analisar.mjs recolha/2026-11-01/apis 2026-11-02 6`
