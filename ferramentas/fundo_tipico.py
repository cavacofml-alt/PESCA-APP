"""Fundo típico de cada praia: cota mediana a 100, 150 e 200 m da linha de meia-maré.

Para cada pesqueiro de tipo «praia» do config, à volta do seu ponto de terra:
  1. costa = células com cota >= 2 m (nível médio) que tocam no mar;
  2. entram as células de mar cujo ponto de costa mais próximo fica a 500 m ou menos do pesqueiro;
  3. cota mediana dessas células a 100, 150 e 200 m da costa (faixas de ±5 m).
Fontes por ordem: os levantamentos COSMO (o mais recente primeiro) e, se nenhum cobrir a praia,
o LiDAR 2011 do IH (EMODnet). Uma fonte só serve se tiver costa em pelo menos 60 % dos 1000 m à volta
do pesqueiro e 30 células ou mais em cada distância. Tudo a 3 m (o COSMO é reduzido por média).

Dependências: numpy, scipy, rasterio, pyproj. Uso:
  python3 -I ferramentas/fundo_tipico.py fundos/tipico.json \\
      --cosmo fundos/quarteira_garrao.json LTHQUGA1_20250612_20250616_DEM.tif \\
      --cosmo fundos/praia_faro.json LTHFA1_20250617_DEM.tif \\
      --lidar lidar2011.tif 590_HR_Lidar_Algarve.emo.zip
"""
import argparse
import datetime as dt
import hashlib
import json
import sys

import numpy as np
import rasterio
from pyproj import Transformer
from rasterio.enums import Resampling
from rasterio.windows import from_bounds
from scipy import ndimage as ndi

DISTANCIAS = (100, 150, 200)
# cotaCostaM: linha de meia-maré, 2 m ao ZH. No LiDAR (à LAT) usa-se o mesmo valor: a LAT fica 0 a 0,34 m acima
# do ZH em Faro-Olhão, o que pode deslocar a linha de costa uns metros para o largo (limitação conhecida).
CRITERIOS = {"cotaCostaM": 2.0, "raioM": 500, "faixaM": 5, "resolucaoM": 3.0,
             "coberturaCostaMin": 0.6, "celulasMin": 30, "distanciasM": list(DISTANCIAS)}
LIDAR = {
    "nome": "Instituto Hidrográfico — LiDAR 2011 (projecto DGT/APA), publicado no EMODnet Bathymetry",
    "rotulo": "LiDAR 2011",
    "produto": "590_HR_Lidar_Algarve",
    "levantamento": "2011",
    "url": "https://emodnet.ec.europa.eu/geonetwork/srv/api/records/SDN_CPRD_590_HR_Lidar_Algarve",
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
    "tratamento": "grelha de ~12 x 14 m (1/128 de minuto); ~1 % de falhas preenchidas com a média das vizinhas "
                  "(ferramentas/lidar_emodnet.py)",
}


def sha256(caminho):
    h = hashlib.sha256()
    with open(caminho, "rb") as f:
        for bloco in iter(lambda: f.read(1 << 20), b""):
            h.update(bloco)
    return h.hexdigest()


