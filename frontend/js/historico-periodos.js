// kuhaiku/raposopdv/RaposoPDV-769745521c52e0c8dd0eaa6a76ce386c5a6d5e4d/frontend/js/historico-periodos.js
checkAuth();

document.addEventListener('DOMContentLoaded', () => {
    // --- Elementos DOM
    const historicoContainer = document.getElementById('historico-periodos-container');
    const historicoPlaceholder = document.getElementById('historico-placeholder');
    const fecharPeriodoBtn = document.getElementById('fechar-periodo-btn');
    const confirmModal = document.getElementById('confirm-modal');
    const successModal = document.getElementById('success-modal');
    const cancelBtn = document.getElementById('cancel-btn');
    const fecharPeriodoForm = document.getElementById('fechar-periodo-form');
    const okBtn = document.getElementById('ok-btn');
    const successMessageEl = document.getElementById('success-message');

    // --- Funções Auxiliares
    function formatarData(dataISO) {
        if (!dataISO) return 'N/A';
        return new Date(dataISO).toLocaleDateString('pt-BR');
    }
    
    function formatarDataCompleta(dataISO) {
        if (!dataISO) return 'N/A';
        return new Date(dataISO).toLocaleString('pt-BR');
    }

    function formatarMoeda(valor) {
        return parseFloat(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }

    // --- Funções de Dados
    async function carregarHistoricoPeriodos() {
        historicoPlaceholder.classList.remove('hidden');
        historicoContainer.innerHTML = '';
        historicoContainer.appendChild(historicoPlaceholder);

        try {
            const response = await fetchWithAuth('/api/usuarios/historico-periodos');
            if (!response.ok) throw new Error('Erro ao buscar histórico de períodos.');

            const periodos = await response.json();
            
            historicoPlaceholder.classList.add('hidden'); // Esconde o placeholder se houver dados

            if (periodos.length === 0) {
                historicoContainer.innerHTML = '<p class="text-center py-6 text-gray-500 dark:text-gray-400">Nenhum período de vendas foi encerrado ainda.</p>';
                return;
            }

            periodos.forEach(periodo => {
                const details = document.createElement('details');
                details.className = 'flex flex-col rounded-lg bg-white dark:bg-gray-800 shadow-sm group';
                
                // Cabeçalho resumido
                const dataInicio = formatarData(periodo.data_inicio);
                const dataFim = formatarData(periodo.data_fim);
                const faturado = formatarMoeda(periodo.total_faturado);

                details.innerHTML = `
                    <summary class="flex cursor-pointer items-center justify-between gap-6 py-4 px-4 list-none">
                        <p class="text-gray-900 dark:text-gray-100 text-sm font-medium leading-normal">
                           Período: ${dataInicio} - ${dataFim} - Vendas: ${faturado}
                        </p>
                        <span class="material-symbols-outlined text-gray-600 dark:text-gray-400 group-open:rotate-180 transition-transform">expand_more</span>
                    </summary>
                    <div class="border-t border-gray-200 dark:border-gray-700 p-4">
                        <div class="space-y-3">
                            <div class="flex justify-between items-center">
                                <p class="text-gray-600 dark:text-gray-400 text-sm font-medium">Início do Período:</p>
                                <p class="text-gray-900 dark:text-gray-100 text-sm font-bold">${formatarDataCompleta(periodo.data_inicio)}</p>
                            </div>
                            <div class="flex justify-between items-center">
                                <p class="text-gray-600 dark:text-gray-400 text-sm font-medium">Encerramento:</p>
                                <p class="text-gray-900 dark:text-gray-100 text-sm font-bold">${formatarDataCompleta(periodo.data_fim)}</p>
                            </div>
                            <div class="flex justify-between items-center">
                                <p class="text-gray-600 dark:text-gray-400 text-sm font-medium">Número de Vendas:</p>
                                <p class="text-gray-900 dark:text-gray-100 text-sm font-bold">${periodo.numero_vendas}</p>
                            </div>
                            <div class="flex justify-between items-center">
                                <p class="text-gray-600 dark:text-gray-400 text-sm font-medium">Ticket Médio:</p>
                                <p class="text-gray-900 dark:text-gray-100 text-sm font-bold">${formatarMoeda(periodo.ticket_medio)}</p>
                            </div>
                            <div class="flex justify-between items-center">
                                <p class="text-gray-600 dark:text-gray-400 text-sm font-medium">Itens Vendidos:</p>
                                <p class="text-gray-900 dark:text-gray-100 text-sm font-bold">${periodo.itens_vendidos}</p>
                            </div>
                            <div class="flex justify-between items-center pt-3 border-t dark:border-gray-700">
                                <p class="text-gray-900 dark:text-gray-100 text-base font-bold">Comissão Gerada (35%):</p>
                                <p class="text-success text-base font-bold">${formatarMoeda(periodo.comissao_vendedor)}</p>
                            </div>
                        </div>
                    </div>
                `;
                historicoContainer.appendChild(details);
            });
        } catch (error) {
            console.error(error.message);
            historicoPlaceholder.textContent = `Erro ao carregar histórico: ${error.message}`;
        }
    }
    
    // --- LÓGICA DE FECHAMENTO DE PERÍODO
    
    fecharPeriodoBtn.addEventListener('click', () => {
        fecharPeriodoForm.reset();
        confirmModal.classList.remove('hidden');
        confirmModal.classList.add('flex');
    });

    cancelBtn.addEventListener('click', () => {
        confirmModal.classList.add('hidden');
        confirmModal.classList.remove('flex');
    });

    okBtn.addEventListener('click', () => {
        successModal.classList.add('hidden');
        successModal.classList.remove('flex');
    });

    fecharPeriodoForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const senha = document.getElementById('password-confirm').value;
        
        // Desabilita e adiciona spinner
        const confirmButton = fecharPeriodoForm.querySelector('#confirm-btn');
        confirmButton.disabled = true;
        confirmButton.innerHTML = '<div class="spinner mr-2 inline-block"></div> Confirmando...';


        try {
            const response = await fetchWithAuth('/api/usuarios/fechar-periodo', {
                method: 'POST',
                body: JSON.stringify({ senha })
            });
            const data = await response.json();

            if (!response.ok) throw new Error(data.message);

            // Sucesso
            confirmModal.classList.add('hidden');
            confirmModal.classList.remove('flex');
            successMessageEl.textContent = data.message;
            successModal.classList.remove('hidden');
            successModal.classList.add('flex');
            
            carregarHistoricoPeriodos(); // Recarrega a lista de períodos

        } catch (error) {
            alert(error.message);
        } finally {
            // Restaura o botão
            confirmButton.disabled = false;
            confirmButton.innerHTML = '<span class="truncate">Confirmar</span>';
        }
    });

    // --- Inicialização
    carregarHistoricoPeriodos();
});
