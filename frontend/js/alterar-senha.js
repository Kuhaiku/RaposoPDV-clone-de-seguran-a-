checkAuth();

document.addEventListener('DOMContentLoaded', () => {
    const logoutBtn = document.getElementById('logout-btn');
    const alterarSenhaForm = document.getElementById('alterar-senha-form');
    const successMessageDiv = document.getElementById('success-message');

    alterarSenhaForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        successMessageDiv.textContent = '';
        
        const senhaAtual = document.getElementById('senha-atual').value;
        const novaSenha = document.getElementById('nova-senha').value;

        try {
            const response = await fetchWithAuth('/api/usuarios/redefinir-senha-propria', {
                method: 'PUT',
                body: JSON.stringify({ senhaAtual, novaSenha })
            });
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message);
            }

            alterarSenhaForm.reset();
            successMessageDiv.textContent = data.message + " Você será deslogado por segurança.";
            
            // Desloga o usuário após 3 segundos
            setTimeout(() => {
                logout();
            }, 3000);

        } catch (error) {
            alert(error.message);
        }
    });

    logoutBtn.addEventListener('click', logout);
});