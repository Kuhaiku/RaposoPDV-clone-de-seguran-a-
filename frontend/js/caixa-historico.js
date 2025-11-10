checkAuth();

const logoutBtn = document.getElementById('logout-btn');
const historicoTableBody = document.getElementById('historico-caixa-body');
const selectAno = document.getElementById('select-ano');
const detailsModal = document.getElementById('details-modal');
const closeModalBtn = document.getElementById('close-modal-btn');
let graficoAnual = null;

logoutBtn.addEventListener('click', logout);

function formatarData(dataISO) {
    if (!dataISO) return 'N/A';
    return new Date(dataISO).toLocaleString('pt-BR');
}

async function carregarHistoricoDetalhado() {
    try {
        const response = await fetchWithAuth('/api/caixa/fechados');
        if (!response.ok) throw new Error('Erro ao buscar histórico de caixas.');
        const historico = await response.json();
        historicoTableBody.innerHTML = '';
        if (historico.length === 0) {
            historicoTableBody.innerHTML = '<tr><td colspan="7">Nenhum caixa fechado encontrado.</td></tr>';
            return;
        }
        historico.forEach(caixa => {
            const tr = document.createElement('tr');
            tr.dataset.caixaId = caixa.id; // Adiciona o ID para o clique
            tr.innerHTML = `
                
                <td>${formatarData(caixa.data_abertura)}</td>
                <td>R$ ${parseFloat(caixa.valor_inicial).toFixed(2)}</td>
                <td>${formatarData(caixa.data_fechamento)}</td>
                <td>R$ ${parseFloat(caixa.valor_final_apurado).toFixed(2)}</td>
                <td>${caixa.usuario_abertura_nome}</td>
                <td>${caixa.usuario_fechamento_nome}</td>
            `;
            historicoTableBody.appendChild(tr);
        });
    } catch (error) {
        console.error(error);
        alert('Não foi possível carregar o histórico detalhado.');
    }
}

async function carregarAnos() {
    try {
        const response = await fetchWithAuth('/api/caixa/anos');
        if (!response.ok) throw new Error('Erro ao buscar anos.');
        const anos = await response.json();
        selectAno.innerHTML = '';
        anos.forEach(ano => {
            const option = document.createElement('option');
            option.value = ano;
            option.textContent = ano;
            selectAno.appendChild(option);
        });
        if (anos.length > 0) {
            carregarDadosGrafico(anos[0]);
        }
    } catch (error) {
        console.error(error);
    }
}

async function carregarDadosGrafico(ano) {
    try {
        const response = await fetchWithAuth(`/api/caixa/historico-anual?ano=${ano}`);
        if (!response.ok) throw new Error('Erro ao buscar dados do gráfico.');
        const dadosMensais = await response.json();
        const labels = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
        const data = Array(12).fill(0);
        dadosMensais.forEach(item => {
            data[item.mes - 1] = item.total_apurado;
        });
        renderizarGrafico(labels, data);
    } catch (error) {
        console.error(error);
    }
}

function renderizarGrafico(labels, data) {
    const ctx = document.getElementById('grafico-anual-caixa').getContext('2d');
    if (graficoAnual) {
        graficoAnual.destroy();
    }
    graficoAnual = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: `Total Apurado por Mês (R$)`,
                data: data,
                backgroundColor: 'rgba(52, 152, 219, 0.5)',
                borderColor: 'rgba(52, 152, 219, 1)',
                borderWidth: 1
            }]
        },
        options: { scales: { y: { beginAtZero: true } }, responsive: true, maintainAspectRatio: false }
    });
}

async function abrirModalDetalhes(caixaId) {
    try {
        const response = await fetchWithAuth(`/api/caixa/${caixaId}`);
        if (!response.ok) throw new Error('Erro ao buscar detalhes do caixa.');
        const caixa = await response.json();
        document.getElementById('modal-caixa-id').textContent = `#${caixa.id}`;
        document.getElementById('modal-caixa-info').innerHTML = `
            <p><strong>Data de Abertura:</strong> ${formatarData(caixa.data_abertura)} por <strong>${caixa.usuario_abertura_nome}</strong></p>
            <p><strong>Valor Inicial:</strong> R$ ${parseFloat(caixa.valor_inicial).toFixed(2)}</p>
            <hr>
            <p><strong>Data de Fechamento:</strong> ${formatarData(caixa.data_fechamento)} por <strong>${caixa.usuario_fechamento_nome}</strong></p>
            <p><strong>Valor Final Apurado:</strong> R$ ${parseFloat(caixa.valor_final_apurado).toFixed(2)}</p>
            <hr>
            <p><strong>Observações:</strong></p>
            <p style="white-space: pre-wrap;">${caixa.observacoes || 'Nenhuma observação registrada.'}</p>
        `;
        detailsModal.style.display = 'flex';
    } catch (error) {
        alert(error.message);
    }
}

historicoTableBody.addEventListener('click', (event) => {
    const tr = event.target.closest('tr');
    if (tr && tr.dataset.caixaId) {
        abrirModalDetalhes(tr.dataset.caixaId);
    }
});
closeModalBtn.addEventListener('click', () => { detailsModal.style.display = 'none'; });
detailsModal.addEventListener('click', (event) => {
    if (event.target === detailsModal) detailsModal.style.display = 'none';
});
selectAno.addEventListener('change', () => carregarDadosGrafico(selectAno.value));
document.addEventListener('DOMContentLoaded', () => {
    carregarHistoricoDetalhado();
    carregarAnos();
});