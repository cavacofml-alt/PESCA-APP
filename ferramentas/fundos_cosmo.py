"""Converte um modelo digital de elevação (DEM) do Programa COSMO (APA) em fundos/<id>.json.

O DEM vem do levantamento topo-hidrográfico do COSMO (GeoTIFF, EPSG:3763, cotas em metros ao
zero hidrográfico, 2 m abaixo do nível médio). O ficheiro original não entra no repositório:
o acesso é limitado a utilizadores registados no COSMO. Só o resultado tratado é guardado.

Saída (JSON, lida pelo ecrã «Mapa»):
  - isobatas: linhas de igual cota do nível médio (2 m ZH) para baixo: de 0,5 em 0,5 m até
    -10 m ZH, de 1 em 1 m até -20 m e de 5 em 5 m daí para baixo (fora do alcance do surfcasting);
  - formas: fundões e cabeços, com o ponto mais fundo / menos fundo, a cota e o contorno;
  - cobertura: contorno da zona levantada;
  - fonte e tratamento: produto, data do levantamento, SHA-256 do DEM e critérios usados.

Fundões e cabeços (critérios provisórios, iguais para todos os DEM, guardados na saída):
  1. distância à costa = distância ao ponto mais próximo com cota >= 2 m ZH (nível médio);
  2. perfil típico = mediana das cotas à mesma distância da costa (classes de 1 m), tomadas nos
     pontos cujo ponto de costa mais próximo fica a 500 m ou menos (serve para costas curvas,
     cabos e barras entre ilhas);
  3. anomalia = cota - perfil típico (filtro de mediana 3 x 3 para tirar o ruído);
  4. fundão: anomalia <= -0,4 m; cabeço: anomalia >= +0,4 m; zonas com pelo menos 1000 m²,
     entre 15 e 320 m da costa, e cuja anomalia mais forte fica a 200 m da costa ou menos;
  5. ponto marcado: o mais fundo (fundão) ou o menos fundo (cabeço) da zona, até 200 m da costa.

Dependências (só para correr esta ferramenta; a app não usa Python):
  pip install numpy scipy rasterio pyproj shapely scikit-image
Uso:
  python3 -I ferramentas/fundos_cosmo.py DEM.tif fundos/<id>.json --id <id> --nome "<nome>" \\
      --produto <produto COSMO> --levantamento AAAA-MM-DD [--levantamento-fim AAAA-MM-DD] \\
      --url <página do produto no COSMO>
"""
import argparse
import datetime as dt
import hashlib
import json
import math
import sys

import numpy as np
import rasterio
from pyproj import Transformer
from rasterio.enums import Resampling
from scipy import ndimage as ndi
from shapely.geometry import LineString, Polygon
from skimage import measure

VERSAO = 1
CRITERIOS = {
    "cotaCostaM": 2.0,          # nível médio = 2,00 m acima do zero hidrográfico (Faro-Olhão)
    "classeDistanciaM": 1.0,
    "raioCostaM": 500.0,
    "limiarAnomaliaM": 0.4,
    "areaMinimaM2": 1000.0,
    "distanciaMinimaM": 15.0,
    "faixaM": 320.0,
    "distanciaMaximaM": 200.0,
    # [até esta cota (m ZH), intervalo (m)]: 0,5 m até -10, 1 m até -20, 5 m daí para baixo
    "isobatasNiveis": [[-10.0, 0.5], [-20.0, 1.0], [-100.0, 5.0]],
}
CELULA_COSTA_M = 50.0
PASSO_FORMAS = 2      # 0,3 m x 2 = 0,6 m
PASSO_ISOBATAS = 4    # 0,3 m x 4 = 1,2 m
SIMPLIFICAR_M = 0.6
LINHA_MINIMA_M = 15.0


def sha256(caminho):
    h = hashlib.sha256()
    with open(caminho, "rb") as f:
        for bloco in iter(lambda: f.read(1 << 20), b""):
            h.update(bloco)
    return h.hexdigest()


