const COR_CLASSE = {
    A1: "#d15847",
    A2: "#f97316",
    B:  "#eab308",
    C:  "#3b82f6",
    D:  "#22c55e",
};

async function init() {
    const resp = await fetch("/api/fila");
    if (resp.status === 404) {
        window.location.replace("/upload");
        return;
    }

    const fila = await resp.json();

    // Badge total
    const badge = document.getElementById("badge-total");
    badge.textContent = `${fila.length} pacientes`;
    badge.classList.remove("oculto");

    // Prévia
    renderizarPrevia(fila.slice(0, 10));
}

function renderizarPrevia(pacientes) {
    const wrapper = document.getElementById("tabelaPreview");
    if (!pacientes.length) {
        wrapper.innerHTML = "<p class='placeholder'>Sem dados.</p>";
        return;
    }

    const linhas = pacientes.map(p => {
        const cor = COR_CLASSE[p.classe_swalis] || "#999";
        return `
            <tr>
                <td class="col-pos">${p.posicao}</td>
                <td class="col-nome">${p.nome_paciente}</td>
                <td><span class="badge-classe" style="background:${cor}">${p.classe_swalis}</span></td>
                <td class="col-score">${p.score_final}</td>
                <td class="col-dias">${p.dias_em_fila}d</td>
                <td class="col-esp">${p.especialidade}</td>
            </tr>`;
    }).join("");

    wrapper.innerHTML = `
        <table>
            <thead>
                <tr>
                    <th>#</th>
                    <th>Paciente</th>
                    <th>Classe</th>
                    <th>Score</th>
                    <th>Fila</th>
                    <th>Especialidade</th>
                </tr>
            </thead>
            <tbody>${linhas}</tbody>
        </table>`;
}

function baixar(tipo) {
    const url = tipo === "entrega" ? "/api/exportar/entrega" : "/api/exportar/completo";
    const status = document.getElementById("status");
    status.textContent = "Gerando arquivo...";
    status.className = "status carregando";

    fetch(url)
        .then(resp => {
            if (!resp.ok) throw new Error("Erro ao gerar CSV.");
            return resp.blob();
        })
        .then(blob => {
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = tipo === "entrega" ? "fila_priorizada_entrega.csv" : "fila_priorizada_completo.csv";
            a.click();
            URL.revokeObjectURL(a.href);
            status.textContent = "Download iniciado com sucesso.";
            status.className = "status sucesso";
            setTimeout(() => status.className = "status oculto", 3000);
        })
        .catch(err => {
            status.textContent = `Erro: ${err.message}`;
            status.className = "status erro";
        });
}

document.addEventListener("DOMContentLoaded", init);
