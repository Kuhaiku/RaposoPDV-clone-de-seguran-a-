checkAuth();

document.addEventListener('DOMContentLoaded', () => {
    // --- ELEMENTOS DO DOM ---
    const logoutBtn = document.getElementById('logout-btn');
    const nomeVendedorHeader = document.getElementById('nome-vendedor-header');
    const filtroPeriodoContainer = document.querySelector('.filtro-periodo');
    const periodoAtualInfo = document.getElementById('periodo-atual-info');
    
    // Elementos de Ações
    const fecharPeriodoBtn = document.getElementById('fechar-periodo-btn'); 
    const verHistoricoBtn = document.getElementById('ver-historico-btn');
    const abrirModalSenhaBtn = document.getElementById('abrir-modal-senha-btn');

    // Modais de Ações
    const modalFecharPeriodo = document.getElementById('modal-fechar-periodo');
    const formFecharPeriodo = document.getElementById('form-fechar-periodo');
    const cancelarFechamentoBtn = document.getElementById('cancelar-fechamento-btn');
    
    const modalAlterarSenha = document.getElementById('modal-alterar-senha');
    const formAlterarSenha = document.getElementById('form-alterar-senha');
    const cancelarAlterarSenhaBtn = document.getElementById('cancelar-alterar-senha-btn');
    const modalSuccessMessageDiv = document.getElementById('modal-success-message');

    // Cards de métricas
    const totalFaturadoEl = document.getElementById('total-faturado');
    const numeroVendasEl = document.getElementById('numero-vendas');
    const ticketMedioEl = document.getElementById('ticket-medio');
    const itensVendidosEl = document.getElementById('itens-vendidos');
    const comissaoVendedorEl = document.getElementById('comissao-vendedor');

    // Listas e Gráfico
    const topProdutosLista = document.getElementById('top-produtos-lista');
    const ultimasVendasBody = document.getElementById('ultimas-vendas-body');
    const graficoCanvas = document.getElementById('grafico-desempenho-diario');
    let graficoVendas = null;

    // --- ESTADO ---
    let periodoAtual = 'periodo_atual'; 

    // --- FUNÇÕES DE RENDERIZAÇÃO ---
    function formatarData(dataISO) {
        if (!dataISO) return 'N/A';
        return new Date(dataISO).toLocaleDateString('pt-BR');
    }

    function formatarMoeda(valor) {
        return parseFloat(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }

    function preencherMetricas(dados) {
        totalFaturadoEl.textContent = formatarMoeda(dados.totalFaturado);
        numeroVendasEl.textContent = dados.numeroVendas;
        ticketMedioEl.textContent = formatarMoeda(dados.ticketMedio);
        itensVendidosEl.textContent = dados.itensVendidos;
        comissaoVendedorEl.textContent = formatarMoeda(dados.comissaoVendedor);
        
        periodoAtualInfo.textContent = `Período: Desde ${formatarData(dados.dataInicioPeriodo)}`;
    }

    function preencherTopProdutos(produtos) {
        topProdutosLista.innerHTML = '';
        if (produtos.length === 0) {
            topProdutosLista.innerHTML = '<li>Nenhuma venda no período.</li>';
            return;
        }
        produtos.forEach(p => {
            const li = document.createElement('li');
            li.innerHTML = `<span>${p.nome}</span><span class="quantidade">${p.totalVendido} un</span>`;
            topProdutosLista.appendChild(li);
        });
    }

    function preencherUltimasVendas(vendas) {
        ultimasVendasBody.innerHTML = '';
        if (vendas.length === 0) {
            ultimasVendasBody.innerHTML = '<tr><td colspan="3">Nenhuma venda registrada.</td></tr>';
            return;
        }
        vendas.forEach(v => {
            const tr = document.createElement('tr');
            const data = new Date(v.data_venda).toLocaleDateString('pt-BR');
            tr.innerHTML = `<td>${data}</td><td>${v.cliente_nome || 'N/A'}</td><td>${formatarMoeda(v.valor_total)}</td>`;
            ultimasVendasBody.appendChild(tr);
        });
    }

    function renderizarGrafico(graficoData) {
        if (graficoVendas) {
            graficoVendas.destroy();
        }
        const ctx = graficoCanvas.getContext('2d');
        const labels = graficoData.map(d => `Dia ${d.dia}`);
        const data = graficoData.map(d => d.total);

        graficoVendas = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: 'Faturamento Diário (R$)',
                    data,
                    backgroundColor: 'rgba(52, 152, 219, 0.6)',
                    borderColor: 'rgba(52, 152, 219, 1)',
                    borderRadius: 5,
                    borderWidth: 1,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: { y: { beginAtZero: true } },
                plugins: { legend: { display: false } }
            }
        });
    }

    // --- FUNÇÕES DE DADOS ---
    async function carregarDadosPerfil() {
        try {
            const queryParam = periodoAtual !== 'periodo_atual' ? `?periodo=${periodoAtual}` : '';
            
            const response = await fetchWithAuth(`/api/usuarios/meu-perfil${queryParam}`);
            if (!response.ok) throw new Error('Erro ao buscar dados do perfil.');
            const dados = await response.json();

            if(dados.nomeVendedor) {
                nomeVendedorHeader.textContent = `Bem-vindo(a), ${dados.nomeVendedor}!`;
            }

            preencherMetricas(dados);
            preencherTopProdutos(dados.topProdutos);
            preencherUltimasVendas(dados.ultimasVendas);
            renderizarGrafico(dados.graficoData);

        } catch (error) {
            console.error(error);
            alert('Não foi possível carregar os dados do seu perfil.');
        }
    }

    // --- LÓGICA DO FECHAMENTO DE PERÍODO (MODAL) ---
    fecharPeriodoBtn.addEventListener('click', () => {
        modalFecharPeriodo.style.display = 'flex';
        document.getElementById('senha-fechamento').value = '';
    });

    cancelarFechamentoBtn.addEventListener('click', () => {
        modalFecharPeriodo.style.display = 'none';
        formFecharPeriodo.reset();
    });

    formFecharPeriodo.addEventListener('submit', async (event) => {
        event.preventDefault();
        const senha = document.getElementById('senha-fechamento').value;

        try {
            const response = await fetchWithAuth('/api/usuarios/fechar-periodo', {
                method: 'POST',
                body: JSON.stringify({ senha })
            });
            const data = await response.json();

            if (!response.ok) throw new Error(data.message);

            alert(data.message);
            modalFecharPeriodo.style.display = 'none';
            carregarDadosPerfil(); 

        } catch (error) {
            alert(error.message);
        }
    });
    
    // --- LÓGICA DE ALTERAÇÃO DE SENHA (MODAL) ---
    abrirModalSenhaBtn.addEventListener('click', () => {
        modalAlterarSenha.style.display = 'flex';
        modalSuccessMessageDiv.textContent = '';
        formAlterarSenha.reset();
    });

    cancelarAlterarSenhaBtn.addEventListener('click', () => {
        modalAlterarSenha.style.display = 'none';
        formAlterarSenha.reset();
    });

    formAlterarSenha.addEventListener('submit', async (event) => {
        event.preventDefault();
        modalSuccessMessageDiv.textContent = '';
        
        const senhaAtual = document.getElementById('modal-senha-atual').value;
        const novaSenha = document.getElementById('modal-nova-senha').value;

        try {
            const response = await fetchWithAuth('/api/usuarios/redefinir-senha-propria', {
                method: 'PUT',
                body: JSON.stringify({ senhaAtual, novaSenha })
            });
            const data = await response.json();

            if (!response.ok) throw new Error(data.message);

            formAlterarSenha.reset();
            modalSuccessMessageDiv.textContent = data.message + " Você será deslogado por segurança.";
            
            setTimeout(() => { logout(); }, 3000);

        } catch (error) {
            alert(error.message);
        }
    });

    // --- EVENT LISTENERS GERAIS ---
    logoutBtn.addEventListener('click', logout);

    verHistoricoBtn.addEventListener('click', () => {
        window.location.href = 'historico-periodos.html';
    });

    filtroPeriodoContainer.addEventListener('click', (event) => {
        if (event.target.tagName === 'BUTTON') {
            document.querySelectorAll('.btn-periodo').forEach(btn => btn.classList.remove('active'));
            event.target.classList.add('active');
            periodoAtual = event.target.dataset.periodo;
            carregarDadosPerfil();
        }
    });

    // Fecha modais ao clicar fora
    modalFecharPeriodo.addEventListener('click', (event) => {
        if (event.target === modalFecharPeriodo) {
            modalFecharPeriodo.style.display = 'none';
            formFecharPeriodo.reset();
        }
    });
    
    modalAlterarSenha.addEventListener('click', (event) => {
        if (event.target === modalAlterarSenha) {
            modalAlterarSenha.style.display = 'none';
            formAlterarSenha.reset();
        }
    });

    // --- INICIALIZAÇÃO ---
    function inicializar() {
        nomeVendedorHeader.textContent = 'Meu Perfil';
        document.querySelector('[data-periodo="periodo_atual"]').classList.add('active'); 
        carregarDadosPerfil();
    }

    inicializar();
});
