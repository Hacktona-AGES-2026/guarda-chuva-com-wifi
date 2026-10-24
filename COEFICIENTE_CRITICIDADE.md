# Coeficiente de Criticidade — Levantamento de Atributos

## Contexto

O sistema atual de priorização da fila cirúrgica é manual, ruidoso e raramente revisado. Os dados revelam problemas concretos:

- **34 pacientes oncológicos estão com prioridade "baixa"**, sendo que 26 esperam há mais de 180 dias
- **224 pacientes pioraram clinicamente (eventos reais) mas a flag `flag_piora_clinica` diz "nao"** — o sistema atual ignora a maioria das pioras
- **1 paciente oncológico espera há 1.318 dias** na fila
- A prioridade manual atual é praticamente inútil como critério confiável

O objetivo é construir um **coeficiente de criticidade** que combine dados estruturados, eventos clínicos e análise de texto livre via IA para gerar uma ordenação justa e auditável.

---

## Dimensão 1 — Urgência clínica do diagnóstico (maior peso)

### `fila_cirurgica.csv`

| Atributo | Como usar | Relevância |
|---|---|---|
| `cid_principal` | Detectar prefixo `C*` (maligno), `D37–D48` (comportamento incerto), `R91` (achado suspeito). **Não usar `flag_oncologico`** — tem 21 falsos negativos e 23 falsos positivos confirmados nos dados. | Crítico |
| `cid_secundario` | Comorbidades codificadas que agravam o risco (ex.: `I200` angina instável, `K800` coledocolitíase com obstrução, `N132` hidronefrose obstrutiva). | Alto |
| `especialidade` + `procedimento_id` | Junto com a classificação SWALIS define a classe natural do procedimento. Cirurgia oncológica tem peso diferente de catarata. | Alto |

### `eventos_clinicos.csv`

| Atributo | Como usar | Relevância |
|---|---|---|
| `tipo_evento = biopsia`, `resultado = positivo` | Malignidade confirmada mesmo que o CID ainda não reflita — **aparece em 146 solicitações**. Deve elevar urgência como se fosse CID `C*`. | Crítico |
| `tipo_evento = exame_imagem`, `resultado = progressao` | Progressão documentada da doença durante a espera. | Alto |
| `tipo_evento = consulta_reavaliacao`, `resultado = piora` | Piora clínica avaliada por médico. | Alto |

---

## Dimensão 2 — Deterioração durante a espera

### `eventos_clinicos.csv`

| Atributo | Como usar | Relevância |
|---|---|---|
| `tipo_evento = pronto_socorro` | Ida ao PS pelo problema cirúrgico = doença não controlável ambulatorialmente. Recorrência (múltiplos eventos) aumenta o peso. | Alto |
| `tipo_evento = internacao`, `valor_numerico` | Internação durante a espera = gravidade real. Dias internado (`valor_numerico`) aumenta o peso. | Alto |
| `tipo_evento = contato_telefonico`, `resultado = relata_piora` | Piora autorrelatada. Peso menor, mas sinal válido especialmente se recente. | Médio |
| Recência dos eventos | Eventos nos últimos 90/180 dias têm peso maior que eventos antigos. | Alto |
| Quantidade de eventos de piora | Padrão de agravamento progressivo (3+ eventos de piora) indica urgência crescente. | Médio |

---

## Dimensão 3 — Dados não estruturados: texto livre via IA

### `fila_cirurgica.csv` — colunas `justificativa_clinica` e `observacoes`

O texto livre frequentemente contém a informação mais crítica e não está refletida nas colunas estruturadas. A análise manual é inviável para 941 registros.

**Abordagem:** enviar `justificativa_clinica` + `observacoes` para um LLM (Claude API, GPT-4o ou modelo local via Ollama) com prompt estruturado, recebendo um JSON por paciente.

**O que extrair via LLM:**

