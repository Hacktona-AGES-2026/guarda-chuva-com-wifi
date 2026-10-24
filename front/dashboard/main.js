document.addEventListener("DOMContentLoaded", () => {
    // Defina aqui o Número Total de Pacientes geral
    const totalPacientesGeral = 999; 

    // Dados do gráfico: nomes e as devidas quantidades de pacientes
    const dadosGrafico = [
        { "A1": 9 },
        { "A2": 5 },
        { "C": 23 },
        { "D": 55 },
        { "E": 67 }
    ];

    const labels = [];
    const valores = [];
    const cores = ['#f97316', '#3b82f6', '#eab308', '#f87171', '#22c55e'];

    let maiorValor = 0;

    // Extrair chaves e valores, descobrindo qual é o maior valor individual para a proporção da barra
    dadosGrafico.forEach(item => {
        const nome = Object.keys(item)[0];
        const valor = item[nome];
        
        labels.push(nome);
        valores.push(valor);
        
        if (valor > maiorValor) {
            maiorValor = valor;
        }
    });

    // Inserir o Número Total de Pacientes no título correspondente
    const elTotal = document.getElementById('totalPacientes');
    if (elTotal) {
        elTotal.textContent = totalPacientesGeral;
    }

    // Criar o Gráfico de Pizza
    const canvasElement = document.getElementById('salesChart');
    if (canvasElement) {
        const ctx = canvasElement.getContext('2d');
        const somaLocal = valores.reduce((acc, curr) => acc + curr, 0);

        new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: valores,
                    backgroundColor: cores,
                    borderWidth: 0,
                    hoverOffset: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '65%',
                plugins: {
                    legend: { display: false },
                    datalabels: {
                        color: '#fff',
                        font: { weight: 'bold', size: 11 },
                        formatter: (value) => {
                            const base = somaLocal > 0 ? somaLocal : 1;
                            const pct = Math.round((value / base) * 100);
                            return pct + '%';
                        }
                    }
                }
            },
            plugins: [ChartDataLabels]
        });
    }

    // Gerar a Legenda simples ao lado do gráfico de pizza
    const legendContainer = document.getElementById('chartLegendContainer');
    if (legendContainer) {
        legendContainer.innerHTML = '';
        labels.forEach((label, index) => {
            const cor = cores[index % cores.length];
            const itemDiv = document.createElement('div');
            itemDiv.className = 'legend-item';
            itemDiv.innerHTML = `
                <span class="legend-dot" style="background-color: ${cor};"></span>
                <span class="legend-text">${label}</span>
            `;
            legendContainer.appendChild(itemDiv);
        });
    }

    // Gerar as Barras Horizontais Dinâmicas com as cores sincronizadas
    const listaBarrasContainer = document.getElementById('listaBarrasPacientes');
    if (listaBarrasContainer) {
        listaBarrasContainer.innerHTML = '';
        labels.forEach((label, index) => {
            const valor = valores[index];
            const cor = cores[index % cores.length];
            
            // O maior valor fica com 100% de largura, os restantes ajustam-se de forma proporcional
            const percentagemLargura = maiorValor > 0 ? (valor / maiorValor) * 100 : 0;

            const linhaBarra = document.createElement('div');
            linhaBarra.className = 'linha-paciente';
            linhaBarra.innerHTML = `
                <span class="rotulo-categoria">${label}:</span>
                <div class="trilho-barra">
                    <div class="preenchimento-barra" style="width: ${percentagemLargura}%; background-color: ${cor};"></div>
                </div>
                <span class="valor-pacientes">${valor}</span>
            `;
            listaBarrasContainer.appendChild(linhaBarra);
        });
    }
});