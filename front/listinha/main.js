let pacientes = [];
let pacientesFiltrados = [];
let _pacienteEmEdicao = null;
let _ordemArrastada = null; // IDs na ordem atual do DOM após drag

const COR_CLASSE = {
    A1: "#d15847",
    A2: "#f97316",
    B:  "#eab308",
    C:  "#3b82f6",
    D:  "#22c55e",
};

async function carregarFila() {
    try {
        const resp = await fetch("/api/fila");

        if (resp.status === 404) {
            window.location.replace("/upload");
            return;
        }
        if (!resp.ok) throw new Error("Erro ao buscar dados da API.");

        pacientes = await resp.json();
        pacientesFiltrados = [...pacientes];
        renderizarTudo();

    } catch (err) {
        console.error("Erro:", err);
        mostrarEstadoVazio();
    }
}

function mostrarEstadoVazio() {
    const divPrimeiros = document.getElementById("primeiros");
    if (divPrimeiros) {
        divPrimeiros.innerHTML = `
            <h2>Primeiros da Fila</h2>
            <p class="placeholder">Nenhum dado carregado.
               <a href="/upload" style="color:#d15847">Faça o upload dos CSVs</a> para começar.
            </p>`;
    }
    const divTodos = document.getElementById("todosPacientes");
    if (divTodos) divTodos.innerHTML = `<h2>Todos os Pacientes</h2><p class="placeholder">—</p>`;
}

function renderizarTudo(autoSelecionarPrimeiro = true) {
    renderizarPrimeiros(autoSelecionarPrimeiro);
    renderizarTodos();
}

function renderizarPrimeiros(autoSelecionarPrimeiro = true) {
    const divPrimeiros = document.getElementById("listaPrimeiros");
    if (!divPrimeiros) return;

    const primeiros = pacientes.slice(0, 5);
    divPrimeiros.innerHTML = "";

    primeiros.forEach((p) => {
        const cor = COR_CLASSE[p.classe_swalis] || "#999";
        const card = document.createElement("div");
        card.className = "paciente-card-clicavel";
        card.style.borderLeftColor = cor;
        card.innerHTML = `
            <h3>${p.posicao}. ${p.nome_paciente} — ${p.solicitacao_id}</h3>
            <p><strong>Especialidade:</strong> ${p.especialidade}</p>
            <p><strong>Classe:</strong> <span style="color:${cor}">${p.classe_swalis}</span>
               &nbsp;|&nbsp; <strong>Score:</strong> ${p.score_final}</p>
        `;
        card.addEventListener("click", () => exibirDetalhesPaciente(p));
        divPrimeiros.appendChild(card);
    });

    if (autoSelecionarPrimeiro && primeiros.length > 0) exibirDetalhesPaciente(primeiros[0]);
}

function exibirDetalhesPaciente(p) {
    const divInfos = document.getElementById("detalhesConteudo");
    if (!divInfos) return;

    const cor = COR_CLASSE[p.classe_swalis] || "#999";

    divInfos.innerHTML = `
        <h3>${p.posicao}. ${p.nome_paciente}</h3>
        <p><strong>ID:</strong> ${p.solicitacao_id} &nbsp;|&nbsp; <strong>Paciente:</strong> ${p.paciente_id}</p>
        <p><strong>Idade:</strong> ${p.idade} &nbsp;|&nbsp; <strong>Sexo:</strong> ${p.sexo} &nbsp;|&nbsp; <strong>Município:</strong> ${p.municipio}</p>
        <p><strong>CID:</strong> ${p.cid_principal} — ${p.cid_descricao || "—"}</p>
        <p><strong>Procedimento:</strong> ${p.procedimento}</p>
        <p><strong>Especialidade:</strong> ${p.especialidade}</p>
        <hr style="margin:10px 0; border-color:#eee">
        <p><strong>Classe SWALIS:</strong> <span style="color:${cor}; font-size:1.1em">${p.classe_swalis}</span></p>
        <p><strong>Score final:</strong> ${p.score_final}
           &nbsp;(base ${p.score_classe} + agrav. ${p.score_agravamento} + equidade ${p.score_equidade} + risco ${p.ajuste_risco} - preop ${p.penalidade_pre_op})</p>
        <p><strong>Dias em fila:</strong> ${p.dias_em_fila}</p>
        <hr style="margin:10px 0; border-color:#eee">
        <p style="font-style:italic; font-weight:normal; text-transform:none; font-size:0.85rem">${p.justificativa}</p>
        <hr style="margin:10px 0; border-color:#eee">
        <div id="localizacaoBox" class="localizacao-box">
            <span class="localizacao-loading">Buscando localização...</span>
        </div>
        <hr style="margin:10px 0; border-color:#eee">
        <button class="btn-editar" id="btnAbrirEdicao">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            Editar dados
        </button>
        <hr style="margin:10px 0; border-color:#eee">
        <div id="historicoBox"></div>
    `;

    document.getElementById("btnAbrirEdicao").addEventListener("click", () => exibirFormularioEdicao(p));
    buscarLocalizacao(p.municipio);
    buscarHistorico(p.solicitacao_id);
}

