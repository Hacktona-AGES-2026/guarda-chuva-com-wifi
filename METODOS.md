# Métodos de Priorização da Fila Cirúrgica

## 1. Normalização — `normalizar.py`

- Carrega os três CSVs (fila, eventos clínicos, procedimentos)
- Padroniza CID (remove pontos, maiúsculas), prioridade e município
- Deriva oncológico diretamente do CID (`C*`), descartando flags manuais inconsistentes
- Imputa nulos com valores conservadores (ASA=2, dor=0, limitação="nenhuma")
- Marca duplicatas (mesmo paciente + mesmo procedimento), preservando a solicitação mais antiga
- Agrega eventos por solicitação: conta pioras totais e recentes (180 dias), dias internado, HbA1c mais recente, sinais de desistência por contato telefônico
- Separa eventos anteriores à entrada na fila (histórico) de eventos durante a espera — apenas eventos durante a espera alimentam scores de piora

---

## 2. Classificação SWALIS — `classificar_swalis.py`

Classifica cada paciente em uma de 5 classes de urgência de forma totalmente determinística (sem LLM), avaliando condições em ordem decrescente de urgência:

| Classe | Prazo | Critério |
|--------|-------|----------|
| **A1** | 15 dias | Oncológico com internação ou piora recente; CID de obstrução/instabilidade aguda; alarme clínico grave no texto |
| **A2** | 21 dias | Oncológico estável; biópsia positiva sem CID `C*`; CID de comportamento incerto com piora recente |
| **B**  | 60 dias | Limitação funcional grave; dor ≥8 EVA; piora recente sem marcador oncológico |
| **C**  | 180 dias | Limitação moderada; dor ≥4 EVA; piora histórica |
| **D**  | 360 dias | Sem urgência clínica identificada |

- Palavras-chave de alarme são detectadas por regex no texto livre (ex: "estrangulamento", "sepse", "disfagia", "perda ponderal")
- A primeira regra verdadeira define a classe — sem sobreposição

---

## 3. Análise de Texto por LLM — `llm.py`

- Analisa `justificativa_clinica` + `observacoes` de cada paciente via LLM
- **Provider 1:** Claude API (Haiku) se `ANTHROPIC_API_KEY` estiver definida
- **Provider 2:** Ollama local (`llama3`) como fallback
- **Modo offline:** retorna `score_texto = 0` sem interromper o pipeline
- Extrai por paciente:
  - `sinais_alarme`: termos de urgência no texto livre
  - `malignidade_confirmada_texto`: malignidade descrita mas não registrada no CID
  - `progressao_descrita`: piora ou progressão mencionada no relato
  - `desistencia_ou_resolvido`: paciente já operado ou desistiu
  - `score_texto`: 0–10

---

## 4. Cálculo do Coeficiente — `coeficiente.py`

Score final composto por seis dimensões:

```
score_final = score_classe        (0–100)   dominante — define a faixa
            + score_agravamento   (0–30)    pioras recentes (+6/evento) e internações (+1/dia)
            + score_llm           (0–20)    resultado da análise LLM (0 se offline)
            + score_equidade      (0–∞)     (atraso_relativo ^ 1.4) × fator_classe
            + ajuste_risco        (0–10)    idade ≥65, ASA 3-4, limitação, dor, HbA1c >8.5
            − penalidade_pre_op   (0–5)     avaliação pré-anestésica pendente ou vencida
```

**Score de equidade** — anti-fome de categorias:
- Baseado no atraso *relativo* ao prazo da classe (não em dias absolutos)
- Classes menos urgentes têm fator maior, crescem mais rápido com a espera
- Sem teto — um B com 4× o prazo pode superar um A2 recém-chegado
- Classes urgentes (A1/A2) têm fator baixo, freando inversões prematuras

**Regra de ouro** — garantida em dois níveis:
1. `score_classe` de oncológicos (≥85) é maior que qualquer C ou D (≤47)
2. Proteção explícita: score mínimo de qualquer oncológico = score máximo dos "sem urgência" + 1

**Desistências** detectadas pelo LLM recebem `score = -999` e vão para o fim absoluto da fila.

