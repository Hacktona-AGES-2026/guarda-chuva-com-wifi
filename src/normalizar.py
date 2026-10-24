# -*- coding: utf-8 -*-
"""
normalizar.py
Aplica todas as normalizações identificadas em FALHAS_FORMATACAO.md e retorna
DataFrames limpos prontos para o cálculo do coeficiente.
"""
import unicodedata
import pandas as pd

DATASET_DIR = "dataset"
REF = pd.Timestamp("2026-10-23")

# Palavras de alarme clínico extraídas do verificador oficial + dicionário de dados
KW_ALARME = (
    r"encarcer|estrangul|colangite|icter|pancreatite|enterorragia|melena|hematemese|"
    r"suboclus|perda ponderal|disfagia|sepse|hidronefrose|perda de funcao|transfund|"
    r"hemoptise|rouquidao|linfonodo.{0,10}(?:fixo|palpavel)|sangramento espontaneo|"
    r"acamad|ulcera de pressao|quedas de repeticao|glaucoma facomorfico|retencao de co2|"
    r"dano neurologico|psa em elevacao|dessaturacao|angina em repouso|sincope|"
    r"crescimento rapido|retencao urinaria aguda|massa anexial|ca-125"
)

# CIDs que indicam urgência independente do prefixo
CID_URGENTES = {"I200", "K403", "K400", "K420", "K430", "K800", "N132", "I832"}


def _remover_acentos(texto: str) -> str:
    return unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode("ascii")


def normalizar_cid(serie: pd.Series) -> pd.Series:
    """Remove ponto e coloca em maiúsculas para comparação uniforme."""
    return serie.str.upper().str.replace(".", "", regex=False).str.strip()


def normalizar_prioridade(serie: pd.Series) -> pd.Series:
    """Normaliza variações de grafia: Baixa/baixa/Média/media → baixa/media/alta."""
    return (
        serie.str.lower()
        .str.strip()
        .apply(lambda x: _remover_acentos(x) if isinstance(x, str) else x)
    )


def normalizar_municipio(serie: pd.Series) -> pd.Series:
    """Padroniza para Title Case sem acentos para agrupamento."""
    return (
        serie.str.strip()
        .str.lower()
        .apply(lambda x: _remover_acentos(x).title() if isinstance(x, str) else x)
    )


def carregar_fila(path: str = None) -> pd.DataFrame:
    path = path or f"{DATASET_DIR}/fila_cirurgica.csv"
    fila = pd.read_csv(path, parse_dates=["data_entrada_fila", "data_ultima_revisao_prioridade", "data_hba1c_ultima"])

    # --- F1: CID sem ponto ---
    fila["cid_norm"] = normalizar_cid(fila["cid_principal"])

    # --- F2: prioridade ---
    fila["prioridade_norm"] = normalizar_prioridade(fila["prioridade_regulacao"].fillna(""))

    # --- F3: município ---
    fila["municipio_norm"] = normalizar_municipio(fila["municipio"])

    # --- F4: flags descartadas — derivar oncológico do CID ---
    fila["oncologico"] = fila["cid_norm"].str.startswith("C")
    fila["cid_comportamento_incerto"] = fila["cid_norm"].apply(
        lambda x: isinstance(x, str) and (
            (x.startswith("D3") and x[1:3] in [str(i) for i in range(37, 49)]) or
            x.startswith("D4") and x[:3] in ["D37","D38","D39","D40","D41","D42","D43","D44","D45","D46","D47","D48"]
        )
    )
    fila["cid_urgente"] = fila["cid_norm"].isin(CID_URGENTES)

    # --- F7: imputar nulos com valores conservadores ---
    fila["asa"] = fila["asa"].fillna(2).astype(int)
    fila["intensidade_dor_eva"] = fila["intensidade_dor_eva"].fillna(0).astype(int)
    fila["limitacao_funcional"] = fila["limitacao_funcional"].fillna("nenhuma")
    fila["distancia_hospital_km"] = fila["distancia_hospital_km"].fillna(fila["distancia_hospital_km"].median())

    # --- F5: marcar duplicatas (mesmo paciente + mesmo procedimento) ---
    # Manter a solicitação mais antiga por par; marcar as demais como duplicata
    fila_sorted = fila.sort_values("data_entrada_fila")
    fila["is_duplicata"] = fila_sorted.duplicated(subset=["paciente_id", "procedimento_id"], keep="first")

    return fila


def carregar_eventos(path: str = None) -> pd.DataFrame:
    path = path or f"{DATASET_DIR}/eventos_clinicos.csv"
    ev = pd.read_csv(path, parse_dates=["data_evento"])

    # --- E1: remover eventos com conteúdo duplicado (IDs diferentes) ---
    cols_conteudo = ["solicitacao_id", "paciente_id", "data_evento", "tipo_evento", "resultado", "descricao"]
    ev = ev.drop_duplicates(subset=cols_conteudo, keep="first")

    return ev


def carregar_procedimentos(path: str = None) -> pd.DataFrame:
    path = path or f"{DATASET_DIR}/procedimentos.csv"
    return pd.read_csv(path)


