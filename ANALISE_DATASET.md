# Análise do dataset: Desafio 1, Priorização Inteligente da Fila Cirúrgica

> Levantamento exploratório da fila e dos eventos, feito antes de definirmos a abordagem.
> Data de referência do dataset: **23/10/2026**. Todos os números abaixo vêm da execução sobre os arquivos originais (sem limpeza prévia, exceto quando indicado).

---

## 1. Visão geral

| Arquivo | Linhas | Observação |
|---|---|---|
| `fila_cirurgica.csv` | 941 solicitações | 907 pacientes únicos, sendo que 34 pacientes têm mais de uma solicitação |
| `eventos_clinicos.csv` | 1.505 eventos | Ligados a 624 solicitações. **326 solicitações não têm nenhum evento** |
| `procedimentos.csv` | 23 procedimentos | Risco cirúrgico 1 (catarata) a 5 (revascularização) |
| `referencias/swalis.csv` | 5 classes | A1 (15 d), A2 (21 d), B (60 d), C (180 d), D (360 d) |

**Perfil da fila**
- Idade: 18 a 92 anos (mediana 58).
- ASA: 1 → 86 · 2 → 620 · 3 → 203 · 4 → 6 · vazio → 26.
- Dor EVA: mediana 3 (0 a 9), 38 vazias.
- 115 pacientes moram a mais de 300 km do hospital.

**Tempo de espera**
- Mediana de **268 dias**, máximo de **1.550 dias**.
- **353 solicitações (37,5%) estão há mais de 1 ano na fila.**
- Oncológicos: mediana de 78 dias. Mesmo assim, há casos extremos (ver seção 3).
- Mediana de espera por especialidade: Mastologia 128 d · Cir. Cardíaca 156 · Cir. Oncológica 158 · … · Ortopedia 303 · Oftalmologia 317 · Cir. Geral 341 · **Otorrino 429**.

---

## 2. Oncológicos (regra de ouro)

- **177 solicitações com CID C\*** (18,8% da fila).
- CIDs mais frequentes: C50 mama (36), C61 próstata (30), **C44 pele (28)**, C18 cólon (23), C16 estômago (17), C34 pulmão (11), C73 tireoide (10).
- Distribuição pela prioridade manual:

| | alta | média | baixa | vazia |
|---|---|---|---|---|
| Oncológico (C\*) | 94 | 48 | **34** | 1 |
| Não oncológico | 205 | 222 | 327 | 10 |

- **34 oncológicos estão como "baixa".**
- **133 oncológicos têm dor EVA ≤ 3.** Doença grave com dor baixa: dor não pode ser o critério dominante.
- O C44 (CBC/CEC de pele) é oncológico pela regra, mas o próprio SWALIS o coloca como classe **B**. Ele precisa ficar acima de qualquer "sem urgência", mesmo que não fique no topo.
- Regra de ouro: usar o **CID**, nunca a `flag_oncologico` (ver seção 4).

---

## 3. A prioridade manual (`prioridade_regulacao`) não serve como verdade

- Grafias: `baixa` 348 · `alta` 296 · `media` 263 · `Baixa` 13 · `Média` 7 · `Alta` 3 · **vazia 11**. É preciso normalizar (lower + remover acento).
- **843 de 941 (90%) nunca foram revisadas** (`data_ultima_revisao_prioridade == data_entrada_fila`).
- A prioridade não acompanha a limitação: 30 pacientes com limitação **grave** estão como "baixa", e 87 com limitação **nenhuma** estão como "alta".
- 23 pacientes com dor ≥ 8 estão como "baixa".
- **Oncológicos esquecidos como "baixa", esperando há anos:**
  - `SOL-2023-00010`: C18.7, adenocarcinoma de sigmoide confirmado, **1.318 dias** na fila.
  - `SOL-2024-00006`: C61, próstata Gleason 4+4, 1.009 dias.
  - `SOL-2024-00071`: C50.9, carcinoma ductal invasivo IIB, 862 dias.

---

## 4. Flags manuais inconsistentes

| Flag | Problema |
|---|---|
| `flag_oncologico` | **44 divergências com o CID**: 23 marcados `sim` sem CID C\* (K40 hérnia, H25 catarata, K80, M16…) e **21 com CID C\* marcados `nao`** |
| `flag_diabetico` | 262 `sim`. 14 têm DM em `comorbidades`/`cid_secundario` mas flag `nao`, e 15 têm flag `sim` sem DM registrado |
| `flag_piora_clinica` | 88 `sim`. Das **210 solicitações com evento de piora**, **156 estão com flag `nao`**. Outras 34 têm `sim` sem nenhum evento de piora |

