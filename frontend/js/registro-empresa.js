const API_URL = ''; // URL da sua API

const registroForm = document.getElementById('registro-empresa-form');
const messageDiv = document.getElementById('message');

registroForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    messageDiv.textContent = '';
    messageDiv.className = 'error-message'; // Reseta a classe

    const novaEmpresa = {
        nome_empresa: document.getElementById('nome_empresa').value,
        email_contato: document.getElementById('email_contato').value,
        senha: document.getElementById('senha').value,
        telefone_comercial: document.getElementById('telefone_comercial').value
    };

    try {
        const response = await fetch(`${API_URL}/api/empresas/registrar-publico`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(novaEmpresa),
        });
        
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Erro ao tentar cadastrar.');
        }

        // Sucesso
        messageDiv.textContent = 'Cadastro realizado com sucesso! Aguarde a aprovação do administrador para fazer login.';
        messageDiv.className = 'success-message'; // Classe de sucesso (CSS global)
        registroForm.reset();

    } catch (error) {
        messageDiv.textContent = error.message;
    }
});