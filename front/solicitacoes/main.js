let solicitacoes = [];
let solicitacaoAtiva = null;
let _filtroAtivo = "todos";

async function carregarSolicitacoes() {
    try {
        const resp = await fetch("/api/solicitacoes");
        if (!resp.ok) throw new Error();
        solicitacoes = await resp.json();
        renderizarLista();
    } catch {
        document.getElementById("listaSolicitacoes").innerHTML =
            `<p class="placeholder">Erro ao carregar solicitações.</p>`;
    }
}

function renderizarLista() {
    const lista = document.getElementById("listaSolicitacoes");
    const filtradas = _filtroAtivo === "todos"
        ? solicitacoes
        : solicitacoes.filter(s => s.status === _filtroAtivo);

    if (!filtradas.length) {
        lista.innerHTML = `<p class="placeholder">${solicitacoes.length ? "Nenhuma solicitação neste filtro." : "Nenhuma solicitação registrada."}</p>`;
        return;
    }

    lista.innerHTML = "";
    filtradas.forEach((s) => {
        const card = document.createElement("div");
        const ativa = solicitacaoAtiva && solicitacaoAtiva.id === s.id;
        card.className = "sol-card" + (ativa ? " sol-card-ativa" : "");
        card.innerHTML = `
            <div class="sol-card-header">
                <span class="sol-id">#${s.id}</span>
                <span class="sol-badge ${s.status === "aprovada" ? "badge-aprovada" : s.status === "rejeitada" ? "badge-rejeitada" : "badge-pendente"}">
                    ${s.status === "aprovada" ? "Aprovada" : s.status === "rejeitada" ? "Rejeitada" : "Pendente"}
                </span>
            </div>
            <p class="sol-data">${s.timestamp}</p>
            <p class="sol-just">${s.justificativa.length > 80 ? s.justificativa.slice(0, 80) + "…" : s.justificativa}</p>
        `;
        card.addEventListener("click", () => exibirDetalhes(s.id));
        lista.appendChild(card);
    });
}

