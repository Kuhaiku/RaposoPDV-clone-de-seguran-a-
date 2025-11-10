checkAuth();

// Elementos Globais
const logoutBtn = document.getElementById('logout-btn');
const actionCard = document.getElementById('caixa-action-card');

// --- TEMPLATES HTML (AGORA SEM O BOTÃO DE HISTÓRICO) ---
const templateCaixaFechado = `
    <div class="status-indicator status-fechado">Caixa Fechado</div>
    <h2>Abrir Caixa</h2>
    <p>Insira o valor inicial de troco para começar o dia.</p>
    <form id="abrir-caixa-form" class="caixa-form">
        <div class="input-group">
            <label for="valor_inicial">Valor Inicial (Troco)</label>
            <input type="number" step="0.01" id="valor_inicial" placeholder="Ex: 150.00" required>
        </div>
        <button type="submit" class="btn">Abrir Caixa</button>
    </form>
`;
const templateCaixaAberto = `
    <div class="status-indicator status-aberto">Caixa Aberto</div>
    <h2>Fechar Caixa</h2>
    <p>Para encerrar as operações, preencha os campos abaixo.</p>
    <form id="fechar-caixa-form" class="caixa-form">
        <div class="input-group">
            <label for="valor_final_apurado">Valor Final Apurado</label>
            <input type="number" step="0.01" id="valor_final_apurado" style="margin-bottom: 15px" required>
        </div>
        <div class="input-group">
            <label for="observacoes">Observações</label>
            <textarea style="margin-bottom: 15px;" id="observacoes" rows="3"></textarea>
        </div>
        <button type="submit" class="btn" style="background-color: var(--error-color);">Fechar Caixa</button>
    </form>
`;

// --- O RESTANTE DO CÓDIGO PERMANECE O MESMO ---

async function verificarStatusCaixa() {
    try {
        const response = await fetchWithAuth('/api/caixa/status');
        const data = await response.json();
        if (data.status === 'aberto') {
            actionCard.innerHTML = templateCaixaAberto;
            document.getElementById('fechar-caixa-form').addEventListener('submit', handleFecharCaixa);
        } else {
            actionCard.innerHTML = templateCaixaFechado;
            document.getElementById('abrir-caixa-form').addEventListener('submit', handleAbrirCaixa);
        }
    } catch (error) {
        actionCard.innerHTML = '<p>Erro ao carregar status do caixa.</p>';
    }
}

async function carregarGraficoHistorico() {
    try {
        Chart.register(ChartDataLabels);
        const response = await fetchWithAuth('/api/caixa/grafico-historico');
        const data = await response.json();
        const ctx = document.getElementById('grafico-historico-caixa').getContext('2d');
        const labels = data.map(item => item.dia);
        const valores = data.map(item => item.valor_total_dia);
        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Valor Final Apurado (R$)',
                    data: valores,
                    backgroundColor: 'rgba(52, 152, 219, 0.6)',
                    borderColor: 'rgba(52, 152, 219, 1)',
                    borderRadius: 5,
                    borderWidth: 1,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { callback: function(value) { if (value >= 1000) { return 'R$ ' + value / 1000 + 'k'; } return 'R$ ' + value; } }
                    },
                    x: { grid: { display: false } }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) { label += ': '; }
                                if (context.parsed.y !== null) { label += new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(context.parsed.y); }
                                return label;
                            }
                        }
                    },
                    datalabels: {
                        anchor: 'end',
                        align: 'end',
                        color: '#555',
                        font: { weight: 'bold' },
                        formatter: function(value, context) {
                            if (value >= 1000) { return 'R$' + (value / 1000).toFixed(1).replace('.',',') + 'k'; }
                            return 'R$' + value;
                        }
                    }
                }
            }
        });
    } catch (error) {
        console.error("Erro ao carregar gráfico:", error);
    }
}

async function handleAbrirCaixa(event) {
    event.preventDefault();
    const valor_inicial = document.getElementById('valor_inicial').value;
    if (!valor_inicial) return alert('Por favor, insira um valor inicial.');
    try {
        const response = await fetchWithAuth('/api/caixa/abrir', { method: 'POST', body: JSON.stringify({ valor_inicial: parseFloat(valor_inicial) }) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message);
        alert('Caixa aberto com sucesso!');
        verificarStatusCaixa();
    } catch (error) {
        alert(error.message);
    }
}

async function handleFecharCaixa(event) {
    event.preventDefault();
    const valor_final_apurado = document.getElementById('valor_final_apurado').value;
    const observacoes = document.getElementById('observacoes').value;
    if (!valor_final_apurado) return alert('Por favor, insira o valor final apurado.');
    if (!confirm('Tem certeza que deseja fechar o caixa?')) return;
    try {
        const response = await fetchWithAuth('/api/caixa/fechar', { method: 'POST', body: JSON.stringify({ valor_final_apurado: parseFloat(valor_final_apurado), observacoes }) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message);
        alert('Caixa fechado com sucesso!');
        verificarStatusCaixa();
        carregarGraficoHistorico();
    } catch (error) {
        alert(error.message);
    }
}

logoutBtn.addEventListener('click', logout);
document.addEventListener('DOMContentLoaded', () => {
    verificarStatusCaixa();
    carregarGraficoHistorico();
});