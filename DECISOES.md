# DECISOES.md — Priorização Inteligente da Fila Cirúrgica

## Abordagem escolhida

**Score explicável com framework clínico SWALIS + equidade temporal**

Optamos por um motor de score composto, onde a classe clínica domina a ordenação e dimensões secundárias refinam o posicionamento dentro de cada classe. A fila é recalculada a cada upload de dados.

---

## Usuário principal

**O regulador da fila cirúrgica** — a pessoa que hoje atribui manualmente a prioridade (alta/média/baixa) no dia da inclusão e raramente a revisa.

A solução foi desenhada para ele:
- A fila aparece pronta, ordenada, com justificativa por paciente
- Ele pode arrastar um paciente para cima ou para baixo, justificar, e submeter para aprovação
- Ele edita dados clínicos desatualizados diretamente na interface
- Ele aprova ou rejeita reordenações com um clique
- O sistema propõe — ele decide

---

## Por que essa abordagem

**O problema central não é falta de dados, é falta de método.**
A fila atual usa data de entrada + prioridade manual atribuída uma vez e nunca revisada. Isso ignora tudo que acontece durante a espera.

Nossa abordagem resolve os dois problemas do enunciado:

1. **"A urgência clínica não é medida"** → resolvido pela classificação SWALIS determinística (CID, eventos, texto livre) que substitui a prioridade manual por uma classe de urgência derivada dos dados reais

2. **"O paciente muda, a fila não"** → resolvido pelo score de agravamento, que soma pontos a cada evento de piora (pronto-socorro, internação, biópsia positiva) ocorrido *durante* a espera — não apenas no momento de entrada

---

## Decisões difíceis

**1. Descartar as flags manuais do dataset (`flag_oncologico`, `flag_piora_clinica`)**

As flags existiam nas colunas mas não batiam com o CID nem com os eventos em vários casos. Decidimos descartá-las e recalcular tudo deterministicamente a partir dos dados brutos. Isso reduz a dependência de entrada manual ruidosa — exatamente o problema que o enunciado aponta.

**2. Equidade por atraso relativo, não por dias absolutos**

Usar dias absolutos na fila prejudicaria classes menos urgentes: um D com 200 dias compararia diretamente com um A1 com 200 dias, sendo que o prazo do A1 é 15 dias e o do D é 360. Optamos por atraso relativo (`dias / prazo_da_classe`), normalizando a espera pelo que é razoável para cada classe. Isso faz com que um B aguardando 4× seu prazo suba na fila, mas nunca ultrapasse um oncológico.

**3. LLM como camada opcional, não obrigatória**

O pipeline funciona completamente sem LLM. O módulo de análise de texto livre (Claude API ou Ollama) acrescenta até 20 pontos ao score para capturar malignidade descrita em texto mas não registrada no CID — mas sua ausência não bloqueia a fila nem degrada o resultado. Isso garante que a solução funciona em qualquer ambiente, com ou sem chave de API.

**4. Regra de ouro em dois níveis**

A regra de ouro poderia ser garantida só pelos pesos (oncológicos têm score_classe ≥ 85, pacientes sem urgência têm ≤ 47). Mesmo assim, implementamos uma segunda camada explícita: ao final do cálculo, qualquer oncológico com score abaixo do maior score "sem urgência" é elevado para `score_max_calmo + 1`. Optamos pela redundância porque a consequência de violar a regra é a desclassificação da solução.

**5. Reordenação manual com fluxo de aprovação**

O regulador pode propor reordenações manuais. Decidimos não aplicá-las diretamente — elas geram uma solicitação que precisa ser aprovada, mesmo que pelo próprio regulador. Isso cria um rastro auditável de toda intervenção manual na fila, sem impedir a autonomia do profissional.

---

## O que ficou de fora de propósito

- **Agenda de sala cirúrgica** — fora do escopo definido pelo enunciado
- **Preparo pré-operatório e cancelamentos** — idem (os campos existem no dataset e a penalidade de pré-op está no score, mas o fluxo de agendamento não foi construído)
- **Voz do paciente / questionário de sintomas** — não implementado; seria uma extensão natural pelo canal SMS já construído
- **Auditoria de equidade por município e distância** — os dados de distância e município estão no pipeline, mas não construímos um painel de análise de viés geográfico
- **Comparação lado a lado entre dois pacientes** — seria útil para o regulador, mas não foi implementado
- **Persistência em banco de dados** — toda a fila é mantida em memória durante a sessão; em produção, o estado precisaria ser persistido

---

## Stack

- **Backend:** Python + FastAPI
- **Pipeline:** pandas (normalização, classificação, score)
- **LLM:** Claude API (Haiku) com fallback para Ollama local
- **Frontend:** HTML + CSS + JavaScript vanilla (sem frameworks)
- **Dados:** dataset fornecido pela organização (941 pacientes, sintéticos)
