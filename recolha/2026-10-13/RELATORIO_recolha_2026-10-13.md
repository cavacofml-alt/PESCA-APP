# Recolha de material — 13/10/2026 (terça-feira)

Todas as horas de recolha estão em hora de Lisboa (WEST, UTC+1). Entre parênteses, UTC.

**Onde ficaram os ficheiros:** o ambiente na nuvem tinha o acesso bloqueado a api.ipma.pt, open-meteo.com e hidrografico.pt (`curl: (56) CONNECT tunnel failed, response 403`, às 21:29:22). Por isso, todos os downloads (JSON, PDF, XLSX e TXT) foram feitos no seu Chrome e foram para a **pasta de Transferências (Downloads)** do seu computador. As capturas de ecrã estão na pasta `capturas/`, junto a este relatório. Não consegui confirmar sozinho que o Chrome não bloqueou nenhum dos downloads, porque não consigo abrir `chrome://downloads`. Confirme na pasta, por favor.

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
