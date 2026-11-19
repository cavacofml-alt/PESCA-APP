"""Converte o LiDAR 2011 do Algarve (EMODnet Bathymetry, HR_Lidar_Algarve) num GeoTIFF EPSG:3763.

Fonte: Instituto Hidrográfico, levantamento LiDAR de 2011 (projecto DGT/APA), publicado no
EMODnet Bathymetry como «590_HR_Lidar_Algarve» (utilização pública; «DO NOT USE FOR NAVIGATION»).
Ficheiro: https://downloads.emodnet-bathymetry.eu/high_resolution/590_HR_Lidar_Algarve.emo.zip
(ficha: https://emodnet.ec.europa.eu/geonetwork/srv/api/records/SDN_CPRD_590_HR_Lidar_Algarve).

O .emo é uma lista de células de 1/128 de minuto (~12 x 14 m): lon; lat; mín; máx; média; desvio;
n.º de valores; ... O valor é PROFUNDIDADE (positiva abaixo da referência; negativa em terra) em
relação à baixa-mar astronómica mais baixa (LAT, segundo a ficha). Aqui grava-se a COTA (= -média).
Conferido com o COSMO 2025 (Praia de Faro e Quarteira–Garrão): nas zonas fundas e estáveis (-10 a
-6 m), a cota do LiDAR fica 0,1 a 0,25 m acima da do COSMO (zero hidrográfico); junto à praia de
Quarteira fica 0,8 a 1,5 m acima (a praia emagreceu desde 2011).

Falhas da grelha: uma célula sem valor com pelo menos 4 das 8 vizinhas com valor recebe a média
delas (duas passagens). Na faixa Faro–Falésia isto preenche cerca de 1 % das células. Depois
passa-se para EPSG:3763 a 3 m, por interpolação bilinear.

Dependências: numpy, scipy, rasterio. Uso:
  python3 -I ferramentas/lidar_emodnet.py 590_HR_Lidar_Algarve.emo saida.tif [oeste sul este norte]
"""
import sys

import numpy as np
import rasterio
from rasterio.transform import from_origin
from rasterio.warp import Resampling, calculate_default_transform, reproject
from scipy import ndimage as ndi

PASSO = 1 / 7680          # 1/128 de minuto, em graus
RESOLUCAO_M = 3.0
CAIXA = (-8.20, 36.98, -7.97, 37.10)   # Falésia a Faro


def ler_emo(caminho, caixa):
    a = np.loadtxt(caminho, delimiter=";", usecols=(0, 1, 4))
    w, s, e, n = caixa
    a = a[(a[:, 0] >= w) & (a[:, 0] <= e) & (a[:, 1] >= s) & (a[:, 1] <= n)]
    if not len(a):
        sys.exit("Sem pontos na caixa pedida")
    return a


def grelha(a):
    """Devolve a grelha de cotas e o canto sudoeste (centro da célula) dos próprios pontos."""
    w, s = a[:, 0].min(), a[:, 1].min()
    i = np.round((a[:, 0] - w) / PASSO).astype(int)
    j = np.round((a[:, 1] - s) / PASSO).astype(int)
    if np.abs((a[:, 0] - w) / PASSO - i).max() > 0.01 or np.abs((a[:, 1] - s) / PASSO - j).max() > 0.01:
        sys.exit("Os pontos não caem numa grelha de 1/128 de minuto")
    z = np.full((j.max() + 1, i.max() + 1), np.nan)
    z[j, i] = -a[:, 2]                      # profundidade -> cota
    return z, w, s


def preencher(z):
    k = np.ones((3, 3))
    k[1, 1] = 0
    antes = np.isfinite(z).sum()
    for _ in range(2):
        v = np.isfinite(z)
        soma = ndi.convolve(np.where(v, z, 0), k, mode="constant")
        n = ndi.convolve(v.astype(float), k, mode="constant")
        f = (~v) & (n >= 4)
        z[f] = soma[f] / n[f]
    return np.isfinite(z).sum() - antes


def main():
    if len(sys.argv) not in (3, 7):
        sys.exit(__doc__)
    caixa = tuple(map(float, sys.argv[3:7])) if len(sys.argv) == 7 else CAIXA
    a = ler_emo(sys.argv[1], caixa)
    z, w0, s0 = grelha(a)
    medidas = int(np.isfinite(z).sum())
    preenchidas = int(preencher(z))
    h, w = z.shape
    origem = from_origin(w0 - PASSO / 2, s0 + (h - 0.5) * PASSO, PASSO, PASSO)
    fonte = np.flipud(z).astype(np.float32)
    destino_t, dw, dh = calculate_default_transform("EPSG:4326", "EPSG:3763", w, h,
        *rasterio.transform.array_bounds(h, w, origem), resolution=RESOLUCAO_M)
    destino = np.full((dh, dw), np.nan, dtype=np.float32)
    reproject(fonte, destino, src_transform=origem, src_crs="EPSG:4326", src_nodata=np.nan,
              dst_transform=destino_t, dst_crs="EPSG:3763", dst_nodata=np.nan, resampling=Resampling.bilinear)
    destino[np.isnan(destino)] = -9999
    with rasterio.open(sys.argv[2], "w", driver="GTiff", width=dw, height=dh, count=1, dtype="float32",
                       crs="EPSG:3763", transform=destino_t, nodata=-9999, compress="deflate", tiled=True) as o:
        o.write(destino, 1)
        o.update_tags(fonte="EMODnet HR_Lidar_Algarve (IH, LiDAR 2011)", referencia="LAT", cota="-profundidade",
                      celulas_medidas=str(medidas), celulas_preenchidas=str(preenchidas))
    print(f"{sys.argv[2]}: {dw}x{dh} a {RESOLUCAO_M} m; células medidas {medidas}, preenchidas {preenchidas} "
          f"({preenchidas / medidas:.1%})")


if __name__ == "__main__":
    main()
