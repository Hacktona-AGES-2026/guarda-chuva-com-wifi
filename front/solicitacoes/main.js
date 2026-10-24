let solicitacoes = [];
let solicitacaoAtiva = null;

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
    if (!solicitacoes.length) {
        lista.innerHTML = `<p class="placeholder">Nenhuma solicitação registrada.</p>`;
        return;
    }

    lista.innerHTML = "";
    solicitacoes.forEach((s) => {
        const card = document.createElement("div");
        const ativa = solicitacaoAtiva && solicitacaoAtiva.id === s.id;
        card.className = "sol-card" + (ativa ? " sol-card-ativa" : "");
        card.innerHTML = `
            <div class="sol-card-header">
                <span class="sol-id">#${s.id}</span>
                <span class="sol-badge ${s.status === "aprovada" ? "badge-aprovada" : "badge-pendente"}">
                    ${s.status === "aprovada" ? "Aprovada" : "Pendente"}
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

        const itens = s.nova_ordem_detalhada.map(item =>
            `<div class="ordem-item">
                <span class="ordem-pos">${item.posicao}</span>
                <span class="ordem-nome">${item.nome_paciente}</span>
                <span class="ordem-sid">${item.solicitacao_id}</span>
            </div>`
        ).join("");

        const btnAprovar = s.status === "pendente"
            ? `<button class="btn-aprovar" id="btnAprovar">Aprovar Solicitação</button>`
            : `<p class="sol-aprovada-msg">Esta solicitação já foi aprovada e a fila foi reordenada.</p>`;

        painel.innerHTML = `
            <div class="detalhe-header">
                <span class="sol-id">Solicitação #${s.id}</span>
                <span class="sol-badge ${s.status === "aprovada" ? "badge-aprovada" : "badge-pendente"}">
                    ${s.status === "aprovada" ? "Aprovada" : "Pendente"}
                </span>
            </div>
            <p class="detalhe-data">${s.timestamp}</p>
            <div class="detalhe-just-box">
                <span class="detalhe-just-label">Justificativa</span>
                <p class="detalhe-just-texto">${s.justificativa}</p>
            </div>
            <div class="detalhe-ordem">
                <p class="detalhe-ordem-titulo">Ordem proposta (${s.nova_ordem_detalhada.length} pacientes)</p>
                <div class="ordem-lista">${itens}</div>
            </div>
            ${btnAprovar}
            <p id="msgAprovar" class="msg-aprovar" style="display:none"></p>
        `;

        if (s.status === "pendente") {
            document.getElementById("btnAprovar").addEventListener("click", () => aprovarSolicitacao(s.id));
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

document.addEventListener("DOMContentLoaded", carregarSolicitacoes);
