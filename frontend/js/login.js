// Este arquivo agora controla o formulário de login do FUNCIONÁRIO

// Pega os elementos do formulário de login
const loginForm = document.getElementById('login-form');
const errorMessageDiv = document.getElementById('error-message');

loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    // Pega os valores dos TRÊS campos
    const email_empresa = document.getElementById('email_empresa').value;
    const email_funcionario = document.getElementById('email_funcionario').value;
    const senha = document.getElementById('senha').value;
    
    errorMessageDiv.textContent = '';

    try {
        // Envia os três dados para a API
        const response = await fetchWithAuth('/api/usuarios/login', {
            method: 'POST',
            body: JSON.stringify({ email_empresa, email_funcionario, senha }),
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.message || 'Erro ao tentar fazer login.');
        }

        // Salva o token do FUNCIONÁRIO no localStorage
        localStorage.setItem('authToken', data.token);
        window.location.href = 'painel.html';

    } catch (error) {
        errorMessageDiv.textContent = error.message;
    }
});