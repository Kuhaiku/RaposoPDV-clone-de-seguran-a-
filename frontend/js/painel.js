// Garante que checkAuth e fetchWithAuth estão disponíveis (de auth.js)
if (typeof checkAuth !== 'function' || typeof fetchWithAuth !== 'function') {
    console.error("Funções 'checkAuth' ou 'fetchWithAuth' não encontradas. Verifique se auth.js foi carregado corretamente.");
} else {
    checkAuth(); // Verifica se o usuário está logado
}

document.addEventListener('DOMContentLoaded', () => {
    // --- Elementos do DOM ---
    const logoutBtn = document.getElementById('logout-btn');
    const faturamentoPeriodoEl = document.getElementById('faturamento-periodo'); // ID da métrica principal
    const darkModeToggle = document.getElementById('dark-mode-toggle'); // Botão dark mode (opcional)

    // NOVO: Seleciona o link do catálogo
    const catalogoLink = document.getElementById('catalogo-link');

    // --- Funções ---

    // Função para carregar as métricas E os dados da empresa (slug)
    async function carregarDadosPainel() { 
        if (faturamentoPeriodoEl) faturamentoPeriodoEl.textContent = 'Carregando...';
        if (catalogoLink) {
            catalogoLink.style.pointerEvents = 'none'; // Desabilita o clique enquanto carrega
            catalogoLink.title = 'Carregando...';
        }

        try {
            // Faz as duas chamadas em paralelo
            const [metricasRes, empresaRes] = await Promise.all([
                fetchWithAuth('/api/dashboard/metricas'), // Endpoint das métricas
                fetchWithAuth('/api/empresas/meus-dados') // Endpoint para buscar o slug
            ]);

            // Processa as métricas
            if (!metricasRes.ok) {
                 const errorData = await metricasRes.json().catch(() => ({ message: 'Erro desconhecido ao buscar métricas.' }));
                 throw new Error(errorData.message || `Erro ${metricasRes.status}`);
            }
            const metricasData = await metricasRes.json();

            if (faturamentoPeriodoEl) {
                const faturamentoNumerico = parseFloat(metricasData.faturamentoPeriodo) || 0; 
                faturamentoPeriodoEl.textContent = faturamentoNumerico.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            }

            // NOVO: Processa os dados da empresa (slug)
            if (empresaRes.ok && catalogoLink) {
                const empresaData = await empresaRes.json();
                if (empresaData.slug) {
                    catalogoLink.href = `catalogo.html?empresa=${empresaData.slug}`;
                    catalogoLink.style.pointerEvents = 'auto'; // Reabilita o clique
                    catalogoLink.title = 'Acessar catálogo público';
                } else {
                    console.warn('Slug da empresa não encontrado. O link do catálogo não funcionará.');
                    catalogoLink.href = '#'; // Deixa como '#' se o slug não vier
                    catalogoLink.title = 'Catálogo indisponível';
                }
            } else if (catalogoLink) {
                console.warn('Não foi possível carregar os dados da empresa (slug).');
                catalogoLink.title = 'Catálogo indisponível';
            }

        } catch (error) {
            console.error('Erro ao buscar dados do painel:', error);
            if (faturamentoPeriodoEl) faturamentoPeriodoEl.textContent = 'Erro'; 
            if (catalogoLink) catalogoLink.title = 'Erro ao carregar';
        }
    }

    // --- Event Listeners ---

    // Logout
    if (logoutBtn) {
        logoutBtn.addEventListener('click', logout); // Chama a função logout() de auth.js
    } else {
        console.warn("Botão de logout (#logout-btn) não encontrado.");
    }

    // Dark Mode Toggle (Exemplo básico, requer Tailwind dark mode configurado como 'class')
    if (darkModeToggle) {
        // Verifica preferência salva ou do sistema e aplica no carregamento
        if (localStorage.theme === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }

        darkModeToggle.addEventListener('click', () => {
            // Alterna a classe 'dark' no elemento <html>
            const isDark = document.documentElement.classList.toggle('dark');
            // Salva a preferência no localStorage
            localStorage.theme = isDark ? 'dark' : 'light';
        });
    }

    // --- Inicialização ---
    carregarDadosPainel(); // Carrega os dados ao carregar a página

}); // Fim do DOMContentLoaded