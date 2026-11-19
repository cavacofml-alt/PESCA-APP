"""Fundões e cabeços estimados por satélite (Copernicus Sentinel-2 L2A), calibrados com o COSMO.

Método (batimetria por satélite, modelo de Lyzenga com três bandas):
  1. recorte Faro–Falésia das bandas B02 (azul), B03 (verde), B04 (vermelho), B08 (infravermelho
     próximo) e SCL (classificação), a 10 m; filtro de mediana 3 x 3;
  2. reflectância = valor x 0,0001, menos 0,1 se o valor bruto ainda trouxer a compensação do L2A
     (infravermelho em águas fundas > 600); águas fundas de referência = mediana do sul do recorte;
  3. água útil: SCL = água, infravermelho < 0,02 (sem espuma nem reflexo), azul, verde e vermelho
     acima das águas fundas;
  4. cota = a0 + a1·ln(azul − fundo) + a2·ln(verde − fundo) + a3·ln(vermelho − fundo), ajustada por
     mínimos quadrados às cotas dos DEM do COSMO (0 a −6 m ZH) nos mesmos píxeis; a maré do momento
     da imagem entra na constante;
  5. só se guarda a estimativa entre −6,5 e +0,5 m; terra (vegetação, solo, construído) = +3 m;
  6. passa-se para EPSG:3763 a 5 m e procuram-se fundões e cabeços com os critérios de
     ferramentas/fundos_cosmo.py;
  7. com --confirmar, só ficam as formas que também aparecem (mesmo tipo, a sobrepor-se) numa
     segunda imagem.

Validação (19/11/2026, ver README): na imagem de 14/06/2025, calibrar em Quarteira e testar em Faro
(e o inverso) deu erro quadrático médio de 0,70–0,79 m (0 a −6 m) e as anomalias (fundões/cabeços)
com correlação 0,82–0,93 e o mesmo sinal em 91–98 % dos píxeis com |anomalia| >= 0,4 m.

Dados: Copernicus Sentinel-2 (ESA), cópias públicas na AWS (Element84 Earth Search). Licença:
uso livre, com a menção «contém dados Copernicus Sentinel modificados».

Dependências: numpy, scipy, rasterio, pyproj, shapely, scikit-image. Uso:
  python3 -I ferramentas/batimetria_satelite.py fundos/satelite.json \\
      --cena S2C_29SNB_20261104_0_L2A --confirmar S2C_29SNB_20260915_0_L2A \\
      --cosmo fundos/quarteira_garrao.json LTHQUGA1_20250612_20250616_DEM.tif \\
      --cosmo fundos/praia_faro.json LTHFA1_20250617_DEM.tif [--pasta recortes/]
(rede: a GDAL lê os ficheiros por HTTP; atrás de um proxy, definir GDAL_HTTP_PROXY.)
"""
import argparse
import hashlib
import importlib.util
import json
import os
import re
import sys

import numpy as np
import rasterio
from pyproj import Transformer
from rasterio.warp import Resampling, calculate_default_transform, reproject
from rasterio.windows import from_bounds
from scipy import ndimage as ndi
from shapely.geometry import Polygon
from skimage import measure

AQUI = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("fundos_cosmo", os.path.join(AQUI, "fundos_cosmo.py"))
fc = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(fc)

CAIXA = (-8.215, 36.972, -7.955, 37.108)      # Falésia a Faro
BANDAS = ("B02", "B03", "B04", "B08", "SCL")
BASE = "https://sentinel-cogs.s3.us-west-2.amazonaws.com/sentinel-s2-l2a-cogs"
ITEM = "https://earth-search.aws.element84.com/v1/collections/sentinel-2-l2a/items/"
GAMA = (-6.5, 0.5)
CALIBRACAO = (-6.0, 0.0)
VERSAO = 1


def url_cena(cena):
    m = re.match(r"^S2[ABC]_(\d{2})([A-Z])([A-Z]{2})_(\d{4})(\d{2})(\d{2})_\d+_L2A$", cena)
    if not m:
        sys.exit(f"Nome de cena inesperado: {cena}")
    zona, banda, quad, ano, mes, _ = m.groups()
    return f"{BASE}/{zona}/{banda}/{quad}/{ano}/{int(mes)}/{cena}"