function exibirFormularioEdicao(p) {
    _pacienteEmEdicao = p;
    const divInfos = document.getElementById("detalhesConteudo");
    if (!divInfos) return;

    divInfos.innerHTML = `
        <h3>${p.posicao}. ${p.nome_paciente}</h3>
        <p style="font-size:0.78rem; color:#888; margin-bottom:10px">Editar dados clínicos — o score será recalculado ao atualizar.</p>
        <form class="form-edicao" id="formEdicao" onsubmit="return false">
            <label>Classe SWALIS
                <select name="classe_swalis" id="selectSwalis">
                    ${["A1","A2","B","C","D"].map(c => `<option value="${c}" ${p.classe_swalis === c ? "selected" : ""}>${c}</option>`).join("")}
                </select>
            </label>
            <div id="justificativaSwalisBox" style="display:none">
                <label>Justificativa da alteração de classe <span style="color:#d15847">*</span>
                    <textarea name="justificativa_swalis" id="justificativaSwalis" rows="3" placeholder="Descreva o motivo da alteração da classe SWALIS..." style="resize:vertical"></textarea>
                </label>
            </div>
            <label>Especialidade
                <input type="text" name="especialidade" value="${(p.especialidade || "").replace(/"/g, "&quot;")}">
            </label>
            <label>Procedimento
                <input type="text" name="procedimento" value="${(p.procedimento || "").replace(/"/g, "&quot;")}">
            </label>
            <label>CID Principal
                <input type="text" name="cid_principal" id="inputCid" value="${(p.cid_principal || "").replace(/"/g, "&quot;")}">
            </label>
            <div class="cid-preview-box" id="cidPreviewBox">
                <span class="cid-preview-label">Descrição do CID</span>
                <span class="cid-preview-valor" id="cidPreviewValor">${p.cid_descricao || "—"}</span>
                <span class="cid-preview-status" id="cidPreviewStatus"></span>
            </div>
            <div class="form-edicao-acoes">
                <button class="btn-salvar" id="btnSalvar" type="button">Atualizar</button>
                <button class="btn-cancelar" id="btnCancelar" type="button">Cancelar</button>
            </div>
            <p id="msgEdicao" class="msg-edicao" style="display:none"></p>
        </form>
    `;

    // Mostra/oculta justificativa quando classe muda
    const selectSwalis = document.getElementById("selectSwalis");
    const justBox = document.getElementById("justificativaSwalisBox");
    selectSwalis.addEventListener("change", () => {
        justBox.style.display = selectSwalis.value !== p.classe_swalis ? "block" : "none";
    });

    // Lookup CID ao sair do campo
    const inputCid = document.getElementById("inputCid");
    inputCid.addEventListener("blur", () => buscarDescricaoCid(inputCid.value, p.cid_principal));
    inputCid.addEventListener("keydown", (e) => {
        if (e.key === "Enter") buscarDescricaoCid(inputCid.value, p.cid_principal);
    });

    document.getElementById("btnSalvar").addEventListener("click", () => salvarEdicao(_pacienteEmEdicao));
    document.getElementById("btnCancelar").addEventListener("click", () => exibirDetalhesPaciente(_pacienteEmEdicao));
}

