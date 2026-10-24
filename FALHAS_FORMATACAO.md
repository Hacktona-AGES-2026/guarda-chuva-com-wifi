# Relatório de Falhas de Formatação — Dataset

Data de análise: **23/10/2026**  
Arquivos analisados: `fila_cirurgica.csv` (941 linhas), `eventos_clinicos.csv` (1.505 linhas), `procedimentos.csv` (23 linhas), `referencias/swalis.csv` (5 linhas)  
Arquivos **excluídos** da análise por serem não estruturados e destinados a leitura por IA: `justificativa_clinica`, `observacoes`, `descricao`

---

## Resumo executivo

| Arquivo | Falhas encontradas | Impacto na priorização |
|---|---|---|
| `fila_cirurgica.csv` | 9 tipos de falha | Alto — afeta CID, prioridade, município e flags |
| `eventos_clinicos.csv` | 4 tipos de falha | Médio — eventos órfãos, duplicatas e domínio incompleto |
| `procedimentos.csv` | Nenhuma | — |
| `referencias/swalis.csv` | Nenhuma | — |

---

## `fila_cirurgica.csv`

### F1 — CID sem ponto decimal (13,3% dos registros)

**Registros afetados:** 125 de 941  
**Descrição:** O campo `cid_principal` deveria sempre usar a notação padrão CID-10 com ponto (ex.: `K40.9`). Em 125 registros o ponto está ausente (ex.: `K409`, `C61`, `D440`).

| Prefixo | Qtd sem ponto |
|---|---|
| C (oncológico) | 53 |
| N (urológico/renal) | 38 |
| D (comportamento incerto) | 11 |
| K (digestivo) | 7 |
| Outros | 16 |

**Impacto:** qualquer comparação direta de strings (`CID == "C50.4"`) vai ignorar pacientes com `"C504"`. A detecção de oncológicos precisa normalizar o campo antes de usar.  
**Correção:** `cid.str.upper().str.replace(".", "", regex=False)`

---

### F2 — `prioridade_regulacao`: variações de grafia e valores nulos

**Registros afetados:** 16 com grafia inconsistente + 11 nulos

| Valor no arquivo | Qtd | Valor correto |
|---|---|---|
| `baixa` | 348 | `baixa` |
| `alta` | 296 | `alta` |
| `media` | 263 | `media` |
| `Baixa` | 13 | `baixa` |
| `Média` | 7 | `media` |
| `Alta` | 3 | `alta` |
| `NaN` | 11 | ausente |

**Impacto:** agrupamentos e filtros por prioridade retornam resultados incompletos sem normalização.  
**Correção:** `str.lower().str.strip().str.normalize("NFKD").str.encode("ascii","ignore").str.decode("ascii")`

---

### F3 — `municipio`: grafia inconsistente (20 municípios afetados)

**Registros afetados:** ~62 linhas com grafia em caixa errada

Lista completa de municípios com variantes conflitantes:

| Município | Variantes encontradas | Registros afetados |
|---|---|---|
| Porto Alegre | `Porto Alegre`, `PORTO ALEGRE`, `porto alegre` | 20 |
| Canoas | `Canoas`, `canoas` | 3 |
| Alvorada | `Alvorada`, `ALVORADA` | 2 |
| Viamão | `Viamao`, `VIAMAO` | 2 |
| Pelotas | `Pelotas`, `PELOTAS` | 2 |
| Rio Grande | `Rio Grande`, `RIO GRANDE` | 2 |
| Osório | `Osorio`, `osorio`, `OSORIO` | 3 |
| Taquara | `Taquara`, `taquara`, `TAQUARA` | 3 |
| Ijuí | `Ijui`, `IJUI`, `ijui` | 2 |
| Novo Hamburgo | `Novo Hamburgo`, `novo hamburgo` | 1 |
| Gravataí | `Gravatai`, `gravatai` | 1 |
| Guaíba | `Guaiba`, `guaiba` | 1 |
| Camaquã | `Camaqua`, `camaqua` | 1 |
| Cachoeirinha | `Cachoeirinha`, `cachoeirinha` | 1 |
| Cachoeira do Sul | `Cachoeira do Sul`, `cachoeira do sul` | 1 |
| Santana do Livramento | `Santana do Livramento`, `santana do livramento` | 1 |
| Charqueadas | `Charqueadas`, `charqueadas` | 1 |
| Sapucaia do Sul | `Sapucaia do Sul`, `SAPUCAIA DO SUL` | 1 |
| Passo Fundo | `Passo Fundo`, `PASSO FUNDO` | 1 |
| Santa Cruz do Sul | `Santa Cruz do Sul`, `SANTA CRUZ DO SUL` | 1 |

