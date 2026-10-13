"""Converte a tabela de marés do IH (Faro-Olhão, 2026) em mares/2026.json.

Lê as caixas de palavras (pdftotext -bbox) das páginas 143–146 do PDF oficial
e valida tudo antes de escrever: dias seguidos, dia da semana, alternância
PM/BM, intervalos e número de dias. Uso:
  python3 mares_ih.py <dir_com_pNNN.html> <saida.json> <sha256_pdf>
"""
import datetime as dt
import html
import json
import re
import sys
from collections import defaultdict

PAGINAS = [143, 144, 145, 146]
MESES = ["JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO", "JULHO",
         "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"]
SEMANA = ["SEG", "TER", "QUA", "QUI", "SEX", "SÁB", "DOM"]
RE_HORA = re.compile(r"^([01]\d|2[0-3]):([0-5]\d)$")
RE_ALT = re.compile(r"^-?\d\.\d$")
RE_DIA = re.compile(r"^(0[1-9]|[12]\d|3[01])$")
RE_WORD = re.compile(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</word>')


def palavras(path):
    out = []
    for m in RE_WORD.finditer(open(path, encoding="utf-8").read()):
        x0, y0, x1, y1 = map(float, m.groups()[:4])
        out.append({"x0": x0, "y0": y0, "x1": x1, "y1": y1, "yc": (y0 + y1) / 2, "t": html.unescape(m.group(5))})
    return out


def agrupar(valores, tol):
    grupos = []
    for v in sorted(valores):
        if grupos and v - grupos[-1][-1] <= tol:
            grupos[-1].append(v)
        else:
            grupos.append([v])
    return [sum(g) / len(g) for g in grupos]


def pagina(path, erros):
    w = palavras(path)
    meses = [p for p in w if p["t"] in MESES]
    meses.sort(key=lambda p: p["x0"])
    if len(meses) != 3:
        erros.append(f"{path}: {len(meses)} cabeçalhos de mês")
        return []
    nomes_meses = [MESES.index(p["t"]) + 1 for p in meses]
    # Rótulos de dia: números de 2 algarismos com letra grande (altura ~15 pt) na coluna de rótulos.
    rot = [p for p in w if RE_DIA.match(p["t"]) and (p["y1"] - p["y0"]) > 12]
    colx = agrupar([p["x0"] for p in rot], 15)
    if len(colx) != 6:
        erros.append(f"{path}: {len(colx)} colunas de dias (esperadas 6): {colx}")
        return []
    def coluna_de(x):
        cands = [i for i, cx in enumerate(colx) if cx <= x + 2]
        return cands[-1] if cands else None
    semanas = [p for p in w if p["t"] in SEMANA]
    horas = [p for p in w if RE_HORA.match(p["t"])]
    alturas = [p for p in w if RE_ALT.match(p["t"])]
    eventos = []
    for c in range(6):
        mes = nomes_meses[c // 2]
        labels = sorted([p for p in rot if coluna_de(p["x0"]) == c], key=lambda p: p["yc"])
        dias = [int(p["t"]) for p in labels]
        esperado_ini = 1 if c % 2 == 0 else 17
        ultimo_dia = (dt.date(2026, mes % 12 + 1, 1) - dt.timedelta(days=1)).day if mes < 12 else 31
        esperado = list(range(esperado_ini, (16 if c % 2 == 0 else ultimo_dia) + 1))
        if dias != esperado:
            erros.append(f"{path} col {c} mês {mes}: dias {dias} != {esperado}")
            continue
        ys = [p["yc"] for p in labels]
        passo = (ys[-1] - ys[0]) / (len(ys) - 1) if len(ys) > 1 else 42
        # O número do dia está na 2.ª linha do bloco: linhas a −6, +3, +12 e +21 pt do
        # centro do número, com 42 pt entre dias. Bloco do dia = [−13,5; +28,5[ (escalado ao passo real).
        limites = [(y - passo * 13.5 / 42, y + passo * 28.5 / 42) for y in ys]
        hs = [p for p in horas if coluna_de(p["x0"]) == c]
        usados = set()
        for i, (lo, hi) in enumerate(limites):
            d = dt.date(2026, mes, dias[i])
            # Dia da semana impresso (quando existe) tem de bater certo.
            sem = [p for p in semanas if coluna_de(p["x0"]) == c and lo <= p["yc"] < hi]
            if sem and sem[0]["t"] != SEMANA[d.weekday()]:
                erros.append(f"{d}: dia da semana impresso {sem[0]['t']} != {SEMANA[d.weekday()]}")
            do_dia = sorted([p for p in hs if lo <= p["yc"] < hi], key=lambda p: p["yc"])
            if not 3 <= len(do_dia) <= 4:
                erros.append(f"{d}: {len(do_dia)} eventos")
            for h in do_dia:
                par = [a for a in alturas if abs(a["yc"] - h["yc"]) < 3 and 0 < a["x0"] - h["x1"] < 45]
                if len(par) != 1:
                    erros.append(f"{d} {h['t']}: {len(par)} alturas")
                    continue
                usados.add(id(h))
                eventos.append((dt.datetime.combine(d, dt.time(*map(int, h["t"].split(":")))), float(par[0]["t"])))
        sobra = [p["t"] for p in hs if id(p) not in usados]
        if sobra:
            erros.append(f"{path} col {c}: horas sem dia {sobra}")
    return eventos


def main():
    pasta, saida, sha = sys.argv[1:4]
    erros = []
    eventos = []
    for p in PAGINAS:
        eventos += pagina(f"{pasta}/p{p}.html", erros)
    eventos.sort()
    dias = {e[0].date() for e in eventos}
    if len(dias) != 365:
        erros.append(f"{len(dias)} dias com eventos (esperados 365)")
    # Tipo: a tabela não o indica. Alternância a partir do primeiro evento (PM se for mais
    # alto do que o segundo); depois verifica-se que cada PM é mais alta do que as BM vizinhas.
    primeiro = "PM" if eventos[0][1] > eventos[1][1] else "BM"
    tipos = [primeiro if i % 2 == 0 else ("BM" if primeiro == "PM" else "PM") for i in range(len(eventos))]
    for i in range(1, len(eventos)):
        (t0, h0), (t1, h1) = eventos[i - 1], eventos[i]
        pm, bm = (h0, h1) if tipos[i - 1] == "PM" else (h1, h0)
        if not pm > bm:
            erros.append(f"{t1}: PM ({pm}) não é mais alta do que a BM vizinha ({bm})")
    for i in range(1, len(eventos)):
        dmin = (eventos[i][0] - eventos[i - 1][0]).total_seconds() / 60
        if not 30 <= dmin <= 480:
            erros.append(f"{eventos[i][0]}: intervalo de {dmin:.0f} min")
    if erros:
        print("ERROS:\n" + "\n".join(erros[:80]))
        sys.exit(1)
    fonte = "Instituto Hidrográfico, Tabela de Marés 2026, Vol. I, Porto de Faro-Olhão"
    doc = {
        "schemaVersion": 1,
        "station": "Faro-Olhão",
        "year": 2026,
        "timezone": "UTC",
        "source": fonte,
        "sourceUrl": "https://loja.hidrografico.pt/ln/web/wp-content/uploads/2023/11/TabelaMare_I_2026_signed.pdf",
        "sourcePages": "2-121 a 2-124 (páginas 143 a 146 do PDF)",
        "sourceSha256": sha,
        "heightDatum": "zero hidrográfico (2,00 m abaixo do nível médio adotado, Cascais 1938)",
        "heightResolutionM": 0.1,
        "notice": "Horas da tabela em TU (UTC), convertidas para instantes ISO com Z. Tipo PM/BM deduzido pela alternância das alturas (a tabela não o indica). Transcrição automática validada: dias seguidos, dia da semana, alternância e intervalos.",
        "events": [{"instant": t.strftime("%Y-%m-%dT%H:%M:00Z"), "type": tp, "heightM": h, "source": "IH 2026 Faro-Olhão"}
                   for (t, h), tp in zip(eventos, tipos)]
    }
    with open(saida, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print(f"ok: {len(eventos)} eventos, {len(dias)} dias, PM {tipos.count('PM')}, BM {tipos.count('BM')}")


main()