async function buscarDescricaoCid(codigo, cidOriginal) {
    const valorEl = document.getElementById("cidPreviewValor");
    const statusEl = document.getElementById("cidPreviewStatus");
    if (!valorEl || !statusEl) return;

    const norm = codigo.replace(/\./g, "").toUpperCase().trim();
    const normOriginal = (cidOriginal || "").replace(/\./g, "").toUpperCase().trim();

    if (!norm || norm === normOriginal) {
        // Voltou ao original — restaura descrição original
        statusEl.textContent = "";
        statusEl.className = "cid-preview-status";
        return;
    }

    statusEl.textContent = "Buscando...";
    statusEl.className = "cid-preview-status cid-buscando";

    try {
        const resp = await fetch(`/api/cid/${encodeURIComponent(codigo)}`);
        if (!resp.ok) throw new Error("não encontrado");
        const d = await resp.json();
        valorEl.textContent = d.descricao;
        statusEl.textContent = "✓ encontrado";
        statusEl.className = "cid-preview-status cid-ok";
    } catch {
        valorEl.textContent = "CID não encontrado na tabela";
        statusEl.textContent = "✗ não encontrado";
        statusEl.className = "cid-preview-status cid-erro";
    }
}

async function salvarEdicao(pOriginal) {
    const form = document.getElementById("formEdicao");
    const btnSalvar = document.getElementById("btnSalvar");
    const msgEl = document.getElementById("msgEdicao");

    const novaClasse = form.classe_swalis.value.trim();
    const classeMudou = novaClasse !== pOriginal.classe_swalis;
    const justificativaSwalis = classeMudou ? (form.justificativa_swalis?.value.trim() || "") : "";
    const cidDescricaoPreview = document.getElementById("cidPreviewValor")?.textContent || pOriginal.cid_descricao || "";
    const cidPrincipal = form.cid_principal.value.trim();
    const cidMudou = cidPrincipal.replace(/\./g,"").toUpperCase() !== (pOriginal.cid_principal || "").replace(/\./g,"").toUpperCase();

    if (classeMudou && !justificativaSwalis) {
        msgEl.textContent = "A justificativa para alteração de classe SWALIS é obrigatória.";
        msgEl.style.display = "block";
        document.getElementById("justificativaSwalis")?.focus();
        return;
    }
    if (cidMudou && cidDescricaoPreview === "CID não encontrado na tabela") {
        msgEl.textContent = "O CID informado não foi encontrado. Verifique o código.";
        msgEl.style.display = "block";
        document.getElementById("inputCid")?.focus();
        return;
    }

    msgEl.style.display = "none";

    const dados = {
        classe_swalis: novaClasse,
        especialidade: form.especialidade.value.trim(),
        procedimento:  form.procedimento.value.trim(),
        cid_principal: cidPrincipal,
        cid_descricao: cidMudou ? cidDescricaoPreview : pOriginal.cid_descricao,
    };

    btnSalvar.disabled = true;
    btnSalvar.textContent = "Atualizando...";

    try {
        const resp = await fetch(`/api/fila/${encodeURIComponent(pOriginal.solicitacao_id)}/editar`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(dados),
        });

        if (!resp.ok) {
            const err = await resp.json().catch(() => ({}));
            throw new Error(err.detail || "Erro ao salvar.");
        }

        const pAtualizado = await resp.json();

        const idx = pacientes.findIndex(p => p.solicitacao_id === pOriginal.solicitacao_id);
        if (idx !== -1) pacientes[idx] = pAtualizado;
        pacientes.sort((a, b) => b.score_final - a.score_final || b.dias_em_fila - a.dias_em_fila);
        pacientes.forEach((p, i) => { p.posicao = i + 1; });

        const termo = document.getElementById("pesquisaPaciente")?.value.toLowerCase().trim() || "";
        pacientesFiltrados = termo
            ? pacientes.filter(p =>
                (p.nome_paciente || "").toLowerCase().includes(termo) ||
                (p.solicitacao_id || "").toLowerCase().includes(termo) ||
                (p.especialidade || "").toLowerCase().includes(termo))
            : [...pacientes];

        renderizarTudo(false);
        const pFinal = pacientes.find(p => p.solicitacao_id === pOriginal.solicitacao_id) || pAtualizado;
        exibirDetalhesPaciente(pFinal);

    } catch (err) {
        msgEl.textContent = err.message;
        msgEl.style.display = "block";
        btnSalvar.disabled = false;
        btnSalvar.textContent = "Atualizar";
    }
}

