const API_URL = ''; // API na mesma URL
const form = document.getElementById('esqueci-senha-form');
const messageDiv = document.getElementById('message');
const submitButton = form.querySelector('button[type="submit"]');

form.addEventListener('submit', async (event) => {
    event.preventDefault();
    messageDiv.textContent = '';
    messageDiv.className = 'error-message';
    submitButton.disabled = true;
    submitButton.textContent = 'Enviando...';

    const email = document.getElementById('email').value;

    try {
        const response = await fetch(`${API_URL}/api/usuarios/solicitar-redefinicao-senha`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email }),
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Erro ao enviar solicitação.');
        }

        messageDiv.textContent = 'E-mail enviado com sucesso! Verifique sua caixa de entrada e lixo eletrônico.';
        messageDiv.className = 'success-message';
        
        // Redireciona para a página de reset, passando o e-mail
        setTimeout(() => {
            window.location.href = `reset-senha.html?email=${encodeURIComponent(email)}`;
        }, 3000);

    } catch (error) {
        messageDiv.textContent = error.message;
        submitButton.disabled = false;
        submitButton.textContent = 'Enviar E-mail';
    }
});