# -*- coding: utf-8 -*-
"""
priorizar.py
Ponto de entrada principal. Gera:
  - output/fila_priorizada.csv          (lista única — entregável do desafio)
  - output/por_especialidade/<esp>.csv  (sublistas operacionais)

Uso:
  python src/priorizar.py
  python src/priorizar.py --sem-llm          # força modo offline
  python src/priorizar.py --dataset outra/pasta
"""
import argparse
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__)))

import pandas as pd

from normalizar import carregar_fila, carregar_eventos, carregar_procedimentos, enriquecer_fila_com_eventos
from classificar_swalis import classificar
from coeficiente import calcular_coeficiente

OUTPUT_DIR = "output"


def gerar_saida(fila_priorizada: pd.DataFrame):
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    esp_dir = os.path.join(OUTPUT_DIR, "por_especialidade")
    os.makedirs(esp_dir, exist_ok=True)

    # ── Lista única (entregável do desafio) ──────────────────────────────────
    cols_entrega = ["solicitacao_id", "posicao", "justificativa"]
    # Excluir duplicatas marcadas da entrega (manter apenas a mais crítica)
    entrega = fila_priorizada[~fila_priorizada["is_duplicata"]][cols_entrega].copy()
    # Renumerar posições desconsiderando as duplicatas removidas
    entrega = entrega.reset_index(drop=True)
    entrega["posicao"] = entrega.index + 1
    entrega.to_csv(os.path.join(OUTPUT_DIR, "fila_priorizada.csv"), index=False, encoding="utf-8")
    print(f"[saída] fila_priorizada.csv — {len(entrega)} solicitações")

    # ── Sublistas por especialidade ──────────────────────────────────────────
    cols_esp = [
        "posicao", "solicitacao_id", "paciente_id", "nome_paciente", "idade", "sexo",
        "municipio", "cid_principal", "cid_descricao", "procedimento",
        "classe_swalis", "score_final", "score_classe", "score_agravamento",
        "ajuste_tempo", "ajuste_risco", "penalidade_pre_op", "score_llm",
        "dias_em_fila", "prioridade_norm", "justificativa",
    ]
    especialidades = fila_priorizada["especialidade"].dropna().unique()
    for esp in sorted(especialidades):
        df_esp = fila_priorizada[
            (fila_priorizada["especialidade"] == esp) & (~fila_priorizada["is_duplicata"])
        ][cols_esp].copy()
        df_esp = df_esp.reset_index(drop=True)
        df_esp["posicao_especialidade"] = df_esp.index + 1
        nome_arquivo = esp.lower().replace(" ", "_").replace("/", "_") + ".csv"
        df_esp.to_csv(os.path.join(esp_dir, nome_arquivo), index=False, encoding="utf-8")

    print(f"[saída] por_especialidade/ — {len(especialidades)} arquivos")

    # ── Resumo no terminal ───────────────────────────────────────────────────
    print()
    print("=== Resumo da fila priorizada ===")
    print(f"Total de solicitações: {len(entrega)}")
    print()
    print("Por classe SWALIS:")
    dist = fila_priorizada[~fila_priorizada["is_duplicata"]]["classe_swalis"].value_counts().sort_index()
    for cls, n in dist.items():
        print(f"  {cls}: {n}")
    print()
    print("Top 15 posições:")
    cols_resumo = ["posicao", "solicitacao_id", "cid_principal", "classe_swalis",
                   "score_final", "dias_em_fila", "especialidade"]
    print(fila_priorizada[~fila_priorizada["is_duplicata"]][cols_resumo].head(15).to_string(index=False))
    print()
    onco = fila_priorizada[fila_priorizada["oncologico"] & ~fila_priorizada["is_duplicata"]]
    n_total = len(entrega)
    print(f"Oncológicos na primeira metade ({n_total//2} posições): "
          f"{(onco['posicao'] <= n_total//2).sum()} de {len(onco)}")
    print()
    dups = fila_priorizada[fila_priorizada["is_duplicata"]]
    if len(dups):
        print(f"Duplicatas removidas da entrega: {len(dups)} ({dups['paciente_id'].nunique()} pacientes)")


def main():
    ap = argparse.ArgumentParser(description="Gera a fila cirúrgica priorizada.")
    ap.add_argument("--dataset", default="dataset", help="Pasta com os CSVs do dataset")
    ap.add_argument("--sem-llm", action="store_true", help="Desativa análise de texto via LLM")
    args = ap.parse_args()

    print("Carregando dados...")
    fila  = carregar_fila(os.path.join(args.dataset, "fila_cirurgica.csv"))
    ev    = carregar_eventos(os.path.join(args.dataset, "eventos_clinicos.csv"))
    procs = carregar_procedimentos(os.path.join(args.dataset, "procedimentos.csv"))

    print("Enriquecendo com eventos clínicos...")
    fila = enriquecer_fila_com_eventos(fila, ev)

    print("Classificando por SWALIS...")
    fila = classificar(fila)

    llm_df = None
    if not args.sem_llm:
        from llm import analisar_lote, verificar_providers
        verificar_providers()
        llm_df = analisar_lote(fila)
        # Integrar resultados LLM no DataFrame
        if "malignidade_confirmada_texto" in llm_df.columns:
            fila = fila.join(llm_df[["malignidade_confirmada_texto", "progressao_descrita",
                                     "desistencia_ou_resolvido", "sinais_alarme"]], on="solicitacao_id")

    print("Calculando coeficiente de criticidade...")
    fila = calcular_coeficiente(fila, llm_df=llm_df)

    print("Gerando saída...")
    gerar_saida(fila)


if __name__ == "__main__":
    main()
