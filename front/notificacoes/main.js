const NOTIFICACOES = [
    {
        id: 1,
        lida: false,
        tipo: "piora",
        urgencia: "alta",
        timestamp: "24/10/2026 07:12",
        paciente: "Maria Aparecida Souza",
        solicitacao_id: "SOL-2023-00047",
        classe_atual: "B",
        titulo: "Paciente relatou piora crítica",
        resumo: "Respondeu opção 4 ao SMS — piorou e precisa de consulta urgente.",
        resposta_sms: "4",
        detalhes: "Maria respondeu ao contato via SMS com a opção 4 (Piorei, preciso de uma consulta urgente). Ela está há 187 dias na fila, ultrapassando o prazo da classe B (60 dias). Recomenda-se reclassificação para A2 e contato imediato.",
        acoes: ["reclassificar", "contatar"],
    },
    {
        id: 2,
        lida: false,
        tipo: "piora",
        urgencia: "alta",
        timestamp: "24/10/2026 06:48",
        paciente: "José Renato Figueiredo",
        solicitacao_id: "SOL-2022-00118",
        classe_atual: "C",
        titulo: "Paciente foi ao pronto-socorro",
        resumo: "Evento de pronto-socorro registrado ontem — 3º evento em 90 dias.",
        resposta_sms: null,
        detalhes: "José deu entrada no pronto-socorro na noite de 23/10/2026. É o terceiro evento de piora nos últimos 90 dias. Atualmente na classe C, aguardando há 312 dias. O padrão de recorrência sugere agravamento — reclassificação para B ou A2 deve ser avaliada.",
        acoes: ["reclassificar"],
    },
    {
        id: 3,
        lida: false,
        tipo: "piora",
        urgencia: "alta",
        timestamp: "23/10/2026 22:31",
        paciente: "Ana Paula Rodrigues Lima",
        solicitacao_id: "SOL-2024-00203",
        classe_atual: "A2",
        titulo: "Biópsia positiva confirmada",
        resumo: "Resultado de biópsia recebido — carcinoma ductal confirmado.",
        resposta_sms: null,
        detalhes: "Biópsia realizada em 20/10/2026 retornou com resultado de carcinoma ductal invasivo. Ana Paula está atualmente na classe A2, aguardando há 43 dias (prazo: 21 dias). CID ainda registrado como D48.6 — recomenda-se atualização para CID C50 e reclassificação para A1.",
        acoes: ["reclassificar"],
    },
    {
        id: 4,
        lida: false,
        tipo: "resposta",
        urgencia: "media",
        timestamp: "23/10/2026 19:05",
        paciente: "Carlos Eduardo Mendes",
        solicitacao_id: "SOL-2023-00091",
        classe_atual: "C",
        titulo: "Paciente confirma necessidade de cirurgia",
        resumo: "Respondeu opção 1 ao SMS — ainda precisa da cirurgia.",
        resposta_sms: "1",
        detalhes: "Carlos respondeu ao SMS de contato com a opção 1 (Ainda preciso). Está na fila há 241 dias, classe C (prazo 180 dias). Nenhuma ação clínica urgente necessária, mas o prazo já foi ultrapassado. Score de equidade em crescimento.",
        acoes: [],
    },
    {
        id: 5,
        lida: false,
        tipo: "resposta",
        urgencia: "media",
        timestamp: "23/10/2026 17:42",
        paciente: "Francisca Alves Nascimento",
        solicitacao_id: "SOL-2022-00334",
        classe_atual: "B",
        titulo: "Paciente confirma necessidade de cirurgia",
        resumo: "Respondeu opção 1 ao SMS — ainda precisa da cirurgia.",
        resposta_sms: "1",
        detalhes: "Francisca respondeu ao SMS com a opção 1 (Ainda preciso). Está aguardando há 198 dias na classe B (prazo 60 dias). Mais de 3× o prazo da sua classe. Equipe deve avaliar se há eventos de piora não registrados.",
        acoes: [],
    },
    {
        id: 6,
        lida: true,
        tipo: "resposta",
        urgencia: "baixa",
        timestamp: "23/10/2026 14:20",
        paciente: "Roberto Henrique Teixeira",
        solicitacao_id: "SOL-2023-00512",
        classe_atual: "D",
        titulo: "Paciente informa que já foi operado",
        resumo: "Respondeu opção 2 ao SMS — já realizou cirurgia em outro serviço.",
        resposta_sms: "2",
        detalhes: "Roberto respondeu ao SMS com a opção 2 (Já operei). Indica que a cirurgia foi realizada em outro serviço. Recomenda-se remoção da fila com motivo 'Já foi atendido' para liberar a vaga.",
        acoes: ["remover"],
    },
    {
        id: 7,
        lida: true,
        tipo: "resposta",
        urgencia: "baixa",
        timestamp: "23/10/2026 11:08",
        paciente: "Luciana Martins Borges",
        solicitacao_id: "SOL-2024-00089",
        classe_atual: "D",
        titulo: "Paciente desistiu da cirurgia",
        resumo: "Respondeu opção 3 ao SMS — desistiu da cirurgia.",
        resposta_sms: "3",
        detalhes: "Luciana respondeu ao SMS com a opção 3 (Desisti). Recomenda-se remoção da fila com motivo 'Paciente desistiu'. A vaga pode ser realocada.",
        acoes: ["remover"],
    },
    {
        id: 8,
        lida: true,
        tipo: "piora",
        urgencia: "media",
        timestamp: "22/10/2026 20:15",
        paciente: "Antônio Carlos Pereira",
        solicitacao_id: "SOL-2022-00678",
        classe_atual: "B",
        titulo: "HbA1c elevada registrada",
        resumo: "Última HbA1c: 9,2% — diabetes descontrolado para cirurgia eletiva.",
        resposta_sms: null,
        detalhes: "Novo registro de HbA1c de 9,2% em 21/10/2026. O limiar para cirurgia eletiva é 8,5%. Antônio está na fila há 143 dias na classe B. A descompensação diabética aumenta o risco cirúrgico (ASA 3) e pode exigir preparo pré-operatório adicional antes do agendamento.",
        acoes: [],
    },
];

