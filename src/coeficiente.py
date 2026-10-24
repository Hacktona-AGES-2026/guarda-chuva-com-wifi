# -*- coding: utf-8 -*-
"""
coeficiente.py
Calcula o score_final de criticidade para cada solicitação cirúrgica.

Fórmula:
  score_final = score_classe          (0–100)  classe SWALIS domina
              + score_agravamento     (0–30)   eventos de piora
              + score_texto           (0–20)   análise LLM (0 se offline)
              + ajuste_tempo          (0–15)   bônus por espera além do prazo
              + ajuste_risco          (0–10)   perfil de risco do paciente
              - penalidade_pre_op     (0–5)    pré-operatório não pronto
"""
import math
import pandas as pd

from classificar_swalis import CLASSE_PRAZO


# ── Agravamento por eventos (0–30) ───────────────────────────────────────────

def _score_agravamento(row: pd.Series) -> float:
    score = 0.0
    piora_rec = int(row.get("piora_recente_count", 0))
    piora_tot = int(row.get("piora_count", 0))
    dias_int  = float(row.get("dias_internado", 0))
    contato_p = int(row.get("contato_piora_count", 0))

    # Piora recente (últimos 180 dias): cada evento vale 6 pts, máx 18
    score += min(piora_rec * 6, 18)
    # Piora histórica adicional: cada evento além dos recentes vale 2 pts, máx 6
    score += min(max(piora_tot - piora_rec, 0) * 2, 6)
    # Dias internado durante espera: 1 pt/dia, máx 6
    score += min(dias_int, 6)

    return min(score, 30)


# ── Score de texto LLM (0–20) ────────────────────────────────────────────────

def _score_llm(row: pd.Series, llm_df: pd.DataFrame | None) -> float:
    if llm_df is None:
        return 0.0
    sid = row.get("solicitacao_id")
    if sid not in llm_df.index:
        return 0.0

    llm = llm_df.loc[sid]
    raw_score = float(llm.get("score_texto", 0))
    # Bônus por sinais específicos confirmados pelo LLM
    bonus = 0.0
    if llm.get("malignidade_confirmada_texto") and not row.get("oncologico"):
        bonus += 3.0  # malignidade no texto não refletida no CID
    if llm.get("progressao_descrita"):
        bonus += 2.0
    # Penalidade: LLM detectou desistência
    if llm.get("desistencia_ou_resolvido"):
        return -50.0  # vai rebaixar para o fundo da fila (tratado no priorizador)

    return min(raw_score * 2 + bonus, 20)  # normaliza 0-10 para 0-20


# ── Ajuste de tempo de espera (0–15) ─────────────────────────────────────────

def _ajuste_tempo(row: pd.Series) -> float:
    """Bônus crescente para pacientes que já ultrapassaram o prazo da sua classe."""
    classe = str(row.get("classe_swalis", "D"))
    prazo = CLASSE_PRAZO.get(classe, 360)
    dias  = int(row.get("dias_em_fila", 0))

    if dias <= prazo:
        return 0.0
    # log do excedente normalizado: quanto mais além do prazo, maior o bônus
    excedente = dias - prazo
    return min(math.log1p(excedente) * 1.5, 15)


# ── Ajuste de risco do paciente (0–10) ───────────────────────────────────────

def _ajuste_risco(row: pd.Series) -> float:
    score = 0.0
    idade     = int(row.get("idade", 0))
    asa       = int(row.get("asa", 2))
    limitacao = str(row.get("limitacao_funcional", "nenhuma")).lower()
    eva       = int(row.get("intensidade_dor_eva", 0))
    hba1c     = row.get("hba1c_final")

    # Idoso (≥65): janela cirúrgica menor
    if idade >= 80:
        score += 3.0
    elif idade >= 65:
        score += 1.5

    # ASA 3-4: risco anestésico aumentado, urgência em resolver
    if asa >= 4:
        score += 2.0
    elif asa == 3:
        score += 1.0

    # Limitação funcional
    if limitacao == "grave":
        score += 2.0
    elif limitacao == "moderada":
        score += 1.0

    # Dor
    if eva >= 7:
        score += 1.5
    elif eva >= 4:
        score += 0.5

    # Diabetes descontrolado (HbA1c > 8.5) — risco cirúrgico aumentado
    if isinstance(hba1c, (int, float)) and not pd.isna(hba1c) and hba1c > 8.5:
        score += 1.0

    return min(score, 10)


# ── Penalidade pré-operatório (0–5) ──────────────────────────────────────────

def _penalidade_pre_op(row: pd.Series) -> float:
    avaliacao = str(row.get("avaliacao_pre_anestesica", "")).lower()
    exames    = str(row.get("exames_pre_op_validos", "")).lower()

    penalidade = 0.0
    if avaliacao in ("pendente", "vencida"):
        penalidade += 3.0
    if exames == "nao":
        penalidade += 2.0
    return penalidade


