# Recolha de material — 13/10/2026 (terça-feira)

Todas as horas de recolha estão em hora de Lisboa (WEST, UTC+1). Entre parênteses, UTC.

**Onde ficaram os ficheiros:** o ambiente na nuvem tinha o acesso bloqueado a api.ipma.pt, open-meteo.com e hidrografico.pt (`curl: (56) CONNECT tunnel failed, response 403`, às 21:29:22). Por isso, todos os downloads (JSON, PDF, XLSX e TXT) foram feitos no seu Chrome e foram para a **pasta de Transferências (Downloads)** do seu computador. As capturas de ecrã estão na pasta `capturas/`, junto a este relatório. Não consegui confirmar sozinho que o Chrome não bloqueou nenhum dos downloads, porque não consigo abrir `chrome://downloads`. Confirme na pasta, por favor.

---

## A. FIZK

Conta: Luis, plano **FREE**. App em espanhol.

### 1. Diário de Pesca — exportação

- **Exporta?** Sim. Caminho: Diario → Perfil → secção "Descargar mis datos".
- **Formato:** folha de cálculo **.xlsx**. Texto da app: "Tus jornadas y tus capturas en una hoja de cálculo (.xlsx)".
- Há duas opções:
  - "Mis jornadas y capturas": "Todo lo que has apuntado, tal cual lo guardaste." Disponível no plano grátis.
  - "Con las condiciones de cada jornada": "Viento, mar, marea y luna de cada captura." **Só no plano PRO**. Não obtido: o botão está bloqueado.
- **Exemplo exportado:** `diario-fizk-2026-10-13.xlsx`, nas Transferências. Download às 21:34 (pedido a `fizk.com/diario/api/export?v=basica`, HTTP 200).
- A conta não tem registos. O ficheiro só traz os cabeçalhos e uma frase de "ainda sem dados".
- **Campos de cada registo**, com os nomes exactos das colunas:
  - Folha **"Capturas"**: Fecha · Hora · Lugar · Disciplina · Especie · Peso (kg) · Talla (cm) · Liberada · Cebo o señuelo · Montaje · Observaciones · ¿Tiene foto? · Ver en el diario
  - Folha **"Jornadas"**: Fecha · Hora de inicio · Hora de fin · Duración (min) · Cerrada por el sistema · Lugar · Disciplina · Equipo usado · Nº de capturas · Observaciones · Satisfacción (1-5) · Residuos recogidos
  - Folha **"Resumen"**: "Mi diario de pesca · FIZK" / "Generado el" "22:34 del 13 de octubre de 2026" / "Versión" "Básica"
- Nota: o ficheiro diz "22:34", mas o download foi às 21:34 de Lisboa. A hora do resumen parece estar em hora de Espanha (UTC+2). É uma observação minha, não está declarada.

### 2. Fontes de dados declaradas

O texto vem do botão ⓘ do meteograma, janela "Información sobre predicciones". Não tem link próprio, está dentro da app em https://fizk.com/app/. Captura: `04_fizk_info_fontes_predicciones.jpg`.

> "Las predicciones meteorológicas y marinas que ves en esta web provienen de Open-Meteo y del Instituto Hidrográfico de la Marina (IHM). Utilizamos datos actualizados cada 12 horas para ofrecerte información precisa y confiable."

Lista de dados que vem a seguir, copiada literalmente:

- Temperatura del agua: Variación a lo largo del día.
- Velocidad y dirección del viento: Intensidad y orientación del viento a 10 metros sobre el suelo.
- Altura y dirección de las olas: Para el oleaje y las marejadas.
- Precipitación y probabilidad de lluvia.
- Presión atmosférica: Indicador de cambios climáticos.
- Cobertura nubosa: Nivel de nubes en el cielo.
- Horas de sol: Salida, puesta y duración del día.
- Fases de la luna: Incluyendo salidas y puestas lunares.

O texto **não indica nenhum modelo** (ECMWF, GFS, etc.). Só diz "Open-Meteo" e "Instituto Hidrográfico de la Marina (IHM)".

As webcams indicam: "Cámaras de windy.com".