let _filtroAtivo = "todas";
let _notAtiva = null;

function _urgenciaCor(u) {
    if (u === "alta") return "not-urgencia-alta";
    if (u === "media") return "not-urgencia-media";
    return "not-urgencia-baixa";
}

function _urgenciaLabel(u) {
    if (u === "alta") return "Urgente";
    if (u === "media") return "Atenção";
    return "Info";
}

function _tipoLabel(t) {
    if (t === "piora") return "Piora clínica";
    return "Resposta SMS";
}

function _respostaLabel(r) {
    const map = { "1": "Ainda preciso", "2": "Já operei", "3": "Desisti", "4": "Piorei — consulta urgente" };
    return map[r] || "—";
}

function renderizarLista() {
    const lista = document.getElementById("listaNot");
    const filtradas = NOTIFICACOES.filter(n => {
        if (_filtroAtivo === "nao-lida") return !n.lida;
        if (_filtroAtivo === "piora") return n.tipo === "piora";
        if (_filtroAtivo === "resposta") return n.tipo === "resposta";
        return true;
    });

    if (!filtradas.length) {
        lista.innerHTML = `<p class="placeholder">Nenhuma notificação neste filtro.</p>`;
        return;
    }

    lista.innerHTML = "";
    filtradas.forEach(n => {
        const div = document.createElement("div");
        div.className = `not-card${_notAtiva === n.id ? " not-card-ativa" : ""}${n.lida ? " not-card-lida" : ""}`;
        div.innerHTML = `
            <div class="not-card-header">
                <span class="not-urgencia ${_urgenciaCor(n.urgencia)}">${_urgenciaLabel(n.urgencia)}</span>
                <span class="not-tipo">${_tipoLabel(n.tipo)}</span>
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

    const acoesBtns = n.acoes.map(a => {
        if (a === "reclassificar") return `<button class="not-btn-acao not-btn-reclassificar">Reclassificar paciente</button>`;
        if (a === "remover") return `<button class="not-btn-acao not-btn-remover">Remover da fila</button>`;
        if (a === "contatar") return `<button class="not-btn-acao not-btn-contatar">Contatar paciente</button>`;
        return "";
    }).join("");

    const respostaHtml = n.resposta_sms
        ? `<div class="not-resposta-box">
               <span class="not-resposta-label">Resposta do paciente ao SMS</span>
               <p class="not-resposta-texto">Opção ${n.resposta_sms} — <strong>${_respostaLabel(n.resposta_sms)}</strong></p>
           </div>`
        : "";

    document.getElementById("detalheNot").innerHTML = `
        <div class="not-detalhe-header">
            <span class="not-urgencia ${_urgenciaCor(n.urgencia)}">${_urgenciaLabel(n.urgencia)}</span>
            <span class="not-tipo">${_tipoLabel(n.tipo)}</span>
        </div>
        <h3 class="not-detalhe-titulo">${n.titulo}</h3>
        <p class="not-detalhe-data">${n.timestamp}</p>
        <div class="not-paciente-box">
            <span class="not-paciente-label">Paciente</span>
            <p class="not-paciente-nome">${n.paciente}</p>
            <p class="not-paciente-sub">${n.solicitacao_id} · Classe atual: <strong>${n.classe_atual}</strong></p>
        </div>
        ${respostaHtml}
        <div class="not-descricao">
            <p>${n.detalhes}</p>
        </div>
        ${acoesBtns
            ? `<div class="not-acoes">${acoesBtns}</div>`
            : `<p class="not-sem-acao">Nenhuma ação necessária — notificação informativa.</p>`}
    `;

    document.querySelectorAll(".not-btn-reclassificar").forEach(btn =>
        btn.addEventListener("click", () => { window.location.href = "/listinha"; })
    );
    document.querySelectorAll(".not-btn-remover").forEach(btn =>
        btn.addEventListener("click", () => { window.location.href = "/listinha"; })
    );
    document.querySelectorAll(".not-btn-contatar").forEach(btn =>
        btn.addEventListener("click", () => { window.location.href = "/listinha"; })
    );
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
