# Bibliotecas de terceiros

| Ficheiro | Origem | Versão | Licença |
|---|---|---|---|
| `suncalc.js` | [mourner/suncalc](https://github.com/mourner/suncalc), pacote npm `suncalc` | 1.9.0 (sem alterações) | BSD-2-Clause, ver `LICENSE-suncalc` |

SHA-256 de `suncalc.js`: `5bfe4127cb91b7436295135d491e2d8abeccacbc8c4d450fb30771183b1e24d2`

`package.json` nesta pasta só indica ao Node que `suncalc.js` é CommonJS (é um módulo UMD), para os testes o poderem carregar. No browser é carregado com `<script>` clássico e fica em `window.SunCalc`.
