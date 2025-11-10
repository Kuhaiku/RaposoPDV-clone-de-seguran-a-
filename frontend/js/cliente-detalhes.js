// Garante que checkAuth e fetchWithAuth estão disponíveis (de auth.js)
if (typeof checkAuth !== 'function' || typeof fetchWithAuth !== 'function') {
    console.error("Funções 'checkAuth' ou 'fetchWithAuth' não encontradas.");
} else {
    checkAuth(); // Verifica login
}

document.addEventListener('DOMContentLoaded', () => {

    // --- ELEMENTOS DO DOM ---
    const nomeClienteHeader = document.getElementById('nome-cliente-header');
    const totalGastoEl = document.getElementById('total-gasto');
    const totalComprasEl = document.getElementById('total-compras');
    const dadosCadastraisEl = document.getElementById('dados-cadastrais');
    const historicoComprasList = document.getElementById('historico-compras-list');
    const historicoPlaceholder = document.getElementById('historico-placeholder');
    const gerarRelatorioBtn = document.getElementById('gerar-relatorio-btn');
    const selecionarTodasCheck = document.getElementById('selecionar-todas');
    const selectAllContainer = document.getElementById('select-all-container');
    // const reciboEmpresaNomeRelatorio = document.getElementById('recibo-empresa-nome-relatorio'); // Removido, será buscado dentro da função

    // --- NOVOS Seletores para Edição/Exclusão ---
    const editClientButton = document.getElementById('edit-client-button');
    const deleteClientButton = document.getElementById('delete-client-button');
    const editClientDetailsModal = document.getElementById('edit-client-details-modal');
    const editClientDetailsForm = document.getElementById('edit-client-details-form');
    const editClientDetailsMessage = document.getElementById('edit-client-details-message');
    const closeModalButtons = document.querySelectorAll('.close-modal-btn'); // Botões de fechar

    let currentClienteData = null; // Armazena dados do cliente
    let currentVendasData = []; // Armazena dados das vendas detalhadas
    let clienteId = null; // Armazena o ID do cliente da página

    // --- Funções Auxiliares ---
    const formatCurrency = (value) => {
        const number = parseFloat(value) || 0;
        return number.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    };
    const formatDateTime = (dataISO) => {
        if (!dataISO) return 'N/A';
        return new Date(dataISO).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    };
    // Funções de Modal (openModal, closeModal, showModalMessage, clearModalMessage)
    const showModalMessage = (element, message, isError = false) => {
        if (!element) return;
        element.textContent = message;
        element.classList.remove('hidden', 'text-green-600', 'text-red-600');
        element.classList.add(isError ? 'text-red-600' : 'text-green-600');
     };
    const clearModalMessage = (element) => {
        if (!element) return;
        element.textContent = '';
        element.classList.add('hidden');
     };
    const openModal = (modalElement) => {
        if (modalElement) {
             modalElement.classList.add('is-open');
             document.body.style.overflow = 'hidden';
        }
    };
    const closeModal = (modalElement) => {
        if (modalElement) {
             modalElement.classList.remove('is-open');
             document.body.style.overflow = '';
             // Limpa mensagem específica do modal de detalhes ao fechar
             if(editClientDetailsMessage) clearModalMessage(editClientDetailsMessage);
        }
    };


    // --- Funções Principais ---

    // Gera o relatório PDF/Imagem das vendas selecionadas
    async function gerarRelatorio() {
        console.log("Iniciando gerarRelatorio..."); // Log inicial
        const checkboxesMarcadas = historicoComprasList.querySelectorAll('.venda-checkbox:checked');
        if (checkboxesMarcadas.length === 0) {
            alert('Por favor, selecione pelo menos uma venda para gerar o relatório.');
            return;
        }

        const vendaIdsSelecionadas = Array.from(checkboxesMarcadas).map(cb => cb.dataset.vendaId);

        gerarRelatorioBtn.disabled = true;
        gerarRelatorioBtn.innerHTML = '<div class="spinner spinner-small mr-1 inline-block"></div> Gerando...';

        const elementoRecibo = document.getElementById('recibo-template');

        // --- Log para verificar se o template PAI foi encontrado ---
        if (!elementoRecibo) {
            console.error("FALHA CRÍTICA: Elemento #recibo-template NÃO encontrado no DOM!");
            alert("Erro interno: Template do relatório não encontrado. Verifique o HTML.");
            gerarRelatorioBtn.disabled = false;
            gerarRelatorioBtn.innerHTML = '<span class="material-symbols-outlined mr-1 text-sm">download</span> Relatório';
            return; // Interrompe a função aqui
        } else {
            console.log("Elemento #recibo-template encontrado com sucesso.");
            // console.log("Conteúdo interno do #recibo-template:", elementoRecibo.innerHTML); // Descomente se precisar ver o HTML interno
        }
        // --- Fim do Log ---


        try {
            const vendasParaRelatorio = currentVendasData.filter(venda => vendaIdsSelecionadas.includes(String(venda.id)));

            // Busca elementos DENTRO do template
            const reciboClienteNomeEl = elementoRecibo.querySelector('#recibo-cliente-nome');
            const reciboEmpresaNomeRelatorioEl = elementoRecibo.querySelector('#recibo-empresa-nome-relatorio');
            const reciboVendasContainer = elementoRecibo.querySelector('#recibo-vendas-container');
            const reciboTotalGeralEl = elementoRecibo.querySelector('#recibo-total-geral');
            const reciboDataGeracaoEl = elementoRecibo.querySelector('#recibo-data-geracao');

             // --- Logs para verificar CADA elemento interno ---
             console.log("Verificando elementos internos:");
             console.log("#recibo-cliente-nome:", reciboClienteNomeEl);
             console.log("#recibo-empresa-nome-relatorio:", reciboEmpresaNomeRelatorioEl);
             console.log("#recibo-vendas-container:", reciboVendasContainer);
             console.log("#recibo-total-geral:", reciboTotalGeralEl);
             console.log("#recibo-data-geracao:", reciboDataGeracaoEl);
             // --- Fim dos Logs ---


            // Verifica se os elementos essenciais foram encontrados
            if (!reciboClienteNomeEl || !reciboEmpresaNomeRelatorioEl || !reciboVendasContainer || !reciboTotalGeralEl || !reciboDataGeracaoEl) {
                 console.error("Um ou mais elementos internos do #recibo-template retornaram null.");
                 throw new Error("Erro ao encontrar elementos internos do template do relatório. Verifique os IDs no HTML.");
            }

            // Preenche os elementos encontrados
            reciboClienteNomeEl.textContent = currentClienteData?.nome || 'Cliente';
            reciboEmpresaNomeRelatorioEl.textContent = localStorage.getItem('nomeEmpresa') || 'Relatório de Vendas';
            reciboVendasContainer.innerHTML = ''; // Limpa o container
            reciboDataGeracaoEl.textContent = new Date().toLocaleString('pt-BR');

            let totalGeral = 0;

            // ***** INÍCIO DA MODIFICAÇÃO *****
            vendasParaRelatorio.forEach(venda => {
                let itensHtml = '';
                if (venda.itens && venda.itens.length > 0) {
                    venda.itens.forEach(item => {
                        const subtotal = (item.quantidade || 0) * (item.preco_unitario || 0);
                        
                        // Adicionamos a coluna formatCurrency(item.preco_unitario)
                        itensHtml += `<tr>
                                        <td>${item.produto_nome || '?'}</td>
                                        <td style="text-align: center;">${item.quantidade || 0}</td>
                                        <td style="text-align: right;">${formatCurrency(item.preco_unitario)}</td>
                                        <td style="text-align: right;">${formatCurrency(subtotal)}</td>
                                      </tr>`;
                    });
                } else {
                    // Colspan atualizado para 4
                    itensHtml = '<tr><td colspan="4">Nenhum item detalhado.</td></tr>';
                }
                
                let pagamentosHtml = '<p style="margin-top: 5px;"><strong>Pagamento:</strong> ';
                 if (venda.pagamentos && venda.pagamentos.length > 0) {
                      pagamentosHtml += venda.pagamentos.map(p => `${p.metodo}: ${formatCurrency(p.valor)}`).join(' / ');
                 } else { pagamentosHtml += 'N/A'; }
                 pagamentosHtml += '</p>';
                
                // Adicionado <th>Unit.</th> no cabeçalho da tabela
                reciboVendasContainer.innerHTML += `
                    <div class="recibo-info" style="border-top: 2px solid #000; padding-top: 15px; margin-top: 15px;"> <p><strong>Venda:</strong> #${venda.id}</p> <p><strong>Data:</strong> ${formatDateTime(venda.data_venda)}</p> ${pagamentosHtml} </div>
                    <table class="recibo-tabela"> 
                        <thead>
                            <tr>
                                <th>Item</th>
                                <th style="text-align: center;">Qtd.</th>
                                <th style="text-align: right;">Unit.</th>
                                <th style="text-align: right;">Subtotal</th>
                            </tr>
                        </thead> 
                        <tbody>${itensHtml}</tbody> 
                    </table>
                    <div class="recibo-total" style="font-size: 1rem; border-top: 1px dashed #000;"> <strong>TOTAL DA VENDA: ${formatCurrency(venda.valor_total)}</strong> </div>`;
                
                totalGeral += parseFloat(venda.valor_total || 0);
            });
            // ***** FIM DA MODIFICAÇÃO *****

            // Preenche o total geral
            reciboTotalGeralEl.textContent = formatCurrency(totalGeral);

            console.log("Template preenchido, iniciando html2canvas...");

            // Gera a imagem usando html2canvas
            const canvas = await html2canvas(elementoRecibo, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
            console.log("html2canvas concluído.");

            const link = document.createElement('a');
            link.href = canvas.toDataURL('image/png');
            link.download = `Relatorio_${(currentClienteData?.nome || 'Cliente').replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.png`;
            link.click();
            console.log("Download iniciado.");

        } catch (error) {
            console.error('Erro detalhado ao gerar relatório:', error);
            alert(`Ocorreu um erro ao gerar o relatório: ${error.message}`);
        } finally {
             gerarRelatorioBtn.disabled = false;
             gerarRelatorioBtn.innerHTML = '<span class="material-symbols-outlined mr-1 text-sm">download</span> Relatório';
        }
    }


    // Preenche os dados cadastrais na tela
    const preencherDadosCadastraisNaTela = (cliente) => {
        dadosCadastraisEl.innerHTML = `
            <p><strong class="font-medium text-zinc-600 dark:text-zinc-400 block text-xs">Nome:</strong> <span class="text-text-light dark:text-zinc-200">${cliente.nome || 'N/A'}</span></p>
            <p><strong class="font-medium text-zinc-600 dark:text-zinc-400 block text-xs">Telefone:</strong> <span class="text-text-light dark:text-zinc-200">${cliente.telefone || 'N/A'}</span></p>
            <p><strong class="font-medium text-zinc-600 dark:text-zinc-400 block text-xs">CPF:</strong> <span class="text-text-light dark:text-zinc-200">${cliente.cpf || 'N/A'}</span></p>
            <p><strong class="font-medium text-zinc-600 dark:text-zinc-400 block text-xs">Email:</strong> <span class="text-text-light dark:text-zinc-200">${cliente.email || 'N/A'}</span></p>
            <p><strong class="font-medium text-zinc-600 dark:text-zinc-400 block text-xs">Endereço:</strong> <span class="text-text-light dark:text-zinc-200">${[cliente.logradouro, cliente.numero, cliente.bairro, cliente.cidade, cliente.estado, cliente.cep].filter(Boolean).join(', ') || 'N/A'}</span></p>
        `;
        nomeClienteHeader.textContent = cliente.nome || 'Cliente sem nome';
        document.title = `Detalhes | ${cliente.nome || 'Cliente'}`;
     };

    // Carrega os detalhes do cliente e seu histórico
    async function carregarDetalhesCliente() {
        const urlParams = new URLSearchParams(window.location.search);
        clienteId = urlParams.get('id');
        if (!clienteId) {
            alert('ID do cliente não encontrado na URL.');
            window.location.href = 'clientes.html';
            return;
        }

        historicoPlaceholder.textContent = 'Carregando dados...';
        historicoPlaceholder.classList.remove('hidden');
        historicoComprasList.innerHTML = '';
        currentVendasData = [];

        try {
            const clienteResponse = await fetchWithAuth(`/api/clientes/${clienteId}/detalhes`);
            if (!clienteResponse.ok) {
                const errorData = await clienteResponse.json().catch(() => ({ message: 'Erro desconhecido.' }));
                throw new Error(errorData.message || `Erro ${clienteResponse.status}.`);
            }
            currentClienteData = await clienteResponse.json();

            preencherDadosCadastraisNaTela(currentClienteData);
            totalGastoEl.textContent = formatCurrency(currentClienteData.total_gasto);
            totalComprasEl.textContent = currentClienteData.historico_compras ? currentClienteData.historico_compras.length : 0;

            historicoPlaceholder.classList.add('hidden');
            if (currentClienteData.historico_compras && currentClienteData.historico_compras.length > 0) {
                 gerarRelatorioBtn.classList.remove('hidden');
                 selectAllContainer.classList.remove('hidden');
                const detalhesPromessas = currentClienteData.historico_compras.map(vendaResumo =>
                     fetchWithAuth(`/api/vendas/${vendaResumo.id}`).then(res => res.ok ? res.json() : Promise.reject(`Erro ${res.status} venda ${vendaResumo.id}`))
                );
                currentVendasData = await Promise.all(detalhesPromessas);
                currentVendasData.sort((a, b) => new Date(b.data_venda) - new Date(a.data_venda));

                currentVendasData.forEach(venda => {
                    const vendaCard = document.createElement('div');
                    vendaCard.className = 'bg-white dark:bg-zinc-800 rounded-lg shadow-sm overflow-hidden venda-card border dark:border-zinc-700';
                    vendaCard.dataset.vendaId = venda.id;
                    let itensPreview = '';
                    if (venda.itens && venda.itens.length > 0) {
                         itensPreview = venda.itens.map(item => `${item.quantidade}x ${item.produto_nome}`).join(', ');
                         if(itensPreview.length > 50) itensPreview = itensPreview.substring(0, 50) + '...';
                    } else { itensPreview = 'Nenhum item detalhado'; }
                    let pagamentosPreview = '';
                    if (venda.pagamentos && venda.pagamentos.length > 0) {
                         pagamentosPreview = venda.pagamentos.map(p => p.metodo).join(' / ');
                    } else { pagamentosPreview = 'N/A'; }
                    vendaCard.innerHTML = `
                        <div class="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center"> <div class="flex items-center space-x-2"> <input type="checkbox" class="venda-checkbox form-checkbox rounded text-primary focus:ring-primary/50 h-4 w-4 border-gray-300 dark:border-gray-600 dark:bg-gray-700" data-venda-id="${venda.id}"> <p class="text-sm font-semibold text-text-light dark:text-text-dark">Pedido #${venda.id}</p> </div> <p class="text-xs text-subtext-light dark:text-subtext-dark">${formatDateTime(venda.data_venda)}</p> </div>
                        <div class="p-4 space-y-2"> <div class="text-xs"> <span class="font-medium text-zinc-500 dark:text-zinc-400">Itens:</span> <span class="text-text-light dark:text-zinc-300 ml-1">${itensPreview}</span> </div> <div class="border-t border-gray-200 dark:border-gray-700 my-1"></div> <div class="flex justify-between items-center text-sm"> <span class="font-medium text-subtext-light dark:text-subtext-dark">Pagamento:</span> <span class="font-semibold text-text-light dark:text-zinc-200">${pagamentosPreview}</span> </div> <div class="flex justify-between items-center mt-1"> <span class="text-sm font-bold text-subtext-light dark:text-subtext-dark">Total:</span> <span class="text-sm font-bold text-primary">${formatCurrency(venda.valor_total)}</span> </div> </div>
                    `;
                    historicoComprasList.appendChild(vendaCard);
                });
            } else {
                gerarRelatorioBtn.classList.add('hidden');
                selectAllContainer.classList.add('hidden');
                historicoComprasList.innerHTML = '<p class="text-center py-6 text-zinc-500 dark:text-zinc-400">Nenhuma compra registrada.</p>';
            }
        } catch (error) {
            console.error('Erro ao carregar detalhes do cliente:', error);
            historicoPlaceholder.textContent = `Erro: ${error.message}`;
            historicoPlaceholder.classList.remove('hidden');
            alert(`Não foi possível carregar os detalhes: ${error.message}`);
            nomeClienteHeader.textContent = 'Erro';
            totalGastoEl.textContent = 'Erro';
            totalComprasEl.textContent = 'Erro';
            dadosCadastraisEl.innerHTML = '<p class="text-red-500">Falha ao carregar dados.</p>';
             // Desabilita botões de ação se falhar ao carregar
             if(editClientButton) editClientButton.disabled = true;
             if(deleteClientButton) deleteClientButton.disabled = true;
        }
    }

    // --- Funções para Edição e Exclusão ---
    const abrirModalEdicaoDetalhes = () => {
         if (!currentClienteData) { alert("Dados do cliente ainda não carregados."); return; }
         clearModalMessage(editClientDetailsMessage);
         editClientDetailsForm.reset();
         document.getElementById('edit-details-nome').value = currentClienteData.nome || '';
         document.getElementById('edit-details-telefone').value = currentClienteData.telefone || '';
         document.getElementById('edit-details-cpf').value = currentClienteData.cpf || '';
         document.getElementById('edit-details-email').value = currentClienteData.email || '';
         document.getElementById('edit-details-cep').value = currentClienteData.cep || '';
         document.getElementById('edit-details-logradouro').value = currentClienteData.logradouro || '';
         document.getElementById('edit-details-numero').value = currentClienteData.numero || '';
         document.getElementById('edit-details-bairro').value = currentClienteData.bairro || '';
         document.getElementById('edit-details-cidade').value = currentClienteData.cidade || '';
         document.getElementById('edit-details-estado').value = currentClienteData.estado || '';
         openModal(editClientDetailsModal);
     };

    const handleEditDetalhesSubmit = async (event) => {
         event.preventDefault();
         clearModalMessage(editClientDetailsMessage);
         const submitButton = editClientDetailsModal.querySelector('button[type="submit"]');
         if (!submitButton || !clienteId) return;
         submitButton.disabled = true;
         submitButton.innerHTML = `<div class="spinner mr-2 inline-block"></div> Salvando...`;
         const formData = new FormData(editClientDetailsForm);
         const clienteAtualizado = Object.fromEntries(formData.entries());
         if (!clienteAtualizado.nome || !clienteAtualizado.telefone) {
             showModalMessage(editClientDetailsMessage, "Nome e Telefone são obrigatórios.", true);
             submitButton.disabled = false; submitButton.textContent = 'Salvar Alterações'; return;
         }
         try {
             const response = await fetchWithAuth(`/api/clientes/${clienteId}`, { method: 'PUT', body: JSON.stringify(clienteAtualizado) });
             const data = await response.json(); if (!response.ok) throw new Error(data.message || 'Erro ao atualizar.');
             currentClienteData = { ...currentClienteData, ...clienteAtualizado };
             preencherDadosCadastraisNaTela(currentClienteData); // Re-renderiza dados na tela
             showModalMessage(editClientDetailsMessage, 'Dados atualizados com sucesso!');
             setTimeout(() => { closeModal(editClientDetailsModal); }, 1500);
         } catch (error) {
             console.error("Erro ao atualizar:", error);
             showModalMessage(editClientDetailsMessage, `Erro: ${error.message}`, true);
         } finally {
             if (submitButton) { submitButton.disabled = false; submitButton.textContent = 'Salvar Alterações'; }
         }
     };

     const handleDeleteDetalhesClick = async () => {
         if (!currentClienteData) return;
         const nomeCliente = currentClienteData.nome || 'este cliente';
         if (!confirm(`Tem certeza que deseja excluir ${nomeCliente}?\n\nATENÇÃO: A exclusão é permanente e só é permitida se não houver vendas associadas.`)) return;
         deleteClientButton.disabled = true; editClientButton.disabled = true; deleteClientButton.innerHTML = '<div class="spinner spinner-small"></div>';
         try {
             const response = await fetchWithAuth(`/api/clientes/${clienteId}`, { method: 'DELETE' });
             const data = await response.json(); if (!response.ok) { if (response.status === 400 && data.message.includes("vendas existentes")) { throw new Error(data.message); } else { throw new Error(data.message || 'Erro ao excluir.'); } }
             alert(data.message || 'Cliente excluído com sucesso!');
             window.location.href = 'clientes.html'; // Redireciona
         } catch (error) {
             console.error("Erro ao excluir:", error); alert(`Erro: ${error.message}`);
             deleteClientButton.disabled = false; editClientButton.disabled = false; deleteClientButton.innerHTML = '<span class="material-symbols-outlined mr-1 text-sm">delete</span> Excluir';
         }
     };


    // --- EVENT LISTENERS ---
    if(gerarRelatorioBtn) gerarRelatorioBtn.addEventListener('click', gerarRelatorio);
    if(selecionarTodasCheck) selecionarTodasCheck.addEventListener('change', (event) => {
        const isChecked = event.target.checked; historicoComprasList.querySelectorAll('.venda-checkbox').forEach(cb => { cb.checked = isChecked; });
    });
    if(historicoComprasList) historicoComprasList.addEventListener('change', (event) => {
         if (event.target.classList.contains('venda-checkbox') && !event.target.checked) { selecionarTodasCheck.checked = false; } else if (event.target.classList.contains('venda-checkbox') && event.target.checked) { const allCheckboxes = historicoComprasList.querySelectorAll('.venda-checkbox'); const allChecked = Array.from(allCheckboxes).every(cb => cb.checked); selecionarTodasCheck.checked = allChecked; }
     });

     // Novos Listeners...
     if(editClientButton) editClientButton.addEventListener('click', abrirModalEdicaoDetalhes);
     if(deleteClientButton) deleteClientButton.addEventListener('click', handleDeleteDetalhesClick);
     if(editClientDetailsForm) editClientDetailsForm.addEventListener('submit', handleEditDetalhesSubmit);

     closeModalButtons.forEach(button => {
         button.addEventListener('click', () => { const modal = button.closest('.modal'); if (modal) closeModal(modal); });
     });
     if(editClientDetailsModal) {
         editClientDetailsModal.addEventListener('click', (event) => { if (event.target === editClientDetailsModal) closeModal(editClientDetailsModal); });
     }


    // --- Inicialização ---
    carregarDetalhesCliente();

}); // Fim do DOMContentLoaded
