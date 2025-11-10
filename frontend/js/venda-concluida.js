checkAuth(); // Verifica autenticação do funcionário

document.addEventListener('DOMContentLoaded', () => {
    // Elementos da página
    const numeroVendaEl = document.getElementById('numero-venda');
    const reciboContainer = document.getElementById('recibo-container');
    const reciboNomeEmpresaEl = document.getElementById('recibo-nome-empresa');
    const reciboEnderecoEmpresaEl = document.getElementById('recibo-endereco-empresa');
    const reciboTelefoneEmpresaEl = document.getElementById('recibo-telefone-empresa');
    const reciboClienteNomeEl = document.getElementById('recibo-cliente-nome');
    const reciboDataEl = document.getElementById('recibo-data');
    const reciboVendedorNomeEl = document.getElementById('recibo-vendedor-nome');
    const reciboVendaIdEl = document.getElementById('recibo-venda-id');
    const reciboItensTableBody = document.getElementById('recibo-itens-table').querySelector('tbody');
    const reciboPagamentosEl = document.getElementById('recibo-pagamentos');
    const reciboTotalValorEl = document.getElementById('recibo-total-valor');
    const btnCompartilhar = document.getElementById('btn-compartilhar');
    const btnInicio = document.getElementById('btn-inicio');
    const btnNovaVenda = document.getElementById('btn-nova-venda');

    let vendaDetalhes = null; // Para armazenar os detalhes da venda
    let dadosEmpresa = null; // Para armazenar dados da empresa

    // Função para buscar detalhes da venda
    async function carregarDetalhesVenda(vendaId) {
        if (!vendaId) {
            alert('ID da venda não encontrado.');
            window.location.href = 'painel.html'; // Volta pro painel
            return;
        }

        try {
            // Busca dados da venda e da empresa em paralelo
            const [vendaRes, empresaRes] = await Promise.all([
                 fetchWithAuth(`/api/vendas/${vendaId}`),
                 fetchWithAuth('/api/empresas/meus-dados') // Endpoint que retorna nome, endereço, tel
            ]);

            if (!vendaRes.ok) throw new Error('Falha ao buscar detalhes da venda.');
            vendaDetalhes = await vendaRes.json();

            if (empresaRes.ok) {
                 dadosEmpresa = await empresaRes.json();
            } else {
                 console.warn("Não foi possível buscar dados da empresa para o recibo.");
            }


            // Preenche os elementos da página
            numeroVendaEl.textContent = `#${vendaDetalhes.id}`;
            reciboVendaIdEl.textContent = `#${vendaDetalhes.id}`;
            reciboClienteNomeEl.textContent = vendaDetalhes.cliente_nome || 'Não identificado';
            reciboDataEl.textContent = new Date(vendaDetalhes.data_venda).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
            reciboVendedorNomeEl.textContent = vendaDetalhes.usuario_nome || 'N/A';

            // Preenche cabeçalho do recibo com dados da empresa (se disponíveis)
            if (dadosEmpresa) {
                 reciboNomeEmpresaEl.textContent = dadosEmpresa.nome_empresa || 'Empresa';
                 reciboEnderecoEmpresaEl.textContent = dadosEmpresa.endereco_comercial || '';
                 reciboTelefoneEmpresaEl.textContent = dadosEmpresa.telefone_comercial || '';
            } else {
                 reciboNomeEmpresaEl.textContent = 'Recibo'; // Fallback
            }


            // Preenche tabela de itens
            reciboItensTableBody.innerHTML = ''; // Limpa tabela
            let subtotalItens = 0;
            vendaDetalhes.itens.forEach(item => {
                const subtotal = item.quantidade * item.preco_unitario;
                subtotalItens += subtotal;
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${item.produto_nome}</td>
                    <td>${item.quantidade}</td>
                    <td>${parseFloat(item.preco_unitario).toFixed(2)}</td>
                    <td>${subtotal.toFixed(2)}</td>
                `;
                reciboItensTableBody.appendChild(tr);
            });

             // Preenche pagamentos e calcula total pago
             reciboPagamentosEl.innerHTML = '<h3 class="text-sm font-semibold mb-1">Pagamento:</h3>'; // Reseta e adiciona título
             let totalPago = 0;
             if (vendaDetalhes.pagamentos && vendaDetalhes.pagamentos.length > 0) {
                 vendaDetalhes.pagamentos.forEach(p => {
                     reciboPagamentosEl.innerHTML += `<p>- ${p.metodo}: R$ ${parseFloat(p.valor).toFixed(2)}</p>`;
                     totalPago += parseFloat(p.valor);
                 });
             } else {
                 // Se não houver pagamentos registrados (caso raro ou erro), assume o total da venda
                 totalPago = vendaDetalhes.valor_total;
                  reciboPagamentosEl.innerHTML += `<p>Forma não especificada: R$ ${parseFloat(totalPago).toFixed(2)}</p>`;
             }


            // Preenche o total (usando o total PAGO)
            reciboTotalValorEl.textContent = `R$ ${totalPago.toFixed(2)}`;

        } catch (error) {
            console.error('Erro ao carregar detalhes:', error);
            alert(`Erro ao carregar detalhes da venda: ${error.message}`);
            reciboContainer.innerHTML = '<p class="text-red-500 text-center">Não foi possível carregar os detalhes da venda.</p>';
            btnCompartilhar.disabled = true;
        }
    }

    // Função para compartilhar o recibo
    async function compartilharRecibo() {
        if (!vendaDetalhes) {
            alert('Detalhes da venda não carregados.');
            return;
        }

        btnCompartilhar.disabled = true;
        btnCompartilhar.innerHTML = 'Gerando imagem...';

        try {
            // Usa html2canvas para gerar a imagem do container do recibo
            const canvas = await html2canvas(reciboContainer, {
                 scale: 2, // Aumenta a resolução da imagem
                 backgroundColor: '#ffffff' // Define fundo branco
            });

            // Converte o canvas para Blob
            canvas.toBlob(async (blob) => {
                if (!blob) {
                    throw new Error('Falha ao gerar blob da imagem.');
                }

                const fileName = `recibo_venda_${vendaDetalhes.id}.png`;
                const file = new File([blob], fileName, { type: 'image/png' });
                const shareData = {
                    files: [file],
                    title: `Recibo Venda #${vendaDetalhes.id}`,
                    text: `Segue o recibo da venda #${vendaDetalhes.id}`,
                };

                // Tenta usar a API de Compartilhamento Web
                if (navigator.canShare && navigator.canShare(shareData)) {
                    try {
                        await navigator.share(shareData);
                        console.log('Recibo compartilhado com sucesso!');
                    } catch (err) {
                        // Se o usuário cancelar o compartilhamento, não é um erro real
                        if (err.name !== 'AbortError') {
                            console.error('Erro ao compartilhar:', err);
                            // Fallback para download se o compartilhamento falhar por outro motivo
                            downloadRecibo(blob, fileName);
                        }
                    }
                } else {
                    // Fallback para download se a API não for suportada
                    console.log('API de Compartilhamento Web não suportada, iniciando download.');
                    downloadRecibo(blob, fileName);
                }

            }, 'image/png');

        } catch (error) {
            console.error('Erro ao gerar ou compartilhar recibo:', error);
            alert('Ocorreu um erro ao tentar compartilhar o recibo. Tente baixar.');
             // Tenta oferecer o download como fallback em caso de erro no processo
             try {
                  const canvas = await html2canvas(reciboContainer, { scale: 2, backgroundColor: '#ffffff' });
                  canvas.toBlob((blob) => {
                       if(blob) downloadRecibo(blob, `recibo_venda_${vendaDetalhes.id}.png`);
                  }, 'image/png');
             } catch (downloadError) {
                  console.error("Erro no fallback de download:", downloadError);
             }

        } finally {
            btnCompartilhar.disabled = false;
            btnCompartilhar.innerHTML = '<span class="material-symbols-outlined">share</span> Compartilhar Recibo';
        }
    }

    // Função de fallback para download
    function downloadRecibo(blob, fileName) {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href); // Libera a memória
    }


    // --- Event Listeners ---
    btnCompartilhar.addEventListener('click', compartilharRecibo);
    btnInicio.addEventListener('click', () => { window.location.href = 'painel.html'; });
    btnNovaVenda.addEventListener('click', () => { window.location.href = 'nova-venda.html'; });

    // --- Inicialização ---
    const urlParams = new URLSearchParams(window.location.search);
    const vendaId = urlParams.get('id');
    carregarDetalhesVenda(vendaId);

});
