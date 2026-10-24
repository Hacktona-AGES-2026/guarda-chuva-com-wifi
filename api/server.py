# -*- coding: utf-8 -*-
"""
api/server.py
Servidor FastAPI que integra o pipeline de priorização com o front-end.

Fluxo:
  POST /processar  ← recebe fila_cirurgica.csv, eventos_clinicos.csv, procedimentos.csv
                   → roda o pipeline e armazena resultado em memória
  GET  /api/fila   → retorna a fila priorizada em JSON
  GET  /api/stats  → retorna estatísticas para o dashboard
  GET  /*          → serve o front-end estático

Uso:
  pip install fastapi uvicorn python-multipart
  uvicorn api.server:app --reload --port 8000
  ou:
  python api/server.py
"""
import io
import mimetypes
import os
import re
import sys
import tempfile
from datetime import datetime
from typing import Optional

import pandas as pd
import uvicorn
from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

# Adiciona src/ ao path para importar os módulos do pipeline
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from normalizar import carregar_fila, carregar_eventos, carregar_procedimentos, enriquecer_fila_com_eventos
from classificar_swalis import classificar, CLASSE_SCORE, CLASSE_PRAZO
from coeficiente import calcular_coeficiente, _score_equidade, _ajuste_risco, _penalidade_pre_op, _gerar_justificativa

app = FastAPI(title="Priorização Cirúrgica")

# Estado em memória — substituído a cada POST /processar
_estado: dict = {"fila": None, "fila_df": None, "stats": None}

# Histórico de edições por solicitacao_id — persiste enquanto o servidor estiver no ar
_historico: dict[str, list] = {}

FRONT_DIR = os.path.join(os.path.dirname(__file__), "..", "front")
_CID10_PATH = os.path.join(os.path.dirname(__file__), "..", "dataset", "cid10.csv")

# Tabela CID-10 em memória: chave = código normalizado (sem ponto, uppercase)
def _carregar_cid10() -> dict:
    try:
        df = pd.read_csv(_CID10_PATH, encoding="utf-8")
        return dict(zip(df["cid_norm"].str.upper().str.strip(), df["cid_descricao"]))
    except Exception:
        return {}

_CID10: dict = _carregar_cid10()


# ── Helpers ──────────────────────────────────────────────────────────────────

def _rodar_pipeline(path_fila: str, path_eventos: str, path_procs: str) -> pd.DataFrame:
    fila  = carregar_fila(path_fila)
    ev    = carregar_eventos(path_eventos)
    carregar_procedimentos(path_procs)   # valida existência do arquivo
    fila  = enriquecer_fila_com_eventos(fila, ev)
    fila  = classificar(fila)
    fila  = calcular_coeficiente(fila, llm_df=None)
    return fila


def _fila_para_json(fila: pd.DataFrame) -> list[dict]:
    cols = [
        "posicao", "solicitacao_id", "paciente_id", "nome_paciente",
        "idade", "sexo", "municipio", "especialidade",
        "cid_principal", "cid_descricao", "procedimento",
        "classe_swalis", "score_final", "score_classe",
        "score_agravamento", "score_equidade", "ajuste_risco",
        "penalidade_pre_op", "dias_em_fila", "justificativa",
    ]
    df = fila[~fila["is_duplicata"]][cols].copy()
    df = df.reset_index(drop=True)
    df["posicao"] = df.index + 1
    # Arredondar floats para não poluir o JSON
    float_cols = ["score_final", "score_classe", "score_agravamento",
                  "score_equidade", "ajuste_risco", "penalidade_pre_op"]
    df[float_cols] = df[float_cols].round(2)
    return df.to_dict(orient="records")


def _calcular_stats(fila: pd.DataFrame) -> dict:
    df = fila[~fila["is_duplicata"]]
    dist_classe = df["classe_swalis"].value_counts().to_dict()
    dist_esp    = df["especialidade"].value_counts().to_dict()
    onco        = int(df["oncologico"].sum())
    piora_rec   = int((df["piora_recente_count"] > 0).sum())
    total       = len(df)

    # Métricas reais do pipeline
    alem_prazo      = int((df["score_equidade"] > 0).sum())
    sem_urgencia    = int(df["sem_urgencia"].sum()) if "sem_urgencia" in df.columns else 0
    # Regra de ouro: nenhum oncológico abaixo do primeiro sem_urgencia
    regra_ouro_ok   = True
    if "sem_urgencia" in df.columns and df["sem_urgencia"].any() and df["oncologico"].any():
        pos_primeiro_calmo = df.loc[df["sem_urgencia"], "posicao"].min()
        violacoes = int((df["oncologico"] & (df["posicao"] > pos_primeiro_calmo)).sum())
        regra_ouro_ok = violacoes == 0
    score_medio_por_classe = (
        df.groupby("classe_swalis")["score_final"].mean().round(1).to_dict()
    )

    return {
        "total": total,
        "por_classe": dist_classe,
        "por_especialidade": dist_esp,
        "oncologicos": onco,
        "com_piora_recente": piora_rec,
        "modelo": {
            "total_classificados": total,
            "oncologicos_detectados": onco,
            "pct_oncologicos": round(onco / total * 100, 1) if total else 0,
            "com_piora_recente": piora_rec,
            "pct_piora": round(piora_rec / total * 100, 1) if total else 0,
            "alem_prazo_classe": alem_prazo,
            "pct_alem_prazo": round(alem_prazo / total * 100, 1) if total else 0,
            "regra_ouro_ok": regra_ouro_ok,
            "score_medio_por_classe": score_medio_por_classe,
        },
    }


