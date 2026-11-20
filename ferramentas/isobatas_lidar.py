"""Linhas de fundo do LiDAR 2011 do IH (EMODnet) onde não há levantamento COSMO: fundos/<id>.json.

Entrada: o GeoTIFF feito por ferramentas/lidar_emodnet.py (EPSG:3763, 3 m, cota = -profundidade,
referência LAT). Saída no formato de fundos/<id>.json (o mesmo do COSMO), mas:
  - só isóbatas, de 1 em 1 m a partir de +1 m (na Ria, as de 0,5 m sobre os bancos que secam
    enchiam o mapa), de 2 em 2 m abaixo de −6 e de 5 em 5 m abaixo de −10; sem fundões nem cabeços
    (o método foi feito para praias);
  - suavização gaussiana de 6 m antes das linhas (a grelha original é de ~12 x 14 m); linhas
    simplificadas a 3 m; ficam de fora as linhas com menos de 40 m;
  - as linhas que caem dentro de um levantamento COSMO (--excluir) são cortadas: aí vale o COSMO.

Dependências: numpy, scipy, rasterio, pyproj, shapely, scikit-image. Uso:
  python3 -I ferramentas/isobatas_lidar.py lidar2011_ria.tif fundos/ria_lidar2011.json \\
      590_HR_Lidar_Algarve.emo.zip --excluir fundos/praia_faro.json fundos/quarteira_garrao.json ...
  Vilamoura e Falésia: --id falesia_lidar2011 --nome "Vilamoura e Falésia (LiDAR 2011)" (ver o README).
"""
import argparse
import importlib.util
import json
import os

import numpy as np
import rasterio
from scipy import ndimage as ndi
from shapely.geometry import LineString, MultiLineString, Polygon
from shapely.ops import unary_union
from skimage import measure

AQUI = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("fundos_cosmo", os.path.join(AQUI, "fundos_cosmo.py"))
fc = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(fc)

NIVEIS = [1, 0, -1, -2, -3, -4, -5, -6, -8, -10, -15, -20, -25, -30]
SUAVIZAR_M = 6.0
SIMPLIFICAR_M = 3.0
LINHA_MINIMA_M = 40.0
VERSAO = 1
FONTE = {
    "nome": "Instituto Hidrográfico — LiDAR 2011 (projecto DGT/APA), publicado no EMODnet Bathymetry",
    "rotulo": "LiDAR 2011",
    "produto": "590_HR_Lidar_Algarve",
    "levantamento": "2011",
    "url": "https://emodnet.ec.europa.eu/geonetwork/srv/api/records/SDN_CPRD_590_HR_Lidar_Algarve",
    "resolucaoM": 12,
    # Referência vertical: a ficha do EMODnet diz LAT. O IH (Tabela de Marés 2026, §1.06) diz que o ZH fica
    # abaixo da LAT, e em Faro-Olhão a baixa-mar mínima de 2026 é 0,34 m: a LAT fica 0 a 0,34 m acima do ZH.
    # A app mostra intervalos com esse limite em vez de uma correcção constante (revisão de 19/11/2026).
    "referenciaVertical": "baixa-mar astronómica mais baixa (LAT), segundo a ficha do EMODnet. Em Faro-Olhão a LAT "
                          "fica 0 a 0,34 m acima do zero hidrográfico (IH, Tabela de Marés 2026: o ZH fica abaixo da "
                          "LAT, e a baixa-mar mínima de 2026 é 0,34 m). No confronto com o COSMO 2025, as cotas LiDAR "
                          "das zonas fundas ficaram 0,1 a 0,25 m acima das do COSMO",
    "datum": "LAT",
    "latAcimaZhM": [0, 0.34],
    "utilizacao": "pública; não usar para navegação",
}


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("tif")
    ap.add_argument("saida")
    ap.add_argument("zip", help="590_HR_Lidar_Algarve.emo.zip (para o SHA-256)")
    ap.add_argument("--excluir", nargs="*", default=[])
    ap.add_argument("--id", default="ria_lidar2011")
    ap.add_argument("--nome", default="Ria Formosa e Ancão (LiDAR 2011)")
    a = ap.parse_args()
    with rasterio.open(a.tif) as ds:
        z = ds.read(1, masked=True).filled(np.nan).astype(np.float32)
        t, res = ds.transform, ds.res[0]
    z[(z < -100) | (z > 100)] = np.nan
    zs = fc.suavizar(z, SUAVIZAR_M / res)
    valido = np.isfinite(zs)
    zz = np.where(valido, zs, np.nanmax(zs))
    geo = fc.Geo()
    cosmo = unary_union([Polygon(json.load(open(p, encoding="utf-8"))["cobertura"]).buffer(0) for p in a.excluir]) \
        if a.excluir else None
    isobatas = []
    for nivel in [n for n in NIVEIS if n >= np.nanmin(zs)]:
        linhas = []
        for cont in measure.find_contours(zz, float(nivel), mask=valido):
            px, py = fc.xy_continuo(t, cont[:, 0], cont[:, 1])
            ls = LineString(np.column_stack([px, py])).simplify(SIMPLIFICAR_M)
            if ls.length < LINHA_MINIMA_M:
                continue
            g = LineString(geo.linha(list(ls.coords)))
            if cosmo is not None:
                g = g.difference(cosmo)
            partes = list(g.geoms) if isinstance(g, MultiLineString) else [g] if not g.is_empty else []
            for p in partes:
                if p.geom_type == "LineString" and len(p.coords) >= 2:
                    linhas.append([[round(x, 6), round(y, 6)] for x, y in p.coords])
        if linhas:
            isobatas.append({"cota": float(nivel), "linhas": linhas})
    # zona com dados (fora do COSMO não se corta: o contorno é só a zona do LiDAR tratada)
    v = ndi.binary_closing(np.isfinite(z), iterations=5)
    lab = measure.label(v)
    maior = lab == np.argmax(np.bincount(lab.ravel())[1:]) + 1
    cont = max(measure.find_contours(np.pad(maior, 1).astype(float), 0.5), key=len)
    px, py = fc.xy_continuo(t, cont[:, 0] - 1, cont[:, 1] - 1)
    cobertura = geo.linha(list(Polygon(np.column_stack([px, py])).simplify(30.0).exterior.coords))
    out = {
        "versao": VERSAO, "id": a.id, "nome": a.nome,
        "fonte": {**FONTE, "sha256": fc.sha256(a.zip)},
        "tratamento": {"ferramenta": "ferramentas/isobatas_lidar.py", "versao": VERSAO, "provisorio": True,
                       "criterios": {"niveis": NIVEIS, "suavizarM": SUAVIZAR_M, "simplificarM": SIMPLIFICAR_M,
                                     "linhaMinimaM": LINHA_MINIMA_M, "excluidos": [os.path.basename(p) for p in a.excluir]},
                       "nota": "Só linhas de fundo, fora das zonas com levantamento COSMO. LiDAR de 2011: os canais "
                               "e os bancos mudam; serve de orientação."},
        "cobertura": cobertura,
        "formas": [],
        "isobatas": isobatas,
    }
    with open(a.saida, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")
    n = sum(len(i["linhas"]) for i in isobatas)
    print(f"{a.saida}: {len(isobatas)} níveis, {n} linhas; {os.path.getsize(a.saida) / 1024:.0f} KB")


if __name__ == "__main__":
    main()
