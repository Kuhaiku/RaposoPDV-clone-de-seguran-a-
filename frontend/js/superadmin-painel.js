const API_URL = '';

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

    // FORMULÁRIO DE ADIÇÃO REMOVIDO
    // const addEmpresaForm = document.getElementById('add-empresa-form');
    // const successMessageDiv = document.getElementById('success-message');
    
    const logoutBtn = document.getElementById('logout-superadmin-btn');
    const empresasAtivasBody = document.getElementById('empresas-ativas-body');

    async function carregarEmpresasAtivas() {
        try {
            const response = await fetchWithSuperAdminAuth('/api/empresas/ativas');
            const empresas = await response.json();
            empresasAtivasBody.innerHTML = '';
            if (empresas.length === 0) {
                empresasAtivasBody.innerHTML = '<tr><td colspan="5">Nenhuma empresa ativa encontrada.</td></tr>';
                return;
            }
            empresas.forEach(empresa => {
                const tr = document.createElement('tr');
                let statusClass = '';
                if (empresa.status_pagamento === 'Em Dia') statusClass = 'status-pago';
                else if (empresa.status_pagamento === 'Atrasado') statusClass = 'status-atrasado';
                else statusClass = 'status-aguardando';

                tr.innerHTML = `
                    <td>${empresa.id}</td>
                    <td><a href="superadmin-empresa-detalhes.html?id=${empresa.id}" class="link-tabela">${empresa.nome_empresa}</a></td>
                    <td><span class="status ${statusClass}">${empresa.status_pagamento}</span></td>
                    <td>Dia ${empresa.dia_pagamento_acordado || 'N/D'}</td>
                    <td>
                        <button class="btn-tabela inativar" data-id="${empresa.id}">Inativar</button>
                    </td>
                `;
                empresasAtivasBody.appendChild(tr);
            });
        } catch (error) {
            console.error('Erro ao carregar empresas:', error);
            empresasAtivasBody.innerHTML = '<tr><td colspan="5">Erro ao carregar empresas.</td></tr>';
        }
    }

    empresasAtivasBody.addEventListener('click', async (event) => {
        if (event.target.classList.contains('inativar')) {
            const empresaId = event.target.dataset.id;
            if (confirm(`Tem certeza que deseja inativar a empresa ID ${empresaId}?`)) {
                try {
                    const response = await fetchWithSuperAdminAuth(`/api/empresas/inativar/${empresaId}`, { method: 'PUT' });
                    if (!response.ok) throw new Error('Falha ao inativar empresa.');
                    carregarEmpresasAtivas();
                } catch (error) {
                    alert(error.message);
                }
            }
        }
    });

    // LISTENER DO FORMULÁRIO DE ADIÇÃO REMOVIDO
    // addEmpresaForm.addEventListener('submit', ...);

    logoutBtn.addEventListener('click', logoutSuperAdmin);
    carregarEmpresasAtivas();
});