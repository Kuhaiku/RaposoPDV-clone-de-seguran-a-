// Garante que checkAuth e fetchWithAuth estão disponíveis (de auth.js)
if (typeof checkAuth !== 'function' || typeof fetchWithAuth !== 'function') {
    console.error("Funções 'checkAuth' ou 'fetchWithAuth' não encontradas.");
} else {
    checkAuth(); // Verifica login
}

document.addEventListener('DOMContentLoaded', () => {

    // --- Seletores DOM ---
    const vendasListContainer = document.getElementById('vendas-list-container');
    const vendasListPlaceholder = document.getElementById('vendas-list-placeholder');
    const searchButton = document.getElementById('search-button'); // Botão de busca no header
    // const searchInput = document.getElementById('search-input'); // Campo de busca (se implementado)

    // --- Filtros ---
    const filtrosForm = document.getElementById('filtros-vendas-form');
    const limparFiltrosBtn = document.getElementById('limpar-filtros-btn');
    const filtroVendedorSelect = document.getElementById('filtro-vendedor');

    // --- Modal Detalhes ---
    const detailsModal = document.getElementById('details-modal');
    const modalVendaIdEl = document.getElementById('modal-venda-id');
    const modalVendaInfoEl = document.getElementById('modal-venda-info');
    const modalItensBody = document.getElementById('modal-itens-body');
    const modalPagamentosList = document.getElementById('modal-pagamentos-list');
    const closeModalBtns = document.querySelectorAll('.close-modal-btn'); // Botões de fechar modal

    // --- Estado ---
    let todasVendas = []; // Armazena todas as vendas carregadas
    let vendedores = []; // Armazena a lista de vendedores

    // --- Funções Auxiliares ---
    const formatCurrency = (value) => { /* ... (igual) ... */
        const number = parseFloat(value) || 0;
        return number.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
     };
    const formatDateTime = (dataISO) => { /* ... (igual) ... */
        if (!dataISO) return 'N/A';
        // Ajuste para formato mais comum DD/MM/AAAA HH:MM
        return new Date(dataISO).toLocaleString('pt-BR', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
     };
     const formatDateShort = (dataISO) => { // Formato DD/MM/AAAA
          if (!dataISO) return 'N/A';
          return new Date(dataISO).toLocaleDateString('pt-BR');
     };
    const openModal = (modalElement) => { /* ... (igual) ... */
        if (modalElement) modalElement.classList.remove('hidden'); // Usa hidden do Tailwind
        document.body.style.overflow = 'hidden';
     };
    const closeModal = (modalElement) => { /* ... (igual) ... */
        if (modalElement) modalElement.classList.add('hidden'); // Usa hidden do Tailwind
        document.body.style.overflow = '';
     };

     // Agrupa vendas por Mês/Ano
     const groupByMonthYear = (vendas) => {
          return vendas.reduce((acc, venda) => {
               const date = new Date(venda.data_venda);
               const month = (date.getMonth() + 1).toString().padStart(2, '0');
               const year = date.getFullYear();
               const key = `${month}/${year}`;
               if (!acc[key]) {
                    acc[key] = { mesAno: key, vendas: [], totalMes: 0 };
               }
               acc[key].vendas.push(venda);
               acc[key].totalMes += parseFloat(venda.valor_total || 0);
               return acc;
          }, {});
     };


    // --- Funções Principais ---

    // Carrega vendedores para o filtro
    async function carregarVendedores() {
        try {
            const response = await fetchWithAuth('/api/usuarios'); // Endpoint que lista usuários/vendedores
            if (!response.ok) throw new Error('Erro ao carregar vendedores.');
            vendedores = await response.json();

            // Limpa opções antigas (exceto a primeira "Todos")
            filtroVendedorSelect.innerHTML = '<option value="">Todos</option>';

            vendedores.forEach(vendedor => {
                const option = document.createElement('option');
                option.value = vendedor.id;
                option.textContent = vendedor.nome;
                filtroVendedorSelect.appendChild(option);
            });
        } catch (error) {
            console.error('Falha ao carregar vendedores:', error);
            // Poderia desabilitar o select ou mostrar mensagem
        }
    }


    // Carrega as vendas da API com base nos filtros
    async function carregarVendas(queryParams = '') {
        vendasListPlaceholder.textContent = 'Carregando histórico...';
        vendasListPlaceholder.classList.remove('hidden');
        vendasListContainer.innerHTML = ''; // Limpa lista

        try {
            const response = await fetchWithAuth(`/api/vendas${queryParams}`);
            if (!response.ok) {
                 const errorData = await response.json().catch(() => ({ message: 'Erro desconhecido' }));
                 throw new Error(errorData.message || `Erro ${response.status}`);
            }
            todasVendas = await response.json();

            renderizarVendasAgrupadas(); // Renderiza a lista agrupada

        } catch (error) {
            console.error('Erro ao carregar vendas:', error);
            vendasListPlaceholder.textContent = `Erro ao carregar histórico: ${error.message}.`;
            vendasListPlaceholder.classList.remove('hidden');
            todasVendas = [];
        }
    }

    // Renderiza a lista de vendas agrupadas por mês/ano
    const renderizarVendasAgrupadas = () => {
        vendasListContainer.innerHTML = ''; // Limpa o container
        vendasListPlaceholder.classList.add('hidden'); // Esconde o placeholder

         // Filtra primeiro pela busca (se implementada)
         // const vendasFiltradasPorBusca = todasVendas.filter(v => ...);
         const vendasFiltradasPorBusca = todasVendas; // Por enquanto, usa todas

        if (vendasFiltradasPorBusca.length === 0) {
            vendasListPlaceholder.textContent = 'Nenhuma venda encontrada para os filtros aplicados.';
            vendasListPlaceholder.classList.remove('hidden');
            return;
        }

        const vendasAgrupadas = groupByMonthYear(vendasFiltradasPorBusca);

        // Ordena os grupos de mês/ano (mais recente primeiro)
        const mesesOrdenados = Object.keys(vendasAgrupadas).sort((a, b) => {
             const [mesA, anoA] = a.split('/');
             const [mesB, anoB] = b.split('/');
             return new Date(anoB, mesB - 1) - new Date(anoA, mesA - 1);
        });


        mesesOrdenados.forEach(mesAno => {
            const grupo = vendasAgrupadas[mesAno];
            const grupoDiv = document.createElement('div');
            grupoDiv.className = 'bg-white dark:bg-zinc-800 rounded-xl shadow-sm border dark:border-zinc-700';

            grupoDiv.innerHTML = `
                <div class="p-4 border-b border-gray-200 dark:border-gray-700">
                    <h2 class="text-base font-semibold text-text-light dark:text-text-dark">${mesAno}</h2>
                    <p class="text-sm text-subtext-light dark:text-subtext-dark">Total: ${formatCurrency(grupo.totalMes)}</p>
                </div>
                <ul class="divide-y divide-gray-200 dark:divide-gray-700">
                    ${grupo.vendas.map(venda => `
                        <li class="p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-zinc-700/50 cursor-pointer venda-item" data-venda-id="${venda.id}">
                            <div class="flex-1 min-w-0 mr-4">
                                <p class="font-medium text-text-light dark:text-text-dark truncate">${venda.cliente_nome || 'Não identificado'}</p>
                                <p class="text-xs text-subtext-light dark:text-subtext-dark">Vendedor: ${venda.usuario_nome || '?'} - ${formatDateTime(venda.data_venda)}</p>
                            </div>
                            <div class="text-right flex-shrink-0">
                                <p class="font-medium text-success dark:text-green-400">${formatCurrency(venda.valor_total)}</p>
                                <button class="btn-cancelar text-xs text-danger hover:underline mt-1" data-venda-id="${venda.id}">Cancelar</button>
                            </div>
                        </li>
                    `).join('')}
                </ul>
            `;
            vendasListContainer.appendChild(grupoDiv);
        });
    };

    // Abre o modal de detalhes da venda
    async function abrirModalDetalhes(vendaId) {
         // Limpa dados anteriores
        modalVendaIdEl.textContent = `#${vendaId}`;
        modalVendaInfoEl.innerHTML = '<p>Carregando...</p>';
        modalItensBody.innerHTML = '<tr><td colspan="4" class="text-center p-4">Carregando...</td></tr>';
        modalPagamentosList.innerHTML = '<p>Carregando...</p>';
        openModal(detailsModal); // Abre o modal

        try {
            const response = await fetchWithAuth(`/api/vendas/${vendaId}`);
            if (!response.ok) throw new Error('Erro ao buscar detalhes da venda.');
            const detalhes = await response.json();

            // Preenche informações básicas
            modalVendaInfoEl.innerHTML = `
                <p class="col-span-2"><strong class="text-zinc-600 dark:text-zinc-400">Cliente:</strong> <span class="text-text-light dark:text-zinc-200">${detalhes.cliente_nome || 'Não identificado'}</span></p>
                <p><strong class="text-zinc-600 dark:text-zinc-400">Vendedor:</strong> <span class="text-text-light dark:text-zinc-200">${detalhes.usuario_nome || 'N/A'}</span></p>
                <p><strong class="text-zinc-600 dark:text-zinc-400">Data:</strong> <span class="text-text-light dark:text-zinc-200">${formatDateTime(detalhes.data_venda)}</span></p>
                <p class="col-span-2 mt-1"><strong class="text-zinc-600 dark:text-zinc-400">Valor Total:</strong> <span class="text-primary font-semibold">${formatCurrency(detalhes.valor_total)}</span></p>
            `;

            // Preenche tabela de itens
            modalItensBody.innerHTML = ''; // Limpa
            if (detalhes.itens && detalhes.itens.length > 0) {
                detalhes.itens.forEach(item => {
                    const subtotal = (item.quantidade || 0) * (item.preco_unitario || 0);
                    const tr = document.createElement('tr');
                    tr.className = 'hover:bg-gray-50 dark:hover:bg-zinc-800';
                    tr.innerHTML = `
                        <td class="px-4 py-2 text-text-light dark:text-zinc-200">${item.produto_nome || '?'}</td>
                        <td class="px-4 py-2 text-center text-text-light dark:text-zinc-300">${item.quantidade || 0}</td>
                        <td class="px-4 py-2 text-right text-text-light dark:text-zinc-300">${formatCurrency(item.preco_unitario)}</td>
                        <td class="px-4 py-2 text-right text-text-light dark:text-zinc-300">${formatCurrency(subtotal)}</td>
                    `;
                    modalItensBody.appendChild(tr);
                });
            } else {
                 modalItensBody.innerHTML = '<tr><td colspan="4" class="text-center p-4 text-zinc-500">Nenhum item encontrado nesta venda.</td></tr>';
            }

             // Preenche lista de pagamentos
             modalPagamentosList.innerHTML = ''; // Limpa
             if (detalhes.pagamentos && detalhes.pagamentos.length > 0) {
                  detalhes.pagamentos.forEach(p => {
                       modalPagamentosList.innerHTML += `<p>- ${p.metodo || '?'}: ${formatCurrency(p.valor)}</p>`;
                  });
             } else {
                  modalPagamentosList.innerHTML = '<p class="text-zinc-500">Nenhuma forma de pagamento registrada.</p>';
             }


        } catch (error) {
            console.error('Erro ao abrir detalhes da venda:', error);
            modalVendaInfoEl.innerHTML = `<p class="text-red-500 col-span-2">Erro ao carregar detalhes: ${error.message}</p>`;
            modalItensBody.innerHTML = '<tr><td colspan="4" class="text-center p-4 text-red-500">Erro ao carregar itens.</td></tr>';
            modalPagamentosList.innerHTML = '<p class="text-red-500">Erro ao carregar pagamentos.</p>';
        }
    }


    // Cancela uma venda
    async function handleCancelClick(vendaId, buttonElement) {
        if (!confirm(`Tem certeza que deseja cancelar a venda #${vendaId}? O estoque dos produtos será revertido.`)) {
            return;
        }

        buttonElement.disabled = true;
        buttonElement.innerHTML = '<div class="spinner spinner-small inline-block"></div>'; // Spinner

        try {
            const response = await fetchWithAuth(`/api/vendas/${vendaId}`, { method: 'DELETE' });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Erro desconhecido ao cancelar.');

            alert(data.message || 'Venda cancelada com sucesso!');
            // Recarrega as vendas COM os filtros atuais
             const formData = new FormData(filtrosForm);
             const params = new URLSearchParams(formData).toString();
             await carregarVendas(params ? `?${params}` : '');

        } catch (error) {
            alert(`Erro ao cancelar venda: ${error.message}`);
            buttonElement.disabled = false;
            buttonElement.textContent = 'Cancelar'; // Restaura botão
        }
    }

    // --- Event Listeners ---

    // Aplicar Filtros
    filtrosForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const formData = new FormData(filtrosForm);
        // Remove campos vazios dos parâmetros
        const params = new URLSearchParams();
         for (const [key, value] of formData.entries()) {
             if (value) { // Só adiciona se tiver valor
                 params.append(key, value);
             }
         }
        carregarVendas(params.toString() ? `?${params.toString()}` : '');
    });

    // Limpar Filtros
    limparFiltrosBtn.addEventListener('click', () => {
        filtrosForm.reset();
        // Garante que o select do vendedor volte para "Todos" visualmente se ele tiver sido resetado
        filtroVendedorSelect.value = "";
        carregarVendas(); // Carrega sem filtros
        // Fecha o <details> se estiver aberto
        const detailsElement = filtrosForm.closest('details');
        if (detailsElement) detailsElement.open = false;
    });

    // Abrir Modal de Detalhes ou Cancelar Venda (Delegação de Eventos)
    vendasListContainer.addEventListener('click', (event) => {
         const vendaItem = event.target.closest('.venda-item');
         const cancelButton = event.target.closest('.btn-cancelar');

         if (cancelButton && vendaItem && vendaItem.dataset.vendaId) {
             event.stopPropagation(); // Impede que o clique no botão abra o modal
             handleCancelClick(vendaItem.dataset.vendaId, cancelButton);
         } else if (vendaItem && vendaItem.dataset.vendaId) {
            abrirModalDetalhes(vendaItem.dataset.vendaId);
         }
    });


    // Fechar Modal (Botões 'X' e 'Fechar')
    closeModalBtns.forEach(button => {
        button.addEventListener('click', () => closeModal(detailsModal));
    });

    // Fechar Modal (Clicando fora)
    detailsModal.addEventListener('click', (event) => {
        if (event.target === detailsModal) {
            closeModal(detailsModal);
        }
    });

    // TODO: Adicionar lógica para o botão de busca no header se necessário

    // --- INICIALIZAÇÃO ---
    carregarVendedores(); // Carrega a lista de vendedores para o filtro
    carregarVendas(); // Carrega as vendas iniciais (sem filtros)

}); // Fim do DOMContentLoaded