| Sinal a extrair | Exemplos no texto | Por que importa |
|---|---|---|
| Palavras de alarme clínico | "encarcerado", "estrangulado", "colangite", "icterícia", "disfagia progressiva", "perda ponderal", "hemoptise", "linfonodo fixo", "PSA em elevação" | Indicam urgência cirúrgica imediata |
| Confirmação de malignidade | "carcinoma ductal invasivo", "AP positivo", "biópsia maligna", "neoplasia confirmada" | Pode não estar refletido no CID ainda |
| Progressão descrita | "crescimento rápido", "TC com progressão", "aumento de lesão" | Agravamento documentado apenas em texto |
| Comprometimento funcional grave | "acamado", "dependente", "perda de função", "não deambula" | Piora funcional não capturada nas colunas |
| Desistência ou cirurgia feita | "operou em outro serviço", "desistiu", "óbito" | Remover da fila ativa |

**Saída esperada do LLM por paciente:**
```json
{
  "sinais_alarme": ["disfagia", "perda ponderal"],
  "malignidade_confirmada_texto": true,
  "progressao_descrita": false,
  "desistencia_ou_resolvido": false,
  "score_texto": 8
}
```

---

## Dimensão 4 — Tempo de espera e equidade

### `fila_cirurgica.csv`

| Atributo | Como usar | Relevância |
|---|---|---|
| `dias_em_fila` | Fator de correção crescente — evita que pacientes moderados fiquem eternamente na fila. Normalizar por especialidade (ortopedia tem fila naturalmente maior). | Alto |
| `data_ultima_revisao_prioridade` | Se igual à data de entrada, a prioridade nunca foi revisada e o score está congelado no momento do cadastro. | Médio |
| `prioridade_regulacao` | **Não usar como critério principal.** Pode ser fator de desempate leve com peso muito baixo. | Baixo |

**Lógica de equidade:** aplicar bônus crescente com o tempo (`log(dias_em_fila)` ou bônus linear por faixa), com teto definido pela classe SWALIS. Um paciente classe C (prazo de 180 dias) que já espera 400 dias deve subir na fila mesmo sem agravamento.

---

## Dimensão 5 — Risco cirúrgico e capacidade operacional

### `procedimentos.csv`

| Atributo | Como usar | Relevância |
|---|---|---|
| `risco_cirurgico` (1–5) | Procedimentos de alto risco (4–5) precisam de janela cirúrgica específica. Não devem ficar atrás de procedimentos simples sem motivo clínico. | Médio |
| `necessita_uti` | Limita agendamento por disponibilidade de UTI. Pode gerar sublista ou fila separada por esse critério. | Médio |
| `porte` | Duração de sala operatória — impacta capacidade logística e planejamento de agenda. | Baixo |

### `fila_cirurgica.csv`

| Atributo | Como usar | Relevância |
|---|---|---|
| `asa` | ASA 3–4 exige anestesia especializada. Impacta a janela segura de operação, não a prioridade de urgência em si. | Médio |
| `avaliacao_pre_anestesica` | `pendente` ou `vencida` = paciente não está pronto para operar. Sinaliza necessidade de acelerar o preparo, não de rebaixar na fila. | Operacional |
| `exames_pre_op_validos` | Complementa a avaliação de prontidão para cirurgia. | Operacional |

---

## Dimensão 6 — Localização e acesso

### `fila_cirurgica.csv`

| Atributo | Como usar | Relevância |
|---|---|---|
| `distancia_hospital_km` | Pacientes de longe têm maior custo de deslocamento e menor capacidade de retornar se perderem vaga. Fator de ajuste leve para desempate. 20 registros sem valor. | Baixo-médio |
| `municipio` | Cruzar com dados públicos (IBGE/DataSUS) para estimar tempo médio de espera por município e identificar sub-representação geográfica. | Médio |

**Limitação importante:** distância não indica urgência clínica. Usá-la como desempate ou fator logístico faz sentido, mas não como elevador primário de prioridade — para não criar desigualdade inversa (pacientes próximos sendo penalizados).

---

## Dimensão 7 — Perfil de risco do paciente

### `fila_cirurgica.csv`

