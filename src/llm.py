# -*- coding: utf-8 -*-
"""
llm.py
Analisa texto livre (justificativa_clinica + observacoes) via LLM para extrair
sinais clínicos não capturados pelos dados estruturados.

Prioridade de provider:
  1. Claude API (Anthropic) — se ANTHROPIC_API_KEY estiver definida
  2. Ollama local                — fallback padrão

Saída por paciente:
  {
    "sinais_alarme": ["lista de termos encontrados"],
    "malignidade_confirmada_texto": bool,
    "progressao_descrita": bool,
    "desistencia_ou_resolvido": bool,
    "score_texto": int  (0-10)
  }
"""
import json
import os
import time
import urllib.request
import urllib.error
from typing import Any

# ── Configurações ────────────────────────────────────────────────────────────

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
ANTHROPIC_MODEL   = "claude-haiku-4-5"          # modelo rápido e econômico
ANTHROPIC_URL     = "https://api.anthropic.com/v1/messages"

OLLAMA_URL        = os.environ.get("OLLAMA_URL", "http://localhost:11434/api/generate")
OLLAMA_MODEL      = os.environ.get("OLLAMA_MODEL", "llama3")

# Timeout de rede em segundos
REQUEST_TIMEOUT = 30

# ── Prompt ───────────────────────────────────────────────────────────────────

SYSTEM_PROMPT = """Você é um assistente médico especializado em triagem cirúrgica do SUS.
Analise o texto clínico fornecido e responda APENAS com um JSON válido, sem texto adicional."""

USER_PROMPT_TEMPLATE = """Analise o texto clínico abaixo de um paciente em fila cirúrgica e retorne um JSON com exatamente estas chaves:

- sinais_alarme: lista de strings com termos ou frases de alarme encontrados no texto (ex: ["disfagia progressiva", "perda ponderal"])
- malignidade_confirmada_texto: true se o texto confirma malignidade (biópsia positiva, carcinoma, neoplasia maligna, etc.)
- progressao_descrita: true se o texto descreve progressão ou piora da doença
- desistencia_ou_resolvido: true se o texto indica que o paciente desistiu, foi operado em outro serviço ou o problema foi resolvido
- score_texto: inteiro de 0 a 10 indicando urgência clínica baseada no texto (0=sem urgência, 10=emergência)

TEXTO:
{texto}

Responda APENAS com o JSON, sem explicações."""

# ── Provider: Claude API ─────────────────────────────────────────────────────

def _chamar_claude(texto: str) -> dict[str, Any]:
    payload = json.dumps({
        "model": ANTHROPIC_MODEL,
        "max_tokens": 300,
        "system": SYSTEM_PROMPT,
        "messages": [{"role": "user", "content": USER_PROMPT_TEMPLATE.format(texto=texto)}],
    }).encode("utf-8")

    req = urllib.request.Request(
        ANTHROPIC_URL,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "x-api-key": ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
        },
    )
    with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT) as resp:
        body = json.loads(resp.read())
    raw = body["content"][0]["text"].strip()
    return json.loads(raw)


# ── Provider: Ollama ─────────────────────────────────────────────────────────

def _chamar_ollama(texto: str) -> dict[str, Any]:
    prompt_completo = f"{SYSTEM_PROMPT}\n\n{USER_PROMPT_TEMPLATE.format(texto=texto)}"
    payload = json.dumps({
        "model": OLLAMA_MODEL,
        "prompt": prompt_completo,
        "stream": False,
        "format": "json",
    }).encode("utf-8")

    req = urllib.request.Request(
        OLLAMA_URL,
        data=payload,
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT) as resp:
        body = json.loads(resp.read())
    raw = body.get("response", "{}").strip()
    return json.loads(raw)


# ── Resultado padrão quando LLM não está disponível ─────────────────────────

_RESULTADO_VAZIO: dict[str, Any] = {
    "sinais_alarme": [],
    "malignidade_confirmada_texto": False,
    "progressao_descrita": False,
    "desistencia_ou_resolvido": False,
    "score_texto": 0,
}


def _resultado_vazio() -> dict[str, Any]:
    return dict(_RESULTADO_VAZIO)


# ── Interface pública ────────────────────────────────────────────────────────

def analisar_texto(justificativa: str, observacoes: str = "") -> dict[str, Any]:
    """
    Analisa o texto livre de um paciente.
    Usa Claude se ANTHROPIC_API_KEY estiver definida; caso contrário, Ollama.
    Em caso de falha de rede ou resposta inválida, retorna resultado vazio.
    """
    texto = " ".join(filter(None, [str(justificativa or ""), str(observacoes or "")])).strip()
    if not texto or texto in ("nan", "nan nan"):
        return _resultado_vazio()

    # Tentar Claude primeiro se chave disponível
    if ANTHROPIC_API_KEY:
        try:
            return _chamar_claude(texto)
        except Exception as e:
            print(f"[llm] Claude falhou ({type(e).__name__}), tentando Ollama...")

    # Ollama como padrão/fallback
    try:
        return _chamar_ollama(texto)
    except urllib.error.URLError:
        # Ollama não está rodando — modo offline silencioso
        return _resultado_vazio()
    except Exception as e:
        print(f"[llm] Ollama falhou ({type(e).__name__}), usando resultado vazio.")
        return _resultado_vazio()


def analisar_lote(fila, col_justificativa="justificativa_clinica",
                  col_observacoes="observacoes", delay_s=0.1):
    """
    Analisa todas as linhas do DataFrame e retorna um DataFrame com colunas de resultado.
    delay_s: pausa entre chamadas para não sobrecarregar o provider.
    """
    import pandas as pd

    resultados = []
    total = len(fila)
    provider = "Claude API" if ANTHROPIC_API_KEY else "Ollama"
    print(f"[llm] Analisando {total} textos via {provider}...")

    for i, (_, row) in enumerate(fila.iterrows(), 1):
        resultado = analisar_texto(
            row.get(col_justificativa, ""),
            row.get(col_observacoes, ""),
        )
        resultado["solicitacao_id"] = row["solicitacao_id"]
        resultados.append(resultado)

        if i % 50 == 0:
            print(f"[llm]   {i}/{total} processados")
        if delay_s > 0:
            time.sleep(delay_s)

    df = pd.DataFrame(resultados).set_index("solicitacao_id")
    print(f"[llm] Concluído. Score médio: {df['score_texto'].mean():.1f}")
    return df


def verificar_providers():
    """Imprime quais providers estão disponíveis."""
    print(f"ANTHROPIC_API_KEY definida: {'sim' if ANTHROPIC_API_KEY else 'nao'}")
    if ANTHROPIC_API_KEY:
        print(f"  Modelo Claude: {ANTHROPIC_MODEL}")
    try:
        req = urllib.request.Request(
            OLLAMA_URL.replace("/api/generate", "/api/tags"),
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=3) as resp:
            tags = json.loads(resp.read())
        modelos = [m["name"] for m in tags.get("models", [])]
        print(f"Ollama disponivel: sim  |  modelos: {modelos}")
    except Exception:
        print("Ollama disponivel: nao (nao esta rodando ou URL incorreta)")


if __name__ == "__main__":
    verificar_providers()
    print()
    # Teste com texto de exemplo
    resultado = analisar_texto(
        "Nodulo de mama direita BI-RADS 4C, core biopsy com carcinoma ductal invasivo. "
        "Indicada setorectomia. Paciente com disfagia progressiva e perda ponderal de 8kg.",
        "Paciente relata piora de sintomas por telefone."
    )
    print("Resultado de teste:")
    print(json.dumps(resultado, ensure_ascii=False, indent=2))
