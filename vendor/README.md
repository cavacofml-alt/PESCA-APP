# Bibliotecas de terceiros

| Ficheiro | Origem | Versão | Licença |
|---|---|---|---|
| `suncalc.js` | [mourner/suncalc](https://github.com/mourner/suncalc), pacote npm `suncalc` | 1.9.0 (sem alterações) | BSD-2-Clause, ver `LICENSE-suncalc` |
| `leaflet/` (`leaflet.js`, `leaflet.css`, `images/`) | [Leaflet](https://leafletjs.com), pacote npm `leaflet` (pasta `dist/`) | 1.9.4 (sem alterações) | BSD-2-Clause, ver `leaflet/LICENSE` |

SHA-256 de `suncalc.js`: `5bfe4127cb91b7436295135d491e2d8abeccacbc8c4d450fb30771183b1e24d2`

SHA-256 de `leaflet/leaflet.js`: `db49d009c841f5ca34a888c96511ae936fd9f5533e90d8b2c4d57596f4e5641a`; de `leaflet/leaflet.css`: `a7837102824184820dfa198d1ebcd109ff6d0ff9a2672a074b9a1b4d147d04c6`. O pacote `leaflet-1.9.4.tgz` foi conferido com a integridade publicada no npm (`sha512-nxS1ynzJOmOlHp+iL3FyWqK89GtNL8U8rvlMOsQdTTssxZwCXh8N2NB3GDQOL+YR3XnWyZAxwQixURb+FA74PA==`). O `leaflet.js.map` não é publicado (só serve para depuração).

`package.json` nesta pasta só indica ao Node que `suncalc.js` é CommonJS (é um módulo UMD), para os testes o poderem carregar. No browser é carregado com `<script>` clássico e fica em `window.SunCalc`.
