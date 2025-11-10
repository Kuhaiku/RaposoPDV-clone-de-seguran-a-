// Garante que checkAuth e fetchWithAuth estão disponíveis (de auth.js)
if (typeof checkAuth !== 'function' || typeof fetchWithAuth !== 'function') {
    console.error("Funções 'checkAuth' ou 'fetchWithAuth' não encontradas. Verifique se auth.js foi carregado corretamente.");
} else {
    checkAuth(); // Verifica se o usuário está logado
}

document.addEventListener('DOMContentLoaded', () => {
    // --- Elementos do DOM ---
    const logoutBtn = document.getElementById('logout-btn');
    const faturamentoPeriodoEl = document.getElementById('faturamento-periodo'); // ID da métrica principal (CORRIGIDO)
    const darkModeToggle = document.getElementById('dark-mode-toggle'); // Botão dark mode (opcional)

    // --- Funções ---

    // Função para carregar as métricas (agora só faturamento do período)
    async function carregarMetricas() {
        // Mostra um estado de carregamento inicial
        if (faturamentoPeriodoEl) faturamentoPeriodoEl.textContent = 'Carregando...';

        try {
            const response = await fetchWithAuth('/api/dashboard/metricas'); // Endpoint da API
            if (!response.ok) {
                 const errorData = await response.json().catch(() => ({ message: 'Erro desconhecido ao buscar métricas.' }));
                 throw new Error(errorData.message || `Erro ${response.status}`);
            }
            const data = await response.json();

            // Atualiza apenas a métrica existente
            if (faturamentoPeriodoEl) {
                // Usa 'faturamentoPeriodo' que é o nome da métrica no backend (CORRIGIDO)
                const faturamentoNumerico = parseFloat(data.faturamentoPeriodo) || 0; 
                // Formata como moeda brasileira
                faturamentoPeriodoEl.textContent = faturamentoNumerico.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            }

            // A lógica de Novos Clientes e Gráficos foi REMOVIDA

        } catch (error) {
            console.error('Erro ao buscar métricas:', error);
            if (faturamentoPeriodoEl) faturamentoPeriodoEl.textContent = 'Erro'; // Indica erro na UI
            // Poderia mostrar um alert ou mensagem mais detalhada
            // alert(`Não foi possível carregar as métricas: ${error.message}`);
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
    carregarMetricas(); // Carrega as métricas ao carregar a página

}); // Fim do DOMContentLoaded
