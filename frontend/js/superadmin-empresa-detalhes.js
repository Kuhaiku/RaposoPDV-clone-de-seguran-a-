const API_URL = '';

function checkSuperAdminAuth() {
    const token = localStorage.getItem('superAdminAuthToken');
    if (!token) window.location.href = 'superadmin-login.html';
    return token;
}

function logoutSuperAdmin() {
    localStorage.removeItem('superAdminAuthToken');
    window.location.href = 'superadmin-login.html';
}

async function fetchWithSuperAdminAuth(endpoint, options = {}) {
    const token = checkSuperAdminAuth();
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const response = await fetch(`${API_URL}${endpoint}`, { ...options, headers });
    if (response.status === 401 || response.status === 403) logoutSuperAdmin();
    return response;
}

document.addEventListener('DOMContentLoaded', () => {
    checkSuperAdminAuth();
    
    const urlParams = new URLSearchParams(window.location.search);
    const empresaId = urlParams.get('id');
    if (!empresaId) {
        alert('ID da empresa não especificado.');
        window.location.href = 'superadmin-painel.html';
        return;
    }

    const logoutBtn = document.getElementById('logout-superadmin-btn');
    const headerNomeEmpresa = document.getElementById('header-nome-empresa');
    const dadosEmpresaView = document.getElementById('dados-empresa-view');
    const pagamentosBody = document.getElementById('pagamentos-body');
    const proximoVencimentoEl = document.getElementById('proximo-vencimento');
    const addPagamentoForm = document.getElementById('add-pagamento-form');
    const successMessageDiv = document.getElementById('success-message');

    // NOVOS ELEMENTOS DO MODAL
    const redefinirSenhaBtn = document.getElementById('btn-redefinir-senha-empresa');
    const redefinirSenhaModal = document.getElementById('redefinir-senha-empresa-modal');
    const redefinirSenhaForm = document.getElementById('redefinir-senha-empresa-form');
    const cancelarRedefinirBtn = document.getElementById('cancelar-redefinir-empresa-btn');


    function calcularProximoVencimento(diaAcordado) {
        const hoje = new Date();
        let vencimento = new Date(hoje.getFullYear(), hoje.getMonth(), diaAcordado);

        if (vencimento < hoje) {
            vencimento.setMonth(vencimento.getMonth() + 1);
        }

        let diaDaSemana = vencimento.getDay();
        if (diaDaSemana === 0) {
            vencimento.setDate(vencimento.getDate() + 1);
        } else if (diaDaSemana === 6) {
            vencimento.setDate(vencimento.getDate() + 2);
        }
        
        return vencimento.toLocaleDateString('pt-BR');
    }

    async function carregarDados() {
        try {
            const [empresaRes, pagamentosRes] = await Promise.all([
                fetchWithSuperAdminAuth(`/api/empresas/detalhes/${empresaId}`),
                fetchWithSuperAdminAuth(`/api/pagamentos/${empresaId}`)
            ]);
            
            const empresa = await empresaRes.json();
            const pagamentos = await pagamentosRes.json();
            
            headerNomeEmpresa.textContent = empresa.nome_empresa;
            dadosEmpresaView.innerHTML = `
                <p><strong>CNPJ:</strong> ${empresa.cnpj || 'N/A'}</p>
                <p><strong>Telefone:</strong> ${empresa.telefone_comercial || 'N/A'}</p>
                <p><strong>Endereço:</strong> ${empresa.endereco_comercial || 'N/A'}</p>
                <p><strong>Email Contato:</strong> ${empresa.email_contato}</p>
                <p><strong>Dia Vencimento:</strong> Dia ${empresa.dia_pagamento_acordado}</p>
            `;

            proximoVencimentoEl.textContent = calcularProximoVencimento(empresa.dia_pagamento_acordado);

            pagamentosBody.innerHTML = '';
            if (pagamentos.length > 0) {
                pagamentos.forEach(p => {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td>${new Date(p.data_pagamento).toLocaleDateString('pt-BR')}</td>
                        <td>R$ ${parseFloat(p.valor_pago).toFixed(2)}</td>
                        <td>${String(p.mes_referencia).padStart(2, '0')}/${p.ano_referencia}</td>
                    `;
                    pagamentosBody.appendChild(tr);
                });
            } else {
                pagamentosBody.innerHTML = '<tr><td colspan="3">Nenhum pagamento registrado.</td></tr>';
            }
        } catch (error) {
            console.error(error);
        }
    }

    addPagamentoForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const hoje = new Date();
        const novoPagamento = {
            empresaId: empresaId,
            valorPago: document.getElementById('valor-pago').value,
            mesReferencia: hoje.getMonth() + 1,
            anoReferencia: hoje.getFullYear()
        };
        try {
            const response = await fetchWithSuperAdminAuth('/api/pagamentos/registrar', {
                method: 'POST',
                body: JSON.stringify(novoPagamento)
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message);
            
            addPagamentoForm.reset();
            successMessageDiv.textContent = 'Pagamento registrado com sucesso!';
            setTimeout(() => { successMessageDiv.textContent = ''; }, 3000);
            carregarDados();
        } catch (error) {
            alert(error.message);
        }
    });

    // --- LÓGICA DO MODAL DE REDEFINIR SENHA ---
    redefinirSenhaBtn.addEventListener('click', () => {
        redefinirSenhaModal.style.display = 'flex';
    });

    cancelarRedefinirBtn.addEventListener('click', () => {
        redefinirSenhaModal.style.display = 'none';
        redefinirSenhaForm.reset();
    });

    redefinirSenhaForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const novaSenha = document.getElementById('nova-senha-empresa').value;
        try {
            const response = await fetchWithSuperAdminAuth(`/api/empresas/${empresaId}/redefinir-senha`, {
                method: 'PUT',
                body: JSON.stringify({ novaSenha })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message);
            
            alert(data.message);
            redefinirSenhaModal.style.display = 'none';
            redefinirSenhaForm.reset();
        } catch (error) {
            alert(error.message);
        }
    });

    logoutBtn.addEventListener('click', logoutSuperAdmin);
    carregarDados();
});