| Atributo | Como usar | Relevância |
|---|---|---|
| `idade` | Idosos (65+) têm janela cirúrgica menor — a doença evolui mais rápido e o risco de deterioração é maior. Fator de aceleração leve. | Médio |
| `comorbidades` | `HAS`, `DM2`, `obesidade`, `DPOC` aumentam risco de deterioração durante a espera. Parseadas da string separada por `;`. | Médio |
| `hba1c_ultima` | Diabetes descontrolado (>8,5%) pode impedir cirurgia segura. O valor do cadastro pode ser antigo — preferir a série de eventos `hba1c`. | Médio |
| `intensidade_dor_eva` | Dor alta (≥7) contribui para urgência, mas correlação com gravidade real é fraca (neoplasia pode ter EVA 0). Peso baixo isoladamente. | Baixo |
| `limitacao_funcional` | `grave` = impacto real e mensurável na vida do paciente. Contribui para urgência. | Médio |

---

## O SUS e categorias de atendimento

O SUS possui um sistema formal de regulação cirúrgica (SISREG) que classifica solicitações em categorias de urgência. Essas categorias mapeiam diretamente para as **5 classes SWALIS** já presentes no dataset como referência.

| Categoria SUS / SWALIS | Prazo máximo | Critério | Equivalência nos dados |
|---|---|---|---|
| **A1** — Urgência com risco de vida | 15 dias | Doença de progressão rápida com risco de vida ou perda de órgão/função | CID `C*` em progressão, PS recorrente, internação recente, alarme no texto |
| **A2** — Urgência sem risco imediato | 21 dias | Doença de progressão rápida com risco de agravamento ou incapacidade | Oncológico confirmado e estável, biópsia positiva aguardando cirurgia |
| **B** — Prioritário | 60 dias | Dor, disfunção ou incapacidade importantes, sem progressão rápida | Dor EVA ≥7, limitação grave/moderada, colecistites de repetição |
| **C** — Eletivo com prioridade | 180 dias | Dor ou disfunção moderadas, sem tendência a agravamento | Hérnia sintomática, varizes com dor, catarata com limitação moderada |
| **D** — Eletivo comum | 360 dias | Sem dor, disfunção ou incapacidade relevantes | Hérnia assintomática, nevo sem sinais de malignidade |

**A estratégia de entrelaçamento:** classificar cada paciente em uma classe SWALIS com base em todos os sinais acima, e ordenar **dentro de cada classe** pelo coeficiente de criticidade. A classe domina — um A1 nunca fica atrás de um D, independente de qualquer outro fator.

---

## Fórmula proposta do coeficiente

```
score_final = (
    score_classe_swalis          # 0–100  determinístico (CID + biópsia + eventos graves)
  + score_agravamento_eventos    # 0–30   (PS, internação, progressão, recência e frequência)
  + score_texto_ia               # 0–20   (análise LLM de justificativa + observações)
  + ajuste_tempo_espera          # 0–15   (bônus crescente por dias além do prazo da classe)
  + ajuste_risco_paciente        # 0–10   (idade ≥65, ASA 3-4, limitação grave, comorbidades)
  - penalidade_nao_pronto        # -5     (se avaliação pré-anestésica pendente/vencida)
)
```

**Garantia da regra de ouro:** a classe SWALIS domina a ordenação. Um paciente A1 ou A2 nunca pode ficar abaixo de um C ou D, independente dos demais fatores. O coeficiente detalhado só ordena pacientes dentro da mesma classe.

---

## Atributos a ignorar ou usar com cautela

| Atributo | Motivo |
|---|---|
| `flag_oncologico` | 21 falsos negativos + 23 falsos positivos. Usar o CID diretamente. |
| `flag_diabetico` | Inconsistente. Usar `comorbidades` + série de `hba1c` dos eventos. |
| `flag_piora_clinica` | 224 falsos negativos. Usar os eventos clínicos como fonte de verdade. |
| `prioridade_regulacao` | Ruidosa, raramente revisada. Apenas desempate de último nível. |

---

## Próximas decisões

1. **Stack de implementação** — Python (pandas + requests) ou outra linguagem?
2. **LLM para texto livre** — Claude API, OpenAI GPT-4o ou modelo local (Ollama + llama3)?
3. **Saída: lista única ou sublistas por especialidade?** — Ortopedia e oncologia têm dinâmicas muito diferentes; sublistas separadas podem ser mais úteis para a equipe de regulação.
