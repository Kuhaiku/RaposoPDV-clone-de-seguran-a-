// Garante que checkAuth e fetchWithAuth estão disponíveis (de auth.js)
if (typeof checkAuth !== 'function' || typeof fetchWithAuth !== 'function') {
    console.error("Funções 'checkAuth' ou 'fetchWithAuth' não encontradas. Verifique se auth.js foi carregado corretamente.");
    // Poderia redirecionar para login ou mostrar erro
} else {
    checkAuth();
}

document.addEventListener('DOMContentLoaded', () => {

    // --- Seletores de Elementos DOM ---
    const productListContainer = document.getElementById('product-list-container');
    const productListPlaceholder = document.getElementById('product-list-placeholder');
    const searchInput = document.getElementById('search-input');
    const tabAtivos = document.getElementById('tab-ativos');
    const tabInativos = document.getElementById('tab-inativos');
    const addProductButton = document.getElementById('add-product-button');

    // --- Modais ---
    const addProductPopup = document.getElementById('add-product-popup');
    const editProductPopup = document.getElementById('edit-product-popup');
    const addProductForm = document.getElementById('add-product-form');
    const editProductForm = document.getElementById('edit-product-form');

    // --- Campos do Formulário ADD ---
    const addImageInput = document.getElementById('add-images-input');
    const addImagePreviews = document.getElementById('add-image-previews');
    const addProductMessage = document.getElementById('add-product-message');

    // --- Campos do Formulário EDIT ---
    const editProductIdInput = document.getElementById('edit-product-id');
    const editProductNameInput = document.getElementById('edit-product-name');
    const editProductCodigoInput = document.getElementById('edit-product-codigo');
    const editProductPrecoInput = document.getElementById('edit-product-preco');
    const editProductEstoqueInput = document.getElementById('edit-product-estoque');
    const editProductCategoriaInput = document.getElementById('edit-product-categoria');
    const editProductDescricaoInput = document.getElementById('edit-product-descricao');
    const editImageInput = document.getElementById('edit-images-input');
    const editImagePreviews = document.getElementById('edit-image-previews');
    const editProductMessage = document.getElementById('edit-product-message');

    // --- Estado ---
    let todosProdutos = []; // Armazena todos os produtos (ativos e inativos)
    let filtroAtual = 'ativos'; // 'ativos' ou 'inativos'
    let termoBusca = '';
    let fotosParaRemoverEdit = []; // Armazena fotos a serem removidas na edição [{id: 1, public_id: 'abc'}, ...]
    let addProductFiles = []; // Armazena ARQUIVOS (File objects) para adicionar
    let editProductFiles = []; // Armazena NOVOS ARQUIVOS (File objects) para editar

    const MAX_IMAGES = 5; // Limite máximo de imagens

    // --- Funções Auxiliares ---

    // Formata moeda
    const formatCurrency = (value) => {
        const number = parseFloat(value) || 0;
        return number.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    };

    // Exibe mensagem nos modais
    const showModalMessage = (element, message, isError = false) => {
        if (!element) return; // Verificação
        element.textContent = message;
        element.classList.remove('hidden', 'text-green-600', 'text-red-600');
        element.classList.add(isError ? 'text-red-600' : 'text-green-600');
    };

    // Limpa mensagem dos modais
    const clearModalMessage = (element) => {
        if (!element) return; // Verificação
        element.textContent = '';
        element.classList.add('hidden');
    };

    // Abre um modal (bottom sheet)
    const openPopup = (popupElement) => {
        if (popupElement) {
            popupElement.classList.add('is-open');
            document.body.style.overflow = 'hidden'; // Impedir scroll do body
        }
    };

    // Fecha um modal (bottom sheet)
    const closePopup = (popupElement) => {
        if (popupElement) {
            popupElement.classList.remove('is-open');
            document.body.style.overflow = ''; // Restaurar scroll do body
            // Limpa mensagens de erro/sucesso ao fechar
            clearModalMessage(addProductMessage);
            clearModalMessage(editProductMessage);
        }
    };

    // --- Funções de Pré-visualização de Imagem (AJUSTADA PARA NÃO REMOVER) ---
    const handleFileChange = (event, previewContainer, fileStorage) => {
        const files = event.target.files;
        if (!files) return;

        const currentImageCount = previewContainer.querySelectorAll('.image-preview').length;
        const availableSlots = MAX_IMAGES - currentImageCount;

        if (files.length > availableSlots) {
            alert(`Você pode adicionar no máximo mais ${availableSlots} imagem(ns). O limite total é ${MAX_IMAGES}.`);
            event.target.value = null; // Limpa a seleção atual
            return;
        }

        Array.from(files).forEach(file => {
            // Verifica se um arquivo com o mesmo nome E tamanho já está no array de upload
             const alreadyExists = fileStorage.some(existingFile =>
                existingFile.name === file.name && existingFile.size === file.size
            );

            // Verifica se um preview para esse arquivo já existe na tela (para novos uploads)
            const alreadyPreviewed = Array.from(previewContainer.querySelectorAll('.new-image img'))
                                          .some(img => img.dataset.fileName === file.name && img.dataset.fileSize === String(file.size));


            if (alreadyExists || alreadyPreviewed) {
                console.warn(`Arquivo "${file.name}" já presente ou selecionado, pulando.`);
                return; // Pula este arquivo
            }


            fileStorage.push(file); // Armazena o novo arquivo

            const reader = new FileReader();
            reader.onload = (e) => {
                const div = document.createElement('div');
                // Adiciona 'new-image' para diferenciar dos existentes na edição
                div.className = 'image-preview new-image';
                div.innerHTML = `
                    <img src="${e.target.result}" alt="${file.name}" data-file-name="${file.name}" data-file-size="${file.size}">
                    <button type="button" class="remove-image-btn" title="Remover imagem">&times;</button>
                `;
                previewContainer.insertBefore(div, previewContainer.querySelector('.add-image-btn'));

                div.querySelector('.remove-image-btn').addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    div.remove();
                    const indexToRemove = fileStorage.indexOf(file);
                    if (indexToRemove > -1) {
                        fileStorage.splice(indexToRemove, 1);
                    }
                    checkImageLimit(previewContainer);
                    // Não limpa o input geral aqui, pois múltiplos arquivos podem ter sido selecionados
                });
            };
            reader.readAsDataURL(file);
        });

        checkImageLimit(previewContainer);
        // Limpa o input file DEPOIS para permitir selecionar o mesmo arquivo novamente caso ele seja removido do preview/storage
        // Isso pode ser útil, mas também pode ser confuso se o usuário quiser adicionar mais depois.
        // Vamos deixar sem limpar por enquanto para testar o comportamento de adicionar mais.
        // event.target.value = null;
    };


     // Função para verificar e mostrar/esconder o botão '+'
     const checkImageLimit = (previewContainer) => {
          const addBtn = previewContainer.querySelector('.add-image-btn');
          if (!addBtn) return;
          const currentImageCount = previewContainer.querySelectorAll('.image-preview').length;
          addBtn.style.display = currentImageCount >= MAX_IMAGES ? 'none' : 'flex';
     };


    addImageInput.addEventListener('change', (event) => handleFileChange(event, addImagePreviews, addProductFiles));
    editImageInput.addEventListener('change', (event) => handleFileChange(event, editImagePreviews, editProductFiles));


    // --- Funções Principais ---

    // Carrega TODOS os produtos (ativos e inativos) da API
    const carregarTodosProdutos = async () => {
        productListPlaceholder.textContent = 'Carregando produtos...';
        productListPlaceholder.classList.remove('hidden');
        productListContainer.innerHTML = '';

        try {
            const [ativosRes, inativosRes] = await Promise.all([
                fetchWithAuth('/api/produtos'),
                fetchWithAuth('/api/produtos/inativos')
            ]);

            if (!ativosRes.ok || !inativosRes.ok) {
                let errorMsg = 'Falha ao carregar lista de produtos.';
                try {
                     if (!ativosRes.ok) errorMsg = (await ativosRes.json()).message || errorMsg;
                     else if (!inativosRes.ok) errorMsg = (await inativosRes.json()).message || errorMsg;
                } catch (e) {}
                throw new Error(errorMsg);
            }

            const ativos = await ativosRes.json();
            const inativos = await inativosRes.json();

            todosProdutos = [
                ...ativos.map(p => ({ ...p, ativo: true })),
                ...inativos.map(p => ({ ...p, ativo: false }))
            ];
            todosProdutos.sort((a, b) => a.nome.localeCompare(b.nome));

            renderizarProdutos();

        } catch (error) {
            console.error('Erro ao carregar produtos:', error);
            productListPlaceholder.textContent = `Erro ao carregar produtos: ${error.message}. Tente novamente.`;
            productListPlaceholder.classList.remove('hidden');
            todosProdutos = [];
        }
    };

    // Renderiza a lista de produtos na tela com base nos filtros
    const renderizarProdutos = () => {
        productListContainer.innerHTML = '';
        productListPlaceholder.classList.add('hidden');

        const produtosFiltrados = todosProdutos.filter(p => {
            const correspondeStatus = (filtroAtual === 'ativos' && p.ativo) || (filtroAtual === 'inativos' && !p.ativo);
            const correspondeBusca = termoBusca === '' ||
                                     p.nome.toLowerCase().includes(termoBusca) ||
                                     (p.codigo && String(p.codigo).toLowerCase().includes(termoBusca)); // Garante que código é string
            return correspondeStatus && correspondeBusca;
        });

        if (produtosFiltrados.length === 0) {
            productListPlaceholder.textContent = `Nenhum produto ${filtroAtual} encontrado ${termoBusca ? 'para "' + termoBusca + '"' : ''}.`;
            productListPlaceholder.classList.remove('hidden');
            return;
        }

        produtosFiltrados.forEach(produto => {
            const card = document.createElement('div');
            card.className = `flex items-start gap-3 bg-white dark:bg-zinc-900 rounded-lg p-3 shadow-sm product-card ${!produto.ativo ? 'opacity-60' : ''}`;
            card.dataset.produtoId = produto.id;

            card.innerHTML = `
                <img class="rounded-lg size-16 object-cover border dark:border-zinc-700 flex-shrink-0" src="${produto.foto_url || 'img/placeholder.png'}" alt="${produto.nome}"/>
                <div class="flex-1 min-w-0">
                    <p class="text-secondary dark:text-white text-base font-semibold leading-tight truncate" title="${produto.nome}">${produto.nome}</p>
                    <p class="text-zinc-500 dark:text-zinc-400 text-sm font-normal">SKU: ${produto.codigo || 'N/A'}</p>
                    <p class="text-${produto.ativo ? 'primary' : 'zinc-500 dark:text-zinc-400'} font-bold text-base mt-1">${formatCurrency(produto.preco)}</p>
                    <p class="text-xs text-zinc-400">Estoque: ${produto.estoque}</p>
                </div>
                <div class="flex flex-col items-end gap-1 flex-shrink-0">
                    <button class="btn-edit flex items-center justify-center rounded-lg h-7 px-2 bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors">
                        <span class="material-symbols-outlined mr-1 text-sm">edit</span> Editar
                    </button>
                    ${produto.ativo ? `
                        <button class="btn-inativar flex items-center justify-center rounded-lg h-7 px-2 bg-warning/10 text-warning text-xs font-medium hover:bg-warning/20 transition-colors">
                            <span class="material-symbols-outlined mr-1 text-sm">visibility_off</span> Inativar
                        </button>
                    ` : `
                        <button class="btn-ativar flex items-center justify-center rounded-lg h-7 px-2 bg-success/10 text-success text-xs font-medium hover:bg-success/20 transition-colors">
                            <span class="material-symbols-outlined mr-1 text-sm">visibility</span> Ativar
                        </button>
                        <button class="btn-excluir-perm flex items-center justify-center rounded-lg h-7 px-2 bg-danger/10 text-danger text-xs font-medium hover:bg-danger/20 transition-colors mt-1" title="Excluir Permanentemente">
                            <span class="material-symbols-outlined mr-1 text-sm">delete_forever</span> Excluir
                        </button>
                    `}
                </div>
            `;
            productListContainer.appendChild(card);
        });
    };

    // --- Tratamento de Eventos ---

    // Busca com Debounce
    searchInput.addEventListener('input', () => {
        clearTimeout(searchInput.timer);
        searchInput.timer = setTimeout(() => {
            termoBusca = searchInput.value.toLowerCase();
            renderizarProdutos();
        }, 300);
    });

    // Abas Ativos/Inativos
    const handleTabClick = (tabId) => {
        filtroAtual = tabId;
        tabAtivos.classList.toggle('active', tabId === 'ativos');
        tabInativos.classList.toggle('active', tabId === 'inativos');
        renderizarProdutos();
    };
    tabAtivos.addEventListener('click', () => handleTabClick('ativos'));
    tabInativos.addEventListener('click', () => handleTabClick('inativos'));

    // Abrir Modal Adicionar
    addProductButton.addEventListener('click', () => {
        addProductForm.reset();
        addImagePreviews.innerHTML = `<label for="add-images-input" class="add-image-btn"><span class="material-symbols-outlined text-4xl">add_photo_alternate</span></label>`;
        addProductFiles = [];
        addImageInput.value = null;
        clearModalMessage(addProductMessage);
        checkImageLimit(addImagePreviews); // Garante que o botão + apareça
        openPopup(addProductPopup);
    });

    // Submeter Formulário Adicionar (CORRIGIDO)
    addProductForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        clearModalMessage(addProductMessage);
        // CORREÇÃO: Seleciona o botão DENTRO do contexto do popup/formulário
        const submitButton = addProductPopup.querySelector('button[type="submit"]'); // Busca dentro do popup

        // VERIFICAÇÃO ADICIONADA: Checa se o botão foi encontrado
        if (!submitButton) {
            console.error("Botão de submit não encontrado no formulário de adicionar produto.");
            showModalMessage(addProductMessage, "Erro interno: Botão não encontrado.", true);
            return; // Impede a continuação se o botão não existe
        }

        submitButton.disabled = true; // Agora é seguro desabilitar
        submitButton.innerHTML = `<div class="spinner mr-2 inline-block"></div> Salvando...`;

        const formData = new FormData();
        formData.append('nome', document.getElementById('add-product-name').value);
        formData.append('codigo', document.getElementById('add-product-codigo').value);
        formData.append('preco', document.getElementById('add-product-preco').value);
        formData.append('estoque', document.getElementById('add-product-estoque').value);
        formData.append('categoria', document.getElementById('add-product-categoria').value);
        formData.append('descricao', document.getElementById('add-product-descricao').value);
        addProductFiles.forEach(file => formData.append('imagens', file));

        try {
            const response = await fetchWithAuth('/api/produtos', { method: 'POST', body: formData });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Erro ao salvar.');

            showModalMessage(addProductMessage, 'Produto salvo com sucesso!');
            await carregarTodosProdutos(); // Recarrega lista
             // Limpa o formulário e previews após sucesso ANTES de fechar
             addProductForm.reset();
             addImagePreviews.innerHTML = `<label for="add-images-input" class="add-image-btn"><span class="material-symbols-outlined text-4xl">add_photo_alternate</span></label>`;
             addProductFiles = []; // Limpa array de arquivos
             addImageInput.value = null; // Limpa input file
            setTimeout(() => { closePopup(addProductPopup); }, 1500);

        } catch (error) {
            console.error("Erro ao adicionar produto:", error);
            showModalMessage(addProductMessage, `Erro: ${error.message}`, true);
        } finally {
             // Reabilita botão mesmo se falhar
             if (submitButton) {
                submitButton.disabled = false;
                submitButton.textContent = 'Salvar Produto';
            }
        }
    });

    // Submeter Formulário Editar (CORRIGIDO)
    editProductForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        clearModalMessage(editProductMessage);
        // CORREÇÃO: Seleciona o botão DENTRO do contexto do popup/formulário
        const submitButton = editProductPopup.querySelector('button[type="submit"]'); // Busca dentro do popup

        // VERIFICAÇÃO ADICIONADA:
        if (!submitButton) {
            console.error("Botão de submit não encontrado no formulário de editar produto.");
            showModalMessage(editProductMessage, "Erro interno: Botão não encontrado.", true);
            return;
        }

        submitButton.disabled = true; // Desabilita
        submitButton.innerHTML = `<div class="spinner mr-2 inline-block"></div> Salvando...`; // Adiciona spinner

        const id = editProductIdInput.value;
        const formData = new FormData();
        formData.append('nome', editProductNameInput.value);
        formData.append('codigo', editProductCodigoInput.value);
        formData.append('preco', editProductPrecoInput.value);
        formData.append('estoque', editProductEstoqueInput.value);
        formData.append('categoria', editProductCategoriaInput.value);
        formData.append('descricao', editProductDescricaoInput.value);
        formData.append('fotosParaRemover', JSON.stringify(fotosParaRemoverEdit));
        editProductFiles.forEach(file => formData.append('imagens', file));

        try {
            const response = await fetchWithAuth(`/api/produtos/${id}`, { method: 'PUT', body: formData });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Erro ao atualizar.');

            showModalMessage(editProductMessage, 'Produto atualizado com sucesso!');
            await carregarTodosProdutos();
             // Limpa arrays de controle após sucesso
             fotosParaRemoverEdit = [];
             editProductFiles = [];
             editImageInput.value = null; // Limpa input file
            setTimeout(() => { closePopup(editProductPopup); }, 1500);

        } catch (error) {
            console.error("Erro ao editar produto:", error);
            showModalMessage(editProductMessage, `Erro: ${error.message}`, true);
        } finally {
            if (submitButton) {
               submitButton.disabled = false;
               submitButton.textContent = 'Salvar Alterações';
            }
        }
    });

    // Eventos nos Cards de Produto
    productListContainer.addEventListener('click', async (event) => {
        const button = event.target.closest('button');
        if (!button) return;
        const card = button.closest('.product-card');
        if (!card || !card.dataset.produtoId) return;
        const produtoId = card.dataset.produtoId;
        const produto = todosProdutos.find(p => p.id == produtoId);
        if (!produto) return;

        if (button.classList.contains('btn-edit')) {
            editProductForm.reset();
            editImagePreviews.innerHTML = `<label for="edit-images-input" class="add-image-btn"><span class="material-symbols-outlined text-4xl">add_photo_alternate</span></label>`;
            fotosParaRemoverEdit = [];
            editProductFiles = [];
            editImageInput.value = null;
            clearModalMessage(editProductMessage);

            try {
                const response = await fetchWithAuth(`/api/produtos/${produtoId}`);
                if (!response.ok) throw new Error('Falha ao buscar detalhes do produto.');
                const produtoDetalhado = await response.json();

                editProductIdInput.value = produtoDetalhado.id;
                editProductNameInput.value = produtoDetalhado.nome || '';
                editProductCodigoInput.value = produtoDetalhado.codigo || '';
                editProductPrecoInput.value = produtoDetalhado.preco || '';
                editProductEstoqueInput.value = produtoDetalhado.estoque || '';
                editProductCategoriaInput.value = produtoDetalhado.categoria || '';
                editProductDescricaoInput.value = produtoDetalhado.descricao || '';

                if (produtoDetalhado.fotos && Array.isArray(produtoDetalhado.fotos)) {
                    produtoDetalhado.fotos.forEach(foto => {
                        if (!foto || !foto.url) return;
                        const div = document.createElement('div');
                        div.className = 'image-preview existing-image'; // Marca como existente
                        div.innerHTML = `
                            <img src="${foto.url}" alt="Preview">
                            <button type="button" class="remove-image-btn existing-photo" title="Remover imagem salva">&times;</button>
                        `;
                        const removeBtn = div.querySelector('.remove-image-btn');
                        removeBtn.dataset.fotoId = foto.id;
                        removeBtn.dataset.publicId = foto.public_id;
                        editImagePreviews.insertBefore(div, editImagePreviews.querySelector('.add-image-btn'));

                        removeBtn.addEventListener('click', (ev) => {
                            ev.stopPropagation();
                            const fotoId = ev.target.dataset.fotoId;
                            const publicId = ev.target.dataset.publicId;
                            if (publicId) { // Só adiciona se tiver public_id
                                fotosParaRemoverEdit.push({ id: fotoId !== 'null' ? parseInt(fotoId, 10) : null, public_id: publicId });
                                console.log("Marcado para remover:", fotosParaRemoverEdit);
                                div.remove();
                                checkImageLimit(editImagePreviews); // Verifica limite após remover
                            } else {
                                console.warn("Não foi possível marcar para remover: Public ID ausente.", foto);
                            }
                        });
                    });
                }
                checkImageLimit(editImagePreviews); // Verifica limite ao carregar
                openPopup(editProductPopup);

            } catch(error) {
                 console.error("Erro ao preparar edição:", error);
                 alert(`Erro ao carregar dados do produto: ${error.message}`);
            }
        }
        else if (button.classList.contains('btn-inativar')) {
            if (confirm(`Tem certeza que deseja INATIVAR o produto "${produto.nome}"?`)) {
                try {
                    button.disabled = true; button.innerHTML = '<div class="spinner spinner-small inline-block"></div>'; // Spinner
                    const response = await fetchWithAuth(`/api/produtos/${produtoId}`, { method: 'DELETE' }); // DELETE = Inativar
                    if (!response.ok) throw new Error((await response.json()).message || 'Erro ao inativar.');
                    await carregarTodosProdutos(); // Recarrega e re-renderiza
                } catch (error) {
                    console.error("Erro ao inativar:", error); alert(`Erro: ${error.message}`);
                    button.disabled = false; button.innerHTML = '<span class="material-symbols-outlined mr-1 text-sm">visibility_off</span> Inativar';
                }
            }
        }
        else if (button.classList.contains('btn-ativar')) {
             if (confirm(`Tem certeza que deseja ATIVAR o produto "${produto.nome}"?`)) {
                 try {
                     button.disabled = true; button.innerHTML = '<div class="spinner spinner-small inline-block"></div>';
                     const response = await fetchWithAuth(`/api/produtos/${produtoId}/reativar`, { method: 'PUT' });
                     if (!response.ok) throw new Error((await response.json()).message || 'Erro ao ativar.');
                     await carregarTodosProdutos();
                 } catch (error) {
                     console.error("Erro ao ativar:", error); alert(`Erro: ${error.message}`);
                     button.disabled = false; button.innerHTML = '<span class="material-symbols-outlined mr-1 text-sm">visibility</span> Ativar';
                 }
            }
        }
         else if (button.classList.contains('btn-excluir-perm')) {
            if (confirm(`ATENÇÃO! Excluir PERMANENTEMENTE "${produto.nome}"? NÃO pode ser desfeito e só funciona se não houver vendas.`)) {
                try {
                    button.disabled = true; button.innerHTML = '<div class="spinner spinner-small inline-block"></div>';
                    const response = await fetchWithAuth(`/api/produtos/excluir-em-massa`, {
                         method: 'POST', body: JSON.stringify({ ids: [produtoId] })
                    });
                     const data = await response.json();
                    if (!response.ok) throw new Error(data.message || 'Erro ao excluir.');
                    alert(data.message || "Excluído com sucesso");
                    await carregarTodosProdutos();
                } catch (error) {
                    console.error("Erro ao excluir permanentemente:", error); alert(`Erro: ${error.message}`);
                     button.disabled = false; button.innerHTML = '<span class="material-symbols-outlined mr-1 text-sm">delete_forever</span> Excluir';
                }
            }
        }
     });

    // Fechar Modais
    document.querySelectorAll('.popup-backdrop').forEach(backdrop => {
        backdrop.addEventListener('click', (event) => { if (event.target === backdrop) closePopup(backdrop); });
        backdrop.querySelectorAll('.close-popup-btn').forEach(button => button.addEventListener('click', () => closePopup(backdrop)));
     });

    // --- Inicialização ---
    handleTabClick('ativos');
    carregarTodosProdutos();

}); // Fim do DOMContentLoaded