async function buscarLocalizacao(municipio) {
    const box = document.getElementById("localizacaoBox");
    if (!box || !municipio) return;

    try {
        const url = `https://servicodados.ibge.gov.br/api/v1/localidades/municipios?nome=${encodeURIComponent(municipio.trim())}`;
        const resp = await fetch(url);
        if (!resp.ok) throw new Error("Sem resposta");

        const dados = await resp.json();
        if (!Array.isArray(dados) || dados.length === 0) throw new Error("Não encontrado");

        const d = dados[0];
        const uf    = d.microrregiao?.mesorregiao?.UF;
        const regiao = uf?.regiao;

        box.innerHTML = `
            <p class="localizacao-titulo">Localização (IBGE)</p>
            <div class="localizacao-grid">
                <span class="loc-label">Município</span><span class="loc-val">${d.nome} — ${uf?.sigla || "—"}</span>
                <span class="loc-label">Estado</span><span class="loc-val">${uf?.nome || "—"}</span>
                <span class="loc-label">Região</span><span class="loc-val">${regiao?.nome || "—"}</span>
                <span class="loc-label">Cód. IBGE</span><span class="loc-val">${d.id}</span>
            </div>
        `;
    } catch {
        box.innerHTML = `<span class="localizacao-erro">Localização não encontrada para "${municipio}"</span>`;
    }
}

async function buscarHistorico(solicitacaoId) {
    const box = document.getElementById("historicoBox");
    if (!box) return;

    try {
        const resp = await fetch(`/api/fila/${encodeURIComponent(solicitacaoId)}/historico`);
        if (!resp.ok) throw new Error();
        const registros = await resp.json();

        if (!registros.length) {
            box.innerHTML = `
                <p class="historico-titulo">Histórico de Alterações</p>
                <p class="historico-vazio">Nenhuma alteração registrada.</p>
            `;
            return;
        }

        const itens = registros.slice().reverse().map(r => {
            const posStr = r.posicao_antes !== r.posicao_depois
                ? `<span class="historico-pos">Posição: ${r.posicao_antes} → ${r.posicao_depois}</span>`
                : `<span class="historico-pos">Posição mantida: ${r.posicao_depois}</span>`;
            const campos = r.alteracoes.map(a =>
                `<div class="historico-campo">
                    <span class="historico-campo-nome">${a.campo}</span>
                    <span class="historico-de">${a.de || "—"}</span>
                    <span class="historico-seta">→</span>
                    <span class="historico-para">${a.para || "—"}</span>
                </div>`
            ).join("");
            return `
                <div class="historico-item">
                    <div class="historico-header">
                        <span class="historico-data">${r.timestamp}</span>
                        ${posStr}
                    </div>
                    ${campos}
                </div>
            `;
        }).join("");

        box.innerHTML = `
            <p class="historico-titulo">Histórico de Alterações (${registros.length})</p>
            <div class="historico-lista">${itens}</div>
        `;
    } catch {
        box.innerHTML = "";
    }
}

function renderizarTodos() {
    const lista = document.getElementById("listaPacientes");
    if (!lista) return;
    lista.innerHTML = "";

    pacientesFiltrados.forEach((p) => {
        const cor = COR_CLASSE[p.classe_swalis] || "#999";
        const card = document.createElement("div");
        card.className = "paciente-card paciente-card-clicavel";
        card.style.borderLeftColor = cor;
        card.setAttribute("draggable", "true");
        card.setAttribute("data-sid", p.solicitacao_id);
        card.innerHTML = `
            <h3>${p.posicao}. ${p.nome_paciente} — ${p.solicitacao_id}</h3>
            <p><strong>Especialidade:</strong> ${p.especialidade}
               &nbsp;|&nbsp; <strong>Classe:</strong> <span style="color:${cor}">${p.classe_swalis}</span>
               &nbsp;|&nbsp; <strong>Dias em fila:</strong> ${p.dias_em_fila}</p>
        `;
        card.addEventListener("click", () => exibirDetalhesPaciente(p));
        lista.appendChild(card);
    });
}

