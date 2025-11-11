// Garante que checkAuth e fetchWithAuth estão disponíveis (de auth.js)
if (typeof checkAuth !== 'function' || typeof fetchWithAuth !== 'function') {
    console.error("Funções 'checkAuth' ou 'fetchWithAuth' não encontradas. Verifique se auth.js foi carregado corretamente.");
} else {
    checkAuth(); // Verifica se o usuário está logado
}

document.addEventListener('DOMContentLoaded', () => {

    // --- Seletores de Elementos DOM ---
    const clientListContainer = document.getElementById('client-list-container');
    const clientListPlaceholder = document.getElementById('client-list-placeholder');
    const searchInput = document.getElementById('search-client-input');
    const addClientButton = document.getElementById('add-client-button');

    // --- Modal Adicionar Cliente ---
    const addClientModal = document.getElementById('add-client-modal');
    const addClientForm = document.getElementById('add-client-form');
    const addClientMessage = document.getElementById('add-client-message');

    // --- Botões comuns de fechar modal ---
    const closeModalButtons = document.querySelectorAll('.close-modal-btn');

    // --- Estado ---
    let todosClientes = [];
    let termoBusca = '';
    let clientesVisiveis = [];

    // --- Funções Auxiliares ---
    const showModalMessage = (element, message, isError = false) => { /* ... (igual) ... */
        if (!element) return;
        element.textContent = message;
        element.classList.remove('hidden', 'text-green-600', 'text-red-600');
        element.classList.add(isError ? 'text-red-600' : 'text-green-600');
     };
    const clearModalMessage = (element) => { /* ... (igual) ... */
        if (!element) return;
        element.textContent = '';
        element.classList.add('hidden');
     };
    const openModal = (modalElement) => { /* ... (igual) ... */
        if (modalElement) modalElement.classList.add('is-open');
        document.body.style.overflow = 'hidden';
    };
    const closeModal = (modalElement) => { /* ... (igual) ... */
        if (modalElement) modalElement.classList.remove('is-open');
        document.body.style.overflow = '';
        if (addClientMessage) clearModalMessage(addClientMessage);
    };

    // --- Funções Principais ---

    // Carrega TODOS os clientes da API
    const carregarTodosClientes = async () => { /* ... (igual) ... */
        clientListPlaceholder.textContent = 'Carregando clientes...';
        clientListPlaceholder.classList.remove('hidden');
        clientListContainer.innerHTML = '';

        try {
            const response = await fetchWithAuth('/api/clientes');
            if (!response.ok) {
                 const errorData = await response.json().catch(() => ({ message: 'Erro desconhecido.' }));
                 throw new Error(errorData.message || `Erro ${response.status}`);
            }
            todosClientes = await response.json();
            todosClientes.sort((a, b) => a.nome.localeCompare(b.nome));
            renderizarClientes();

        } catch (error) {
            console.error('Erro ao carregar clientes:', error);
            clientListPlaceholder.textContent = `Erro: ${error.message}. Tente novamente.`;
            clientListPlaceholder.classList.remove('hidden');
            todosClientes = [];
        }
    };

    // Renderiza a lista de clientes (APENAS LINK PARA DETALHES)
    const renderizarClientes = () => {
        clientListContainer.innerHTML = '';
        clientListPlaceholder.classList.add('hidden');

        clientesVisiveis = todosClientes.filter(cliente => {
            const nomeMatch = cliente.nome.toLowerCase().includes(termoBusca);
            // MODIFICAÇÃO: Verifica se cliente.telefone existe antes de chamar .toLowerCase()
            const telMatch = cliente.telefone && cliente.telefone.toLowerCase().includes(termoBusca);
            return nomeMatch || telMatch;
        });

        if (clientesVisiveis.length === 0) {
            clientListPlaceholder.textContent = `Nenhum cliente encontrado ${termoBusca ? 'para "' + termoBusca + '"' : ''}.`;
            clientListPlaceholder.classList.remove('hidden');
            return;
        }

        clientesVisiveis.forEach(cliente => {
            const card = document.createElement('div');
            // Remove 'client-card' se não for mais usada para estilização específica
            card.className = 'bg-white dark:bg-zinc-800 rounded-lg shadow-sm overflow-hidden border border-gray-200 dark:border-gray-700';
            card.dataset.clientId = cliente.id; // Adiciona ID para navegação

            // Cria o link para a página de detalhes
            const linkDetalhes = document.createElement('a');
            linkDetalhes.href = `cliente-detalhes.html?id=${cliente.id}`;
            linkDetalhes.className = 'block p-4 hover:bg-gray-50 dark:hover:bg-zinc-700 transition-colors'; // Estilo do link clicável

            linkDetalhes.innerHTML = `
                <div class="flex justify-between items-center">
                    <div>
                        <h2 class="text-base font-semibold text-text-light dark:text-text-dark truncate" title="${cliente.nome}">${cliente.nome}</h2>
                         ${cliente.telefone ? `<p class="text-sm text-subtext-light dark:text-subtext-dark">Tel: ${cliente.telefone}</p>` : ''}
                         </div>
                    <span class="material-symbols-outlined text-primary">chevron_right</span>
                </div>
            `;
            card.appendChild(linkDetalhes); // Adiciona o link ao card
            clientListContainer.appendChild(card); // Adiciona o card ao container
        });
    };

    // --- Tratamento de Eventos ---

    // Busca
    searchInput.addEventListener('input', () => { /* ... (igual) ... */
        clearTimeout(searchInput.timer);
        searchInput.timer = setTimeout(() => {
            termoBusca = searchInput.value.toLowerCase();
            renderizarClientes();
        }, 300);
    });

    // Abrir Modal Adicionar Cliente
    addClientButton.addEventListener('click', () => { /* ... (igual) ... */
        addClientForm.reset();
        clearModalMessage(addClientMessage);
        openModal(addClientModal);
    });

    // Fechar Modais (botões 'X' e 'Cancelar')
    closeModalButtons.forEach(button => { /* ... (igual) ... */
        button.addEventListener('click', () => {
            const modal = button.closest('.modal');
            if (modal) closeModal(modal);
        });
    });

     // Fechar Modais (clicando fora)
     [addClientModal].forEach(modal => { // Remove editClientModal daqui
          if (modal) {
               modal.addEventListener('click', (event) => {
                    if (event.target === modal) closeModal(modal);
               });
          }
     });

    // Submeter Formulário Adicionar Cliente
    addClientForm.addEventListener('submit', async (event) => { /* ... (igual) ... */
        event.preventDefault();
        clearModalMessage(addClientMessage);
        const submitButton = addClientModal.querySelector('button[type="submit"]');
        if (!submitButton) return;

        submitButton.disabled = true;
        submitButton.innerHTML = `<div class="spinner mr-2 inline-block"></div> Salvando...`;

        const formData = new FormData(addClientForm);
        const novoCliente = Object.fromEntries(formData.entries());

        // ***** MODIFICAÇÃO AQUI *****
        // Apenas o nome é obrigatório
        if (!novoCliente.nome) {
             showModalMessage(addClientMessage, "O campo Nome é obrigatório.", true);
             submitButton.disabled = false;
             submitButton.textContent = 'Salvar Cliente';
             return;
         }
         // ***** FIM DA MODIFICAÇÃO *****

        try {
            const response = await fetchWithAuth('/api/clientes', { method: 'POST', body: JSON.stringify(novoCliente) });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Erro ao salvar.');

            showModalMessage(addClientMessage, 'Cliente salvo com sucesso!');
            await carregarTodosClientes();

            setTimeout(() => { closeModal(addClientModal); }, 1500);

        } catch (error) {
            console.error("Erro ao adicionar:", error);
            showModalMessage(addClientMessage, `Erro: ${error.message}`, true);
        } finally {
            if (submitButton) {
                submitButton.disabled = false;
                submitButton.textContent = 'Salvar Cliente';
            }
        }
    });

    // --- Inicialização ---
    carregarTodosClientes();

}); // Fim do DOMContentLoaded