# ── Justificativa legível ────────────────────────────────────────────────────

def _gerar_justificativa(row: pd.Series, llm_df: pd.DataFrame | None) -> str:
    partes = []

    classe = row.get("classe_swalis", "?")
    partes.append(f"Classe SWALIS {classe}")

    if row.get("oncologico"):
        partes.append("neoplasia maligna (CID " + str(row.get("cid_principal", "")) + ")")
    elif row.get("biopsia_positiva_count", 0) > 0:
        partes.append("biópsia positiva para malignidade")

    piora_rec = int(row.get("piora_recente_count", 0))
    if piora_rec > 0:
        partes.append(f"{piora_rec} evento(s) de piora nos últimos 180 dias")

    dias_int = float(row.get("dias_internado", 0))
    if dias_int > 0:
        partes.append(f"internação de {int(dias_int)} dia(s) durante a espera")

    dias = int(row.get("dias_em_fila", 0))
    prazo = CLASSE_PRAZO.get(classe, 360)
    if dias > prazo:
        partes.append(f"aguardando {dias} dias (prazo da classe: {prazo} dias)")

    if llm_df is not None and row.get("solicitacao_id") in llm_df.index:
        llm = llm_df.loc[row["solicitacao_id"]]
        alarmes = llm.get("sinais_alarme", [])
        if alarmes:
            partes.append("sinais de alarme no texto: " + ", ".join(alarmes[:3]))
        if llm.get("malignidade_confirmada_texto") and not row.get("oncologico"):
            partes.append("malignidade confirmada em texto (CID ainda não atualizado)")

    return "; ".join(partes) + "."


# ── Função principal ─────────────────────────────────────────────────────────

def calcular_coeficiente(fila: pd.DataFrame, llm_df: pd.DataFrame | None = None) -> pd.DataFrame:
    """
    Recebe a fila já normalizada e classificada (saída de normalizar + classificar_swalis).
    Retorna o DataFrame com colunas de score e ordenado por prioridade decrescente.
    llm_df: DataFrame com índice solicitacao_id e colunas de resultado LLM (opcional).
    """
    fila = fila.copy()

    fila["score_agravamento"] = fila.apply(_score_agravamento, axis=1)
    fila["score_llm"]         = fila.apply(lambda r: _score_llm(r, llm_df), axis=1)
    fila["ajuste_tempo"]      = fila.apply(_ajuste_tempo, axis=1)
    fila["ajuste_risco"]      = fila.apply(_ajuste_risco, axis=1)
    fila["penalidade_pre_op"] = fila.apply(_penalidade_pre_op, axis=1)
    fila["justificativa"]     = fila.apply(lambda r: _gerar_justificativa(r, llm_df), axis=1)

    fila["score_final"] = (
        fila["score_classe"]
        + fila["score_agravamento"]
        + fila["score_llm"]
        + fila["ajuste_tempo"]
        + fila["ajuste_risco"]
        - fila["penalidade_pre_op"]
    )

    # Desistências detectadas pelo LLM vão para o fim absoluto
    fila.loc[fila["score_llm"] < -10, "score_final"] = -999

    # Ordem da classe garante que A1 > A2 > B > C > D independente do score_final
    ORDEM_CLASSE = {"A1": 0, "A2": 1, "B": 2, "C": 3, "D": 4}
    fila["ordem_classe"] = fila["classe_swalis"].map(ORDEM_CLASSE).fillna(5)

    # Ordenar: classe primeiro, depois score dentro da classe, desempate por dias em fila
    fila = fila.sort_values(
        ["ordem_classe", "score_final", "dias_em_fila"],
        ascending=[True, False, False],
    )
    fila = fila.reset_index(drop=True)
    fila["posicao"] = fila.index + 1

    return fila


if __name__ == "__main__":
    import sys
    sys.path.insert(0, "src")

    from normalizar import carregar_fila, carregar_eventos, enriquecer_fila_com_eventos
    from classificar_swalis import classificar

    fila = carregar_fila()
    ev   = carregar_eventos()
    fila = enriquecer_fila_com_eventos(fila, ev)
    fila = classificar(fila)
    fila = calcular_coeficiente(fila, llm_df=None)

    print("=== Top 10 mais críticos ===")
    cols = ["posicao", "solicitacao_id", "cid_principal", "classe_swalis",
            "score_final", "dias_em_fila", "especialidade"]
    print(fila[cols].head(10).to_string(index=False))
    print()
    print("=== Score médio por classe ===")
    print(fila.groupby("classe_swalis")["score_final"].describe()[["mean","min","max"]].round(1))
    print()
    print("=== Distribuição de posições dos oncológicos ===")
    onco = fila[fila["oncologico"]]
    print(f"Oncológicos na primeira metade ({len(fila)//2} posições): "
          f"{(onco['posicao'] <= len(fila)//2).sum()} de {len(onco)}")