def recortar(cena, pasta):
    """Lê por HTTP só a janela da costa de cada banda e guarda-a em pasta/<cena>/."""
    destino = os.path.join(pasta, cena)
    if all(os.path.exists(os.path.join(destino, f"{b}.tif")) for b in BANDAS):
        return destino
    os.makedirs(destino, exist_ok=True)
    t = Transformer.from_crs("EPSG:4326", "EPSG:32629", always_xy=True)
    x0, y0 = t.transform(CAIXA[0], CAIXA[1])
    x1, y1 = t.transform(CAIXA[2], CAIXA[3])
    for b in BANDAS:
        with rasterio.open(f"{url_cena(cena)}/{b}.tif") as ds:
            w = from_bounds(min(x0, x1), min(y0, y1), max(x0, x1), max(y0, y1), ds.transform).round_offsets().round_lengths()
            a = ds.read(1, window=w)
            prof = ds.profile
            prof.update(width=w.width, height=w.height, transform=ds.window_transform(w), driver="GTiff",
                        compress="deflate", tiled=False)
            prof.pop("blockxsize", None)
            prof.pop("blockysize", None)
            with rasterio.open(os.path.join(destino, f"{b}.tif"), "w", **prof) as o:
                o.write(a, 1)
    return destino


def resumo(pasta):
    h = hashlib.sha256()
    for b in BANDAS:
        with open(os.path.join(pasta, f"{b}.tif"), "rb") as f:
            h.update(f.read())
    return h.hexdigest()


def estimar(pasta, dems):
    ref = rasterio.open(os.path.join(pasta, "B02.tif"))
    T, crs, shp = ref.transform, ref.crs, (ref.height, ref.width)
    h, w = shp
    fundo = (slice(int(h * 0.85), h), slice(int(w * 0.4), int(w * 0.7)))
    bruto = {b: rasterio.open(os.path.join(pasta, f"{b}.tif")).read(1).astype(float) for b in BANDAS[:4]}
    desvio = 0.1 if np.median(bruto["B08"][fundo]) > 600 else 0.0
    B, G, R, N = (ndi.median_filter(bruto[b] * 1e-4 - desvio, 3) for b in BANDAS[:4])
    scl = np.zeros(shp, dtype=np.uint8)
    reproject(rasterio.band(rasterio.open(os.path.join(pasta, "SCL.tif")), 1), scl,
              dst_transform=T, dst_crs=crs, resampling=Resampling.nearest)
    z = np.full(shp, np.nan, dtype=np.float32)
    for p in dems:
        zz = np.full(shp, np.nan, dtype=np.float32)
        with rasterio.open(p) as ds:
            reproject(rasterio.band(ds, 1), zz, src_nodata=ds.nodata, dst_transform=T, dst_crs=crs,
                      dst_nodata=np.nan, resampling=Resampling.average)
        z = np.where(np.isfinite(zz), zz, z)
    Bf, Gf, Rf = (float(np.percentile(x[fundo], 50)) for x in (B, G, R))
    agua = (scl == 6) & (N < 0.02) & (B - Bf > 0.0005) & (G - Gf > 0.0005) & (R - Rf > 0.0002)
    X = lambda m: np.column_stack([np.ones(m.sum()), np.log(B[m] - Bf), np.log(G[m] - Gf), np.log(R[m] - Rf)])
    k = agua & np.isfinite(z) & (z >= CALIBRACAO[0]) & (z <= CALIBRACAO[1])
    coef, *_ = np.linalg.lstsq(X(k), z[k], rcond=None)
    e = X(k) @ coef - z[k]
    est = np.full(shp, np.nan, dtype=np.float32)
    est[agua] = X(agua) @ coef
    est[(est < GAMA[0]) | (est > GAMA[1])] = np.nan
    est[np.isin(scl, [4, 5, 7]) & (N > 0.05)] = 3.0
    # para EPSG:3763 a 5 m (o resto do tratamento é o dos DEM do COSMO)
    dt, dw, dh = calculate_default_transform(crs, "EPSG:3763", w, h, *rasterio.transform.array_bounds(h, w, T), resolution=5.0)
    out = np.full((dh, dw), np.nan, dtype=np.float32)
    reproject(est, out, src_transform=T, src_crs=crs, src_nodata=np.nan, dst_transform=dt, dst_crs="EPSG:3763",
              dst_nodata=np.nan, resampling=Resampling.bilinear)
    calib = {"pixeis": int(k.sum()), "eqmM": round(float(np.sqrt((e ** 2).mean())), 2),
             "r2": round(float(1 - (e ** 2).sum() / ((z[k] - z[k].mean()) ** 2).sum()), 2),
             "coeficientes": [round(float(c), 4) for c in coef], "compensacaoL2A": desvio}
    return out, dt, calib


