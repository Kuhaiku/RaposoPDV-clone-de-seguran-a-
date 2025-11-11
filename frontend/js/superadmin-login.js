const API_URL = 'http://localhost:3000';

const loginForm = document.getElementById('superadmin-login-form');
const errorMessageDiv = document.getElementById('error-message');

loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = document.getElementById('email').value;
    const senha = document.getElementById('senha').value;

    try {
        const response = await fetch(`${API_URL}/api/superadmin/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, senha }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message);

        localStorage.setItem('superAdminAuthToken', data.token);
        window.location.href = 'superadmin-painel.html';
    } catch (error) {
        errorMessageDiv.textContent = error.message;
    }
});