def ler(caminho, passo):
    with rasterio.open(caminho) as ds:
        if ds.crs is None or ds.crs.to_epsg() != 3763:
            sys.exit(f"Sistema de coordenadas inesperado: {ds.crs} (esperado EPSG:3763)")
        if ds.count != 1 or ds.nodata is None:
            sys.exit("Esperava uma banda com valor de 'sem dados' definido")
        if abs(ds.res[0] - 0.3) > 0.01 or abs(ds.res[1] - 0.3) > 0.01:
            sys.exit(f"Resolução inesperada: {ds.res} (esperado 0,30 m)")
        forma = (ds.height // passo, ds.width // passo)
        a = ds.read(1, out_shape=forma, resampling=Resampling.average, masked=True)
        t = ds.transform * ds.transform.scale(ds.width / forma[1], ds.height / forma[0])
        info = {"largura": ds.width, "altura": ds.height, "limites": list(ds.bounds)}
    z = a.filled(np.nan).astype(np.float32)
    z[(z < -100) | (z > 100)] = np.nan
    return z, t, info


def xy(t, linhas, colunas):
    """Centro das células (linha, coluna) -> coordenadas EPSG:3763."""
    x = t.c + (np.asarray(colunas) + 0.5) * t.a
    y = t.f + (np.asarray(linhas) + 0.5) * t.e
    return x, y


def xy_continuo(t, linhas, colunas):
    """Coordenadas de pontos em fracções de célula (saída do find_contours)."""
    return t.c + (np.asarray(colunas) + 0.5) * t.a, t.f + (np.asarray(linhas) + 0.5) * t.e


class Geo:
    def __init__(self):
        self.t = Transformer.from_crs("EPSG:3763", "EPSG:4326", always_xy=True)

    def lonlat(self, x, y):
        lon, lat = self.t.transform(x, y)
        return round(float(lon), 6), round(float(lat), 6)

    def linha(self, coords):
        lon, lat = self.t.transform([c[0] for c in coords], [c[1] for c in coords])
        return [[round(float(a), 6), round(float(b), 6)] for a, b in zip(lon, lat)]


def mar_principal(z, cota):
    """Maior zona ligada com cota abaixo do nível médio: o mar (deixa de fora lagoas e poças)."""
    mar = np.isfinite(z) & (z < cota)
    lab, n = ndi.label(mar)
    if n == 0:
        sys.exit("Sem mar no DEM")
    tam = np.bincount(lab.ravel())
    tam[0] = 0
    return lab == tam.argmax()


def perfil_tipico(dist, cx, cy, zv, c):
    """Mediana da cota por classe de distância à costa, entre os pontos cujo ponto de costa mais
    próximo fica a menos de raioCostaM (ver cabeçalho). Os pontos de costa são agrupados em
    células de 50 m; entram as células cujo centro fica dentro do raio."""
    from scipy.spatial import cKDTree
    db = np.floor(dist / c["classeDistanciaM"]).astype(np.int64)
    cel_x = np.floor(cx / CELULA_COSTA_M).astype(np.int64)
    cel_y = np.floor(cy / CELULA_COSTA_M).astype(np.int64)
    celulas, cel = np.unique(np.column_stack([cel_x, cel_y]), axis=0, return_inverse=True)
    cel = cel.ravel()
    centros = (celulas + 0.5) * CELULA_COSTA_M
    vizinhas = cKDTree(centros).query_ball_point(centros, r=c["raioCostaM"])
    m = np.full(zv.shape, np.nan, dtype=np.float32)
    ordem = np.lexsort((cel, db))
    db_o, cel_o = db[ordem], cel[ordem]
    fronteiras = np.flatnonzero(np.diff(db_o)) + 1
    for ini, fim in zip(np.r_[0, fronteiras], np.r_[fronteiras, len(db_o)]):
        cs = cel_o[ini:fim]
        zs = zv[ordem[ini:fim]]
        presentes, primeiro = np.unique(cs, return_index=True)
        limites = dict(zip(presentes.tolist(), zip(primeiro.tolist(), np.r_[primeiro[1:], len(cs)].tolist())))
        for k in presentes.tolist():
            partes = [zs[a:b] for a, b in (limites[v] for v in vizinhas[k] if v in limites)]
            a, b = limites[k]
            m[ordem[ini + a:ini + b]] = np.median(np.concatenate(partes))
    return m


def formas(z, t, geo, c):
    terra = np.isfinite(z) & (z >= c["cotaCostaM"])
    mar = mar_principal(z, c["cotaCostaM"])
    dist_px, (li, co) = ndi.distance_transform_edt(~terra, return_indices=True)
    passo = abs(t.a)
    dist = dist_px * passo
    faixa = mar & (dist <= c["faixaM"])
    # ponto de costa mais próximo de cada célula da faixa (coordenadas EPSG:3763)
    cxf, cyf = xy(t, li[faixa], co[faixa])
    cx = np.full(z.shape, np.nan)
    cy = np.full(z.shape, np.nan)
    cx[faixa], cy[faixa] = cxf, cyf
    del li, co
    m = np.full(z.shape, np.nan, dtype=np.float32)
    m[faixa] = perfil_tipico(dist[faixa], cxf, cyf, z[faixa], c)
    anomalia = np.where(faixa, z - m, 0.0)
    anomalia = ndi.median_filter(anomalia, size=3)
    anomalia[~faixa] = 0.0
    zona = faixa & (dist >= c["distanciaMinimaM"])
    saida = []
    for tipo, mascara in (("fundão", anomalia <= -c["limiarAnomaliaM"]), ("cabeço", anomalia >= c["limiarAnomaliaM"])):
        lab = measure.label(mascara & zona, connectivity=2)
        for reg in measure.regionprops(lab):
            area = reg.area * passo * passo
            if area < c["areaMinimaM2"]:
                continue
            ll, cc = reg.coords[:, 0], reg.coords[:, 1]
            an = anomalia[ll, cc]
            e = np.argmin(an) if tipo == "fundão" else np.argmax(an)
            if dist[ll[e], cc[e]] > c["distanciaMaximaM"]:
                continue
            perto = dist[ll, cc] <= c["distanciaMaximaM"]
            zz = z[ll[perto], cc[perto]]
            k = np.nanargmin(zz) if tipo == "fundão" else np.nanargmax(zz)
            lp, cp = ll[perto][k], cc[perto][k]
            lon, lat = geo.lonlat(*xy(t, lp, cp))
            # contorno da zona, simplificado
            sub = np.pad(lab[reg.slice] == reg.label, 1)
            cont = max(measure.find_contours(sub.astype(float), 0.5), key=len)
            px, py = xy_continuo(t, cont[:, 0] + reg.slice[0].start - 1, cont[:, 1] + reg.slice[1].start - 1)
            poli = Polygon(np.column_stack([px, py])).simplify(SIMPLIFICAR_M)
            saida.append({
                "_costa": float(cx[lp, cp]),   # ordem ao longo da costa (de poente para nascente)
                "tipo": tipo,
                "ponto": [lon, lat], "cota": round(float(z[lp, cp]), 2),
                "anomalia": round(float(an[e]), 2),
                "distancia": int(round(float(dist[lp, cp]))),
                "distanciaMin": int(round(float(dist[ll, cc].min()))),
                "distanciaMax": int(round(float(dist[ll, cc].max()))),
                # tamanho da zona: eixos da elipse com os mesmos momentos (arredondados a 10 m)
                "eixoMaior": int(round(reg.axis_major_length * passo, -1)),
                "eixoMenor": int(round(reg.axis_minor_length * passo, -1)),
                "area": int(round(area)),
                "contorno": geo.linha(list(poli.exterior.coords)),
            })
    # numeração pela posição do ponto de costa mais próximo, de poente para nascente
    saida.sort(key=lambda f: f["_costa"])
    n = {"fundão": 0, "cabeço": 0}
    for f in saida:
        n[f["tipo"]] += 1
        f["id"] = ("F" if f["tipo"] == "fundão" else "C") + str(n[f["tipo"]])
        del f["_costa"]
    return saida


def suavizar(z, sigma):
    v = np.isfinite(z)
    num = ndi.gaussian_filter(np.where(v, z, 0.0), sigma)
    den = ndi.gaussian_filter(v.astype(float), sigma)
    with np.errstate(invalid="ignore", divide="ignore"):
        out = num / den
    out[~v] = np.nan
    return out


def niveis_isobatas(c, minimo):
    """Cotas das isóbatas, do nível médio para baixo, até à cota mais funda do DEM."""
    niveis, topo = [], c["cotaCostaM"]
    for ate, passo in c["isobatasNiveis"]:
        n = 0
        while True:
            nivel = round(topo - n * passo, 2)
            if nivel < ate - 1e-9 or nivel < minimo:
                break
            if not niveis or nivel < niveis[-1]:
                niveis.append(nivel)
            n += 1
        topo = ate
    return niveis


def isobatas(z, t, geo, c):
    zs = suavizar(z, 1.0)
    valido = np.isfinite(zs)
    niveis = niveis_isobatas(c, float(np.nanmin(zs)))
    zz = np.where(valido, zs, np.nanmax(zs))
    saida = []
    for nivel in niveis:
        linhas = []
        for cont in measure.find_contours(zz, float(nivel), mask=valido):
            px, py = xy_continuo(t, cont[:, 0], cont[:, 1])
            ls = LineString(np.column_stack([px, py])).simplify(SIMPLIFICAR_M)
            if ls.length >= LINHA_MINIMA_M:
                linhas.append(geo.linha(list(ls.coords)))
        if linhas:
            saida.append({"cota": float(nivel), "linhas": linhas})
    return saida


def cobertura(caminho, geo):
    z, t, _ = ler(caminho, 8)
    v = np.pad(np.isfinite(z), 1)
    cont = max(measure.find_contours(v.astype(float), 0.5), key=len)
    px, py = xy_continuo(t, cont[:, 0] - 1, cont[:, 1] - 1)
    return geo.linha(list(Polygon(np.column_stack([px, py])).simplify(2.0).exterior.coords))


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("dem")
    ap.add_argument("saida")
    ap.add_argument("--id", required=True)
    ap.add_argument("--nome", required=True)
    ap.add_argument("--produto", required=True)
    ap.add_argument("--levantamento", required=True, help="data do levantamento (AAAA-MM-DD); se durou vários dias, o primeiro")
    ap.add_argument("--levantamento-fim", help="último dia do levantamento (AAAA-MM-DD), se durou vários dias")
    ap.add_argument("--url", required=True)
    a = ap.parse_args()
    inicio = dt.date.fromisoformat(a.levantamento)
    if a.levantamento_fim and dt.date.fromisoformat(a.levantamento_fim) <= inicio:
        sys.exit("--levantamento-fim tem de ser depois de --levantamento")
    geo = Geo()
    z, t, info = ler(a.dem, PASSO_FORMAS)
    zi, ti, _ = ler(a.dem, PASSO_ISOBATAS)
    resultado = {
        "versao": VERSAO,
        "id": a.id,
        "nome": a.nome,
        "fonte": {
            "nome": "Agência Portuguesa do Ambiente, Programa COSMO",
            "produto": a.produto,
            "levantamento": a.levantamento,
            **({"levantamentoFim": a.levantamento_fim} if a.levantamento_fim else {}),
            "url": a.url,
            "resolucaoM": 0.3,
            "referenciaVertical": "zero hidrográfico (2,00 m abaixo do nível médio, Cascais 1938)",
            "utilizacao": "Sem restrições (ficha de metadados do COSMO); citar a APA, Programa COSMO",
            "sha256": sha256(a.dem),
        },
        "tratamento": {
            "ferramenta": "ferramentas/fundos_cosmo.py",
            "versao": VERSAO,
            "criterios": CRITERIOS,
            "provisorio": True,
            "nota": "Fundões e cabeços calculados a partir do DEM com os critérios acima. "
                    "Os bancos mudam com os temporais: vale a data do levantamento.",
        },
        "cobertura": cobertura(a.dem, geo),
        "formas": formas(z, t, geo, CRITERIOS),
        "isobatas": isobatas(zi, ti, geo, CRITERIOS),
    }
    with open(a.saida, "w", encoding="utf-8") as f:
        json.dump(resultado, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")
    n_linhas = sum(len(i["linhas"]) for i in resultado["isobatas"])
    print(f"{a.saida}: {len(resultado['formas'])} formas, {len(resultado['isobatas'])} isóbatas "
          f"({n_linhas} linhas); DEM {info['largura']}x{info['altura']}")
    for f in resultado["formas"]:
        print(f"  {f['id']:3s} {f['tipo']:7s} {f['ponto'][1]:.5f},{f['ponto'][0]:.5f} cota {f['cota']:+.2f} "
              f"a {f['distancia']} m (de {f['distanciaMin']} a {f['distanciaMax']}), {f['area']} m²")


if __name__ == "__main__":
    main()
