# Priorização Cirúrgica — guarda-chuva-com-wifi

Sistema de priorização inteligente de fila cirúrgica, desenvolvido para o 4º semestre da PUCRS. Combina regras clínicas determinísticas (modelo SWALIS), análise de eventos e LLM opcional para gerar uma fila auditável e justa.

---

## Visão geral

O sistema recebe três CSVs com dados da fila cirúrgica e produz uma lista priorizada com justificativas por paciente. A ordenação segue a **regra de ouro do SWALIS**: classe clínica domina — um A1 nunca fica atrás de um D, independente de qualquer outro fator.

### Arquitetura

```
dataset/
  fila_cirurgica.csv       ← dados dos pacientes na fila
  eventos_clinicos.csv     ← histórico de eventos por solicitação
  procedimentos.csv        ← catálogo de procedimentos cirúrgicos

src/
  normalizar.py            ← limpeza, imputação e enriquecimento
  classificar_swalis.py    ← classificação A1/A2/B/C/D determinística
  llm.py                   ← análise de texto livre (Claude API / Ollama)
  coeficiente.py           ← cálculo do score_final
  priorizar.py             ← pipeline completo (ponto de entrada CLI)

api/
  server.py                ← FastAPI: recebe CSVs, roda pipeline, serve front

front/
  upload/                  ← tela de upload dos três CSVs
  listinha/                ← fila priorizada em tabela
  dashboard/               ← estatísticas e distribuição por classe/especialidade

output/
  fila_priorizada.csv
  por_especialidade/<especialidade>.csv
```

---

## Como rodar

### Servidor web (recomendado)

```bash
pip install fastapi uvicorn python-multipart pandas
python run.py
```

Abre em `http://localhost:8000`. Faça upload dos três CSVs na tela inicial; o pipeline roda e redireciona para a fila priorizada.

### Pipeline CLI

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

**Saídas geradas:**
- `output/fila_priorizada.csv` — lista única ordenada com `posicao`, `score_final` e `justificativa`
- `output/por_especialidade/<nome>.csv` — uma fila por especialidade com scores detalhados

---

## Pipeline de priorização

### 1. `normalizar.py`

Carrega os três CSVs e corrige falhas de formatação antes de qualquer cálculo:

- Padroniza `cid_principal` (remove ponto, maiúsculas)
- Normaliza `prioridade_regulacao` e `municipio`
- Descarta as flags manuais (`flag_oncologico`, `flag_piora_clinica`) — derivadas diretamente do CID e dos eventos
- Imputa nulos conservadores em `asa`, `intensidade_dor_eva` e `limitacao_funcional`
- Marca solicitações duplicadas (mesmo paciente + mesmo procedimento), mantendo a mais antiga
- Agrega eventos por solicitação: contagem de pioras, pioras recentes (180 dias), dias internado, HbA1c e sinais de desistência

### 2. `classificar_swalis.py`

Classifica cada paciente em uma das 5 classes de urgência de forma determinística, sem LLM:

| Classe | Prazo | Critério principal |
|--------|-------|-------------------|
| A1 | 15 dias | Oncológico com internação ou piora recente; CID de obstrução/instabilidade; alarme clínico + piora |
| A2 | 21 dias | Oncológico estável; biópsia positiva sem CID `C*`; comportamento incerto + piora |
| B  | 60 dias | Limitação grave; dor ≥8; piora recente sem marcador oncológico |
| C  | 180 dias | Limitação moderada; dor ≥4; piora histórica |
| D  | 360 dias | Sem urgência clínica identificada |

### 3. `llm.py` (opcional)

Analisa `justificativa_clinica` + `observacoes` de cada paciente e retorna sinais clínicos não capturados pelas colunas estruturadas.

Providers com prioridade automática:
1. **Claude API** — se `ANTHROPIC_API_KEY` estiver definida
2. **Ollama local** — fallback (`llama3` por padrão, configurável via `OLLAMA_MODEL`)

Se nenhum provider estiver disponível, opera em modo offline silencioso (`score_texto = 0`).

Saída por paciente:
```json
{
  "sinais_alarme": ["disfagia", "perda ponderal"],
  "malignidade_confirmada_texto": true,
  "progressao_descrita": false,
  "desistencia_ou_resolvido": false,
  "score_texto": 8
}
```

### 4. `coeficiente.py`

Calcula o `score_final` combinando cinco dimensões:

```
score_final = score_classe        (0–100)  classe SWALIS — dimensão dominante
            + score_agravamento   (0–30)   PS, internação, progressão em imagem
            + score_llm           (0–20)   análise de texto (0 se offline)
            + score_equidade      (0–∞)    bônus logarítmico por dias além do prazo da classe
            + ajuste_risco        (0–10)   idade ≥65, ASA 3-4, limitação funcional, dor, HbA1c
            - penalidade_pre_op   (0–5)    avaliação pré-anestésica pendente/vencida
```

Pacientes detectados como desistência recebem `score = -999` e vão para o fim da lista.

---

## API REST

O servidor expõe três endpoints além do front-end estático:

| Método | Rota | Descrição |
|--------|------|-----------|
| `POST` | `/processar` | Recebe os 3 CSVs, roda o pipeline, armazena resultado em memória |
| `GET`  | `/api/fila`  | Retorna a fila priorizada em JSON |
| `GET`  | `/api/stats` | Retorna estatísticas (total, por classe, por especialidade, oncológicos, pioras) |

---

## Dataset

Os dados simulam uma fila cirúrgica real com 941 solicitações e incluem:

- **`fila_cirurgica.csv`** — dados demográficos, CID, procedimento, tempo de espera, scores de dor e funcionalidade
- **`eventos_clinicos.csv`** — histórico de eventos (PS, internação, biópsia, exame de imagem, contato telefônico)
- **`procedimentos.csv`** — catálogo com risco cirúrgico, porte e necessidade de UTI

Documentação detalhada em [`dataset/dicionario_dados.md`](dataset/dicionario_dados.md).

---

## Dependências

```
fastapi
uvicorn
python-multipart
pandas
anthropic          # opcional — Claude API
ollama             # opcional — LLM local
```
