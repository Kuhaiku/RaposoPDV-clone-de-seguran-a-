const API_URL = '';

const loginForm = document.getElementById('login-empresa-form');
const errorMessageDiv = document.getElementById('error-message');

loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email_contato = document.getElementById('email_contato').value;
    const senha = document.getElementById('senha').value;
    errorMessageDiv.textContent = '';

    try {
        const response = await fetch(`${API_URL}/api/empresas/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email_contato, senha }),
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.message || 'Erro ao tentar fazer login.');
        }

        // Salva o token da EMPRESA no localStorage
        localStorage.setItem('empresaAuthToken', data.token);
        // Redireciona para o painel da empresa
        window.location.href = 'painel-empresa.html';
    } catch (error) {
        errorMessageDiv.textContent = error.message;
    }
});