**Impacto:** agrupamentos por município geram contagens duplicadas, inviabilizando análise geográfica.  
**Correção:** `str.lower().str.strip()` seguido de dicionário de normalização para capitalização correta.

---

### F4 — Flags manuais inconsistentes com os dados reais

Três colunas de flag apresentam divergências sistêmicas em relação às outras fontes de verdade.

#### `flag_oncologico`
| Situação | Qtd |
|---|---|
| CID `C*` mas `flag_oncologico = nao` (falso negativo) | 21 |
| `flag_oncologico = sim` mas CID não é `C*` (falso positivo) | 23 |

#### `flag_piora_clinica`
| Situação | Qtd |
|---|---|
| `flag_piora_clinica = nao` mas paciente tem evento real de piora | 224 |
| `flag_piora_clinica = sim` mas sem nenhum evento de piora | 34 |

#### `flag_diabetico`
Inconsistente com a coluna `comorbidades` e com a série de `hba1c` nos eventos. Não foi possível quantificar com precisão pois a coluna `comorbidades` tem grafias variadas (ex.: `DM2`, `diabetes`, `DM tipo 2`).

**Impacto:** usar qualquer dessas flags como critério de priorização produz resultado incorreto.  
**Correção:** derivar os valores diretamente do CID e dos eventos clínicos; descartar as flags como fonte primária.

---

### F5 — Solicitações duplicadas: mesmo paciente + mesmo procedimento

**Registros afetados:** 44 linhas (22 pacientes com 2 solicitações cada)

Exemplos representativos:

| `paciente_id` | `procedimento_id` | Solicitações | Dias em fila |
|---|---|---|---|
| PAC-00087 | PROC006 | SOL-2024-00003 / SOL-2024-00044 | 1013 / 899 |
| PAC-00685 | PROC023 | SOL-2023-00074 / SOL-2023-00088 | 1085 / 1036 |
| PAC-00863 | PROC020 | SOL-2025-00206 / SOL-2025-00247 | 448 / 425 |
| PAC-00904 | PROC012 | SOL-2026-00809 / SOL-2026-00816 | 60 / 59 |

**Impacto:** sem tratamento, o mesmo paciente aparece duas vezes na fila priorizada, ocupando duas posições.  
**Correção:** identificar duplicatas por `(paciente_id, procedimento_id)` e manter apenas a entrada mais antiga (ou a de maior criticidade), registrando a decisão.

---

### F6 — `hba1c_ultima` no cadastro desatualizada em relação aos eventos

**Registros afetados:** 37  
**Descrição:** para 37 pacientes, o campo `hba1c_ultima` da fila contém uma data (`data_hba1c_ultima`) mais antiga do que o evento `hba1c` mais recente registrado em `eventos_clinicos.csv`. O cadastro não foi atualizado após novos exames.

**Impacto:** usar `hba1c_ultima` do cadastro para avaliar controle glicêmico produz resultado desatualizado.  
**Correção:** sempre priorizar o valor do evento mais recente de `tipo_evento = hba1c` em `eventos_clinicos.csv`.