# ── Endpoints ────────────────────────────────────────────────────────────────

@app.post("/processar")
async def processar(
    fila_cirurgica: UploadFile    = File(...),
    eventos_clinicos: UploadFile  = File(...),
    procedimentos: UploadFile     = File(...),
):
    """Recebe os 3 CSVs, roda o pipeline e armazena o resultado."""
    with tempfile.TemporaryDirectory() as tmpdir:
        arquivos = {
            "fila_cirurgica.csv":   fila_cirurgica,
            "eventos_clinicos.csv": eventos_clinicos,
            "procedimentos.csv":    procedimentos,
        }
        paths = {}
        for nome, upload in arquivos.items():
            conteudo = await upload.read()
            caminho  = os.path.join(tmpdir, nome)
            with open(caminho, "wb") as f:
                f.write(conteudo)
            paths[nome] = caminho

        try:
            fila = _rodar_pipeline(
                paths["fila_cirurgica.csv"],
                paths["eventos_clinicos.csv"],
                paths["procedimentos.csv"],
            )
        except Exception as e:
            raise HTTPException(status_code=422, detail=f"Erro no pipeline: {e}")

        _estado["fila"]    = _fila_para_json(fila)
        _estado["fila_df"] = fila.copy()
        _estado["stats"]   = _calcular_stats(fila)

    return {"ok": True, "total": _estado["stats"]["total"]}


@app.get("/api/fila")
def get_fila():
    if _estado["fila"] is None:
        raise HTTPException(status_code=404, detail="Nenhum dado processado ainda. Faça upload dos CSVs.")
    return JSONResponse(_estado["fila"])


@app.get("/api/stats")
def get_stats():
    if _estado["stats"] is None:
        raise HTTPException(status_code=404, detail="Nenhum dado processado ainda. Faça upload dos CSVs.")
    return JSONResponse(_estado["stats"])


@app.get("/api/cid/{codigo}")
def get_cid(codigo: str):
    norm = codigo.replace(".", "").upper().strip()
    descricao = _CID10.get(norm)
    if descricao:
        return JSONResponse({"codigo": codigo.upper(), "descricao": descricao})
    # Tenta prefixo (ex: "C50" encontra "C504")
    prefixo = next((v for k, v in _CID10.items() if k.startswith(norm)), None)
    if prefixo:
        return JSONResponse({"codigo": codigo.upper(), "descricao": prefixo})
    raise HTTPException(status_code=404, detail=f"CID '{codigo}' não encontrado.")


class EdicaoPaciente(BaseModel):
    classe_swalis: Optional[str] = None
    especialidade: Optional[str] = None
    procedimento: Optional[str] = None
    cid_principal: Optional[str] = None
    cid_descricao: Optional[str] = None


_CID_URGENTES = {"I200", "K403", "K400", "K420", "K430", "K800", "N132", "I832"}
_KW_SEM_URGENCIA = re.compile(
    r"encarcer|estrangul|colangite|icter|pancreatite|sepse|hidronefrose|"
    r"perda ponderal|disfagia|hemoptise|sangramento espontaneo|acamad|"
    r"crescimento rapido|retencao urinaria aguda|massa anexial",
    re.IGNORECASE,
)


