// kuhaiku/raposopdv/RaposoPDV-085802f1cf98b5935bfd28bc7b0705fa97753a17/frontend/js/calculadora.js

// Garante que as funções de autenticação estejam disponíveis
if (typeof checkAuth !== 'function' || typeof fetchWithAuth !== 'function') {
    console.error("Funções 'checkAuth' ou 'fetchWithAuth' não encontradas em auth.js.");
    // Poderia adicionar um alerta ou bloquear a funcionalidade aqui
    alert("Erro crítico: Arquivo de autenticação não carregado corretamente.");
} else {
    checkAuth(); // Verifica se o usuário está logado
}

// --- Funções Auxiliares ---

// Formata um número como moeda BRL
const formatCurrency = (value) => {
    const number = parseFloat(value) || 0;
    return number.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

// Limpa e formata um valor de input (remove R$, pontos, troca vírgula por ponto)
const parseInputValue = (value) => {
    if (!value) return 0;
    const cleaned = String(value)
        .replace('R$', '')
        .replace(/\./g, '') // Remove pontos de milhar
        .replace(',', '.') // Troca vírgula decimal por ponto
        .trim();
    const number = parseFloat(cleaned);
    return isNaN(number) ? 0 : number; // Retorna 0 se não for um número válido
};

// --- Lógica Principal ---

document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM Calculadora carregado."); // Log para confirmar execução

    // Seleciona todos os elementos necessários logo no início
    const totalValueInput = document.getElementById('total-value');
    const percentageInput = document.getElementById('percentage');
    const resultInput = document.getElementById('result');
    const clearButton = document.getElementById('clear-button');
    const loadFromSalesButton = document.getElementById('load-sales-button');

    // **Verificação Imediata dos Elementos**
    if (!totalValueInput) console.error("Elemento 'total-value' não encontrado!");
    if (!percentageInput) console.error("Elemento 'percentage' não encontrado!");
    if (!resultInput) console.error("Elemento 'result' não encontrado!");
    if (!clearButton) console.error("Elemento 'clear-button' não encontrado!"); // Linha ~72 original estaria aqui
    if (!loadFromSalesButton) console.error("Elemento 'load-sales-button' não encontrado!");

    // Função principal de cálculo
    const calculatePercentage = () => {
        // Verifica se os inputs existem antes de ler o valor
        if (!totalValueInput || !percentageInput || !resultInput) return;

        const total = parseInputValue(totalValueInput.value);
        const percentage = parseInputValue(percentageInput.value);

        if (total > 0 && percentage >= 0) {
            const result = (total * percentage) / 100;
            resultInput.value = formatCurrency(result);
        } else {
            resultInput.value = formatCurrency(0); // Garante formato de moeda mesmo zerado
        }
    };

    // Carrega o valor total de vendas do período atual
    async function loadTotalSales() {
        if (!loadFromSalesButton || !totalValueInput) {
            console.error("Botão 'Carregar Vendas' ou input 'Valor Total' não encontrado para executar a função.");
            return;
        }

        const originalButtonHTML = loadFromSalesButton.innerHTML; // Salva o HTML original (ícone)
        loadFromSalesButton.disabled = true;
        loadFromSalesButton.innerHTML = `<div class="spinner spinner-small inline-block"></div>`; // Adiciona spinner

        try {
            const response = await fetchWithAuth('/api/dashboard/metricas');
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({})); // Tenta pegar erro da API
                throw new Error(errorData.message || `Falha ao buscar total de vendas (Status: ${response.status})`);
            }

            const data = await response.json();
            const total = parseFloat(data.faturamentoPeriodo) || 0;

            // Formata com vírgula para exibição no input
            totalValueInput.value = total.toFixed(2).replace('.', ',');

            calculatePercentage(); // Recalcula com o novo valor

        } catch (error) {
            console.error('Erro ao carregar o total de vendas:', error); // Loga o erro no console
            alert(`Erro ao carregar o total de vendas: ${error.message}`); // Mostra alerta para o usuário
        } finally {
            // Restaura o botão, independentemente de sucesso ou falha
            loadFromSalesButton.disabled = false;
            loadFromSalesButton.innerHTML = originalButtonHTML; // Restaura o ícone
        }
    }

    // --- Adiciona Event Listeners somente se os elementos existirem ---

    if (totalValueInput) {
        totalValueInput.addEventListener('input', calculatePercentage);
    }

    if (percentageInput) {
        percentageInput.addEventListener('input', calculatePercentage);
    }

    if (loadFromSalesButton) {
        loadFromSalesButton.addEventListener('click', loadTotalSales);
    }

    // O listener do botão limpar (onde o erro ocorria originalmente)
    if (clearButton) {
        clearButton.addEventListener('click', () => {
            console.log("Botão Limpar clicado."); // Log para confirmar clique
            if (totalValueInput) totalValueInput.value = '';
            if (percentageInput) percentageInput.value = '';
            if (resultInput) resultInput.value = formatCurrency(0);
            if (totalValueInput) totalValueInput.focus(); // Foca no primeiro campo
        });
    }

    // --- Inicialização ---
    if (resultInput) {
        resultInput.value = formatCurrency(0); // Define valor inicial formatado
    } else {
        console.warn("Input de resultado não encontrado para inicialização.");
    }

    console.log("Listeners da Calculadora adicionados."); // Confirma que chegou ao fim do setup
});
