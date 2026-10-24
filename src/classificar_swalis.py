# -*- coding: utf-8 -*-
"""
classificar_swalis.py
Classifica cada solicitação em uma classe SWALIS (A1, A2, B, C, D) de forma
determinística, com base em CID, eventos clínicos e dados estruturados.
Nenhuma chamada a LLM aqui — o módulo llm.py complementa com score de texto.
"""
import re
import pandas as pd

# Pesos da classe no score final (dominam a ordenação)
CLASSE_SCORE = {"A1": 100, "A2": 85, "B": 60, "C": 35, "D": 10}

# Prazo máximo por classe (dias) — usado no ajuste de tempo
CLASSE_PRAZO = {"A1": 15, "A2": 21, "B": 60, "C": 180, "D": 360}

# Palavras de alarme clínico (mesmas do verificador oficial)
KW_ALARME = re.compile(
    r"encarcer|estrangul|colangite|icter|pancreatite|enterorragia|melena|hematemese|"
    r"suboclus|perda ponderal|disfagia|sepse|hidronefrose|perda de funcao|transfund|"
    r"hemoptise|rouquidao|linfonodo.{0,10}(?:fixo|palpavel)|sangramento espontaneo|"
    r"acamad|ulcera de pressao|quedas de repeticao|glaucoma facomorfico|retencao de co2|"
    r"dano neurologico|psa em elevacao|dessaturacao|angina em repouso|sincope|"
    r"crescimento rapido|retencao urinaria aguda|massa anexial|ca-125",
    re.IGNORECASE,
)

# CIDs urgentes independente de prefixo (obstruções, instabilidades)
CID_URGENTES = {"I200", "K403", "K400", "K420", "K430", "K800", "N132", "I832"}


def _tem_alarme(texto: str) -> bool:
    if not isinstance(texto, str):
        return False
    return bool(KW_ALARME.search(texto))


def _classificar_linha(row: pd.Series) -> str:
    """
    Regras de classificação SWALIS em ordem decrescente de urgência.
    A primeira condição verdadeira define a classe.
    """
    cid = str(row.get("cid_norm", ""))
    oncologico = bool(row.get("oncologico", False))
    biopsia_pos = int(row.get("biopsia_positiva_count", 0)) > 0
    piora_recente = int(row.get("piora_recente_count", 0)) > 0
    piora_total = int(row.get("piora_count", 0)) > 0
    dias_internado = float(row.get("dias_internado", 0)) > 0
    cid_urgente = cid in CID_URGENTES
    cid_incerto = bool(row.get("cid_comportamento_incerto", False))
    eva = int(row.get("intensidade_dor_eva", 0))
    limitacao = str(row.get("limitacao_funcional", "nenhuma")).lower()
    justificativa = str(row.get("justificativa_clinica", ""))
    observacoes = str(row.get("observacoes", ""))
    alarme_texto = _tem_alarme(justificativa + " " + observacoes)

    # --- A1: risco de vida ou perda de órgão/função ---
    # Oncológico com progressão ou piora recente + internação
    if oncologico and piora_recente and dias_internado:
        return "A1"
    # CID urgente estrutural (obstrução, angina instável)
    if cid_urgente:
        return "A1"
    # Alarme clínico grave no texto (estrangulamento, sepse, etc.)
    if alarme_texto and (oncologico or piora_recente):
        return "A1"
    # Oncológico com internação durante espera (sem necessariamente piora recente)
    if oncologico and dias_internado:
        return "A1"

    # --- A2: progressão rápida sem risco imediato de vida ---
    # Oncológico confirmado (CID C*) independente do estado
    if oncologico:
        return "A2"
    # Biópsia positiva mesmo sem CID C* (malignidade não registrada no CID)
    if biopsia_pos:
        return "A2"
    # CID de comportamento incerto + piora recente
    if cid_incerto and piora_recente:
        return "A2"
    # Alarme clínico grave no texto sem marcador oncológico formal
    if alarme_texto and piora_recente:
        return "A2"

    # --- B: dor/disfunção importante, sem progressão rápida ---
    # Limitação grave
    if limitacao == "grave":
        return "B"
    # Dor intensa + piora documentada
    if eva >= 7 and piora_total:
        return "B"
    # Dor muito intensa (≥8) mesmo sem evento de piora
    if eva >= 8:
        return "B"
    # CID incerto (sem piora recente) ou alarme no texto sem piora
    if cid_incerto or alarme_texto:
        return "B"
    # Piora recente sem marcador oncológico (PS ou internação recente)
    if piora_recente:
        return "B"
    # Limitação moderada + dor significativa
    if limitacao == "moderada" and eva >= 5:
        return "B"

    # --- C: dor/disfunção moderada sem tendência de agravamento ---
    if limitacao == "moderada":
        return "C"
    if eva >= 4:
        return "C"
    if piora_total:
        return "C"

    # --- D: sem urgência clínica relevante ---
    return "D"


def classificar(fila: pd.DataFrame) -> pd.DataFrame:
    """Adiciona colunas 'classe_swalis' e 'score_classe' ao DataFrame da fila."""
    fila = fila.copy()
    fila["classe_swalis"] = fila.apply(_classificar_linha, axis=1)
    fila["score_classe"] = fila["classe_swalis"].map(CLASSE_SCORE)
    return fila


if __name__ == "__main__":
    from normalizar import carregar_fila, carregar_eventos, carregar_procedimentos, enriquecer_fila_com_eventos

    fila = carregar_fila()
    ev = carregar_eventos()
    fila = enriquecer_fila_com_eventos(fila, ev)
    fila = classificar(fila)

    print("Distribuição por classe SWALIS:")
    print(fila["classe_swalis"].value_counts().sort_index())
    print()
    print("Oncológicos por classe:")
    print(fila[fila["oncologico"]]["classe_swalis"].value_counts().sort_index())
    print()
    print("Classe A1 — exemplos:")
    cols = ["solicitacao_id", "cid_principal", "classe_swalis", "piora_recente_count", "dias_internado"]
    print(fila[fila["classe_swalis"] == "A1"][cols].head(8).to_string(index=False))
