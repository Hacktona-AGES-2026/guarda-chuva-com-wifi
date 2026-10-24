let pacientes = [];
let pacientesFiltrados = [];

// Função para buscar e processar o arquivo CSV local
async function carregarCSV() {
    try {
        const response = await fetch('/csvs/fila_cirurgica.csv');
        
        if (!response.ok) {
            throw new Error('Não foi possível carregar o arquivo CSV.');
        }

        const textoCSV = await response.text();
        const linhas = textoCSV.split('\n').map(l => l.trim()).filter(l => l !== '');
        
        if (linhas.length === 0) return;

        const cabecalho = linhas[0].split(',').map(h => h.trim().replace(/^["']|["']$/g, ''));

        pacientes = [];

        // Percorre as linhas de dados atribuindo o número original fixo (posição no CSV)
        for (let i = 1; i < linhas.length; i++) {
            const valores = linhas[i].split(',').map(v => v.trim().replace(/^["']|["']$/g, ''));
            const pacienteObj = {};

            cabecalho.forEach((coluna, index) => {
                pacienteObj[coluna] = valores[index] !== undefined ? valores[index] : '';
            });

            pacienteObj.numeroOriginal = i; 
            pacientes.push(pacienteObj);
        }

        pacientesFiltrados = [...pacientes];

        renderizarTudo();

    } catch (error) {
        console.error("Erro ao ler o CSV:", error);
    }
}

// Identifica automaticamente as colunas de Nome e ID
function obterNomeEId(paciente) {
    const chaves = Object.keys(paciente);
    
    const chaveNome = chaves.find(k => k.toLowerCase().includes('nome') || k.toLowerCase().includes('name'));
    const chaveId = chaves.find(k => k.toLowerCase() === 'id' || k.toLowerCase().includes('id'));
    
    const nome = chaveNome ? paciente[chaveNome] : (chaves[0] ? paciente[chaves[0]] : 'Paciente');
    const id = chaveId ? paciente[chaveId] : (chaves[1] ? paciente[chaves[1]] : '');
    
    return { nome, id, chaveNome, chaveId };
}

// Renderiza todas as seções
function renderizarTudo() {
    renderizarPrimeiros();
    renderizarTodos();
}

// 1. Preenche a div #primeiros SEMPRE com os 5 primeiros oficiais da lista (base de prioridade)
function renderizarPrimeiros() {
    const divPrimeiros = document.getElementById("primeiros");
    if (!divPrimeiros) return;

    let html = `<h2>Primeiros</h2>`;
    
    // Usa sempre o array original 'pacientes' para garantir que sejam sempre os 5 primeiros reais
    const primeiros5 = pacientes.slice(0, 5);

    if (primeiros5.length === 0) {
        html += `<p class="placeholder">Nenhum paciente cadastrado.</p>`;
        divPrimeiros.innerHTML = html;
        
        const divInfos = document.getElementById("infosPaciente");
        if (divInfos) divInfos.innerHTML = `<h2>Infos do paciente</h2><p class="placeholder">Nenhum paciente selecionado.</p>`;
        return;
    }

    primeiros5.forEach((paciente) => {
        const { nome, id, chaveNome, chaveId } = obterNomeEId(paciente);
        
        let cardHtml = `<div class="paciente-card-clicavel">`;
        cardHtml += `<h3>${paciente.numeroOriginal}. ${nome} - ${id}</h3>`;
        
        let contador = 0;
        for (const [chave, valor] of Object.entries(paciente)) {
            if (chave !== 'numeroOriginal' && chave !== chaveNome && chave !== chaveId && contador < 2) {
                cardHtml += `<p><strong>${chave}:</strong> ${valor}</p>`;
                contador++;
            }
        }
        cardHtml += `</div>`;
        html += cardHtml;
    });

    divPrimeiros.innerHTML = html;

    const cardsClicaveis = divPrimeiros.querySelectorAll(".paciente-card-clicavel");
    cardsClicaveis.forEach((card, index) => {
        card.addEventListener("click", () => {
            exibirDetalhesPaciente(primeiros5[index]);
        });
    });

    if (primeiros5.length > 0) {
        exibirDetalhesPaciente(primeiros5[0]);
    }
}

// 2. Preenche a div #infosPaciente com os dados do paciente selecionado
function exibirDetalhesPaciente(paciente) {
    const divInfos = document.getElementById("infosPaciente");
    if (!divInfos) return;

    const { nome, id } = obterNomeEId(paciente);

    let html = `<h2>Infos do paciente</h2>`;
    html += `<div class="detalhes-conteudo">`;
    html += `<h3>${paciente.numeroOriginal}. ${nome} - ${id}</h3>`;

    for (const [chave, valor] of Object.entries(paciente)) {
        if (chave !== 'numeroOriginal') {
            html += `<p><strong>${chave}:</strong> ${valor}</p>`;
        }
    }
    html += `</div>`;

    divInfos.innerHTML = html;
}

// 3. Preenche a div #todosPacientes (pesquisa afeta apenas esta seção)
function renderizarTodos() {
    const divTodos = document.getElementById("todosPacientes");
    if (!divTodos) return;

    let html = `<h2>Todos</h2>`;
    html += `<input type="text" id="inputBusca" class="input-busca" placeholder="Pesquisar por nome ou ID..." value="${document.getElementById('inputBusca') ? document.getElementById('inputBusca').value : ''}">`;
    html += `<div id="listaTodosContainer">`;

    pacientesFiltrados.forEach((paciente) => {
        const { nome, id, chaveNome, chaveId } = obterNomeEId(paciente);
        
        html += `<div class="paciente-card">`;
        html += `<h3>${paciente.numeroOriginal}. ${nome} - ${id}</h3>`;
        
        for (const [chave, valor] of Object.entries(paciente)) {
            if (chave !== 'numeroOriginal' && chave !== chaveNome && chave !== chaveId) {
                html += `<p><strong>${chave}:</strong> ${valor}</p>`;
            }
        }
        html += `</div>`;
    });

    html += `</div>`;
    divTodos.innerHTML = html;

    const inputBusca = document.getElementById("inputBusca");
    if (inputBusca) {
        inputBusca.addEventListener("input", (e) => {
            const termo = e.target.value.toLowerCase().trim();

            // Filtra apenas a lista de "Todos" sem alterar a seção dos 5 primeiros
            pacientesFiltrados = pacientes.filter(paciente => {
                const { nome, id } = obterNomeEId(paciente);
                return nome.toLowerCase().includes(termo) || String(id).toLowerCase().includes(termo);
            });
            
            const listaContainer = document.getElementById("listaTodosContainer");
            if (listaContainer) {
                let listaHtml = "";
                pacientesFiltrados.forEach((paciente) => {
                    const { nome, id, chaveNome, chaveId } = obterNomeEId(paciente);
                    listaHtml += `<div class="paciente-card">`;
                    listaHtml += `<h3>${paciente.numeroOriginal}. ${nome} - ${id}</h3>`;
                    for (const [chave, valor] of Object.entries(paciente)) {
                        if (chave !== 'numeroOriginal' && chave !== chaveId) {
                            listaHtml += `<p><strong>${chave}:</strong> ${valor}</p>`;
                        }
                    }
                    listaHtml += `</div>`;
                });
                listaContainer.innerHTML = listaHtml;
            }
        });
        
        inputBusca.focus();
    }
}

// Dispara o carregamento do CSV ao iniciar
document.addEventListener("DOMContentLoaded", () => {
    carregarCSV();
});