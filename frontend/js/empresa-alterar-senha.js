const API_URL = '';

// Funções de Autenticação para a EMPRESA (copiadas de painel-empresa.js)
function checkEmpresaAuth() {
    const token = localStorage.getItem('empresaAuthToken');
    if (!token) {
        window.location.href = 'login-empresa.html';
    }
    return token;
}

function logoutEmpresa() {
    localStorage.removeItem('empresaAuthToken');
    window.location.href = 'login-empresa.html';
}

async function fetchWithEmpresaAuth(endpoint, options = {}) {
    const token = checkEmpresaAuth();
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    const response = await fetch(`${API_URL}${endpoint}`, { ...options, headers });
    if (response.status === 401) {
        logoutEmpresa();
    }
    return response;
}

document.addEventListener('DOMContentLoaded', () => {
    checkEmpresaAuth();

    const nomeEmpresaHeader = document.getElementById('nome-empresa-header');
    const logoutBtn = document.getElementById('logout-empresa-btn');
    const alterarSenhaForm = document.getElementById('alterar-senha-empresa-form');
    const successMessageDiv = document.getElementById('success-message');

    // Preenche o nome da empresa no header
    try {
        const token = localStorage.getItem('empresaAuthToken');
        const payload = JSON.parse(atob(token.split('.')[1]));
        nomeEmpresaHeader.textContent = payload.nomeEmpresa;
    } catch (e) {
        nomeEmpresaHeader.textContent = "Empresa";
    }

    alterarSenhaForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        successMessageDiv.textContent = '';
        
        const senhaAtual = document.getElementById('senha-atual').value;
        const novaSenha = document.getElementById('nova-senha').value;

        try {
            const response = await fetchWithEmpresaAuth('/api/empresas/redefinir-senha-propria', {
                method: 'PUT',
                body: JSON.stringify({ senhaAtual, novaSenha })
            });
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message);
            }

            alterarSenhaForm.reset();
            successMessageDiv.textContent = data.message + " Você será deslogado por segurança.";
            
            // Desloga a empresa após 3 segundos
            setTimeout(() => {
                logoutEmpresa();
            }, 3000);

        } catch (error) {
            alert(error.message);
        }
    });

    logoutBtn.addEventListener('click', logoutEmpresa);
});
