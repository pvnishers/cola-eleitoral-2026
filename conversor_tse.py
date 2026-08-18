"""
conversor_tse.py
────────────────
Converte o CSV oficial do TSE (consulta_cand_2026) para o formato JSON
utilizado pelo app "Cola Eleitoral Dinamica 2026".

Schema real do CSV 2026 (50 colunas, sep=';', encoding=latin-1):
  Filtro de situacao: DS_SITUACAO_CANDIDATURA in ('APTO', 'CADASTRADO')
  Nao existe DS_DETALHE_SITUACAO_CAND no arquivo de 2026.

Uso:
    python conversor_tse.py --input consulta_cand_2026_BRASIL.csv --output candidatos.json
    python conversor_tse.py --input consulta_cand_2026_SP.csv     --output candidatos.json --uf SP
"""

import argparse
import json
import sys


def parse_args():
    parser = argparse.ArgumentParser(
        description="Converte CSV do TSE 2026 para candidatos.json (Cola Eleitoral)"
    )
    parser.add_argument("--input",  "-i", required=True,  help="CSV do TSE")
    parser.add_argument("--output", "-o", default="candidatos.json", help="JSON de saida")
    parser.add_argument("--uf",     "-u", default=None,   help="Filtrar por UF (ex: SP)")
    return parser.parse_args()