def enriquecer_fila_com_eventos(fila: pd.DataFrame, ev: pd.DataFrame) -> pd.DataFrame:
    """
    Agrega sinais de eventos clínicos por solicitação e junta na fila.
    Separa eventos históricos (antes da entrada na fila) de eventos durante a espera.
    """
    ids_fila = set(fila["solicitacao_id"])

    # --- E2: remover eventos órfãos ---
    ev = ev[ev["solicitacao_id"].isin(ids_fila)].copy()

    # --- E3: separar histórico vs. piora durante espera ---
    datas_entrada = fila.set_index("solicitacao_id")["data_entrada_fila"]
    ev["data_entrada"] = ev["solicitacao_id"].map(datas_entrada)
    ev["durante_espera"] = ev["data_evento"] >= ev["data_entrada"]

    ev_espera = ev[ev["durante_espera"]].copy()

    # ---- Agregações por solicitação ----

    # Biópsia positiva (qualquer época — pode ter ocorrido antes da entrada como histórico relevante)
    biopsia_pos = (
        ev[ev["tipo_evento"].eq("biopsia") & ev["resultado"].eq("positivo")]
        .groupby("solicitacao_id").size().rename("biopsia_positiva_count")
    )

    # Eventos de piora durante a espera
    piora_espera = ev_espera[
        ev_espera["tipo_evento"].isin(["pronto_socorro", "internacao"]) |
        (ev_espera["tipo_evento"].eq("exame_imagem") & ev_espera["resultado"].eq("progressao")) |
        (ev_espera["tipo_evento"].eq("consulta_reavaliacao") & ev_espera["resultado"].eq("piora"))
    ]
    piora_count = piora_espera.groupby("solicitacao_id").size().rename("piora_count")

    # Piora recente (últimos 180 dias)
    piora_recente = ev_espera[
        (ev_espera["data_evento"] >= REF - pd.Timedelta(days=180)) & (
            ev_espera["tipo_evento"].isin(["pronto_socorro", "internacao"]) |
            (ev_espera["tipo_evento"].eq("exame_imagem") & ev_espera["resultado"].eq("progressao")) |
            (ev_espera["tipo_evento"].eq("consulta_reavaliacao") & ev_espera["resultado"].eq("piora"))
        )
    ]
    piora_recente_count = piora_recente.groupby("solicitacao_id").size().rename("piora_recente_count")

    # Internações: dias totais internado
    internacoes = ev_espera[ev_espera["tipo_evento"].eq("internacao")]
    dias_internado = internacoes.groupby("solicitacao_id")["valor_numerico"].sum().rename("dias_internado")

    # HbA1c mais recente (preferir evento sobre cadastro — F6)
    hba1c_ev = (
        ev[ev["tipo_evento"].eq("hba1c")]
        .sort_values("data_evento")
        .groupby("solicitacao_id")["valor_numerico"]
        .last()
        .rename("hba1c_recente")
    )

    # Contato: relata piora ou desistência
    contato_piora = (
        ev_espera[ev_espera["tipo_evento"].eq("contato_telefonico") & ev_espera["resultado"].eq("relata_piora")]
        .groupby("solicitacao_id").size().rename("contato_piora_count")
    )
    desistiu = (
        ev[ev["tipo_evento"].eq("contato_telefonico") & ev["resultado"].isin(["desistiu", "informou_cirurgia_outro_servico"])]
        .groupby("solicitacao_id").size().rename("desistiu_count")
    )

    # Juntar tudo na fila
    fila = fila.join(biopsia_pos, on="solicitacao_id")
    fila = fila.join(piora_count, on="solicitacao_id")
    fila = fila.join(piora_recente_count, on="solicitacao_id")
    fila = fila.join(dias_internado, on="solicitacao_id")
    fila = fila.join(hba1c_ev, on="solicitacao_id")
    fila = fila.join(contato_piora, on="solicitacao_id")
    fila = fila.join(desistiu, on="solicitacao_id")

    # Preencher nulos das agregações
    fila["biopsia_positiva_count"] = fila["biopsia_positiva_count"].fillna(0).astype(int)
    fila["piora_count"] = fila["piora_count"].fillna(0).astype(int)
    fila["piora_recente_count"] = fila["piora_recente_count"].fillna(0).astype(int)
    fila["dias_internado"] = fila["dias_internado"].fillna(0)
    fila["contato_piora_count"] = fila["contato_piora_count"].fillna(0).astype(int)
    fila["desistiu_count"] = fila["desistiu_count"].fillna(0).astype(int)

    # hba1c: priorizar evento sobre cadastro
    fila["hba1c_final"] = fila["hba1c_recente"].combine_first(fila["hba1c_ultima"])

    return fila


if __name__ == "__main__":
    fila = carregar_fila()
    ev = carregar_eventos()
    procs = carregar_procedimentos()
    fila = enriquecer_fila_com_eventos(fila, ev)

    print(f"Fila normalizada: {len(fila)} linhas")
    print(f"  Oncológicos (CID C*): {fila['oncologico'].sum()}")
    print(f"  Duplicatas marcadas: {fila['is_duplicata'].sum()}")
    print(f"  Com biópsia positiva: {(fila['biopsia_positiva_count'] > 0).sum()}")
    print(f"  Com piora durante espera: {(fila['piora_count'] > 0).sum()}")
    print(f"  Com piora recente (180d): {(fila['piora_recente_count'] > 0).sum()}")
    print(f"  Desistências sinalizadas: {(fila['desistiu_count'] > 0).sum()}")
