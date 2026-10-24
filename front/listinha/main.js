let pacientes = [];
let pacientesFiltrados = [];

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
            mostrarEstadoVazio();
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

function renderizarTudo() {
    renderizarPrimeiros();
    renderizarTodos();
}

function renderizarPrimeiros() {
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

    if (primeiros.length > 0) exibirDetalhesPaciente(primeiros[0]);
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
    `;
}

function renderizarTodos() {
    const lista = document.getElementById("listaPacientes");
    if (!lista) return;
    lista.innerHTML = "";

    pacientesFiltrados.forEach((p) => {
        const cor = COR_CLASSE[p.classe_swalis] || "#999";
        const card = document.createElement("div");
        card.className = "paciente-card";
        card.style.borderLeftColor = cor;
        card.innerHTML = `
            <h3>${p.posicao}. ${p.nome_paciente} — ${p.solicitacao_id}</h3>
            <p><strong>Especialidade:</strong> ${p.especialidade}
               &nbsp;|&nbsp; <strong>Classe:</strong> <span style="color:${cor}">${p.classe_swalis}</span>
               &nbsp;|&nbsp; <strong>Dias em fila:</strong> ${p.dias_em_fila}</p>
        `;
        lista.appendChild(card);
    });
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

document.addEventListener("DOMContentLoaded", carregarFila);