def converter(input_path: str, output_path: str, uf_filter: str | None = None):
    try:
        import pandas as pd
    except ImportError:
        print("[ERRO] Pandas nao encontrado. Instale com: pip install pandas")
        sys.exit(1)

    print(f"[INFO] Lendo: {input_path} ...")

    # ── Leitura do CSV ──────────────────────────────────────────────────────────
    # TSE 2026: ISO-8859-1, separador ";", campos entre aspas duplas
    df = pd.read_csv(
        input_path,
        sep=";",
        encoding="latin-1",
        dtype=str,
        on_bad_lines="skip",
        low_memory=False,
    )

    # Remover BOM e espacos dos nomes das colunas
    df.columns = [c.strip().replace("\ufeff", "") for c in df.columns]

    print(f"[OK] {len(df):,} registros | {len(df.columns)} colunas")
    print(f"     Colunas: {list(df.columns[:6])} ...")

    # ── Colunas essenciais para o app ──────────────────────────────────────────
    # No CSV de 2026 nao existe DS_DETALHE_SITUACAO_CAND.
    # O filtro de aptidao e feito via DS_SITUACAO_CANDIDATURA.
    COLS = [
        "SG_UF",
        "CD_CARGO",
        "DS_CARGO",
        "SQ_CANDIDATO",
        "NR_CANDIDATO",
        "NM_URNA_CANDIDATO",
        "NM_CANDIDATO",
        "SG_PARTIDO",
        "NM_PARTIDO",
        "DS_SITUACAO_CANDIDATURA",
        "DS_GENERO",
        "DS_COR_RACA",
        "NM_FEDERACAO",     # novo em 2026
        "SG_FEDERACAO",     # novo em 2026
    ]

    # Checar quais colunas realmente existem (tolerante a versoes diferentes)
    cols_ok      = [c for c in COLS if c in df.columns]
    cols_ausentes = [c for c in COLS if c not in df.columns]
    if cols_ausentes:
        print(f"[AVISO] Colunas nao encontradas (serao omitidas): {cols_ausentes}")

    df = df[cols_ok].copy()

    # ── Normalizar strings ──────────────────────────────────────────────────────
    for col in df.select_dtypes(include="object").columns:
        df[col] = df[col].str.strip()

    # ── Gerar caminho da foto oficial do candidato ──────────────────────────────
    if "SQ_CANDIDATO" in df.columns and "SG_UF" in df.columns:
        uf_foto = df["SG_UF"].str.upper()
        # Se cargo for Presidente (1), a pasta de fotos do TSE é "BR"
        if "CD_CARGO" in df.columns:
            uf_foto = uf_foto.where(df["CD_CARGO"] != "1", "BR")
        df["foto"] = "fotos_candidatos/" + uf_foto + "/F" + uf_foto + df["SQ_CANDIDATO"] + "_div.jpg"

    # ── Filtrar situacao de candidatura ────────────────────────────────────────
    if "DS_SITUACAO_CANDIDATURA" in df.columns:
        # #NE = "Nao Encerrado" — candidaturas ainda em registro (fase pre-eleicao)
        # APTO/CADASTRADO = candidaturas homologadas
        # Incluimos #NE pois o TSE publica os dados antes do encerramento do prazo
        SITUACOES_VALIDAS = {"APTO", "CADASTRADO", "#NE"}
        antes = len(df)
        df = df[df["DS_SITUACAO_CANDIDATURA"].isin(SITUACOES_VALIDAS)]
        # Traduzir #NE para label amigavel
        df["DS_SITUACAO_CANDIDATURA"] = df["DS_SITUACAO_CANDIDATURA"].replace({
            "#NE": "EM REGISTRO",
            "APTO": "DEFERIDO",
            "CADASTRADO": "CADASTRADO",
        })
        print(f"[OK] {len(df):,} candidatos incluidos (removidos {antes - len(df):,})")
    else:
        print("[AVISO] DS_SITUACAO_CANDIDATURA nao encontrada — sem filtro de aptidao")

    # ── Filtrar cargos relevantes para a Cola ──────────────────────────────────
    # CD_CARGO: 1=Presidente, 2=Vice-Pres, 3=Governador, 4=Vice-Gov,
    #           5=Senador, 6=Dep.Federal, 7=Dep.Estadual, 8=Dep.Distrital
    CARGOS_VALIDOS = {"1", "3", "5", "6", "7", "8"}
    if "CD_CARGO" in df.columns:
        antes = len(df)
        df = df[df["CD_CARGO"].isin(CARGOS_VALIDOS)]
        print(f"[OK] {len(df):,} candidatos nos cargos relevantes (removidos {antes - len(df):,})")

    # ── Presidente -> UF = NACIONAL ────────────────────────────────────────────
    if "CD_CARGO" in df.columns and "SG_UF" in df.columns:
        df.loc[df["CD_CARGO"] == "1", "SG_UF"] = "NACIONAL"

    # ── Filtrar UF se solicitado ────────────────────────────────────────────────
    if uf_filter and "SG_UF" in df.columns:
        uf_filter = uf_filter.upper()
        df = df[(df["SG_UF"] == uf_filter) | (df["SG_UF"] == "NACIONAL")]
        print(f"[OK] {len(df):,} candidatos apos filtro UF={uf_filter}")

    # ── Renomear para o padrao do app ───────────────────────────────────────────
    rename_map = {
        "SG_UF":                    "uf",
        "CD_CARGO":                 "cdCargo",
        "DS_CARGO":                 "cargo",
        "SQ_CANDIDATO":             "sqCandidato",
        "NR_CANDIDATO":             "numero",
        "NM_URNA_CANDIDATO":        "nomeUrna",
        "NM_CANDIDATO":             "nomeCompleto",
        "SG_PARTIDO":               "partido",
        "NM_PARTIDO":               "nomePartido",
        "DS_SITUACAO_CANDIDATURA":  "situacao",
        "DS_GENERO":                "genero",
        "DS_COR_RACA":              "corRaca",
        "NM_FEDERACAO":             "federacao",
        "SG_FEDERACAO":             "sgFederacao",
    }
    rename_ok = {k: v for k, v in rename_map.items() if k in df.columns}
    df = df.rename(columns=rename_ok)

    # ── Remover duplicatas (mesmo candidato em multiplos turnos) ───────────────
    dedup_cols = ["numero", "cargo", "uf"]
    dedup_ok   = [c for c in dedup_cols if c in df.columns]
    if dedup_ok:
        antes = len(df)
        df = df.drop_duplicates(subset=dedup_ok, keep="first")
        if antes != len(df):
            print(f"[OK] {antes - len(df):,} duplicatas removidas")

    # ── ID sequencial ───────────────────────────────────────────────────────────
    df = df.reset_index(drop=True)
    df.insert(0, "id", range(1, len(df) + 1))

    # Substituir valores "#NE", "#NULO", NaN por string vazia
    df = df.replace({"#NE": "", "#NULO": "", "#NI": ""})
    df = df.fillna("")

    # ── Exportar JSON ───────────────────────────────────────────────────────────
    registros = df.to_dict(orient="records")
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(registros, f, ensure_ascii=False, indent=2)

    tamanho_kb = round(len(json.dumps(registros)) / 1024, 1)
    print(f"\n[OK] Exportado: {output_path}")
    print(f"     Total: {len(registros):,} candidatos | {tamanho_kb} KB")

    # Resumo por cargo
    from collections import Counter
    cargos = Counter(r.get("cargo", "?") for r in registros)
    print("\nCandidatos por cargo:")
    for cargo, qtd in sorted(cargos.items()):
        print(f"   {cargo:<35} {qtd:>6,}")

    # Resumo por UF (top 10)
    ufs = Counter(r.get("uf", "?") for r in registros)
    print("\nTop UFs:")
    for uf, qtd in ufs.most_common(10):
        print(f"   {uf:<10} {qtd:>6,}")


if __name__ == "__main__":
    args = parse_args()
    converter(args.input, args.output, args.uf)