Conclusão: **as flags devem ser recalculadas a partir de CID, comorbidades, texto e eventos**. A flag original serve no máximo como sinal fraco.

---

## 5. Deterioração durante a espera (eventos)

**Tipos de evento:** contato telefônico 425 · HbA1c 286 · pronto-socorro 203 · falta 189 · biópsia 163 · exame de imagem 106 · reavaliação 92 · internação 41.

| Evento | Resultados |
|---|---|
| biópsia | positivo 147 · negativo 9 · inconclusivo 7 |
| pronto-socorro | atendido_liberado 119 · observação 84 |
| exame_imagem | estável 77 · **progressão 29** |
| consulta_reavaliacao | **piora 83** · estável 9 |
| contato_telefonico | atendeu 192 · não atendeu 140 · **relata_piora 56** · relata_melhora 19 · **desistiu 13** · **cirurgia em outro serviço 5** |
| falta | consulta 104 · exame 61 · avaliação pré-anestésica 24 |

**Achados-chave**
- **104 pacientes com PS ou internação nos últimos 180 dias**: 44 deles estão como "baixa" e 67 com `flag_piora = nao`.
- **23 pacientes com biópsia positiva cujo CID ainda não é C\*** (D05 in situ, D44, D37, E04 tireoide, D25, K57, K51, R91…). Na prioridade manual: 11 baixa, 6 média, 5 alta e 1 "Baixa". São os casos do tipo "o paciente mudou e a fila não".
- **18 CIDs de comportamento incerto/suspeito** (D37–D48, R91).
- **HbA1c**: 133 solicitações têm série de exames. 44 têm o último valor **> 8,5%**, 39 subiram ≥ 1 ponto, e em 35 o `hba1c_ultima` do cadastro difere do último evento (cadastro desatualizado).
- **Sinais de abandono ou contato perdido**: 39 solicitações com ≥ 2 "não atendeu" e 25 com ≥ 2 faltas.

**Atenção ao tempo dos eventos**
- **155 eventos são anteriores à entrada na fila** (133 biópsias, 17 PS, 5 internações). Normalmente é a biópsia que gerou a indicação ou o histórico citado pelo médico. Isso não é "piora durante a espera", então separar eventos *antes* e *depois* da entrada.
- Nenhum evento tem data futura.

---

## 6. Informação que só existe no texto livre

**`justificativa_clinica`** (tamanho médio de 104 caracteres)
- 33 são muito pobres (< 40 caracteres): "Conforme laudo anexo." (10), "Solicito cirurgia." (7), "Indicacao cirurgica." (6)…
- 110 estão inteiramente em CAIXA ALTA: normalizar antes de buscar palavras-chave.
- **100 textos contêm palavras de alarme** (lista do verificador: suboclusão, perda ponderal, icterícia, encarceramento, disfagia, sangramento…). **79 deles não são oncológicos e 36 estão como "baixa".**
- Abreviações comuns: pct, PS, AP, Bx, US, TC, RNM, HAS, DM, Hb, PAAF, BI-RADS, Bethesda.

**`observacoes`** (544 preenchidas)
- Transporte (30), relato de piora (14), não atende (6).
- **Saída da fila**: "PCT DESISTIU DO PROCEDIMENTO. SOLICITA RETIRADA DA FILA." (6) e "realizou a cirurgia em outro serviço (Hospital de Clínicas)" (5).
- Somando os eventos de telefone (desistiu ou operou fora), são **18 solicitações candidatas a sair da fila**. Isso deve ser **sugerido ao regulador, nunca aplicado automaticamente**.
- Também há ruído não clínico ("Paciente pede cirurgia no período de férias", "solicita previsão de data").

---

## 7. Defeitos de cadastro (limpeza obrigatória)

| Defeito | Quantidade | Tratamento sugerido |
|---|---|---|
| CID sem ponto (`K409` × `K40.9`) | 32 | `upper()` + remover `.` |
| Município com grafia inconsistente | 62 grafias → 38 municípios reais (`PORTO ALEGRE`, `porto alegre`, `canoas`, `osorio`…) | `strip().title()` + remover acentos |
| **Solicitações duplicadas** (mesmo paciente e mesmo procedimento) | **22 grupos / 44 linhas**; em 5 grupos o nome está grafado diferente (ex.: `Jurema Quadros Weber` × `JUREMA QUADROS WEBER`) | Manter uma e herdar a **data de entrada mais antiga** e os eventos de todas |
| Eventos duplicados (mesmo conteúdo, IDs diferentes) | 7 | Deduplicar por (solicitação, data, tipo, resultado, descrição) |
| Eventos órfãos (solicitação fora da fila) | 9 | Ignorar ou tentar religar via `paciente_id` |
| Paciente com várias solicitações e eventos ligados a só uma | 34 pacientes | Agregar eventos clínicos por `paciente_id` quando fizer sentido |
| Prioridade vazia | 11 | Não usar como entrada principal |
| ASA vazio | 26 | Imputar ou tratar como "desconhecido" |
| Dor EVA vazia | 38 | Não assumir 0. Usar texto/limitação ou marcar "não informado" |
| Limitação funcional vazia | 20 | Idem |
| Distância vazia | 20 | Imputar pela mediana do município |