---

## 5. Pipeline Completo — `priorizar.py`

Orquestra os quatro módulos em sequência:
1. `normalizar` → carrega e enriquece os três CSVs
2. `classificar_swalis` → atribui classe e score_classe
3. `llm` → análise de texto (opcional)
4. `coeficiente` → calcula score_final, ordena, atribui posição
5. Exporta `output/fila_priorizada.csv` e CSVs por especialidade

---

---

## Perguntas Prováveis da Banca

### Sobre o modelo de priorização

**Por que usar a classe SWALIS como dimensão dominante e não um score único?**
> Porque a classificação clínica por urgência é o padrão do SUS. Um score puramente numérico poderia colocar um D muito antigo à frente de um A1 recente. A classe funciona como um teto semântico intransponível.

**Como vocês evitam que um paciente de baixa urgência "suba" a fila apenas por esperar muito?**
> O score de equidade usa atraso *relativo* (dias / prazo da classe) com expoente 1.4, e um fator multiplicador menor para classes urgentes. Isso garante crescimento graduado. Além disso, a regra de ouro garante que oncológicos nunca fiquem abaixo de pacientes sem urgência.

**O que é o score de equidade e por que não usar simplesmente os dias na fila?**
> Dias absolutos prejudicariam classes menos urgentes — um D com 200 dias comparia com um A1 com 200 dias sendo que o prazo do A1 é 15 dias e o do D é 360. Usar atraso relativo normaliza a comparação pela expectativa de cada classe.

**Como o sistema lida com dados faltantes?**
> Imputação conservadora: ASA assume 2 (risco médio), dor assume 0, limitação assume "nenhuma". Isso evita sobrestimar urgência por dado ausente.

**Por que descartar as flags manuais (`flag_oncologico`, `flag_piora_clinica`) do dataset?**
> Eram derivadas manualmente e inconsistentes com os dados brutos. O sistema as recalcula deterministicamente a partir do CID e dos eventos — mais confiável e auditável.

---

### Sobre o uso de LLM

**Por que usar um LLM se a maior parte da priorização já é determinística?**
> Textos livres de justificativa clínica frequentemente contêm informações críticas não refletidas nas colunas estruturadas — malignidade confirmada em biópsia cujo CID ainda não foi atualizado, por exemplo. O LLM captura esses sinais com score de 0 a 20 pontos extras.

**O que acontece se o LLM estiver indisponível?**
> O pipeline continua normalmente com `score_texto = 0`. Nenhum paciente é bloqueado. A classificação SWALIS e o score de agravamento garantem o resultado sem LLM.

**Como vocês garantem que o LLM não "inventa" urgência?**
> O score LLM é limitado a 20 pontos (máximo), e o score_classe de 100 pontos domina. Mesmo que o LLM erre para cima, o impacto é controlado. Desistências detectadas pelo LLM, porém, rebaixam o score para -999 — esse lado é mais sensível e caberia revisão manual em produção.

---

### Sobre a interface e o fluxo

**Por que o médico pode aprovar sua própria solicitação de reordenação?**
> O protótipo não modela dois papéis distintos (solicitante e aprovador). Em produção, essa decisão de governança seria da instituição. O fluxo foi modelado para demonstrar o caminho técnico de auditoria, não para impor controle de acesso.

**Como a reordenação manual se relaciona com o score automático?**
> A reordenação manual sobrepõe o score temporariamente. Ao aprovar, a fila assume a nova ordem e o campo `posicao` é reatribuído. O score original permanece armazenado — uma reavaliação automática posterior poderia restaurar a ordem calculada.

**O que acontece com a fila se o servidor reiniciar?**
> Todo o estado é em memória. A fila volta ao estado original dos CSVs. Isso é intencional para o protótipo de hackathon; em produção, o estado persistiria em banco de dados.

**Como o sistema evita duplicatas na fila?**
> No `normalizar.py`, pares (paciente_id, procedimento_id) duplicados são marcados com `is_duplicata = True`. A solicitação mais antiga é mantida ativa; as demais poderiam ser filtradas na exibição — atualmente são exibidas com a marcação disponível.
