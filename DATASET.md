# Dataset — Documentação

Desafio 1: Priorização Inteligente da Fila Cirúrgica  
9ª Hackatona de Engenharia de Software · 2026 · Fin-x · PUCRS · Hospital São Lucas

> Todos os dados são **100% sintéticos** — nenhum paciente real. Data de referência: **23/10/2026**.

---

## Estrutura de arquivos

```
dataset/
├── fila_cirurgica.csv          # 941 solicitações cirúrgicas (tabela principal)
├── eventos_clinicos.csv        # ~1.500 eventos que ocorreram durante a espera
├── procedimentos.csv           # catálogo de 23 procedimentos cirúrgicos
├── dicionario_dados.md         # descrição detalhada de cada coluna
├── verificar_fila_priorizada.py# script de validação do entregável
└── referencias/
    └── swalis.csv              # framework de urgência (referência opcional)
```

---

## Arquivos

### `fila_cirurgica.csv` — tabela principal (941 linhas)

Uma linha por solicitação cirúrgica. É a tabela central do desafio.

| Coluna | O que significa |
|---|---|
| `solicitacao_id` | Identificador único da solicitação (ex.: `SOL-2025-00318`). Chave de ligação com `eventos_clinicos.csv`. |
| `paciente_id` | Identificador do paciente (ex.: `PAC-00412`). Um paciente pode ter mais de uma solicitação. |
| `nome_paciente` | Nome sintético. Pode haver variações de grafia para o mesmo paciente. |
| `sexo` | `F` ou `M`. |
| `idade` | Idade em anos (18–92). |
| `municipio` | Município de residência. Grafia levemente inconsistente em alguns registros. |
| `uf` | Unidade federativa (`RS`). |
| `distancia_hospital_km` | Distância aproximada até o hospital em km. Pode estar vazia. |
| `procedimento_id` | Chave para `procedimentos.csv` (ex.: `PROC004`). |
| `procedimento` | Nome do procedimento. Redundante com o catálogo, disponível por conveniência. |
| `especialidade` | Especialidade cirúrgica (ex.: `Cirurgia Geral`, `Oncologia`). |
| `cid_principal` | Código CID-10 do diagnóstico principal. **Atenção:** nem sempre tem ponto — `K409` e `K40.9` são o mesmo código. CIDs iniciados por `C` indicam neoplasia maligna. |
| `cid_descricao` | Descrição textual do CID principal. |
| `cid_secundario` | CID de comorbidade, quando disponível. Frequentemente vazio. |
| `asa` | Classificação de risco anestésico ASA (1–4). Pode estar vazio. |
| `comorbidades` | Lista de comorbidades separadas por `;` (ex.: `HAS; DM2; obesidade`). Pode estar incompleta. |
| `intensidade_dor_eva` | Dor na escala visual analógica (0–10). Pode estar vazio. Doença grave pode ter dor baixa. |
| `limitacao_funcional` | `nenhuma`, `leve`, `moderada` ou `grave`. Pode estar vazio. |
| `justificativa_clinica` | Texto livre do médico solicitante. Pode conter informações clínicas importantes não refletidas nas colunas estruturadas. |
| `observacoes` | Anotações da regulação, call center e enfermagem. Frequentemente vazio. |
| `data_entrada_fila` | Data em que a solicitação entrou na fila. |
| `dias_em_fila` | Dias desde a entrada até 23/10/2026. |
| `prioridade_regulacao` | Prioridade manual atribuída na inclusão (`alta`, `media`, `baixa`). **Ruidosa e raramente revisada.** |
| `data_ultima_revisao_prioridade` | Data da última revisão. Na maioria dos casos igual à data de entrada (nunca revisada). |
| `flag_oncologico` | Flag manual (`sim`/`nao`). **Não é confiável — nem sempre bate com o CID.** |
| `flag_diabetico` | Flag manual (`sim`/`nao`). Nem sempre bate com comorbidades, texto ou exames. |
| `flag_piora_clinica` | Flag manual (`sim`/`nao`). Desatualizada — use os eventos clínicos como fonte de verdade. |
| `hba1c_ultima` | Última HbA1c registrada no cadastro (pré-operatório, opcional). Pode estar desatualizada. |
| `data_hba1c_ultima` | Data da HbA1c registrada no cadastro (pré-operatório, opcional). |
| `avaliacao_pre_anestesica` | `realizada`, `pendente` ou `vencida` (pré-operatório, opcional). |
| `exames_pre_op_validos` | `sim` ou `nao` (pré-operatório, opcional). |

---

### `eventos_clinicos.csv` — histórico clínico durante a espera (~1.500 linhas)

O que aconteceu com cada paciente enquanto aguardava na fila. Ligado à fila por `solicitacao_id`.

| Coluna | O que significa |
|---|---|
| `evento_id` | Identificador único do evento (ex.: `EVT-000123`). Há alguns eventos duplicados (mesmo conteúdo, IDs diferentes). |
| `solicitacao_id` | Chave para `fila_cirurgica.csv`. Alguns eventos apontam para solicitações que já saíram da fila. |
| `paciente_id` | Identificador do paciente. |
| `data_evento` | Data do evento. Pode ser anterior à entrada na fila (ex.: biópsia que gerou a solicitação). |
| `tipo_evento` | Tipo do evento — ver tabela abaixo. |
| `resultado` | Resultado do evento — depende do tipo. |
| `valor_numerico` | Valor numérico quando aplicável: HbA1c em % (`hba1c`) ou dias de internação (`internacao`). Vazio nos demais tipos. |
| `descricao` | Texto livre: laudo, motivo do atendimento, anotação. |
| `origem` | De onde veio o registro: `laboratorio`, `radiologia`, `call center`, `ambulatorio`, `UPA`, `PS Hospital Sao Lucas` etc. |

