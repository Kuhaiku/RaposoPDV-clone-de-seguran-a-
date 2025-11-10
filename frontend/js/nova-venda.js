checkAuth(); // Verifica autenticação do funcionário

document.addEventListener('DOMContentLoaded', () => {
    // --- ELEMENTOS DO DOM ---
    const logoutBtn = document.getElementById('logout-btn');
    // Cliente
    const clienteDisplayContainer = document.getElementById('cliente-display-container');
    const clienteDisplayNameInput = document.getElementById('cliente-display-name');
    const selectedClienteIdInput = document.getElementById('selected-cliente-id');
    const removerClienteBtn = document.getElementById('remover-cliente-btn');
    const btnNovoCliente = document.getElementById('btn-novo-cliente');
    // Modal Cliente
    const clientModal = document.getElementById('client-modal');
    const inputFiltroClienteModal = document.getElementById('input-filtro-cliente-modal');
    const listaClientesModalEl = document.getElementById('lista-clientes-modal');
    // Produtos
    const btnAbrirBuscaProduto = document.getElementById('btn-abrir-busca-produto');
    const carrinhoItensEl = document.getElementById('carrinho-itens');
    // Modal Produto
    const productModal = document.getElementById('product-modal');
    const inputBuscaProdutoModal = document.getElementById('input-busca-produto-modal');
    const listaProdutosModalEl = document.getElementById('lista-produtos-modal');
    // Pagamento e Total
    const subtotalVendaEl = document.getElementById('subtotal-venda');
    const vendaTotalEl = document.getElementById('venda-total');
    const finalizarVendaBtn = document.getElementById('finalizar-venda-btn');
    const metodosPagamentoContainer = document.getElementById('metodos-pagamento-container');
    const valoresParciaisContainer = document.getElementById('valores-parciais-container');
    // Modal Novo Cliente
    const modalNovoCliente = document.getElementById('modal-novo-cliente');
    const formNovoCliente = document.getElementById('form-novo-cliente');
    const btnCancelarNovoCliente = document.getElementById('btn-cancelar-novo-cliente');


    // --- ESTADO DA APLICAÇÃO ---
    let produtosDisponiveis = [];
    let todosClientes = [];
    let carrinho = [];
    let dadosEmpresa = {};
    let totalVenda = 0;

    // --- FUNÇÕES DE LÓGICA E RENDERIZAÇÃO ---

    // Carrega clientes (para busca no modal)
    async function carregarClientes() {
        try {
            const clientesRes = await fetchWithAuth('/api/clientes');
            if (!clientesRes.ok) throw new Error('Falha ao carregar clientes');
            todosClientes = await clientesRes.json();
            renderizarClientesModal(todosClientes); // Renderiza todos inicialmente no modal
        } catch (error) {
            console.error('Erro ao carregar clientes:', error);
            listaClientesModalEl.innerHTML = '<p class="text-red-500 p-4">Erro ao carregar clientes.</p>';
        }
    }

    // Renderiza clientes no MODAL de busca
    function renderizarClientesModal(clientes) {
        listaClientesModalEl.innerHTML = '';
        const termoBusca = inputFiltroClienteModal.value.toLowerCase();

        const clientesFiltrados = clientes.filter(c => c.nome.toLowerCase().includes(termoBusca));

        if (clientesFiltrados.length === 0) {
            listaClientesModalEl.innerHTML = '<p class="text-zinc-500 p-4">Nenhum cliente encontrado.</p>';
            return;
        }

        clientesFiltrados.forEach(cliente => {
            const div = document.createElement('div');
            div.className = 'p-3 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-700 cursor-pointer cliente-selecao-modal';
            div.dataset.clienteId = cliente.id; // Corrigido para clienteId
            div.innerHTML = `
                <p class="font-medium text-secondary dark:text-zinc-100">${cliente.nome}</p>
                <p class="text-sm text-zinc-500 dark:text-zinc-400">Tel: ${cliente.telefone || 'N/A'}</p>
            `;
            // Adiciona evento de clique para selecionar o cliente
            div.addEventListener('click', () => selecionarCliente(cliente));
            listaClientesModalEl.appendChild(div);
        });
    }


    // Seleciona um cliente do modal
    function selecionarCliente(cliente) {
        selectedClienteIdInput.value = cliente.id;
        clienteDisplayNameInput.value = cliente.nome; // Atualiza o input principal
        removerClienteBtn.classList.remove('hidden'); // Mostra o botão de remover
        clientModal.classList.remove('is-open'); // Fecha o modal
    }

    // Remove o cliente selecionado
    function removerClienteSelecionado() {
        selectedClienteIdInput.value = '';
        clienteDisplayNameInput.value = ''; // Limpa o input principal
        clienteDisplayNameInput.placeholder = "Selecionar cliente..."; // Volta placeholder
        removerClienteBtn.classList.add('hidden'); // Esconde o botão de remover
    }

    // Carrega produtos disponíveis (para o modal)
    async function carregarProdutosDisponiveis() {
        try {
            const produtosRes = await fetchWithAuth('/api/produtos');
            if (!produtosRes.ok) throw new Error('Falha ao carregar produtos');
            produtosDisponiveis = await produtosRes.json();
            renderizarProdutosModal(produtosDisponiveis); // Renderiza todos inicialmente no modal de produtos
        } catch (error) {
            console.error('Erro ao carregar produtos:', error);
            listaProdutosModalEl.innerHTML = '<p class="text-red-500 p-4">Erro ao carregar produtos.</p>';
        }
    }

    // Renderiza produtos no MODAL de busca de produtos
    function renderizarProdutosModal(produtos) {
        listaProdutosModalEl.innerHTML = '';
        const termoBusca = inputBuscaProdutoModal.value.toLowerCase();

        const produtosFiltrados = produtos.filter(p =>
            p.nome.toLowerCase().includes(termoBusca) ||
            (p.codigo && p.codigo.toLowerCase().includes(termoBusca))
        );

        if (produtosFiltrados.length === 0) {
            listaProdutosModalEl.innerHTML = '<p class="text-zinc-500 p-4">Nenhum produto encontrado.</p>';
            return;
        }

        produtosFiltrados.forEach(produto => {
            const itemNoCarrinho = carrinho.find(item => item.id === produto.id);
            const quantidadeNoCarrinho = itemNoCarrinho ? itemNoCarrinho.quantidade : 0;
            const produtoOriginal = produtosDisponiveis.find(p => p.id === produto.id); // Busca o original para estoque total
            const estoqueOriginal = produtoOriginal ? produtoOriginal.estoque : 0;
            const estoqueDisponivel = estoqueOriginal - quantidadeNoCarrinho;


            if (estoqueDisponivel > 0) {
                 const div = document.createElement('div');
                 div.className = 'bg-white dark:bg-zinc-900 p-3 rounded-xl flex items-center gap-3 shadow-sm produto-selecao-modal cursor-pointer hover:ring-2 hover:ring-primary/50';
                 div.dataset.produtoId = produto.id;
                 div.innerHTML = `
                      <img class="w-14 h-14 rounded-lg object-cover flex-shrink-0" src="${produto.foto_url || 'img/placeholder.png'}" alt="${produto.nome}"/>
                      <div class="flex-1 min-w-0">
                           <p class="font-semibold text-secondary dark:text-zinc-100 truncate">${produto.nome}</p>
                           <p class="text-sm text-zinc-500 dark:text-zinc-400">R$ ${parseFloat(produto.preco).toFixed(2)}</p>
                           <p class="text-xs text-zinc-400">Estoque Disp.: ${estoqueDisponivel}</p>
                      </div>
                      <span class="material-symbols-outlined text-primary add-produto-modal-btn">add_circle</span>
                 `;
                 div.addEventListener('click', () => adicionarAoCarrinho(produto.id));
                 listaProdutosModalEl.appendChild(div);
            }
        });
    }

    // Renderiza os itens no carrinho (na tela principal)
    function renderizarCarrinho() {
        carrinhoItensEl.innerHTML = '';
        totalVenda = 0;
        const carrinhoVazioEl = document.querySelector('.carrinho-vazio'); // Busca pelo seletor agora

        if (carrinho.length === 0) {
             // Se o elemento de vazio não existe E o carrinho está vazio, adiciona a mensagem
             if (!carrinhoVazioEl) {
                  carrinhoItensEl.innerHTML = '<p class="text-zinc-500 dark:text-zinc-400 text-center py-4 carrinho-vazio">Nenhum produto adicionado.</p>';
             }
             finalizarVendaBtn.disabled = true;
        } else {
             // Se o elemento de vazio existe E o carrinho NÃO está vazio, remove a mensagem
             if (carrinhoVazioEl) carrinhoVazioEl.remove();
             finalizarVendaBtn.disabled = false;

            carrinho.forEach(item => {
                const itemEl = document.createElement('div');
                itemEl.className = 'bg-white dark:bg-zinc-900 p-3 rounded-xl flex items-center gap-3 shadow-sm carrinho-item';
                itemEl.dataset.produtoId = item.id;
                const subtotal = item.preco * item.quantidade;
                totalVenda += subtotal;
                const produtoOriginal = produtosDisponiveis.find(p => p.id === item.id);
                const estoqueOriginal = produtoOriginal ? produtoOriginal.estoque : 0;
                const isEstoqueMaximo = item.quantidade >= estoqueOriginal;

                itemEl.innerHTML = `
                    <img class="w-14 h-14 rounded-lg object-cover flex-shrink-0" src="${item.foto_url || 'img/placeholder.png'}" alt="${item.nome}"/>
                    <div class="flex-1 min-w-0">
                        <p class="font-semibold text-secondary dark:text-zinc-100 truncate">${item.nome}</p>
                        <p class="text-sm text-zinc-500 dark:text-zinc-400">R$ ${parseFloat(item.preco).toFixed(2)}</p>
                    </div>
                    <div class="flex items-center gap-2 flex-shrink-0">
                        <button class="w-7 h-7 rounded-full bg-zinc-100 dark:bg-zinc-800 text-secondary dark:text-zinc-300 flex items-center justify-center hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors btn-qty-change" data-change="-1">-</button>
                        <span class="w-6 text-center font-bold text-secondary dark:text-white">${item.quantidade}</span>
                        <button class="w-7 h-7 rounded-full bg-zinc-100 dark:bg-zinc-800 text-secondary dark:text-zinc-300 flex items-center justify-center hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors btn-qty-change" data-change="1" ${isEstoqueMaximo ? 'disabled' : ''}>+</button>
                    </div>
                    <button class="text-red-500 hover:text-red-700 transition-colors flex-shrink-0 btn-remover-item">
                        <span class="material-symbols-outlined text-xl">delete</span>
                    </button>
                `;
                carrinhoItensEl.appendChild(itemEl);
            });
        }
        subtotalVendaEl.textContent = `R$ ${totalVenda.toFixed(2)}`;
        vendaTotalEl.textContent = `R$ ${totalVenda.toFixed(2)}`;
        renderizarPagamentos();
        renderizarProdutosModal(produtosDisponiveis); // Atualiza modal de produtos
    }

    // Renderiza inputs de pagamento parcial se necessário
    function renderizarPagamentos() {
        const checkboxesPagamento = metodosPagamentoContainer.querySelectorAll('input[name="pagamento"]:checked');
        valoresParciaisContainer.innerHTML = '';

        metodosPagamentoContainer.querySelectorAll('.payment-button').forEach(label => {
            const input = label.querySelector('input');
            if (input.checked) {
                label.classList.add('active');
            } else {
                label.classList.remove('active');
            }
        });

        if (checkboxesPagamento.length > 1) {
             let hasAPrazo = false;
             checkboxesPagamento.forEach(chk => { if (chk.value === 'A Prazo') hasAPrazo = true; });

             if (hasAPrazo) {
                 // Desmarca todos os outros e mantém só 'A Prazo'
                 checkboxesPagamento.forEach(chk => {
                     if (chk.value !== 'A Prazo') {
                         chk.checked = false;
                         chk.closest('.payment-button').classList.remove('active');
                     }
                 });
                 // Chama renderizarPagamentos novamente para limpar os inputs parciais
                 renderizarPagamentos();
                 return; // Sai da função atual
             }

            // Continua criando inputs parciais se não houver 'A Prazo' selecionado com outros
            checkboxesPagamento.forEach(input => {
                const valorMetodo = input.value;
                const div = document.createElement('div');
                div.className = 'relative';
                div.innerHTML = `
                    <label for="valor-${valorMetodo.toLowerCase().replace(' ', '-')}" class="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Valor em ${valorMetodo}</label>
                    <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none pt-6">
                         <span class="text-zinc-500 sm:text-sm">R$</span>
                    </div>
                    <input type="number" step="0.01" min="0.01" id="valor-${valorMetodo.toLowerCase().replace(' ', '-')}" class="valor-parcial form-input block w-full pl-7 pr-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg text-secondary dark:text-white bg-white dark:bg-zinc-900 placeholder:text-zinc-500 focus:outline-none focus:ring-primary focus:border-primary sm:text-sm" data-metodo="${valorMetodo}" placeholder="0,00">
                `;
                valoresParciaisContainer.appendChild(div);
            });
        }
    }


    // Adiciona produto ao carrinho
    function adicionarAoCarrinho(produtoId) {
        const produto = produtosDisponiveis.find(p => p.id === produtoId);
        if (!produto) return;

        const itemNoCarrinho = carrinho.find(item => item.id === produtoId);
        const quantidadeNoCarrinho = itemNoCarrinho ? itemNoCarrinho.quantidade : 0;

        // Pega o estoque original do array principal
        const produtoOriginal = produtosDisponiveis.find(p => p.id === produtoId);
        const estoqueOriginal = produtoOriginal ? produtoOriginal.estoque : 0;

        if (estoqueOriginal <= quantidadeNoCarrinho) {
            alert(`Estoque máximo atingido para "${produto.nome}".`);
            return;
        }


        if (itemNoCarrinho) {
            itemNoCarrinho.quantidade++;
        } else {
            carrinho.push({
                id: produto.id,
                nome: produto.nome,
                preco: produto.preco,
                foto_url: produto.foto_url,
                quantidade: 1
            });
        }
        renderizarCarrinho();
    }

    // Altera quantidade no carrinho
    function alterarQuantidade(produtoId, mudanca) {
        const itemIndex = carrinho.findIndex(item => item.id === produtoId);
        if (itemIndex === -1) return;

        const item = carrinho[itemIndex];
        const produtoOriginal = produtosDisponiveis.find(p => p.id === produtoId);
        const estoqueOriginal = produtoOriginal ? produtoOriginal.estoque : 0;
        const novaQuantidade = item.quantidade + mudanca;

        if (novaQuantidade <= 0) {
            carrinho.splice(itemIndex, 1);
        } else if (novaQuantidade > estoqueOriginal) {
            alert(`Estoque máximo (${estoqueOriginal}) atingido para "${item.nome}".`);
            item.quantidade = estoqueOriginal;
        } else {
            item.quantidade = novaQuantidade;
        }
        renderizarCarrinho();
    }

    // Remove item do carrinho
    function removerDoCarrinho(produtoId) {
        carrinho = carrinho.filter(item => item.id !== produtoId);
        renderizarCarrinho();
    }

    // Inicializa a página
    async function inicializar() {
        await carregarClientes();
        await carregarProdutosDisponiveis();
        renderizarCarrinho();

        try {
             const empresaRes = await fetchWithAuth('/api/empresas/meus-dados');
             if (empresaRes.ok) dadosEmpresa = await empresaRes.json();
        } catch (error) {
             console.error('Erro ao buscar dados da empresa:', error);
        }
    }

    // --- EVENT LISTENERS ---

    // Abrir Modal de Busca de Cliente
    clienteDisplayContainer.addEventListener('click', (e) => {
        if (!e.target.closest('#remover-cliente-btn')) {
             inputFiltroClienteModal.value = '';
             renderizarClientesModal(todosClientes);
             clientModal.classList.add('is-open');
             inputFiltroClienteModal.focus();
        }
    });

    // Filtrar Clientes no Modal
    inputFiltroClienteModal.addEventListener('keyup', () => {
         renderizarClientesModal(todosClientes);
    });

     // Fechar Modal Cliente clicando fora
     clientModal.addEventListener('click', (e) => {
         if (e.target === clientModal) {
             clientModal.classList.remove('is-open');
         }
     });

    // Remover Cliente Selecionado
    removerClienteBtn.addEventListener('click', removerClienteSelecionado);


    // Modal de Novo Cliente
    btnNovoCliente.addEventListener('click', () => {
        formNovoCliente.reset();
        modalNovoCliente.classList.add('is-open');
    });
    btnCancelarNovoCliente.addEventListener('click', () => {
        modalNovoCliente.classList.remove('is-open');
    });
    modalNovoCliente.addEventListener('click', (e) => {
        if (e.target === modalNovoCliente) modalNovoCliente.classList.remove('is-open');
    });
    formNovoCliente.addEventListener('submit', async (event) => {
        event.preventDefault();
        const novoCliente = {
            nome: document.getElementById('modal-nome').value,
            telefone: document.getElementById('modal-telefone').value,
            cpf: document.getElementById('modal-cpf').value
        };
        try {
            const response = await fetchWithAuth('/api/clientes', { method: 'POST', body: JSON.stringify(novoCliente) });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message);
            await carregarClientes();
            const clienteCriado = todosClientes.find(c => c.id === data.clienteId);
            if (clienteCriado) selecionarCliente(clienteCriado);
            modalNovoCliente.classList.remove('is-open');
        } catch (error) {
            alert(`Erro ao salvar cliente: ${error.message}`);
        }
    });

    // Modal de Busca de Produto
    btnAbrirBuscaProduto.addEventListener('click', () => {
        inputBuscaProdutoModal.value = '';
        renderizarProdutosModal(produtosDisponiveis);
        productModal.classList.add('is-open');
        inputBuscaProdutoModal.focus();
    });
    inputBuscaProdutoModal.addEventListener('keyup', () => {
         renderizarProdutosModal(produtosDisponiveis);
    });
    productModal.addEventListener('click', (e) => {
        if (e.target === productModal) productModal.classList.remove('is-open');
    });

    // Ações no Carrinho
    carrinhoItensEl.addEventListener('click', (event) => {
        const target = event.target;
        const itemEl = target.closest('.carrinho-item');
        if (!itemEl) return;
        const produtoId = parseInt(itemEl.dataset.produtoId);
        if (target.closest('.btn-qty-change')) {
            const change = parseInt(target.closest('.btn-qty-change').dataset.change);
            alterarQuantidade(produtoId, change);
        } else if (target.closest('.btn-remover-item')) {
            removerDoCarrinho(produtoId);
        }
    });

    // Seleção de Método de Pagamento
    metodosPagamentoContainer.addEventListener('change', renderizarPagamentos);

    // Finalizar Venda
    finalizarVendaBtn.addEventListener('click', async () => {
         if (carrinho.length === 0) {
             alert('Adicione produtos ao carrinho antes de finalizar.');
             return;
         }
         const clienteId = selectedClienteIdInput.value ? parseInt(selectedClienteIdInput.value) : null;
         const itensVenda = carrinho.map(item => ({ produto_id: item.id, quantidade: item.quantidade }));
         const checkboxesPagamento = metodosPagamentoContainer.querySelectorAll('input[name="pagamento"]:checked');
         if (checkboxesPagamento.length === 0) {
             alert('Selecione pelo menos uma forma de pagamento.');
             return;
         }
         let pagamentos = [];
         let somaPagamentos = 0;
         let erroPagamentoParcial = false;
         let aPrazoSelecionado = false;

          checkboxesPagamento.forEach(chk => { if (chk.value === 'A Prazo') aPrazoSelecionado = true; });

         if (aPrazoSelecionado && checkboxesPagamento.length > 1) {
              alert('Não é possível combinar "A Prazo" com outras formas de pagamento.');
              return;
         }

         if (checkboxesPagamento.length === 1) {
             const metodo = checkboxesPagamento[0].value;
             // Se for A Prazo, o valor é o total, senão é o total da venda
             const valorPagamento = totalVenda; // Para A Prazo ou pagamento único, o valor é o total
             pagamentos.push({ metodo: metodo, valor: valorPagamento });
             somaPagamentos = valorPagamento;
         } else { // Pagamento parcial (já sabemos que não tem 'A Prazo' aqui)
             const inputsParciais = valoresParciaisContainer.querySelectorAll('.valor-parcial');
             inputsParciais.forEach(input => {
                 const valor = parseFloat(input.value) || 0;
                 if (valor < 0.01) {
                      erroPagamentoParcial = true;
                      input.classList.add('border-red-500');
                 } else {
                      pagamentos.push({ metodo: input.dataset.metodo, valor: valor });
                      somaPagamentos += valor;
                      input.classList.remove('border-red-500');
                 }
             });
             if (erroPagamentoParcial) {
                  alert('Preencha valores válidos para todas as formas de pagamento selecionadas.');
                  return;
             }
             if (pagamentos.length === 0) { // Garante que pelo menos um valor foi inserido
                  alert('Insira o valor para pelo menos uma das formas de pagamento.');
                  return;
             }
             // Validar soma em pagamento parcial
              if (Math.abs(somaPagamentos - totalVenda) > 0.01) {
                  if (!confirm(`A soma dos pagamentos (R$ ${somaPagamentos.toFixed(2)}) é diferente do total da venda (R$ ${totalVenda.toFixed(2)}). Deseja continuar mesmo assim?`)) {
                      return;
                  }
                  // Se continuar, o backend ainda registrará o valor_total baseado nos itens.
             }
         }


         try {
             finalizarVendaBtn.disabled = true;
             // Adiciona spinner ao botão
             finalizarVendaBtn.innerHTML = `
                <div class="spinner mr-2"></div>
                Processando...`;
             const response = await fetchWithAuth('/api/vendas', {
                 method: 'POST',
                 body: JSON.stringify({ cliente_id: clienteId, itens: itensVenda, pagamentos: pagamentos })
             });
             const data = await response.json();
             if (!response.ok) throw new Error(data.message || 'Erro ao registrar venda.');
             window.location.href = `venda-concluida.html?id=${data.vendaId}`;
         } catch (error) {
             alert(`Erro ao finalizar venda: ${error.message}`);
             finalizarVendaBtn.disabled = false;
             // Restaura botão original
             finalizarVendaBtn.innerHTML = '<span class="material-symbols-outlined">check_circle</span> Finalizar Venda';
         }
    });

    // Logout
    if (logoutBtn) {
        logoutBtn.addEventListener('click', logout);
    }

    // --- INICIALIZAÇÃO DA PÁGINA ---
    inicializar();
});