def cobertura_estimativa(z, t, geo):
    valido = np.isfinite(z) & (z < 2)
    valido = ndi.binary_closing(valido, iterations=10)
    lab = measure.label(valido)
    maior = lab == np.argmax(np.bincount(lab.ravel())[1:]) + 1
    cont = max(measure.find_contours(np.pad(maior, 1).astype(float), 0.5), key=len)
    px, py = fc.xy_continuo(t, cont[:, 0] - 1, cont[:, 1] - 1)
    return geo.linha(list(Polygon(np.column_stack([px, py])).simplify(20.0).exterior.coords))


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("saida")
    ap.add_argument("--cena", required=True)
    ap.add_argument("--confirmar")
    ap.add_argument("--cosmo", nargs=2, action="append", required=True, metavar=("JSON", "TIF"))
    ap.add_argument("--pasta", default="recortes-sentinel2")
    a = ap.parse_args()
    dems = []
    for js, tif in a.cosmo:
        if fc.sha256(tif) != json.load(open(js, encoding="utf-8"))["fonte"]["sha256"]:
            sys.exit(f"{tif}: SHA-256 diferente do registado em {js}")
        dems.append(tif)
    geo = fc.Geo()
    resultados = {}
    for cena in [a.cena] + ([a.confirmar] if a.confirmar else []):
        pasta = recortar(cena, a.pasta)
        z, t, calib = estimar(pasta, dems)
        resultados[cena] = (z, t, calib, fc.formas(z, t, geo, fc.CRITERIOS), resumo(pasta))
        print(cena, calib, len(resultados[cena][3]), "formas")
    z, t, calib, formas, sha = resultados[a.cena]
    if a.confirmar:
        outras = [(f["tipo"], Polygon(f["contorno"]).buffer(0)) for f in resultados[a.confirmar][3]]
        formas = [f for f in formas if any(tp == f["tipo"] and Polygon(f["contorno"]).buffer(0).intersects(p) for tp, p in outras)]
        n = {"fundão": 0, "cabeço": 0}
        for f in formas:
            n[f["tipo"]] += 1
            f["id"] = ("F" if f["tipo"] == "fundão" else "C") + str(n[f["tipo"]])
    data = lambda c: f"{c.split('_')[2][:4]}-{c.split('_')[2][4:6]}-{c.split('_')[2][6:8]}"
    resultado = {
        "versao": VERSAO, "id": "satelite", "nome": f"Satélite ({'/'.join(reversed(data(a.cena).split('-')))})",
        "fonte": {
            "nome": "Copernicus Sentinel-2 (ESA), tratado nesta app",
            "tipo": "estimado",
            "produto": a.cena,
            "levantamento": data(a.cena),
            **({"confirmadoCom": a.confirmar, "confirmadoEm": data(a.confirmar)} if a.confirmar else {}),
            "url": ITEM + a.cena,
            "resolucaoM": 10,
            "referenciaVertical": "zero hidrográfico, por calibração com os levantamentos COSMO de 06/2025 "
                                  "(a maré do momento da imagem entra na calibração)",
            "utilizacao": "Copernicus Sentinel: uso livre; contém dados Copernicus Sentinel modificados",
            "sha256": sha,
        },
        "tratamento": {
            "ferramenta": "ferramentas/batimetria_satelite.py", "versao": VERSAO, "provisorio": True,
            "criterios": fc.CRITERIOS, "calibracao": calib,
            "validacao": {"imagem": "S2A_29SNB_20250614_1_L2A", "eqmM": [0.70, 0.79], "correlacaoAnomalias": [0.82, 0.93],
                          "sinalCerto": [0.91, 0.98], "nota": "calibrar num COSMO e testar no outro (0 a −6 m ZH)"},
            "nota": "Estimativa, não medição: erro típico de 0,6–0,8 m na cota; só entre ~0,3 e 4,5 m de profundidade; "
                    "dias calmos e de água limpa.",
        },
        "cobertura": cobertura_estimativa(z, t, geo),
        "formas": formas,
        "isobatas": [],
    }
    with open(a.saida, "w", encoding="utf-8") as f:
        json.dump(resultado, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")
    print(f"{a.saida}: {len(formas)} formas (calibração: EQM {calib['eqmM']} m, R² {calib['r2']})")


if __name__ == "__main__":
    main()
