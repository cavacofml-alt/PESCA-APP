# Open-Meteo lido a 16/10/2026 (16:59–17:08)

Só referência: a app não lê estes ficheiros (e `recolha/` nunca é publicada).

- Leitura com `node ferramentas/analisar.mjs --rede 2026-10-17 1`, para responder ao utilizador sobre as
  condições de 17/10 na barra do Farol. O limite de pedidos do Open-Meteo (HTTP 429) deixou de fora vários
  pontos: há só Faro - Mar Poente, Vilamoura e Falésia Alfamar (marine) e esses mais Forte Novo (forecast).
- `*_barraFarol_*`: ponto de teste na barra de Faro-Olhão (36,963, −7,871; coordenadas aproximadas, não
  confirmadas pelo utilizador). Não é um pesqueiro da app.
- Servem também para comparar com a Fizk, se a recolha n.º 4 for feita hoje à mesma hora.