`dias_em_fila` está consistente com `data_entrada_fila` (0 divergências).

---

## 8. Casos concretos para demo e pitch

**`SOL-2026-00380`: biópsia positiva, CID ainda benigno**
- CID K57.3 (doença diverticular), prioridade **baixa**, 165 dias na fila.
- Eventos: biópsia inconclusiva (08/06) → **biópsia positiva para adenocarcinoma (02/10)** → reavaliação (14/10): *"AP positivo para malignidade. Necessário atualizar CID e prioridade."*
- Ninguém atualizou o cadastro. É o melhor exemplo de "o paciente mudou, a fila não".

**`SOL-2025-00264`: sinais de alarme só no texto e nos eventos**
- CID K57.3, prioridade **baixa**, **417 dias** na fila.
- Texto: *"Perda ponderal de 11 kg em 2 meses e massa palpável em FIE."*
- Eventos: 2 idas ao PS por **suboclusão** (25/06 e 16/09/2026).
- As colunas estruturadas não mostram nada disso.

**`SOL-2023-00010`: oncológico esquecido**
- Adenocarcinoma de sigmoide confirmado, prioridade baixa, **1.318 dias** na fila.

---

## 9. Implicações para o design da solução

1. **Não confiar em `prioridade_regulacao` nem nas flags.** Recalcular tudo a partir de CID, texto e eventos. A prioridade manual serve como baseline do "antes × depois".
2. **A dor não pode dominar**: a maioria dos oncológicos tem dor baixa.
3. **O tempo de espera deve ser relativo à urgência** (fração do prazo da classe), e não em dias absolutos. Caso contrário, um paciente sem urgência com 1.500 dias passa um câncer recente e **viola a regra de ouro**.
4. **A regra de ouro deve valer por construção**: CID C\* nunca abaixo de A2/B, independentemente de pesos.
5. **Suspeitos sem CID C\*** (biópsia positiva, D37–D48, R91, palavras de alarme) devem subir e gerar alerta de "atualizar CID".
6. **Distinguir eventos antes e depois da entrada na fila.**
7. **Saídas da fila** (desistência, cirurgia em outro serviço, duplicatas) ficam como sugestão com evidência, e o regulador confirma. Documentar no `DECISOES.md`.
8. **O texto livre é fonte primária de sinal**: usar palavras-chave como base e LLM com citação do trecho como extra.
9. Rodar `python verificar_fila_priorizada.py fila_priorizada.csv` a cada versão. Ele usa uma definição conservadora de "sem urgência clínica": não oncológico, dor ≤ 3, limitação nenhuma/leve, sem CID urgente (`I200, K403, K400, K420, K430, K800, N132, I832`, 46 casos na fila), sem evento de piora e sem palavra de alarme.

---

## Anexo: normalização mínima (pandas)

```python
import pandas as pd, unicodedata
REF = pd.Timestamp("2026-10-23")
sem_acento = lambda s: unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode() if isinstance(s, str) else s

fila = pd.read_csv("fila_cirurgica.csv", parse_dates=["data_entrada_fila"])
ev = pd.read_csv("eventos_clinicos.csv", parse_dates=["data_evento"])

fila["cid"] = fila.cid_principal.str.upper().str.replace(".", "", regex=False)
fila["onco"] = fila.cid.str.startswith("C")
fila["suspeito"] = fila.cid.str.match(r"D(3[7-9]|4[0-8])|R91")
fila["prioridade"] = fila.prioridade_regulacao.map(sem_acento).str.lower()
fila["municipio_norm"] = fila.municipio.map(sem_acento).str.strip().str.title()
fila["texto"] = (fila.justificativa_clinica.fillna("") + " " + fila.observacoes.fillna("")).map(sem_acento).str.lower()

ev = ev.drop_duplicates(["solicitacao_id", "data_evento", "tipo_evento", "resultado", "descricao"])
ev = ev[ev.solicitacao_id.isin(fila.solicitacao_id)]
ev = ev.merge(fila[["solicitacao_id", "data_entrada_fila"]])
ev["durante_espera"] = ev.data_evento >= ev.data_entrada_fila
```
