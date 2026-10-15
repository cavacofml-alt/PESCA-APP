# Recolha n.º 3 na Fizk (Claude web, 15/10/2026, 09:09–09:35) e comparação com as nossas notas

Só referência: a app não lê estes ficheiros (e `recolha/` nunca é publicada).

- `claude-web/`: o que o Claude web entregou — `0_resumo.txt`, `1_Vilamoura.csv`, `1_Ancao.csv`,
  `2_favoritos_por_especie.txt`, `3_o_que_o_score_considera.txt`. Os CSV de Faro - Mar Poente, Falésia
  Alfamar e Forte Novo não vieram neste envio.
- `apis/`: Open-Meteo para os nossos pontos, lido às 10:06 do mesmo dia.
- `comparacao-fizk.md`: tabela por período e hora a hora, gerada com
  `node ferramentas/comparar-fizk.mjs recolha/2026-10-15/apis vilamoura=recolha/2026-10-15/claude-web/1_Vilamoura.csv ancao=recolha/2026-10-15/claude-web/1_Ancao.csv`

## O que ficou confirmado

1. **A Fizk usa os mesmos dados que nós.** Vento, rajada, direcções, altura e período da onda e
   temperatura da água são os do Open-Meteo e batem com os nossos em 48 de 48 horas, nos dois pontos
   (dentro do arredondamento com que a Fizk os mostra). As diferenças de nota vêm das regras, não dos
   dados. Só as marés diferem: a Fizk usa o IHM espanhol, hoje 36–52 min adiantado em relação ao IH
   (preia-mar 04:54 e 17:17 na Fizk; 05:46 e 18:04 na tabela do IH).
2. **As setas da Fizk apontam para onde vai o vento ou a onda.** Rotação + 180° dá a direcção de onde
   vem, igual à nossa ao grau. O pressuposto do Claude web estava certo.
3. **O período da onda da Fizk é o `wave_period`** (período médio do Open-Meteo), arredondado ao segundo.
4. **A Fizk tem parâmetros próprios por ponto, que não mostra.** Vilamoura e Forte Novo caem na mesma
   célula do modelo (mesmo mar e vento), mas às 09:00 têm 6,5/7,1 e 6,3/7,2 (robalo/dourada). Faro e
   Ancão partilham a célula do mar e diferem 1,0 no robalo (6,6 e 5,6).

## Onde divergimos

Hoje, 15/10: Levante (vento de ENE a SE entre as 03h e as 20h, até 23 km/h ≈ 12 nós, rajadas até
44 km/h) e ondulação de Sudeste (129–153°) de 0,8–1,3 m, período 6–7 s, potência 2,3–5,6 kW/m.

- **As nossas regras:** mar de fora com limo (regra 2) em Faro, Ancão, Almargem e Vilamoura o dia
  todo → robalo 1 e dourada 1. Falésia: limo de madrugada e de manhã (P 1,56–1,73, pouco acima do
  limiar provisório de 1,5); à tarde 3/3 e à noite 4/4. Molhes: robalo 4–5 do lado poente (com aviso
  de limo); dourada 1 (P ≥ 1,5).
- **A Fizk:** as melhores horas do dia são estas. Vilamoura: robalo 7,6 às 14h e dourada 8,7 às 16h;
  Ancão: 7,1 e 7,6. Na escala dela, 7,6–10 é «Excelente».

Em dia de Levante com mar mexido, as duas apps dizem o contrário. O limo não está na lista do que a
Fizk diz considerar, e a própria Fizk avisa que não vê fenómenos locais.

## Como a nota da Fizk se comporta (34 horas visíveis por ponto; observação, não fórmula)

- **Sobe com o vento.** Correlação de 0,90 entre a nota do robalo e a velocidade do vento, nos dois
  pontos (dourada: 0,83 em Vilamoura, 0,72 no Ancão). Mas hoje o vento forte coincidiu com as horas
  de dia, por isso não dá para separar o efeito do vento do da hora.
- **Cai depois do anoitecer.** Vilamoura 6,3 → 3,9 entre as 20h e as 21h; Ancão 6,3 → 4,8 entre as
  19h e as 20h (pôr do Sol às 18:55), com o vento a baixar ao mesmo tempo.
- **Dourada ≥ robalo, e a diferença cresce quando a onda baixa.** Correlação de −0,96 entre
  (dourada − robalo) e a altura da onda, nos dois pontos. Vilamoura: de 0,6 (onda de 1,1 m) a 1,6
  (0,8 m); Ancão: de 0,0 (1,3 m) a 1,2 (0,9 m). Vai no sentido da nossa regra 12 (a dourada quer mar
  calmo), mas sem limite: 8,7 com P = 2,9 kW/m, onde nós damos 1.
- **A fórmula continua invisível** (é calculada no servidor). Com um só dia e variáveis que andam
  juntas, não dá para a deduzir.

## O que cada uma considera

- Só a Fizk: velocidade do vento como factor da nota, Lua, época do ano e hora do dia.
- Só nós: limo (direcção com mar mexido), potência (Hs² × T), limite de potência para a dourada,
  repontos junto ao nascer ou pôr do Sol, chuva das 48 h anteriores (água turva).
- As duas: ondulação, maré, pressão, temperatura da água.

## Por fazer

- CSV de Faro - Mar Poente, Falésia Alfamar e Forte Novo. Às 09:00 (ficheiro 2) a Fizk dava
  Faro 6,6/6,6, Falésia 6,3/8,0 e Forte Novo 6,3/7,2; nós damos 1/1 nos três (limo de manhã).
- Repetir num dia calmo e sem Levante (secção 4 do pedido), para ver se as duas apps concordam quando
  não há limo.
