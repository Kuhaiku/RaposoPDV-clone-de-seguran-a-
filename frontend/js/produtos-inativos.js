checkAuth();

const logoutBtn = document.getElementById('logout-btn');
const produtosInativosTableBody = document.getElementById('produtos-inativos-table-body');

logoutBtn.addEventListener('click', logout);

async function carregarProdutosInativos() {
    try {
        const response = await fetchWithAuth('/api/produtos/inativos');
        if (!response.ok) throw new Error('Erro ao buscar produtos inativos.');
        
        const produtos = await response.json();
        produtosInativosTableBody.innerHTML = ''; 

        if (produtos.length === 0) {
            produtosInativosTableBody.innerHTML = `<tr><td colspan="5">Nenhum produto inativo encontrado.</td></tr>`;
            return;
        }

        produtos.forEach(produto => {
            const tr = document.createElement('tr');
            tr.dataset.produtoId = produto.id; 
            tr.innerHTML = `
                <td><img src="${produto.foto_url}" alt="${produto.nome}" class="produto-img"></td>
                <td>${produto.nome}</td>
                <td>R$ ${parseFloat(produto.preco).toFixed(2)}</td>
                <td>${produto.estoque}</td>
                <td>
                    <button class="btn-action btn-edit">Reativar</button>
                </td>
            `;
            produtosInativosTableBody.appendChild(tr);
        });
    } catch (error) {
        console.error(error.message);
        alert('Não foi possível carregar a lista de produtos inativos.');
    }
}

produtosInativosTableBody.addEventListener('click', async (event) => {
    const target = event.target;
    if (!target.classList.contains('btn-edit')) return;

    const tr = target.closest('tr');
    const produtoId = tr.dataset.produtoId;

    if (confirm('Tem certeza que deseja reativar este produto? Ele voltará a aparecer na loja.')) {
        try {
            const response = await fetchWithAuth(`/api/produtos/${produtoId}/reativar`, { method: 'PUT' });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message);
            
            // Recarrega a lista, o produto reativado deve sumir daqui
            carregarProdutosInativos();
        } catch (error) {
            alert(error.message);
        }
    }
});

document.addEventListener('DOMContentLoaded', carregarProdutosInativos);