let _dragConfigured = false;
let _sidArrastado = null; // SID do card que foi arrastado nesta sessão de drag

function _configurarDragDrop() {
    const lista = document.getElementById("listaPacientes");
    if (!lista || _dragConfigured) return;
    _dragConfigured = true;

    let sidArrastando = null;

    lista.addEventListener("dragstart", (e) => {
        const card = e.target.closest("[data-sid]");
        if (!card) return;
        sidArrastando = card.dataset.sid;
        _sidArrastado = card.dataset.sid;
        card.classList.add("drag-arrastando");
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", sidArrastando);
    }, { capture: false });

    lista.addEventListener("dragend", (e) => {
        const card = e.target.closest("[data-sid]");
        if (card) card.classList.remove("drag-arrastando");
        lista.querySelectorAll(".drag-sobre").forEach(c => c.classList.remove("drag-sobre"));
        sidArrastando = null;
        _verificarMudancaOrdem();
    }, { capture: false });

    lista.addEventListener("dragover", (e) => {
        e.preventDefault();
        const card = e.target.closest("[data-sid]");
        if (!card || card.dataset.sid === sidArrastando) return;
        lista.querySelectorAll(".drag-sobre").forEach(c => c.classList.remove("drag-sobre"));
        card.classList.add("drag-sobre");
        e.dataTransfer.dropEffect = "move";
    }, { capture: false });

    lista.addEventListener("dragleave", (e) => {
        const card = e.target.closest("[data-sid]");
        if (!card) return;
        if (!card.contains(e.relatedTarget)) card.classList.remove("drag-sobre");
    }, { capture: false });

    lista.addEventListener("drop", (e) => {
        e.preventDefault();
        const alvo = e.target.closest("[data-sid]");
        if (!alvo || alvo.dataset.sid === sidArrastando) return;
        alvo.classList.remove("drag-sobre");

        const cardMovendo = lista.querySelector(`[data-sid="${sidArrastando}"]`);
        if (!cardMovendo) return;

        const rect = alvo.getBoundingClientRect();
        if (e.clientY < rect.top + rect.height / 2) {
            lista.insertBefore(cardMovendo, alvo);
        } else {
            lista.insertBefore(cardMovendo, alvo.nextSibling);
        }
        _verificarMudancaOrdem();
    }, { capture: false });
}

function _verificarMudancaOrdem() {
    const lista = document.getElementById("listaPacientes");
    const btn = document.getElementById("btnSolicitarReordenacao");
    if (!lista || !btn) return;

    const sidsDOM = [...lista.querySelectorAll("[data-sid]")].map(c => c.dataset.sid);
    const sidsOriginal = pacientesFiltrados.map(p => String(p.solicitacao_id));

    const mudou = sidsDOM.some((sid, i) => sid !== sidsOriginal[i]);
    if (!mudou) {
        _ordemArrastada = null;
        btn.style.display = "none";
        return;
    }

    _ordemArrastada = sidsDOM;

    // Calcula quantas casas o paciente arrastado se moveu
    const posOriginal = sidsOriginal.indexOf(_sidArrastado);
    const posNova = sidsDOM.indexOf(_sidArrastado);
    const delta = Math.abs(posNova - posOriginal);

    if (delta <= 1) {
        // Mudança pequena: aplica direto sem modal
        _aplicarOrdemDireta(sidsDOM);
        btn.style.display = "none";
    } else {
        btn.style.display = "flex";
    }
}

