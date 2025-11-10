document.addEventListener('DOMContentLoaded', () => {

    const API_URL = '';

    const catalogoGrid = document.getElementById('catalogo-grid');
    const nomeEmpresaHeader = document.getElementById('nome-empresa-header');
    const lightboxOverlay = document.getElementById('lightbox-overlay');
    const lightboxSwiperContainer = document.getElementById('lightbox-swiper-container');
    const lightboxClose = document.querySelector('.lightbox-close');
    const buscaProdutoInput = document.getElementById('busca-produto-catalogo');
    const filtrosCategoriaContainer = document.getElementById('filtros-categoria');

    let todosProdutos = [];
    let categoriaAtiva = 'todos';
    let lightboxSwiper = null;

    function renderizarProdutos() {
        catalogoGrid.innerHTML = '';
        const termoBusca = buscaProdutoInput.value.toLowerCase();
        
        const produtosFiltrados = todosProdutos.filter(produto => {
            const correspondeBusca = produto.nome.toLowerCase().includes(termoBusca);
            const correspondeCategoria = (categoriaAtiva === 'todos' || produto.categoria === categoriaAtiva);
            return correspondeBusca && correspondeCategoria;
        });

        if (produtosFiltrados.length === 0) {
            catalogoGrid.innerHTML = '<p>Nenhum produto encontrado com os filtros aplicados.</p>';
            return;
        }

        produtosFiltrados.forEach((produto, index) => {
            const card = document.createElement('div');
            card.className = 'produto-card';
            card.dataset.produtoId = produto.id;
            
            const fotoUrl = produto.fotos && produto.fotos.length > 0 ? produto.fotos[0] : 'img/placeholder.png';

            card.innerHTML = `
                <img src="${fotoUrl}" alt="${produto.nome}" class="produto-card-imagem">
                <div class="produto-card-info">
                    <h3 class="produto-card-nome">${produto.nome}</h3>
                    <p class="produto-card-descricao">${produto.descricao || ''}</p>
                    <p class="produto-card-preco">R$ ${parseFloat(produto.preco).toFixed(2)}</p>
                </div>
            `;
            catalogoGrid.appendChild(card);
        });
    }

    function criarBotoesFiltro(categorias) {
        filtrosCategoriaContainer.innerHTML = '';
        
        const btnTodos = document.createElement('button');
        btnTodos.className = 'btn-filtro-categoria active';
        btnTodos.textContent = 'Todos';
        btnTodos.dataset.categoria = 'todos';
        filtrosCategoriaContainer.appendChild(btnTodos);

        categorias.forEach(categoria => {
            const btn = document.createElement('button');
            btn.className = 'btn-filtro-categoria';
            btn.textContent = categoria;
            btn.dataset.categoria = categoria;
            filtrosCategoriaContainer.appendChild(btn);
        });
    }

    async function carregarCatalogo() {
        try {
            const urlParams = new URLSearchParams(window.location.search);
            const empresaSlug = urlParams.get('empresa');

            if (!empresaSlug) {
                throw new Error('Empresa não especificada.');
            }

            const response = await fetch(`${API_URL}/api/publico/catalogo/${empresaSlug}`);
            if (!response.ok) {
                throw new Error('Catálogo não encontrado ou indisponível.');
            }
            const data = await response.json();

            document.title = `Catálogo | ${data.nome_empresa}`;
            nomeEmpresaHeader.textContent = data.nome_empresa;
            todosProdutos = data.produtos.map(p => ({
                ...p,
                fotos: Array.isArray(p.fotos) ? p.fotos : JSON.parse(p.fotos)
            }));

            criarBotoesFiltro(data.categorias);
            renderizarProdutos();

        } catch (error) {
            console.error(error);
            nomeEmpresaHeader.textContent = 'Erro ao Carregar';
            catalogoGrid.innerHTML = `<p>${error.message}</p>`;
        }
    }
    
    catalogoGrid.addEventListener('click', async (event) => {
        const card = event.target.closest('.produto-card');
        if (card) {
            const produtoId = card.dataset.produtoId;
            const produto = todosProdutos.find(p => p.id == produtoId);
            if (!produto) return;

            const swiperWrapper = lightboxSwiperContainer.querySelector('.swiper-wrapper');
            swiperWrapper.innerHTML = '';

            if (produto.fotos && produto.fotos.length > 0) {
                produto.fotos.forEach(url => {
                    const slide = document.createElement('div');
                    slide.className = 'swiper-slide';
                    slide.innerHTML = `<img src="${url}" alt="${produto.nome}">`;
                    swiperWrapper.appendChild(slide);
                });
            } else {
                 const slide = document.createElement('div');
                    slide.className = 'swiper-slide';
                    slide.innerHTML = `<img src="img/placeholder.png" alt="Sem foto">`;
                    swiperWrapper.appendChild(slide);
            }

            if (lightboxSwiper) {
                lightboxSwiper.destroy(true, true);
            }

            lightboxSwiper = new Swiper(lightboxSwiperContainer, {
                loop: true,
                navigation: {
                    nextEl: '.swiper-button-next',
                    prevEl: '.swiper-button-prev',
                },
                autoplay: false,
            });

            lightboxOverlay.style.display = 'flex';
        }
    });

    function fecharLightbox() {
        lightboxOverlay.style.display = 'none';
        if (lightboxSwiper) {
            lightboxSwiper.destroy(true, true);
            lightboxSwiper = null;
        }
    }

    buscaProdutoInput.addEventListener('input', renderizarProdutos);

    filtrosCategoriaContainer.addEventListener('click', (event) => {
        if (event.target.tagName === 'BUTTON') {
            document.querySelectorAll('.btn-filtro-categoria').forEach(btn => btn.classList.remove('active'));
            event.target.classList.add('active');
            categoriaAtiva = event.target.dataset.categoria;
            renderizarProdutos();
        }
    });

    lightboxClose.addEventListener('click', fecharLightbox);
    lightboxOverlay.addEventListener('click', (event) => {
        if (event.target === lightboxOverlay) {
            fecharLightbox();
        }
    });

    carregarCatalogo();
});