---

### F7 — Campos nulos em colunas relevantes para priorização

| Coluna | Nulos | Observação |
|---|---|---|
| `distancia_hospital_km` | 20 | Impede análise geográfica para 2,1% da fila |
| `asa` | 26 | Impede avaliação de risco anestésico para 2,8% |
| `intensidade_dor_eva` | 38 | Impede uso de dor como critério para 4% |
| `limitacao_funcional` | 20 | Impede avaliação funcional para 2,1% |
| `prioridade_regulacao` | 11 | 11 pacientes sem nenhuma prioridade registrada (inclui 1 oncológico com CID `C44.3` esperando 706 dias) |

**Impacto:** qualquer cálculo de score que não trate nulos pode excluir ou pontuar incorretamente esses pacientes.  
**Correção:** imputar valor conservador (ex.: `limitacao_funcional` nulo → tratar como `nenhuma`; `asa` nulo → tratar como `2`), nunca descartar a linha.

---

### F8 — `prioridade_regulacao` nunca revisada para a maioria dos pacientes

**Registros afetados:** majoritário  
**Descrição:** para a maior parte das solicitações, `data_ultima_revisao_prioridade` é igual a `data_entrada_fila`, indicando que a prioridade foi atribuída no cadastro e nunca mais foi revisada.

**Impacto:** a prioridade atual reflete o estado clínico do momento da entrada, não o estado atual.  
**Obs.:** esta não é uma falha de formato, mas é uma falha de processo com impacto direto na confiabilidade dos dados.

---

### F9 — `consulta_reavaliacao`: domínio incompleto nos dados reais

**Descrição:** o dicionário de dados documenta três resultados possíveis para `tipo_evento = consulta_reavaliacao`: `piora`, `estavel` e `melhora`. Nos dados, o valor `melhora` não aparece nenhuma vez.

| `resultado` | Qtd |
|---|---|
| `piora` | 83 |
| `estavel` | 9 |
| `melhora` | 0 |

**Impacto:** baixo para a priorização (ausência de `melhora` não afeta a detecção de urgência), mas indica possível viés de registro ou dado incompleto.

---

## `eventos_clinicos.csv`

### E1 — Eventos duplicados (mesmo conteúdo, IDs diferentes)

**Registros afetados:** 14 linhas (7 pares de duplicatas)

Exemplos:

| Par | `solicitacao_id` | `tipo_evento` | `resultado` |
|---|---|---|---|
| EVT-000050 / EVT-000051 | SOL-2023-00083 | `falta` | `avaliacao_pre_anestesica` |
| EVT-000055 / EVT-000056 | SOL-2023-00023 | `falta` | `exame` |
| EVT-000323 / EVT-000324 | SOL-2026-00036 | `biopsia` | `positivo` |
| EVT-000712 / EVT-000713 | SOL-2026-00335 | `pronto_socorro` | `observacao` |

**Impacto:** contar eventos duplicados infla artificialmente o score de agravamento para os pacientes afetados.  
**Correção:** deduplicar por `(solicitacao_id, data_evento, tipo_evento, resultado)` antes de calcular qualquer agregação.

---

### E2 — Eventos com `solicitacao_id` inexistente na fila (órfãos)

**Registros afetados:** 9 eventos

| `evento_id` | `solicitacao_id` | `tipo_evento` | `data_evento` |
|---|---|---|---|
| EVT-000262 | SOL-2025-00998 | `hba1c` | 2025-11-02 |
| EVT-000267 | SOL-2025-00904 | `hba1c` | 2025-11-09 |
| EVT-000287 | SOL-2023-00941 | `falta` | 2025-11-24 |
| EVT-000345 | SOL-2025-00909 | `falta` | 2026-01-09 |
| EVT-000491 | SOL-2023-00926 | `hba1c` | 2026-04-27 |
| EVT-000562 | SOL-2023-00927 | `falta` | 2026-05-24 |
| EVT-000623 | SOL-2025-00955 | `contato_telefonico` | 2026-06-18 |
| EVT-000768 | SOL-2024-00960 | `falta` | 2026-07-21 |
| EVT-001020 | SOL-2024-00962 | `falta` | 2026-08-29 |