def janela(tif, x, y, raio):
    with rasterio.open(tif) as ds:
        if ds.crs is None or ds.crs.to_epsg() != 3763:
            sys.exit(f"{tif}: esperado EPSG:3763")
        f = max(1, round(CRITERIOS["resolucaoM"] / ds.res[0]))
        w = from_bounds(x - raio, y - raio, x + raio, y + raio, ds.transform).round_offsets().round_lengths()
        a = ds.read(1, window=w, out_shape=(max(1, int(w.height // f)), max(1, int(w.width // f))),
                    resampling=Resampling.average, masked=True, boundless=True, fill_value=ds.nodata)
        res = ds.res[0] * w.width / a.shape[1]
    z = a.filled(np.nan).astype(float)
    z[(z < -100) | (z > 100)] = np.nan
    return z, res


def perfil(tif, x, y):
    c = CRITERIOS
    z, res = janela(tif, x, y, c["raioM"] + 400)
    terra = np.isfinite(z) & (z >= c["cotaCostaM"])
    mar = np.isfinite(z) & (z < c["cotaCostaM"])
    lab, n = ndi.label(mar)
    if n == 0 or not terra.any():
        return None, "sem costa nem mar na janela"
    tam = np.bincount(lab.ravel())
    tam[0] = 0
    mar = lab == tam.argmax()
    h, w = z.shape
    borda = terra & ndi.binary_dilation(mar)
    bl, bc = np.nonzero(borda)
    perto_borda = np.hypot((bl - h / 2) * res, (bc - w / 2) * res) <= c["raioM"]
    cobertura = perto_borda.sum() / (2 * c["raioM"] / res)
    if cobertura < c["coberturaCostaMin"]:
        return None, f"costa em {cobertura:.0%} dos {2 * c['raioM']} m à volta do pesqueiro"
    d, (li, co) = ndi.distance_transform_edt(~terra, return_indices=True)
    d *= res
    perto = np.hypot((li - h / 2) * res, (co - w / 2) * res) <= c["raioM"]
    out, amostras = {}, {}
    for dd in DISTANCIAS:
        k = mar & perto & (np.abs(d - dd) <= c["faixaM"])
        if k.sum() < c["celulasMin"]:
            return None, f"só {int(k.sum())} células a {dd} m"
        out[str(dd)] = round(float(np.median(z[k])), 1)
        amostras[str(dd)] = int(k.sum())
    return {"cotas": out, "celulas": amostras, "coberturaCosta": round(float(min(cobertura, 1.0)), 2)}, None


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("saida")
    ap.add_argument("--config", default="config.json")
    ap.add_argument("--cosmo", nargs=2, action="append", default=[], metavar=("JSON", "TIF"))
    ap.add_argument("--lidar", nargs=2, metavar=("TIF", "ZIP"))
    a = ap.parse_args()
    cfg = json.load(open(a.config, encoding="utf-8"))
    fontes, ordem = {}, []
    for js, tif in a.cosmo:
        d = json.load(open(js, encoding="utf-8"))
        if sha256(tif) != d["fonte"]["sha256"]:
            sys.exit(f"{tif}: SHA-256 diferente do registado em {js}")
        f = d["fonte"]
        fontes[d["id"]] = {k: f[k] for k in ("nome", "produto", "levantamento", "levantamentoFim", "url",
                                                 "referenciaVertical", "utilizacao", "sha256") if k in f}
        fim = f.get("levantamentoFim") or f["levantamento"]
        fontes[d["id"]]["rotulo"] = f"COSMO {fim[5:7]}/{fim[:4]}"
        fontes[d["id"]]["datum"] = "ZH"
        ordem.append((fim, d["id"], tif))
    ordem.sort(reverse=True)
    if a.lidar:
        fontes["lidar2011"] = {**LIDAR, "sha256": sha256(a.lidar[1])}
        ordem.append(("2011", "lidar2011", a.lidar[0]))
    to = Transformer.from_crs("EPSG:4326", "EPSG:3763", always_xy=True)
    praias = {}
    for pid, pq in cfg["pesqueiros"].items():
        if pq.get("tipo") != "praia":
            continue
        p = cfg["locais"][pq["terra"]]
        x, y = to.transform(p["longitude"], p["latitude"])
        motivos = []
        for _, fid, tif in ordem:
            r, motivo = perfil(tif, x, y)
            if r:
                praias[pid] = {"fonte": fid, **r}
                break
            motivos.append(f"{fid}: {motivo}")
        if pid not in praias:
            praias[pid] = {"fonte": None, "motivo": "; ".join(motivos) or "sem fontes"}
        print(pid, praias[pid])
    usadas = {p["fonte"] for p in praias.values() if p["fonte"]}
    fontes = {k: v for k, v in fontes.items() if k in usadas}
    out = {"versao": 1, "geradoEm": dt.date.today().isoformat(), "ferramenta": "ferramentas/fundo_tipico.py",
           "criterios": CRITERIOS, "provisorio": True, "fontes": fontes, "praias": praias}
    with open(a.saida, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
        f.write("\n")


if __name__ == "__main__":
    main()
