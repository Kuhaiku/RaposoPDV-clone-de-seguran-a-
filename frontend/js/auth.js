// Define a URL base da API. Deixe em branco se o frontend e o backend estiverem no mesmo servidor/domínio.
const API_URL = '';

/**
 * Verifica se o token de autenticação do funcionário existe no localStorage.
 * Redireciona para a página de login se não houver token e não estiver na página de login.
 */
function checkAuth() {
    const token = localStorage.getItem('authToken');
    // Verifica se não há token E se a página atual NÃO é login.html
    if (!token && !window.location.pathname.endsWith('login.html') && !window.location.pathname.endsWith('login-empresa.html')) {
        // Redireciona para a página de login apropriada (assumindo login de funcionário como padrão)
        window.location.href = 'login.html';
    }
    // Retorna true se autenticado, false caso contrário (útil se precisar da informação)
    return !!token;
}

/**
 * Remove o token de autenticação do funcionário do localStorage e redireciona para a página de login.
 */
function logout() {
    localStorage.removeItem('authToken');
    // Redireciona sempre para o login do funcionário ao deslogar
    window.location.href = 'login.html';
}

/**
 * Realiza uma requisição fetch adicionando o token de autenticação do funcionário
 * e tratando automaticamente o redirecionamento em caso de erro 401 (Não Autorizado).
 * Lida corretamente com requisições JSON e FormData.
 *
 * @param {string} endpoint O caminho da API (ex: '/api/produtos').
 * @param {object} options As opções do fetch (method, body, headers, etc.).
 * @returns {Promise<Response>} A promessa com a resposta do fetch.
 */
async function fetchWithAuth(endpoint, options = {}) {
    const token = localStorage.getItem('authToken');
    // Começa com os headers passados nas opções, ou um objeto vazio
    const headers = { ...options.headers };

    // Adiciona o token de autorização se existir
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    // *** IMPORTANTE: NÃO definir Content-Type se o body for FormData ***
    if (!(options.body instanceof FormData)) {
        // Define Content-Type como application/json por padrão para outros tipos de body,
        // apenas se não estiver já definido nas opções.
        if (!headers['Content-Type']) {
            headers['Content-Type'] = 'application/json';
        }
    }
    // Se for FormData, o navegador cuidará do Content-Type (multipart/form-data; boundary=...)

    try {
        // Realiza a requisição fetch com as opções e headers montados
        const response = await fetch(`${API_URL}${endpoint}`, {
            ...options, // Inclui method, body, etc.
            headers: headers // Usa os headers montados
        });

        // Se a resposta for 401 (Não autorizado), desloga o usuário e lança um erro
        if (response.status === 401) {
            logout(); // Executa a função de logout para limpar o token e redirecionar
            // Lança um erro para interromper a execução e ser pego pelo catch no local da chamada
            throw new Error('Sessão expirada ou inválida. Faça login novamente.');
        }

        // Retorna a resposta completa para ser tratada no local da chamada
        // (ex: verificar response.ok, chamar response.json(), etc.)
        return response;

    } catch (error) {
         // Loga erros de rede ou o erro 401 lançado acima
         console.error(`Erro na requisição para ${endpoint}:`, error);
         // Relança o erro para que o catch no local da chamada possa tratá-lo
         // (ex: exibindo uma mensagem de erro para o usuário)
         throw error;
    }
}


// --- LÓGICA DE RESPONSIVIDADE INTEGRADA ---
// IIFE (Immediately Invoked Function Expression) para encapsular o escopo
(function() {
    /**
     * Verifica se a largura da janela corresponde a um dispositivo móvel.
     * @returns {boolean} True se for considerado mobile, false caso contrário.
     */
    function isMobile() {
        // Define o ponto de corte para mobile (pode ajustar se necessário)
        return window.innerWidth <= 767;
    }

    /**
     * Configura funcionalidades responsivas (menu hambúrguer, CSS mobile)
     * se a tela for considerada mobile.
     */
    function setupResponsiveFeatures() {
        // Executa apenas se for mobile
        if (!isMobile()) {
            // Se não for mobile, garante que a sidebar não fique com a classe 'active'
            // caso o usuário redimensione a janela de mobile para desktop.
             const sidebar = document.querySelector('.sidebar');
             if (sidebar) {
                sidebar.classList.remove('active');
             }
             // Remove o botão hambúrguer se ele existir e a tela não for mais mobile
             const menuToggle = document.querySelector('.menu-toggle');
             if (menuToggle) {
                 menuToggle.remove();
             }
            return; // Sai da função se não for mobile
        }

        // --- Executa apenas em telas mobile ---

        // 1. Injeta a tag <link> para o mobile.css no <head> se ainda não existir
        if (!document.querySelector('link[href="css/mobile.css"]')) {
            const mobileCssLink = document.createElement('link');
            mobileCssLink.rel = 'stylesheet';
            mobileCssLink.href = 'css/mobile.css';
            document.head.appendChild(mobileCssLink);
        }


        // 2. Cria e injeta o botão do menu hambúrguer (apenas se houver sidebar e o botão ainda não existir)
        const sidebar = document.querySelector('.sidebar');
        if (sidebar && !document.querySelector('.menu-toggle')) {
            const menuToggle = document.createElement('button');
            menuToggle.innerHTML = '&#9776;'; // Ícone de hambúrguer (3 barras horizontais)
            menuToggle.className = 'menu-toggle'; // Classe para estilização (definida em mobile.css)
            menuToggle.setAttribute('aria-label', 'Abrir menu'); // Acessibilidade
            menuToggle.setAttribute('aria-controls', 'sidebar'); // Acessibilidade
            menuToggle.setAttribute('aria-expanded', 'false'); // Acessibilidade
            document.body.appendChild(menuToggle);

            // 3. Adiciona a funcionalidade de clique ao botão hambúrguer
            menuToggle.addEventListener('click', () => {
                const isExpanded = sidebar.classList.toggle('active'); // Alterna a classe 'active'
                menuToggle.setAttribute('aria-expanded', isExpanded.toString()); // Atualiza acessibilidade
                // Opcional: Mudar ícone para 'X' quando aberto
                // menuToggle.innerHTML = isExpanded ? '&#10005;' : '&#9776;';
            });

             // 4. Fecha a sidebar se clicar fora dela (no main-content, por exemplo)
             const mainContent = document.querySelector('.main-content');
             if (mainContent) {
                  mainContent.addEventListener('click', () => {
                       if (sidebar.classList.contains('active')) {
                            sidebar.classList.remove('active');
                            menuToggle.setAttribute('aria-expanded', 'false');
                            // menuToggle.innerHTML = '&#9776;'; // Volta ícone hambúrguer
                       }
                  });
             }
        }
    }

    // Executa a configuração de responsividade quando o DOM estiver pronto
    document.addEventListener('DOMContentLoaded', setupResponsiveFeatures);

    // Executa novamente se a janela for redimensionada (para lidar com mudanças de orientação ou tamanho)
    let resizeTimeout;
    window.addEventListener('resize', () => {
        // Usa um timeout para evitar execuções excessivas durante o redimensionamento
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(setupResponsiveFeatures, 150);
    });

})(); // Fim da IIFE
