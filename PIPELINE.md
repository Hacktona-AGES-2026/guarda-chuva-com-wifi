# Pipeline de Priorização Cirúrgica

## Como usar

```bash
# Modo offline (sem LLM)
python src/priorizar.py --sem-llm

# Com Claude API
export ANTHROPIC_API_KEY=sk-ant-...
python src/priorizar.py

# Com Ollama local
ollama pull llama3
python src/priorizar.py

# Apontando para outra pasta de dados
python src/priorizar.py --dataset outra/pasta
```

**Saída gerada:**
- `output/fila_priorizada.csv` — lista única ordenada (`solicitacao_id`, `posicao`, `justificativa`)
- `output/por_especialidade/<nome>.csv` — uma fila por especialidade com scores detalhados

---

## Módulos

### `normalizar.py`
Carrega os três CSVs e corrige as falhas de formatação identificadas antes de qualquer cálculo:
- Padroniza `cid_principal` (remove ponto, coloca em maiúsculas)
- Normaliza `prioridade_regulacao` e `municipio` (remove variações de caixa e acentos)
- Descarta as flags manuais `flag_oncologico` e `flag_piora_clinica` — deriva os valores diretamente do CID e dos eventos
- Imputa nulos conservadores em `asa`, `intensidade_dor_eva` e `limitacao_funcional`
- Marca solicitações duplicadas (mesmo paciente + mesmo procedimento), mantendo a mais antiga
- Agrega os eventos clínicos por solicitação: contagem de pioras, pioras recentes (últimos 180 dias), dias internado, HbA1c mais recente e sinais de desistência

### `classificar_swalis.py`
Classifica cada paciente em uma das 5 classes de urgência do modelo SWALIS de forma determinística, sem LLM:

| Classe | Prazo | Critério principal |
|---|---|---|
| A1 | 15 dias | Oncológico com internação ou piora recente; CID de obstrução/instabilidade; alarme clínico + piora |
| A2 | 21 dias | Oncológico estável; biópsia positiva sem CID `C*`; comportamento incerto + piora |
| B  | 60 dias | Limitação grave; dor ≥8; piora recente sem marcador oncológico |
| C  | 180 dias | Limitação moderada; dor ≥4; piora histórica |
| D  | 360 dias | Sem urgência clínica identificada |

A classe domina a ordenação final — um A1 nunca fica atrás de um D independente dos demais fatores.

### `llm.py`
Analisa o texto livre (`justificativa_clinica` + `observacoes`) de cada paciente e retorna um JSON com sinais clínicos não capturados pelas colunas estruturadas.

Usa dois providers com prioridade automática:
1. **Claude API** — se `ANTHROPIC_API_KEY` estiver definida
2. **Ollama local** — fallback padrão (`llama3` por padrão, configurável via `OLLAMA_MODEL`)

Se nenhum provider estiver disponível, opera em modo offline silencioso (`score_texto = 0`) sem travar o pipeline.

O que o LLM extrai por paciente:
- `sinais_alarme` — termos de urgência encontrados no texto
- `malignidade_confirmada_texto` — malignidade descrita no texto mas não registrada no CID
- `progressao_descrita` — piora documentada apenas em texto livre
- `desistencia_ou_resolvido` — paciente que já operou em outro serviço ou desistiu
- `score_texto` — score de urgência de 0 a 10

### `coeficiente.py`
Calcula o `score_final` de cada paciente combinando cinco dimensões:

```
score_final = score_classe        (0–100)  classe SWALIS — dimensão dominante
            + score_agravamento   (0–30)   eventos de piora: PS, internação, progressão em imagem
            + score_llm           (0–20)   análise de texto (0 se offline)
            + ajuste_tempo        (0–15)   bônus logarítmico por dias além do prazo da classe
            + ajuste_risco        (0–10)   idade ≥65, ASA 3-4, limitação funcional, dor, HbA1c
            - penalidade_pre_op   (0–5)    avaliação pré-anestésica pendente/vencida ou exames inválidos
```

Pacientes detectados como desistência pelo LLM recebem `score = -999` e vão para o fim da lista.

### `priorizar.py`
Ponto de entrada que orquestra os quatro módulos acima em sequência e gera os arquivos de saída. Também remove as solicitações duplicadas da entrega final, mantendo apenas a de maior criticidade por paciente.
