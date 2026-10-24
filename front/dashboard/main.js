const COR_CLASSE = {
    A1: "#d15847",
    A2: "#f97316",
    B:  "#eab308",
    C:  "#3b82f6",
    D:  "#22c55e",
};

async function carregarStats() {
    try {
        const resp = await fetch("/api/stats");

        if (resp.status === 404) {
            mostrarEstadoVazio();
            return;
        }
        if (!resp.ok) throw new Error("Erro ao buscar stats.");

        const stats = await resp.json();
        renderizarDashboard(stats);

    } catch (err) {
        console.error("Erro:", err);
        mostrarEstadoVazio();
    }
}

function mostrarEstadoVazio() {
    const el = document.getElementById("totalPacientes");
    if (el) el.textContent = "—";
    const barras = document.getElementById("listaBarrasPacientes");
    if (barras) barras.innerHTML = `<p class="placeholder"><a href="/upload" style="color:#d15847">Faça o upload dos CSVs</a> para ver o dashboard.</p>`;
}

function renderizarDashboard(stats) {
    // Total
    const elTotal = document.getElementById("totalPacientes");
    if (elTotal) elTotal.textContent = stats.total;

    // Dados por classe SWALIS
    const porClasse  = stats.por_classe || {};
    const labels     = Object.keys(COR_CLASSE).filter(k => porClasse[k] !== undefined);
    const valores    = labels.map(k => porClasse[k] || 0);
    const cores      = labels.map(k => COR_CLASSE[k]);

    // Atualiza subtítulo do gráfico
    const subtitulo = document.querySelector(".titulosGraficoPizza p");
    if (subtitulo) subtitulo.textContent = labels.join("  ");

    // Gráfico de rosca
    const canvas = document.getElementById("salesChart");
    if (canvas) {
        const ctx = canvas.getContext("2d");
        const soma = valores.reduce((a, b) => a + b, 0);

        new Chart(ctx, {
            type: "doughnut",
            data: {
                labels,
                datasets: [{
                    data: valores,
                    backgroundColor: cores,
                    borderWidth: 0,
                    hoverOffset: 4,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: "65%",
                plugins: {
                    legend: { display: false },
                    datalabels: {
                        color: "#fff",
                        font: { weight: "bold", size: 11 },
                        formatter: (value) => {
                            const pct = Math.round((value / (soma || 1)) * 100);
                            return pct + "%";
                        },
                    },
                },
            },
            plugins: [ChartDataLabels],
        });
    }

    // Legenda
    const legendContainer = document.getElementById("chartLegendContainer");
    if (legendContainer) {
        legendContainer.innerHTML = "";
        labels.forEach((label, i) => {
            const item = document.createElement("div");
            item.className = "legend-item";
            item.innerHTML = `
                <span class="legend-dot" style="background-color:${cores[i]}"></span>
                <span class="legend-text">${label} (${valores[i]})</span>
            `;
            legendContainer.appendChild(item);
        });
    }

    // Barras horizontais por classe
    const listaBarras = document.getElementById("listaBarrasPacientes");
    if (listaBarras) {
        listaBarras.innerHTML = "";
        const maiorValor = Math.max(...valores, 1);

        labels.forEach((label, i) => {
            const pct = (valores[i] / maiorValor) * 100;
            const linha = document.createElement("div");
            linha.className = "linha-paciente";
            linha.innerHTML = `
                <span class="rotulo-categoria">${label}:</span>
                <div class="trilho-barra">
                    <div class="preenchimento-barra" style="width:${pct}%; background-color:${cores[i]}"></div>
                </div>
                <span class="valor-pacientes">${valores[i]}</span>
            `;
            listaBarras.appendChild(linha);
        });
    }
}

document.addEventListener("DOMContentLoaded", carregarStats);
