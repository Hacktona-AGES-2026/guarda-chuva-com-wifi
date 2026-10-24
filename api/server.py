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
import os
import sys
import tempfile

import pandas as pd
import uvicorn
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

# Adiciona src/ ao path para importar os módulos do pipeline
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from normalizar import carregar_fila, carregar_eventos, carregar_procedimentos, enriquecer_fila_com_eventos
from classificar_swalis import classificar
from coeficiente import calcular_coeficiente

app = FastAPI(title="Priorização Cirúrgica")

# Estado em memória — substituído a cada POST /processar
_estado: dict = {"fila": None, "stats": None}

FRONT_DIR = os.path.join(os.path.dirname(__file__), "..", "front")


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
                  "ajuste_tempo", "ajuste_risco", "penalidade_pre_op"]
    df[float_cols] = df[float_cols].round(2)
    return df.to_dict(orient="records")


def _calcular_stats(fila: pd.DataFrame) -> dict:
    df = fila[~fila["is_duplicata"]]
    dist_classe = df["classe_swalis"].value_counts().to_dict()
    dist_esp    = df["especialidade"].value_counts().to_dict()
    onco        = int(df["oncologico"].sum())
    piora_rec   = int((df["piora_recente_count"] > 0).sum())
    return {
        "total": len(df),
        "por_classe": dist_classe,
        "por_especialidade": dist_esp,
        "oncologicos": onco,
        "com_piora_recente": piora_rec,
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

        _estado["fila"]  = _fila_para_json(fila)
        _estado["stats"] = _calcular_stats(fila)

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


# ── Servir front estático ────────────────────────────────────────────────────
# Montado depois dos endpoints para não sobrescrever /api e /processar
app.mount("/", StaticFiles(directory=FRONT_DIR, html=True), name="front")


# ── Entrypoint ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True,
                app_dir=os.path.dirname(__file__))
