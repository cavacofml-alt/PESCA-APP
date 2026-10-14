// Pontos de dados que os pesqueiros do config.json usam (decisão C). Função pura.
// mar: Open-Meteo Marine (ondulação e temperatura da água); terra: Open-Meteo Forecast (vento,
// pressão, chuva). Sem substituição entre pontos: cada pesqueiro usa só os seus.
export function pontosNecessarios(config) {
  const mar = new Set();
  const terra = new Set();
  for (const pq of Object.values(config.pesqueiros)) {
    if (pq.mar) mar.add(pq.mar);
    if (pq.agua) mar.add(pq.agua);
    if (pq.terra) terra.add(pq.terra);
  }
  const falta = [...mar, ...terra].filter(k => !config.locais?.[k]);
  if (falta.length) throw new Error(`config.json: pontos sem coordenadas: ${falta.join(", ")}`);
  return { mar: [...mar], terra: [...terra] };
}