async function exibirDetalhes(id) {
    const painel = document.getElementById("detalhesSolicitacao");
    painel.innerHTML = `<p class="placeholder">Carregando...</p>`;

    try {
        const resp = await fetch(`/api/solicitacoes/${id}`);
        if (!resp.ok) throw new Error();
        const s = await resp.json();
        solicitacaoAtiva = s;
        renderizarLista();

        const itens = s.nova_ordem_detalhada.map(item => {
            const moveu = item.posicao_anterior != null && item.posicao_anterior !== item.posicao_nova;
            const seta = moveu
                ? `<span class="pos-de">${item.posicao_anterior}º</span>
                   <span class="pos-seta">${item.posicao_nova < item.posicao_anterior ? "↑" : "↓"}</span>
                   <span class="pos-para">${item.posicao_nova}º</span>`
                : `<span class="pos-igual">${item.posicao_nova != null ? item.posicao_nova + "º" : "—"}</span>`;

            const historico = item.historico && item.historico.length
                ? item.historico.slice().reverse().map(r => {
                    const posStr = r.posicao_antes !== r.posicao_depois
                        ? `<span class="hist-pos">${r.posicao_antes} → ${r.posicao_depois}</span>`
                        : `<span class="hist-pos">Posição mantida: ${r.posicao_depois}</span>`;
                    const campos = r.alteracoes.map(a =>
                        `<div class="hist-campo">
                            <span class="hist-campo-nome">${a.campo}</span>
                            <span class="hist-de">${a.de || "—"}</span>
                            <span class="hist-seta">→</span>
                            <span class="hist-para">${a.para || "—"}</span>
                        </div>`
                    ).join("");
                    return `<div class="hist-item">
                        <div class="hist-header">
                            <span class="hist-data">${r.timestamp}</span>
                            ${posStr}
                        </div>
                        ${campos}
                    </div>`;
                }).join("")
                : `<p class="hist-vazio">Nenhuma alteração de dados registrada.</p>`;

            return `
                <div class="paciente-detalhe-card ${moveu ? "card-moveu" : ""}">
                    <div class="pac-header">
                        <div class="pac-pos">${seta}</div>
                        <div class="pac-nome">${item.nome_paciente}</div>
                        <div class="pac-sid">${item.solicitacao_id}</div>
                    </div>
                    <div class="pac-info">
                        <span><strong>Idade:</strong> ${item.idade ?? "—"}</span>
                        <span><strong>Sexo:</strong> ${item.sexo ?? "—"}</span>
                        <span><strong>Município:</strong> ${item.municipio ?? "—"}</span>
                        <span><strong>Especialidade:</strong> ${item.especialidade ?? "—"}</span>
                        <span><strong>Procedimento:</strong> ${item.procedimento ?? "—"}</span>
                        <span><strong>CID:</strong> ${item.cid_principal ?? "—"} — ${item.cid_descricao ?? "—"}</span>
                        <span><strong>Classe SWALIS:</strong> ${item.classe_swalis ?? "—"}</span>
                        <span><strong>Score:</strong> ${item.score_final ?? "—"}</span>
                        <span><strong>Dias em fila:</strong> ${item.dias_em_fila ?? "—"}</span>
                    </div>
                    <div class="pac-historico">
                        <p class="pac-historico-titulo">Histórico de alterações de dados</p>
                        ${historico}
                    </div>
                </div>`;
        }).join("");

        const btnAprovar = s.status === "pendente"
            ? `<div class="acoes-solicitacao">
                   <button class="btn-aprovar" id="btnAprovar">Aprovar Solicitação</button>
                   <button class="btn-rejeitar" id="btnRejeitar">Rejeitar</button>
               </div>`
            : s.status === "rejeitada"
            ? `<p class="sol-rejeitada-msg">Esta solicitação foi rejeitada.</p>`
            : `<p class="sol-aprovada-msg">Esta solicitação já foi aprovada e a fila foi reordenada.</p>`;

        painel.innerHTML = `
            <div class="detalhe-header">
                <span class="sol-id">Solicitação #${s.id}</span>
                <span class="sol-badge ${s.status === "aprovada" ? "badge-aprovada" : s.status === "rejeitada" ? "badge-rejeitada" : "badge-pendente"}">
                    ${s.status === "aprovada" ? "Aprovada" : s.status === "rejeitada" ? "Rejeitada" : "Pendente"}
                </span>
            </div>
            <p class="detalhe-data">${s.timestamp}</p>
            <div class="detalhe-just-box">
                <span class="detalhe-just-label">Justificativa</span>
                <p class="detalhe-just-texto">${s.justificativa}</p>
            </div>
            ${btnAprovar}
            <p id="msgAprovar" class="msg-aprovar" style="display:none"></p>
            <div class="detalhe-pacientes">
                <p class="detalhe-ordem-titulo">${s.nova_ordem_detalhada.length} pacientes — ordem proposta</p>
                ${itens}
            </div>
        `;

        if (s.status === "pendente") {
            document.getElementById("btnAprovar").addEventListener("click", () => aprovarSolicitacao(s.id));
            document.getElementById("btnRejeitar").addEventListener("click", () => rejeitarSolicitacao(s.id));
        }
    } catch {
        painel.innerHTML = `<p class="placeholder">Erro ao carregar detalhes.</p>`;
    }
}

async function aprovarSolicitacao(id) {
    const btn = document.getElementById("btnAprovar");
    const msg = document.getElementById("msgAprovar");
    btn.disabled = true;
    btn.textContent = "Aprovando...";

    try {
        const resp = await fetch(`/api/solicitacoes/${id}/aprovar`, { method: "POST" });
        if (!resp.ok) {
            const err = await resp.json().catch(() => ({}));
            throw new Error(err.detail || "Erro ao aprovar.");
        }
        await carregarSolicitacoes();
        exibirDetalhes(id);
    } catch (err) {
        msg.textContent = err.message;
        msg.style.display = "block";
        btn.disabled = false;
        btn.textContent = "Aprovar Solicitação";
    }
}

async function rejeitarSolicitacao(id) {
    const btn = document.getElementById("btnRejeitar");
    const msg = document.getElementById("msgAprovar");
    btn.disabled = true;
    btn.textContent = "Rejeitando...";

    try {
        const resp = await fetch(`/api/solicitacoes/${id}/rejeitar`, { method: "POST" });
        if (!resp.ok) {
            const err = await resp.json().catch(() => ({}));
            throw new Error(err.detail || "Erro ao rejeitar.");
        }
        await carregarSolicitacoes();
        exibirDetalhes(id);
    } catch (err) {
        msg.textContent = err.message;
        msg.style.display = "block";
        btn.disabled = false;
        btn.textContent = "Rejeitar";
    }
}

document.addEventListener("DOMContentLoaded", () => {
    carregarSolicitacoes();

    document.querySelectorAll(".filtro-tab").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".filtro-tab").forEach(b => b.classList.remove("ativo"));
            btn.classList.add("ativo");
            _filtroAtivo = btn.dataset.status;
            renderizarLista();
        });
    });
});
