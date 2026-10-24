document.getElementById("formUpload").addEventListener("submit", async (e) => {
    e.preventDefault();

    const btn    = document.getElementById("btnProcessar");
    const status = document.getElementById("status");

    const fila       = document.getElementById("fila_cirurgica").files[0];
    const eventos    = document.getElementById("eventos_clinicos").files[0];
    const procedimentos = document.getElementById("procedimentos").files[0];

    if (!fila || !eventos || !procedimentos) {
        mostrarStatus("Selecione os três arquivos CSV antes de continuar.", "erro");
        return;
    }

    btn.disabled = true;
    mostrarStatus("Processando... isso pode levar alguns segundos.", "carregando");

    const formData = new FormData();
    formData.append("fila_cirurgica", fila);
    formData.append("eventos_clinicos", eventos);
    formData.append("procedimentos", procedimentos);

    try {
        const resp = await fetch("/processar", { method: "POST", body: formData });
        const dados = await resp.json();

        if (!resp.ok) {
            throw new Error(dados.detail || "Erro desconhecido no servidor.");
        }

        mostrarStatus(`Pronto! ${dados.total} pacientes priorizados. Redirecionando...`, "sucesso");
        localStorage.setItem("fila_processada", "1");
        setTimeout(() => { window.location.href = "/dashboard"; }, 1500);

    } catch (err) {
        mostrarStatus(`Erro: ${err.message}`, "erro");
        btn.disabled = false;
    }
});

function mostrarStatus(mensagem, tipo) {
    const el = document.getElementById("status");
    el.textContent = mensagem;
    el.className = `status ${tipo}`;
}