**Tipos de evento e o que revelam:**

| `tipo_evento` | `resultado` possíveis | O que significa |
|---|---|---|
| `biopsia` | `positivo`, `negativo`, `inconclusivo` | `positivo` = malignidade confirmada. Pode existir mesmo quando o CID da fila ainda é benigno. |
| `hba1c` | valor em `valor_numerico` | Série temporal de controle glicêmico. Acima de 8,5% indica diabetes descontrolado para cirurgia eletiva. |
| `pronto_socorro` | `atendido_liberado`, `observacao` | Ida ao PS ou UPA pelo problema cirúrgico ou condição relacionada. |
| `internacao` | `alta` | Internação durante a espera. Dias de internação em `valor_numerico`. |
| `exame_imagem` | `estavel`, `progressao` | Controle de imagem. `progressao` indica piora. |
| `consulta_reavaliacao` | `piora`, `estavel`, `melhora` | Reavaliação ambulatorial. |
| `contato_telefonico` | `atendeu`, `nao_atendeu`, `relata_piora`, `relata_melhora`, `informou_cirurgia_outro_servico`, `desistiu` | Contato feito pelo call center. |
| `falta` | `consulta`, `exame`, `avaliacao_pre_anestesica` | Paciente não compareceu ao compromisso. |

---

### `procedimentos.csv` — catálogo de procedimentos cirúrgicos (23 linhas)

Tabela de referência com características de cada procedimento.

| Coluna | O que significa |
|---|---|
| `procedimento_id` | Identificador do procedimento (`PROC001` a `PROC023`). Chave para `fila_cirurgica.csv`. |
| `procedimento` | Nome do procedimento cirúrgico. |
| `especialidade` | Especialidade responsável. |
| `porte` | Complexidade: `pequeno`, `medio`, `grande` ou `especial`. |
| `risco_cirurgico` | Escala de 1 a 5. 1 = menor risco (ex.: catarata), 5 = maior risco (ex.: revascularização do miocárdio). |
| `duracao_media_min` | Duração média em minutos de sala cirúrgica. |
| `necessita_uti` | Se requer UTI no pós-operatório: `sim`, `nao` ou `eventual`. |

---

### `referencias/swalis.csv` — framework de urgência (5 linhas, uso opcional)

Tabela de referência baseada no modelo SWALIS (Surgical Waiting List Information System), que define classes de urgência para cirurgias eletivas. **Não há mapeamento pronto no dataset** — a equipe deve construí-lo a partir do diagnóstico, dor, limitação funcional, texto e eventos.

| Coluna | O que significa |
|---|---|
| `classe` | Classe de urgência: `A1`, `A2`, `B`, `C` ou `D`. |
| `descricao` | Critério clínico da classe. |
| `prazo_maximo_dias` | Prazo máximo recomendado para realização da cirurgia: 15, 21, 60, 180 ou 360 dias. |
| `exemplos` | Exemplos ilustrativos de cada classe. |

**Resumo das classes:**

| Classe | Prazo | Critério |
|---|---|---|
| A1 | 15 dias | Doença de progressão rápida com risco de vida ou perda de órgão/função |
| A2 | 21 dias | Doença de progressão rápida com risco de agravamento ou incapacidade |
| B | 60 dias | Dor, disfunção ou incapacidade importantes, sem progressão rápida |
| C | 180 dias | Dor ou disfunção moderadas, sem tendência a agravamento |
| D | 360 dias | Sem dor, disfunção ou incapacidade relevantes |

---

### `dicionario_dados.md`

Documentação técnica completa de todas as colunas dos três arquivos CSV principais, com domínios, exemplos e observações sobre qualidade dos dados.

---

### `verificar_fila_priorizada.py`

Script Python de validação para o entregável do desafio (`fila_priorizada.csv`). Verifica:

1. **Formato** — colunas obrigatórias (`solicitacao_id`, `posicao`, `justificativa`), posições inteiras e únicas, IDs existentes.
2. **Cobertura** — quantas solicitações ficaram fora do arquivo entregue.
3. **Regra de ouro** — nenhum paciente oncológico (CID `C*`) pode estar abaixo de um paciente sem urgência clínica.
4. **Indicadores** — posição mediana dos oncológicos, proporção de pacientes com piora recente na primeira metade etc.

**Como usar:**
```bash
python dataset/verificar_fila_priorizada.py caminho/para/fila_priorizada.csv
```

---

## Regra de ouro do desafio

> **Nenhum paciente com neoplasia maligna (CID iniciado por `C`) pode ficar abaixo de um paciente sem urgência clínica.**

Use o CID diretamente — não a `flag_oncologico`, que é manual e não confiável.

## Qualidade dos dados

Os dados têm defeitos intencionais, como em um sistema real:

- Flags (`flag_oncologico`, `flag_diabetico`, `flag_piora_clinica`) frequentemente não batem com o CID ou os eventos.
- CID às vezes sem ponto (`K409` e `K40.9` são o mesmo código — normalize antes de comparar).
- Prioridade manual raramente revisada após inclusão.
- Município com grafia inconsistente (maiúsculas/minúsculas).
- Solicitações duplicadas (mesmo paciente, mesmo procedimento).
- Eventos apontando para solicitações que já saíram da fila.
- Informação clínica importante que só aparece no texto livre da `justificativa_clinica`.