**Impacto:** esses eventos não contribuem para nenhuma priorização se o JOIN for feito pela fila. Podem indicar pacientes que saíram da fila (alta, óbito, cirurgia em outro serviço) mas cujos eventos continuaram sendo registrados.  
**Correção:** ignorar esses eventos no cálculo do coeficiente; registrar os IDs para auditoria.

---

### E3 — 22 eventos de acompanhamento com data anterior à entrada na fila

**Registros afetados:** 22 eventos  
**Tipos afetados:** `pronto_socorro` (maioria) e `internacao`  
**Descrição:** eventos de acompanhamento (que deveriam ocorrer após a entrada na fila) têm `data_evento` anterior a `data_entrada_fila` da solicitação correspondente.

Exemplos:

| `evento_id` | `solicitacao_id` | `tipo_evento` | `data_evento` | `data_entrada_fila` |
|---|---|---|---|---|
| EVT-000009 | SOL-2023-00017 | `pronto_socorro` | 2022-12-16 | 2023-03-23 |
| EVT-000018 | SOL-2023-00060 | `pronto_socorro` | 2023-06-23 | 2023-10-10 |
| EVT-000074 | SOL-2024-00149 | `internacao` | 2024-07-03 | 2024-10-22 |

**Impacto:** pode indicar que esses eventos são histórico clínico anterior (ex.: internação que motivou a solicitação), o que é informação válida, ou pode ser erro de data. O dicionário menciona que eventos podem ser anteriores à entrada para `biopsia` e `hba1c`, mas não para `pronto_socorro` e `internacao`.  
**Correção:** para fins de detecção de piora **durante a espera**, filtrar apenas eventos com `data_evento >= data_entrada_fila`. Para fins de histórico clínico, incluir todos.

---

### E4 — `valor_numerico` nulo em 78% dos registros

**Registros afetados:** 1.178 de 1.505  
**Descrição:** o campo `valor_numerico` é preenchido apenas para `tipo_evento = hba1c` (286 registros) e `tipo_evento = internacao` (41 registros), totalizando 327 registros. Os demais 1.178 são nulos por design.

**Impacto:** nenhum — comportamento esperado. Documentado aqui apenas para confirmação de que não há dados faltando inesperadamente.

---

## Checklist de normalização necessária antes de calcular o coeficiente

| # | Campo | Transformação necessária |
|---|---|---|
| 1 | `cid_principal` | `upper().replace(".", "")` para comparação; reintroduzir ponto para exibição |
| 2 | `prioridade_regulacao` | `lower().strip()` + remover acento de `"Média"` |
| 3 | `municipio` | `lower().strip()` para agrupamentos geográficos |
| 4 | `flag_oncologico` | **Ignorar.** Derivar de `cid_principal` |
| 5 | `flag_piora_clinica` | **Ignorar.** Derivar de `eventos_clinicos.csv` |
| 6 | `hba1c_ultima` | Preferir evento mais recente de `tipo_evento = hba1c` |
| 7 | Nulos em `asa`, `intensidade_dor_eva`, `limitacao_funcional` | Imputar valor conservador, nunca descartar linha |
| 8 | Duplicatas `(paciente_id, procedimento_id)` | Manter a entrada de maior criticidade ou a mais antiga |
| 9 | Eventos duplicados | Deduplicar por `(solicitacao_id, data_evento, tipo_evento, resultado)` |
| 10 | Eventos órfãos (9 IDs) | Excluir do cálculo; registrar para auditoria |
| 11 | Eventos anteriores à entrada | Separar em "histórico" vs "piora durante espera" por data |