def _recalcular_fila(fila_df: pd.DataFrame) -> pd.DataFrame:
    """Recalcula scores e reordena a fila completa após uma edição."""
    df = fila_df.copy()

    # Recalcula campos derivados do CID
    df["cid_norm"] = df["cid_principal"].str.replace(".", "", regex=False).str.upper()
    df["oncologico"] = df["cid_norm"].str.startswith("C", na=False)

    # Recalcula score_classe a partir da classe_swalis
    df["score_classe"] = df["classe_swalis"].map(CLASSE_SCORE).fillna(10)

    # Recalcula scores individuais
    df["score_equidade"]    = df.apply(_score_equidade, axis=1)
    df["ajuste_risco"]      = df.apply(_ajuste_risco, axis=1)
    df["penalidade_pre_op"] = df.apply(_penalidade_pre_op, axis=1)
    df["justificativa"]     = df.apply(lambda r: _gerar_justificativa(r, None), axis=1)

    agrav = df["score_agravamento"] if "score_agravamento" in df.columns else 0
    df["score_final"] = (
        df["score_classe"] + agrav + df["score_equidade"]
        + df["ajuste_risco"] - df["penalidade_pre_op"]
    )

    # Regra de ouro
    def _sem_urgencia(r):
        if r.get("oncologico"): return False
        if r.get("cid_norm", "") in _CID_URGENTES: return False
        if r.get("piora_recente_count", 0) > 0: return False
        if r.get("biopsia_positiva_count", 0) > 0: return False
        txt = str(r.get("justificativa_clinica", "")) + " " + str(r.get("observacoes", ""))
        if _KW_SEM_URGENCIA.search(txt): return False
        if int(r.get("intensidade_dor_eva", 0)) > 3: return False
        if str(r.get("limitacao_funcional", "nenhuma")).lower() not in ("nenhuma", "leve"): return False
        return True

    df["sem_urgencia"] = df.apply(_sem_urgencia, axis=1)
    if df["sem_urgencia"].any() and df["oncologico"].any():
        score_max_calmo = df.loc[df["sem_urgencia"], "score_final"].max()
        mask = df["oncologico"] & (df["score_final"] <= score_max_calmo)
        if mask.any():
            df.loc[mask, "score_final"] = score_max_calmo + 1

    df = df.sort_values(["score_final", "dias_em_fila"], ascending=[False, False])
    df = df.reset_index(drop=True)
    df["posicao"] = df.index + 1
    return df


@app.post("/api/fila/{solicitacao_id}/editar")
def editar_paciente(solicitacao_id: str, edicao: EdicaoPaciente):
    if _estado["fila_df"] is None:
        raise HTTPException(status_code=404, detail="Nenhum dado processado ainda.")

    df = _estado["fila_df"]
    mask = df["solicitacao_id"].astype(str) == solicitacao_id
    if not mask.any():
        raise HTTPException(status_code=404, detail=f"Paciente {solicitacao_id} não encontrado.")

    # Captura posição e valores antes da edição
    paciente_antes = next(
        (p for p in _estado["fila"] if str(p.get("solicitacao_id")) == solicitacao_id),
        None,
    )
    posicao_antes = paciente_antes["posicao"] if paciente_antes else None

    campos = edicao.model_dump(exclude_none=True)

    # Registra apenas os campos que de fato mudaram
    _LABELS = {
        "classe_swalis": "Classe SWALIS",
        "especialidade": "Especialidade",
        "procedimento": "Procedimento",
        "cid_principal": "CID Principal",
        "cid_descricao": "Descrição do CID",
    }
    alteracoes = []
    for col, novo_val in campos.items():
        val_ant = str(paciente_antes.get(col, "") or "") if paciente_antes else ""
        if str(novo_val).strip() != val_ant.strip():
            alteracoes.append({
                "campo": _LABELS.get(col, col),
                "de": val_ant,
                "para": str(novo_val),
            })

    for col, val in campos.items():
        df.loc[mask, col] = val

    df = _recalcular_fila(df)
    _estado["fila_df"] = df
    _estado["fila"] = _fila_para_json(df)

    paciente = next(
        (p for p in _estado["fila"] if str(p.get("solicitacao_id")) == solicitacao_id),
        None,
    )
    if paciente is None:
        raise HTTPException(status_code=404, detail="Paciente não encontrado após edição.")

    if alteracoes:
        registro = {
            "timestamp": datetime.now().strftime("%d/%m/%Y %H:%M"),
            "posicao_antes": posicao_antes,
            "posicao_depois": paciente["posicao"],
            "alteracoes": alteracoes,
        }
        _historico.setdefault(solicitacao_id, []).append(registro)

    return JSONResponse(paciente)


@app.get("/api/fila/{solicitacao_id}/historico")
def get_historico(solicitacao_id: str):
    return JSONResponse(_historico.get(solicitacao_id, []))


@app.get("/api/exportar/completo")
def exportar_completo():
    if _estado["fila"] is None:
        raise HTTPException(status_code=404, detail="Nenhum dado processado ainda.")
    df = pd.DataFrame(_estado["fila"])
    csv = df.to_csv(index=False)
    return StreamingResponse(
        io.StringIO(csv),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=fila_priorizada_completo.csv"},
    )


@app.get("/api/exportar/entrega")
def exportar_entrega():
    if _estado["fila"] is None:
        raise HTTPException(status_code=404, detail="Nenhum dado processado ainda.")
    df = pd.DataFrame(_estado["fila"])[["solicitacao_id", "posicao", "justificativa"]]
    csv = df.to_csv(index=False)
    return StreamingResponse(
        io.StringIO(csv),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=fila_priorizada_entrega.csv"},
    )


# ── Servir front estático ────────────────────────────────────────────────────
# Montado depois dos endpoints para não sobrescrever /api e /processar.
# O StaticFiles retorna 405 para POST em paths que não existem como arquivo,
# mas como o endpoint POST /api/fila/{id}/editar está registrado antes deste
# mount, o FastAPI o resolve primeiro — o mount só captura o que sobra.
app.mount("/", StaticFiles(directory=FRONT_DIR, html=True), name="front")


# ── Entrypoint ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True,
                app_dir=os.path.dirname(__file__))