async function _aplicarOrdemDireta(nova_ordem) {
    try {
        const resp = await fetch("/api/solicitacoes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                nova_ordem,
                justificativa: "Ajuste de 1 posição (aplicado automaticamente)",
                pacientes_movidos: _sidArrastado ? [_sidArrastado] : [],
            }),
        });
        if (!resp.ok) throw new Error();
        const sol = await resp.json();

        // Aprova imediatamente
        await fetch(`/api/solicitacoes/${sol.id}/aprovar`, { method: "POST" });

        // Atualiza ordem local
        pacientes.sort((a, b) => {
            const ia = nova_ordem.indexOf(String(a.solicitacao_id));
            const ib = nova_ordem.indexOf(String(b.solicitacao_id));
            return ia - ib;
        });
        pacientes.forEach((p, i) => { p.posicao = i + 1; });
        pacientesFiltrados = [...pacientes];

        _ordemArrastada = null;
        _sidArrastado = null;
        renderizarTudo(false);
        _mostrarToast("Ordem atualizada.");
    } catch {
        _mostrarToast("Erro ao aplicar reordenação.");
    }
}

function _abrirModalSolicitacao() {
    document.getElementById("txtJustificativa").value = "";
    document.getElementById("msgModal").style.display = "none";
    document.getElementById("modalJustificativa").style.display = "flex";
    document.getElementById("txtJustificativa").focus();
}

function _fecharModal() {
    document.getElementById("modalJustificativa").style.display = "none";
}

async function enviarSolicitacao() {
    const justificativa = document.getElementById("txtJustificativa").value.trim();
    const msgEl = document.getElementById("msgModal");
    const btnConfirmar = document.getElementById("btnConfirmarModal");

    if (!justificativa) {
        msgEl.textContent = "A justificativa é obrigatória.";
        msgEl.style.display = "block";
        return;
    }

    const lista = document.getElementById("listaPacientes");
    const nova_ordem = [...lista.querySelectorAll("[data-sid]")].map(c => c.dataset.sid);
    const pacientes_movidos = _sidArrastado ? [_sidArrastado] : [];

    btnConfirmar.disabled = true;
    btnConfirmar.textContent = "Enviando...";
    msgEl.style.display = "none";

    try {
        const resp = await fetch("/api/solicitacoes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ nova_ordem, justificativa, pacientes_movidos }),
        });
        if (!resp.ok) {
            const err = await resp.json().catch(() => ({}));
            throw new Error(err.detail || "Erro ao enviar solicitação.");
        }

        _fecharModal();
        _ordemArrastada = null;
        renderizarTodos();
        document.getElementById("btnSolicitarReordenacao").style.display = "none";
        _mostrarToast("Solicitação enviada com sucesso!");
    } catch (err) {
        msgEl.textContent = err.message;
        msgEl.style.display = "block";
    } finally {
        btnConfirmar.disabled = false;
        btnConfirmar.textContent = "Confirmar";
    }
}

function _mostrarToast(texto) {
    const toast = document.getElementById("toast");
    if (!toast) return;
    toast.textContent = texto;
    toast.classList.add("toast-visivel");
    setTimeout(() => toast.classList.remove("toast-visivel"), 3000);
}

// Pesquisa
document.getElementById("pesquisaPaciente")?.addEventListener("input", (e) => {
    const termo = e.target.value.toLowerCase().trim();
    pacientesFiltrados = pacientes.filter((p) =>
        (p.nome_paciente || "").toLowerCase().includes(termo) ||
        (p.solicitacao_id || "").toLowerCase().includes(termo) ||
        (p.especialidade || "").toLowerCase().includes(termo)
    );
    renderizarTodos();
});

document.addEventListener("DOMContentLoaded", () => {
    _configurarDragDrop();
    carregarFila();

    document.getElementById("btnSolicitarReordenacao")?.addEventListener("click", _abrirModalSolicitacao);
    document.getElementById("btnConfirmarModal")?.addEventListener("click", enviarSolicitacao);
    document.getElementById("btnCancelarModal")?.addEventListener("click", _fecharModal);
    document.getElementById("modalJustificativa")?.addEventListener("click", (e) => {
        if (e.target === document.getElementById("modalJustificativa")) _fecharModal();
    });
});
