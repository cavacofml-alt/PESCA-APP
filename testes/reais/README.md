# Respostas reais das APIs

Ficheiros de 13/10 (~21:30): descarregados no Chrome do utilizador. Ficheiros de 14/10 (09:46): descarregados
neste ambiente com os mesmos URL da app. Todos sem alterações. Servem para os
testes confirmarem que o código aceita o formato real. **Não são previsões actuais.**

| Ficheiro | Origem |
|---|---|
| `openmeteo_forecast_faro_20261013_2130.json` | Open-Meteo Forecast, 37.01 / -7.93, `timeformat=unixtime`, `wind_speed_unit=kn` |
| `openmeteo_forecast_quarteira_20261013_2130.json` | Open-Meteo Forecast, 37.07 / -8.1, idem |
| `openmeteo_marine_{faro,quarteira}_20261014_0946.json` | Open-Meteo Marine, 36.97/-7.98 e 37.05/-8.1, `timeformat=unixtime`, `past_days=7` |
| `openmeteo_forecast_{faro,quarteira}_20261014_0946.json` | Open-Meteo Forecast, como acima |
| `ih_boia_faro_20261115.json` | Instituto Hidrográfico, boia de Faro (`buoys_datawell/locations/20`, `datetime=2026-11-15T00:30:00Z/2026-11-15T10:30:00Z`), descarregado a 17/11/2026 neste ambiente. Tem um registo em falta (QC 9, 09:26), uma onda máxima com QC 4 (09:56) e uma temperatura com QC 2 (00:56) |
| `cmems_ibi_wav_capacidades_20261120_excerto.xml` | Copernicus Marine WMTS, capacidades de `IBI_ANALYSISFORECAST_WAV_005_005` (20/11/2026, 16:02 UTC), só os blocos `Layer` de `VHM0`, `VTM02`, `VTM10` e `VTPK` das versões `202411` e `202611`, sem alterações |
