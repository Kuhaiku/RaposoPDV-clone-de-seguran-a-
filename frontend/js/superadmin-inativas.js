const API_URL = '';

// Funções de Autenticação e API para o Super Admin
function checkSuperAdminAuth() {
    const token = localStorage.getItem('superAdminAuthToken');
    if (!token) {
        window.location.href = 'superadmin-login.html';
    }
    return token;
}

function logoutSuperAdmin() {
    localStorage.removeItem('superAdminAuthToken');
    window.location.href = 'superadmin-login.html';
}

async function fetchWithSuperAdminAuth(endpoint, options = {}) {
    const token = checkSuperAdminAuth();
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    const response = await fetch(`${API_URL}${endpoint}`, { ...options, headers });
    if (response.status === 401 || response.status === 403) {
        logoutSuperAdmin();
    }
    return response;
}


document.addEventListener('DOMContentLoaded', () => {
    checkSuperAdminAuth();

    const logoutBtn = document.getElementById('logout-superadmin-btn');
    const empresasInativasBody = document.getElementById('empresas-inativas-body');

    // Função para carregar e exibir as empresas inativas
    async function carregarEmpresasInativas() {
        try {
            const response = await fetchWithSuperAdminAuth('/api/empresas/inativas');
            const empresas = await response.json();
            empresasInativasBody.innerHTML = '';
            if (empresas.length === 0) {
                empresasInativasBody.innerHTML = '<tr><td colspan="4">Nenhuma empresa inativa encontrada.</td></tr>';
                return;
            }
            empresas.forEach(empresa => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${empresa.id}</td>
                    <td>${empresa.nome_empresa}</td>
                    <td>${empresa.email_contato}</td>
                    <td>
                        <button class="btn-action btn-edit" data-id="${empresa.id}" style="background-color: var(--success-color);">Reativar</button>
                    </td>
                `;
                empresasInativasBody.appendChild(tr);
            });
        } catch (error) {
            console.error('Erro ao carregar empresas inativas:', error);
            empresasInativasBody.innerHTML = '<tr><td colspan="4">Erro ao carregar empresas.</td></tr>';
        }
    }

    // Listener para a tabela de empresas (para o botão 'Reativar')
    empresasInativasBody.addEventListener('click', async (event) => {
        if (event.target.classList.contains('btn-edit')) { // Reutilizando classe de botão
            const empresaId = event.target.dataset.id;
            if (confirm(`Tem certeza que deseja reativar a empresa ID ${empresaId}?`)) {
                try {
                    const response = await fetchWithSuperAdminAuth(`/api/empresas/ativar/${empresaId}`, { method: 'PUT' });
                    if (!response.ok) throw new Error('Falha ao reativar empresa.');
                    
                    // Recarrega a lista para remover a empresa que foi reativada
                    carregarEmpresasInativas();
                } catch (error) {
                    alert(error.message);
                }
            }
        }
    });

    logoutBtn.addEventListener('click', logoutSuperAdmin);
    
    // Carrega a lista de empresas inativas ao iniciar a página
    carregarEmpresasInativas();
});