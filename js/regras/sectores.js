// Classificação de direcções (graus, de onde vem) em sectores do config.json.
// Intervalos semi-abertos [início, fim). Se início > fim, o sector atravessa 0°/360°.
// Função pura: sem rede nem armazenamento.

export function normalizarGraus(graus) {
  if (typeof graus !== "number" || !Number.isFinite(graus)) return null;
  const g = graus % 360;
  return g < 0 ? g + 360 : g + 0; // "+ 0" converte -0 em 0
}

export function dentroDoSector(graus, [inicio, fim]) {
  if (inicio === fim) return false;
  return inicio < fim ? graus >= inicio && graus < fim : graus >= inicio || graus < fim;
}

// Devolve o nome do sector (chave em config.mar.sectoresGraus) ou null se a direcção
// for inválida ou não couber em nenhum sector.
export function sectorDaDirecao(graus, sectores) {
  const g = normalizarGraus(graus);
  if (g === null) return null;
  for (const [nome, intervalo] of Object.entries(sectores)) {
    if (dentroDoSector(g, intervalo)) return nome;
  }
  return null;
}
