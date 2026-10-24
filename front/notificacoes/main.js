const NOTIFICACOES = [
    {
        id: 1,
        lida: false,
        timestamp: "24/10/2026 07:12",
        paciente: "Maria Aparecida Souza",
        solicitacao_id: "SOL-2023-00047",
        classe_atual: "B",
        titulo: "Paciente relatou piora e precisa de consulta urgente",
        resumo: "Respondeu opção 4 ao SMS — piorou e precisa de consulta urgente.",
        detalhes: "Maria respondeu ao contato via SMS com a opção 4 (Piorei, preciso de uma consulta urgente). Está há 187 dias na fila, ultrapassando o prazo da classe B (60 dias). O caso deve ser reavaliado pelo regulador.",
    },
    {
        id: 2,
        lida: false,
        timestamp: "24/10/2026 06:03",
        paciente: "José Renato Figueiredo",
        solicitacao_id: "SOL-2022-00118",
        classe_atual: "C",
        titulo: "Paciente relatou piora e precisa de consulta urgente",
        resumo: "Respondeu opção 4 ao SMS — piorou e precisa de consulta urgente.",
        detalhes: "José respondeu ao SMS com a opção 4 (Piorei, preciso de uma consulta urgente). Está aguardando há 312 dias na classe C (prazo 180 dias). É o segundo contato relatando piora nos últimos 60 dias.",
    },
    {
        id: 3,
        lida: false,
        timestamp: "23/10/2026 22:45",
        paciente: "Ana Paula Rodrigues Lima",
        solicitacao_id: "SOL-2024-00203",
        classe_atual: "A2",
        titulo: "Paciente relatou piora e precisa de consulta urgente",
        resumo: "Respondeu opção 4 ao SMS — piorou e precisa de consulta urgente.",
        detalhes: "Ana Paula respondeu ao SMS com a opção 4 (Piorei, preciso de uma consulta urgente). Está na classe A2 há 43 dias (prazo: 21 dias já ultrapassado). Situação requer atenção prioritária.",
    },
    {
        id: 4,
        lida: false,
        timestamp: "23/10/2026 19:30",
        paciente: "Francisca Alves Nascimento",
        solicitacao_id: "SOL-2022-00334",
        classe_atual: "B",
        titulo: "Paciente relatou piora e precisa de consulta urgente",
        resumo: "Respondeu opção 4 ao SMS — piorou e precisa de consulta urgente.",
        detalhes: "Francisca respondeu ao SMS com a opção 4 (Piorei, preciso de uma consulta urgente). Está na fila há 198 dias na classe B (prazo 60 dias). Mais de 3× o prazo da classe.",
    },
    {
        id: 5,
        lida: true,
        timestamp: "23/10/2026 14:55",
        paciente: "Antônio Carlos Pereira",
        solicitacao_id: "SOL-2022-00678",
        classe_atual: "B",
        titulo: "Paciente relatou piora e precisa de consulta urgente",
        resumo: "Respondeu opção 4 ao SMS — piorou e precisa de consulta urgente.",
        detalhes: "Antônio respondeu ao SMS com a opção 4 (Piorei, preciso de uma consulta urgente). Está na fila há 143 dias na classe B. Já possui registro de HbA1c 9,2% indicando diabetes descontrolado.",
    },
    {
        id: 6,
        lida: true,
        timestamp: "22/10/2026 11:20",
        paciente: "Luciana Martins Borges",
        solicitacao_id: "SOL-2024-00089",
        classe_atual: "C",
        titulo: "Paciente relatou piora e precisa de consulta urgente",
        resumo: "Respondeu opção 4 ao SMS — piorou e precisa de consulta urgente.",
        detalhes: "Luciana respondeu ao SMS com a opção 4 (Piorei, preciso de uma consulta urgente). Está aguardando há 220 dias na classe C (prazo 180 dias). Primeiro contato de piora registrado.",
    },
];

let _filtroAtivo = "todas";
let _notAtiva = null;

function renderizarLista() {
    const lista = document.getElementById("listaNot");
    const filtradas = _filtroAtivo === "nao-lida"
        ? NOTIFICACOES.filter(n => !n.lida)
        : NOTIFICACOES;

    if (!filtradas.length) {
        lista.innerHTML = `<p class="placeholder">Nenhuma notificação.</p>`;
        return;
    }

    lista.innerHTML = "";
    filtradas.forEach(n => {
        const div = document.createElement("div");
        div.className = `not-card${_notAtiva === n.id ? " not-card-ativa" : ""}${n.lida ? " not-card-lida" : ""}`;
        div.innerHTML = `
            <div class="not-card-header">
                <span class="not-urgencia">Atenção</span>
                ${!n.lida ? `<span class="not-bolinha"></span>` : ""}
            </div>
            <p class="not-titulo">${n.titulo}</p>
            <p class="not-resumo">${n.resumo}</p>
            <p class="not-data">${n.timestamp} · ${n.paciente}</p>
        `;
        div.addEventListener("click", () => exibirDetalhe(n.id));
        lista.appendChild(div);
    });
}

function exibirDetalhe(id) {
    const n = NOTIFICACOES.find(x => x.id === id);
    if (!n) return;

    n.lida = true;
    _notAtiva = id;
    renderizarLista();
    atualizarBadge();

    document.getElementById("detalheNot").innerHTML = `
        <div class="not-detalhe-header">
            <span class="not-urgencia">Atenção</span>
            <span class="not-tipo">Resposta SMS — Opção 4</span>
        </div>
        <h3 class="not-detalhe-titulo">${n.titulo}</h3>
        <p class="not-detalhe-data">${n.timestamp}</p>
        <div class="not-paciente-box">
            <span class="not-paciente-label">Paciente</span>
            <p class="not-paciente-nome">${n.paciente}</p>
            <p class="not-paciente-sub">${n.solicitacao_id} · Classe atual: <strong>${n.classe_atual}</strong></p>
        </div>
        <div class="not-resposta-box">
            <span class="not-resposta-label">Resposta do paciente ao SMS</span>
            <p class="not-resposta-texto">Opção 4 — <strong>Piorei, preciso de uma consulta urgente</strong></p>
        </div>
        <div class="not-descricao">
            <p>${n.detalhes}</p>
        </div>
    `;
}

function atualizarBadge() {
    const naoLidas = NOTIFICACOES.filter(n => !n.lida).length;
    const badge = document.getElementById("navBadge");
    if (badge) {
        badge.textContent = naoLidas > 0 ? naoLidas : "";
        badge.style.display = naoLidas > 0 ? "inline-flex" : "none";
    }
}

document.addEventListener("DOMContentLoaded", () => {
    renderizarLista();
    atualizarBadge();

    document.querySelectorAll(".filtro-tab").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".filtro-tab").forEach(b => b.classList.remove("ativo"));
            btn.classList.add("ativo");
            _filtroAtivo = btn.dataset.filtro;
            renderizarLista();
        });
    });
});
