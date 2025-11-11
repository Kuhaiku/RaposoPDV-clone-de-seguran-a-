const API_URL = ''; // API na mesma URL
const form = document.getElementById('reset-senha-form');
const messageDiv = document.getElementById('message');
const emailInput = document.getElementById('email');
const submitButton = form.querySelector('button[type="submit"]');

// Preenche o e-mail vindo da URL
document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const email = urlParams.get('email');
    if (email) {
        emailInput.value = email;
    } else {
        alert('E-mail não encontrado. Volte para a página "Esqueci a Senha".');
        window.location.href = 'esqueci-senha.html';
    }
});

form.addEventListener('submit', async (event) => {
    event.preventDefault();
    messageDiv.textContent = '';
    messageDiv.className = 'error-message';
    submitButton.disabled = true;
    submitButton.textContent = 'Salvando...';

    const email = emailInput.value;
    const token = document.getElementById('token').value;
    const novaSenha = document.getElementById('novaSenha').value;

    try {
        const response = await fetch(`${API_URL}/api/usuarios/redefinir-senha-com-token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, token, novaSenha }),
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Erro ao redefinir a senha.');
        }

        messageDiv.textContent = 'Senha alterada com sucesso! Você já pode fazer login.';
        messageDiv.className = 'success-message';
        form.reset();
        
        setTimeout(() => {
            window.location.href = 'login.html';
        }, 3000);

    } catch (error) {
        messageDiv.textContent = error.message;
        submitButton.disabled = false;
        submitButton.textContent = 'Salvar Nova Senha';
    }
});