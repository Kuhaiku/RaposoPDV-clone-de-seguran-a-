(function() {
    // Função para verificar se a tela é de dispositivo móvel
    function isMobile() {
        return window.innerWidth <= 767;
    }

    // Função que executa toda a lógica de responsividade
    function setupResponsiveFeatures() {
        // Se não for mobile, não faz nada
        if (!isMobile()) {
            return;
        }

        // 1. Injeta o CSS do mobile no <head>
        const mobileCssLink = document.createElement('link');
        mobileCssLink.rel = 'stylesheet';
        mobileCssLink.href = 'css/mobile.css';
        document.head.appendChild(mobileCssLink);

        // 2. Cria e injeta o botão do menu (apenas se houver uma sidebar na página)
        const sidebar = document.querySelector('.sidebar');
        if (sidebar) {
            const menuToggle = document.createElement('button');
            menuToggle.innerHTML = '&#9776;'; // Ícone de hambúrguer
            menuToggle.className = 'menu-toggle';
            document.body.appendChild(menuToggle);

            // 3. Adiciona a funcionalidade de clique ao botão
            menuToggle.addEventListener('click', () => {
                sidebar.classList.toggle('active');
            });
        }
    }

    // Executa a função assim que o DOM estiver pronto
    document.addEventListener('DOMContentLoaded', setupResponsiveFeatures);

})();
