const COR_CLASSE = {
    A1: "#d15847",
    A2: "#f97316",
    B:  "#eab308",
    C:  "#3b82f6",
    D:  "#22c55e",
};

const TEMPO_ESPERA = [
    { classe: "A1", antes: 18,  depois: 11,  prazo: 15  },
    { classe: "A2", antes: 28,  depois: 17,  prazo: 21  },
    { classe: "B",  antes: 94,  depois: 58,  prazo: 60  },
    { classe: "C",  antes: 210, depois: 248, prazo: 180 },
    { classe: "D",  antes: 390, depois: 461, prazo: 360 },
];

async function carregarStats() {
    try {
        const resp = await fetch("/api/stats");
        if (resp.status === 404) { window.location.replace("/upload"); return; }
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
    const porClasse = stats.por_classe || {};
    const labels    = Object.keys(COR_CLASSE).filter(k => porClasse[k] !== undefined);
    const valores   = labels.map(k => porClasse[k] || 0);
    const cores     = labels.map(k => COR_CLASSE[k]);

    document.getElementById("totalPacientes").textContent = stats.total;

    const subtitulo = document.querySelector(".titulosGraficoPizza p");
    if (subtitulo) subtitulo.textContent = labels.join("  ");

    // Rosca
    const canvas = document.getElementById("salesChart");
    if (canvas) {
        const ctx = canvas.getContext("2d");
        const soma = valores.reduce((a, b) => a + b, 0);
        new Chart(ctx, {
            type: "doughnut",
            data: { labels, datasets: [{ data: valores, backgroundColor: cores, borderWidth: 0, hoverOffset: 4 }] },
            options: {
                responsive: true, maintainAspectRatio: false, cutout: "65%",
                plugins: {
                    legend: { display: false },
                    datalabels: {
                        color: "#fff", font: { weight: "bold", size: 11 },
                        formatter: (v) => Math.round((v / (soma || 1)) * 100) + "%",
                    },
                },
            },
            plugins: [ChartDataLabels],
        });
    }

    // Legenda rosca
    const legendContainer = document.getElementById("chartLegendContainer");
    if (legendContainer) {
        legendContainer.innerHTML = "";
        labels.forEach((label, i) => {
            const item = document.createElement("div");
            item.className = "legend-item";
            item.innerHTML = `<span class="legend-dot" style="background-color:${cores[i]}"></span><span class="legend-text">${label} (${valores[i]})</span>`;
            legendContainer.appendChild(item);
        });
    }

    // Barras por classe
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
                <div class="trilho-barra"><div class="preenchimento-barra" style="width:${pct}%;background-color:${cores[i]}"></div></div>
                <span class="valor-pacientes">${valores[i]}</span>`;
            listaBarras.appendChild(linha);
        });
    }

    renderizarTempo();
    renderizarAcuracia(stats.modelo);
}

function renderizarTempo() {
    const lista = document.getElementById("tempoLista");
    if (!lista) return;
    const max = Math.max(...TEMPO_ESPERA.map(d => Math.max(d.antes, d.depois)));
    lista.innerHTML = TEMPO_ESPERA.map(d => {
        const cor = COR_CLASSE[d.classe];
        const pctAntes  = (d.antes  / max) * 100;
        const pctDepois = (d.depois / max) * 100;
        const melhorou  = d.depois < d.antes;
        const delta     = Math.round(Math.abs(1 - d.depois / d.antes) * 100);
        const ganhoTxt  = melhorou ? `-${delta}%` : `+${delta}%`;
        const ganhoClr  = melhorou ? "#16a34a" : "#d15847";
        return `
        <div class="tempo-linha">
            <span class="tempo-classe" style="color:${cor}">${d.classe}</span>
            <div class="tempo-barras">
                <div class="tempo-bar-wrap" title="Antes: ${d.antes}d">
                    <div class="tempo-bar antes" style="width:${pctAntes}%"></div>
                </div>
                <div class="tempo-bar-wrap" title="Depois: ${d.depois}d">
                    <div class="tempo-bar depois" style="width:${pctDepois}%;background:${cor}"></div>
                </div>
            </div>
            <div class="tempo-vals">
                <span class="tempo-num antes-num">${d.antes}d</span>
                <span class="tempo-num depois-num" style="color:${cor}">${d.depois}d</span>
            </div>
            <span class="tempo-ganho" style="color:${ganhoClr}">${ganhoTxt}</span>
        </div>`;
    }).join("");

    lista.insertAdjacentHTML("beforeend", `
        <div class="tempo-legenda">
            <span class="leg-item"><span class="leg-dot antes-dot"></span>Antes</span>
            <span class="leg-item"><span class="leg-dot depois-dot"></span>Após priorização</span>
        </div>`);
}

function renderizarAcuracia(modelo) {
    if (!modelo) return;
    const grid = document.getElementById("kpiGrid");
    const regraOuro = modelo.regra_ouro_ok;

    const kpis = [
        { label: "Classificados", valor: modelo.total_classificados, icone: "📋" },
        { label: "Oncológicos",   valor: `${modelo.oncologicos_detectados} (${modelo.pct_oncologicos}%)`, icone: "🔬" },
        { label: "Com piora",     valor: `${modelo.com_piora_recente} (${modelo.pct_piora}%)`, icone: "📈" },
        { label: "Regra de ouro", valor: regraOuro ? "Respeitada" : "VIOLADA", icone: regraOuro ? "✅" : "❌" },
    ];

    if (grid) {
        grid.innerHTML = kpis.map(k => `
            <div class="kpi-card">
                <span class="kpi-icone">${k.icone}</span>
                <span class="kpi-valor" style="${k.label === 'Regra de ouro' ? `color:${regraOuro ? '#16a34a' : '#d15847'}` : ''}">${k.valor}</span>
                <span class="kpi-label">${k.label}</span>
            </div>`).join("");
    }

    const fill  = document.getElementById("acuraciaFill");
    const valor = document.getElementById("acuraciaValor");
    const pct   = modelo.pct_alem_prazo;
    if (fill)  fill.style.width  = pct + "%";
    if (valor) valor.textContent = pct + "%";

    const label = document.querySelector(".acuracia-label");
    if (label) label.textContent = "Além do prazo da classe";
}

document.addEventListener("DOMContentLoaded", carregarStats);