Os Términos y condiciones (https://fizk.com/politica-terminos-y-condiciones) não falam de fontes de dados. O link "Aviso legal sobre la cartografía marina" (https://fizk.com/legal/marine-cartography-disclaimer/) não foi obtido. Resposta: "Not Found — The requested URL was not found on this server."

### 3. Previsão

#### Locais

| Pedido | Ponto na Fizk | Coordenadas (lat / lon) | ID |
|---|---|---|---|
| Praia de Faro | **Faro - Mar Poente** (favorito) | 37.0133 / -8.00567 | 3817 |
| Praia de Faro (outro ponto) | **Faro - Mar Nascente** | 36.9842 / -7.96332 | 3769 |
| Praia do Ancão | **Ancão** (favorito, "Loulé") | 37.0322 / -8.03852 | 3619 |
| Ria Formosa (Faro) | **não existe.** A pesquisa "Ria Formosa" devolve "No se han encontrado resultados". Os únicos pontos de ria da zona são "Armona - Ria" (36.9999 / -7.81071). | — | — |
| Quarteira / Molhe de Quarteira | **não existe com esse nome.** "Quarteira" e "Molhe" devolvem "No se han encontrado resultados". O ponto mais próximo é **Forte Novo** ("Loulé"), que recolhi como substituto. | 37.062 / -8.09016 | 3877 |

As coordenadas vêm da lista de favoritos da app ("37.0133/-8.00567", etc.) e do pedido que o mapa faz para listar pontos.

#### Ficheiros com as tabelas (Transferências)

O meteograma não tem botão de exportar. "Compartir" só partilha a ficha. Por isso, extraí do ecrã, em texto, todos os valores do meteograma e guardei um ficheiro por local:

| Local | Ficheiro | Extracção |
|---|---|---|
| Faro - Mar Poente | `fizk_faro_mar_poente_20261013_214228.txt` | 21:42:28 (20:42:28 UTC) |
| Ancão | `fizk_ancao_20261013_214517.txt` | 21:45:17 (20:45:17 UTC) |
| Faro - Mar Nascente | `fizk_faro_mar_nascente_20261013_214642.txt` | 21:46:42 (20:46:42 UTC) |
| Forte Novo | `fizk_forte_novo_quarteira_20261013_214744.txt` | 21:47:44 (20:47:44 UTC) |

⚠️ Nas Transferências há também `fizk_faro_mar_poente_20261013_214038.txt` e `..._214124.txt`. São **versões anteriores com erro**: o bloco "CHIPS" dos dias 15 a 19 repete os dados de 14/10. **Apague-as.** A versão válida é a das 21:42:28.

Cada ficheiro tem três partes:

1. **CHIPS por dia:** nascer e pôr do Sol, Lua (fase e % iluminada), coeficiente de maré e horas e alturas de Pleamar/Bajamar.
2. **MARES:** os rótulos ▲/▼ da curva.
3. **TABELA HORARIA:** 168 linhas, 7 dias × 24 h, de 13/10 00:00 a 19/10 23:00. Separador ";".

Colunas da tabela, com os nomes da app:

- dia; hora
- ícone do céu (nome do ficheiro de imagem)
- temperatura do ar (linha "HORA", ex.: "18°")
- Fizk Score
- Temp. agua (°C)
- Viento (km/h)
- Rachas (km/h)
- Dir. viento
- Altura ola (m)
- Dir. oleaje
- Periodo ola (s)
- Presión (hPa)
- Lluvia (mm)

#### Resposta às alíneas b) a e)

- **Intervalo:** horário, 7 dias (13 a 19/10).
- **Hora:** a app mostra a hora local sem dizer o fuso. Às 21:36 de Lisboa, a coluna "agora" era a das 21:00, e "Actualizado: 21:37" coincidiu com o relógio de Lisboa. Por isso, **as horas coincidem com a hora de Portugal**. É uma observação minha; a app não declara o fuso.
- **Unidades:** exactamente como aparecem: km/h (vento e rajada), m (onda), s (período), hPa, mm, °C. Não converti nada.
- **Direcções do vento e das ondas:** a app só mostra **setas, sem graus nem pontos cardeais**. No ficheiro guardei a rotação da seta, por exemplo "seta rot 175deg". A app **não diz** se a seta aponta para onde o vento vai ou de onde vem.
- **Não mostrado no meteograma:**
  - swell e vaga de vento separados;
  - potência;
  - rajada em direcção;
  - probabilidade de chuva.
- **Marés:** a maré aparece como curva com PM/BM (hora e altura em m). As alturas são negativas na BM (ex.: "▼ 09:50 -1,6 m"). **O referencial das alturas não é indicado** e não coincide com o zero hidrográfico do IH (ver ponto 6).
- **Fizk Score:**
  - No plano FREE só aparece até **14/10 21:00**. Daí em diante as células estão bloqueadas, com a dica "Hazte PRO para ver el Fizk Score de los 7 días". No ficheiro ficam como "bloqueado PRO".
  - **A escala não é indicada no ecrã.** A app mostra um anel com o número e o rótulo "Regular" (valores 3.0–4.1 nos cartões). Nas tabelas vi valores entre 2,8 e 7,5.
  - O score é por espécie. Os valores recolhidos são para **"Lubina"**, a espécie seleccionada.
- **Chips por dia:**
  - Os chips seguem o dia visível à esquerda da tabela. Na posição final de 19/10, o painel continua a mostrar os chips de 18/10. Por isso, **os chips de 19/10 não foram mostrados** (as PM/BM de 19/10 aparecem na curva).
  - Na secção MARES do ficheiro, atribuí o dia a cada rótulo pela posição horizontal. Os rótulos perto da meia-noite podem ficar no dia seguinte. Por exemplo, "▼ 23:46 -0,9 m" aparece como sábado, mas é de sexta-feira 16, como confirma o chip de 16/10. **Os chips são a referência.**
- **Última actualização:** o meteograma não mostra hora de actualização. A ficha mostra "Actualizado: 21:36/21:37" no bloco "ESTADO EN VIVO". O texto de fontes diz "datos actualizados cada 12 horas".
- **Ponto "agora", Faro - Mar Poente, ficha às 21:36:**
  - Maré -1.37 m ↓ "Bajando"
  - Vento 4.3 km/h "NO: noroeste"
  - Ondas 0.5 m "Rizada"
  - Água 20.6 °C; ar 21 °C

### 4. Capturas de ecrã (pasta `capturas/`)

São 7 capturas por local, que cobrem os 7 dias do meteograma: `10_…faro_mar_poente_1..7`, `11_…ancao_1..7`, `12_…faro_mar_nascente_1..7` e `13_…forte_novo_1..7`.

As marés estão na linha "Marea (m)" dessas capturas. O separador "MAREAS Y PRESIONES" da ficha é **só PRO** e não foi obtido.

### 5. Outras informações da app (Faro - Mar Poente; a estrutura é igual nos outros pontos)

- **Ficha (cabeçalho):** "PLAYA", "Algarve • Faro", "2 cámaras", água 20.6 °C, ar 21 °C. Profundidade "Somera (poco profunda)· est.". Composição, Tipo de arena, Acceso e Condiciones aparecem como "—". Captura 06.
- **Estado del mar para pescar:** "Buenas condiciones. Mar cómodo para una playa somera: oleaje suave (0.5 m)". Captura 06.
- **Especies habituales:**
  - Lubina, Dorada, Sargo, Mojarra
  - Corvina, Corvina americana
  - Calamar, Calamar veteado, Sepia
- **Actividad (teoría solunar, J. A. Knight):** a vista do dia aparece desfocada, com o aviso "SOLO PRO – La actividad de los peces, día a día". Não copiei os valores escondidos. Captura 07.
- **Normativa** (tallas mínimas, vedas, artes, espacios protegidos): só PRO. Captura 08.
- **Cámaras:** duas webcams "Montenegro", que a app situa "En Faro - Mar Nascente, a 5 km de aquí". "Cámaras de windy.com". Captura 09.
- **Batimetria:** existe a camada "Batimetría" no mapa, marcada com coroa, ou seja, só PRO. Não obtida.
- **Avisos:** não vi avisos meteorológicos na app.

---

## B. Tabela de marés oficial (Instituto Hidrográfico)

- **Ficheiro:** `TabelaMare_I_2026_signed.pdf`, nas Transferências. 16 943 026 bytes, 205 páginas. Download às 21:32:48 (20:32:48 UTC). O servidor indica "Last-Modified: Mon, 04 Aug 2025 13:23:30 GMT".
- **Link:** https://loja.hidrografico.pt/ln/web/wp-content/uploads/2023/11/TabelaMare_I_2026_signed.pdf
- É a "TABELA DE MARÉS 2026 — VOLUME I — PORTUGAL" (PN40). **Faro-Olhão** está no capítulo 201.12, a partir da página 2–119.
- **2027: não obtido.** Não encontrei nenhuma tabela de 2027 publicada (pesquisa feita a 13/10/2026).
- **Fuso horário**, texto da própria tabela, cabeçalho das páginas de Faro-Olhão:
  > "Porto de Faro-Olhão Latitude 36º 58.69' N Longitude 7º 51.97' W Horas do Fuso: 0 (TU) Ano: 2026"

  Ou seja, as horas estão em **UTC (TU)**, não em hora legal. O volume avisa (p. 1–5):
  > "Alertam-se os utilizadores deste volume da Tabela de Marés, para o facto de as previsões de marés indicadas serem referidas a um fuso horário que poderá não coincidir com o fuso horário correspondente à hora legal."
- **Referencial das alturas**, notas da "BARRA DE FARO-OLHÃO" (p. 2–120):
  > "3. Alturas de maré: — Referidas ao nível do zero hidrográfico. — Nível médio: 2,00 m."
  > "4. Zero hidrográfico: — 2,00 m abaixo do nível médio adotado (Cascais, 1938)."

  As mesmas notas indicam que o marégrafo é "No cais da Ilha da Culatra (…) (atualmente desativado)".
- No site principal há também a ferramenta interactiva "Previsão de Marés" (mapa). Não é um ficheiro. Captura 17.

---

## C. Respostas das APIs (ficheiros .json nas Transferências)

Os ficheiros foram descarregados no Chrome, tal como vieram, sem alterações. O nome de cada ficheiro tem a data e hora de Lisboa.

| Ficheiro | HTTP | Bytes | Hora (Lisboa / UTC) |
|---|---|---|---|
| `ipma_warnings_20261013_213011.json` | 200 | 34 525 | 21:30:11 / 20:30:11 |
| `ipma_sea_day0_…json` | 200 | ver ficheiro | 21:30:12 – 21:30:14 |
| `ipma_sea_day1_…json` | 200 | ver ficheiro | 21:30:12 – 21:30:14 |
| `ipma_sea_day2_…json` | 200 | ver ficheiro | 21:30:12 – 21:30:14 |
| `openmeteo_marine_36.97_-7.98_20261013_213049.json` | 200 | 21 752 | 21:30:49 / 20:30:49 |
| `openmeteo_marine_37.05_-8.1_20261013_213050.json` | 200 | 21 805 | 21:30:50 / 20:30:50 |
| `openmeteo_forecast_37.01_-7.93_20261013_213053.json` | 200 | 12 220 | 21:30:53 / 20:30:53 |
| `openmeteo_forecast_37.07_-8.1_20261013_213054.json` | 200 | 12 214 | 21:30:54 / 20:30:54 |

Os ficheiros `ipma_sea_day0/1/2` têm o sufixo de hora gerado no momento do download, entre 213012 e 213014.

Todas as recolhas da parte C foram feitas no mesmo dia da extracção da Fizk (13/10, 21:30–21:31, uns 11 minutos antes).

### 7. Avisos do IPMA (warnings_www.json)

- O ficheiro tem 200 registos, todos com `"awarenessLevelID":"green"`. **Há registos "green":** são os 200.
- **Há registos com "idAreaAviso":"FAR":** são 8, todos **green**, com startTime "2026-10-13T10:35:00", endTime "2026-10-16T10:00:00" e text "".
- Tipos desses 8 registos:
  - Agitação Marítima
  - Nevoeiro
  - Tempo Quente
  - Tempo Frio
  - Precipitação
  - Neve
  - Trovoada
  - Vento

### 8. Previsão do estado do mar do IPMA (hp-daily-sea-forecast)

| Ficheiro | forecastDate | dataUpdate | Last-Modified |
|---|---|---|---|
| day0 | **2026-10-13** | 2026-10-13T19:31:01 | Tue, 13 Oct 2026 19:31:01 GMT |
| day1 | **2026-10-14** | 2026-10-13T19:31:02 | — |
| day2 | **2026-10-15** | 2026-10-13T19:31:02 | — |

Cada ficheiro tem 12 registos. **O registo `"globalIdLocal": 1080526` existe nos três.** Valores copiados do JSON:

- **day0:** latitude "37.1933", longitude "-8.0000", waveHighMin "0.3", waveHighMax "0.4", wavePeriodMin "2.7", wavePeriodMax "4.5", totalSeaMin 0.5, totalSeaMax 0.5, predWaveDir "W", sstMin "21.4", sstMax "21.7"
- **day1:** waveHighMin "0.3", waveHighMax "1.4", wavePeriodMin "3.4", wavePeriodMax "5.0", totalSeaMin 0.5, totalSeaMax 1.5, predWaveDir "SE", sstMin "21.1", sstMax "21.4"
- **day2:** waveHighMin "1.0", waveHighMax "1.4", wavePeriodMin "4.3", wavePeriodMax "4.9", totalSeaMin 1, totalSeaMax 1.5, predWaveDir "SE", sstMin "20.9", sstMax "21.2"

### 9 e 10. Open-Meteo

As quatro respostas vieram com HTTP 200, timezone "Europe/Lisbon" e 336 instantes horários cada (7 dias passados + 7 de previsão).

Pontos de grelha que o Open-Meteo devolveu:

| Pedido | Ponto devolvido (lat / lon) |
|---|---|
| marine 36.97 / -7.98 | 36.958336 / -7.9583282 |
| marine 37.05 / -8.1 | 37.041664 / -8.124985 |
| forecast 37.01 / -7.93 | 37.00936 / -7.9370203 |
| forecast 37.07 / -8.1 | 37.081425 / -8.109535 |

---

## D. Documentação do Open-Meteo

Fonte: https://open-meteo.com/en/docs/marine-weather-api, tabela "Hourly Parameter Definition". Texto copiado literalmente da página:

- Linha que inclui **`wave_period`**. A célula Variable lista `wave_period`, `wind_wave_period`, `swell_wave_period`, `secondary_swell_wave_period` e `tertiary_swell_wave_period`. Valid time: "Instant". Unit: "Seconds". Description:
  > "Period between mean, wind and swell waves."
- **`wave_peak_period`:** **não tem linha própria** na tabela. Só aparece como variável seleccionável, com a etiqueta "Wave Peak Period".
  - A linha mais próxima é a de `wind_wave_peak_period` e `swell_wave_peak_period`. Valid time "Instant", Unit "Seconds", Description:
    > "Peak period between wind and swell waves."
  - Também existe a variável diária `wind_wave_peak_period_max` / `swell_wave_peak_period_max`, com a descrição "Maximum peak period between wind and swell waves."

---

## E. Teste de CORS

Feito em https://example.com às 21:31:07 (20:31:07 UTC). Usei o comando pedido, injectado na página, com o resultado lido na consola. Repeti com fetch directo para os 8 URLs.

| URL | Resultado |
|---|---|
| IPMA warnings_www.json | **200** |
| IPMA hp-daily-sea-forecast-day0.json | **200** |
| IPMA hp-daily-sea-forecast-day1.json | **200** |
| IPMA hp-daily-sea-forecast-day2.json | **200** |
| Open-Meteo marine (36.97, -7.98) | **200** |
| Open-Meteo marine (37.05, -8.1) | **200** |
| Open-Meteo forecast (37.01, -7.93) | **200** |
| Open-Meteo forecast (37.07, -8.1) | **200** |

Nenhum deu "ERRO". As oito chamadas a partir de outra origem foram aceites.

---

## Lista de ficheiros

### Na pasta de Transferências (Chrome)

1. `ipma_warnings_20261013_213011.json`
2. `ipma_sea_day0_20261013_2130xx.json`
3. `ipma_sea_day1_20261013_2130xx.json`
4. `ipma_sea_day2_20261013_2130xx.json`
5. `openmeteo_marine_36.97_-7.98_20261013_213049.json`
6. `openmeteo_marine_37.05_-8.1_20261013_213050.json`
7. `openmeteo_forecast_37.01_-7.93_20261013_213053.json`
8. `openmeteo_forecast_37.07_-8.1_20261013_213054.json`
9. `TabelaMare_I_2026_signed.pdf`
10. `diario-fizk-2026-10-13.xlsx`
11. `fizk_faro_mar_poente_20261013_214228.txt` (válido)
12. `fizk_ancao_20261013_214517.txt`
13. `fizk_faro_mar_nascente_20261013_214642.txt`
14. `fizk_forte_novo_quarteira_20261013_214744.txt`
15. Para apagar (versões com erro): `fizk_faro_mar_poente_20261013_214038.txt` e `fizk_faro_mar_poente_20261013_214124.txt`

### Na pasta `capturas/` (41 imagens)

- 01–03: Diário (início, Mis jornadas, Descargar mis datos)
- 04: Fontes ("Información sobre predicciones")
- 05–09: Faro - Mar Poente (popup do score, ficha: resumen, actividad PRO, normativa PRO, cámaras)
- 10_1..7: meteograma Faro - Mar Poente
- 11_1..7: meteograma Ancão
- 12_1..7: meteograma Faro - Mar Nascente
- 13_1..7: meteograma Forte Novo
- 14–16: pesquisas sem resultados (Quarteira, Ria Formosa, Molhe)
- 17: IH, ferramenta "Previsão de Marés"
