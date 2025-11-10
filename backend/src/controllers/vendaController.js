// backend/src/controllers/vendaController.js
const pool = require('../config/database');

exports.criar = async (req, res) => {
    // Agora esperamos também um array de pagamentos
    const { cliente_id, itens, pagamentos } = req.body;
    const usuario_id = req.usuarioId;
    const empresa_id = req.empresaId;

    if (!itens || itens.length === 0) {
        return res.status(400).json({ message: 'A venda deve conter pelo menos um item.' });
    }
    if (!pagamentos || pagamentos.length === 0) {
        return res.status(400).json({ message: 'A venda deve ter pelo menos uma forma de pagamento.' });
    }

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        // O valor total da venda continua sendo a soma dos produtos
        let valor_total_produtos = 0;
        for (const item of itens) {
            const [rows] = await connection.query('SELECT preco, estoque FROM produtos WHERE id = ? FOR UPDATE', [item.produto_id]);
            const produto = rows[0];
            if (!produto) throw new Error(`Produto com ID ${item.produto_id} não encontrado.`);
            if (produto.estoque < item.quantidade) throw new Error(`Estoque insuficiente para o produto ID ${item.produto_id}.`);
            valor_total_produtos += produto.preco * item.quantidade;
        }

        // 1. Insere na tabela de vendas
        const [vendaResult] = await connection.query(
            'INSERT INTO vendas (cliente_id, usuario_id, empresa_id, valor_total) VALUES (?, ?, ?, ?)',
            [cliente_id, usuario_id, empresa_id, valor_total_produtos]
        );
        const venda_id = vendaResult.insertId;

        // 2. Insere os itens da venda e atualiza o estoque
        for (const item of itens) {
            const [rows] = await connection.query('SELECT preco FROM produtos WHERE id = ?', [item.produto_id]);
            await connection.query(
                'INSERT INTO venda_itens (venda_id, produto_id, quantidade, preco_unitario) VALUES (?, ?, ?, ?)',
                [venda_id, item.produto_id, item.quantidade, rows[0].preco]
            );
            await connection.query('UPDATE produtos SET estoque = estoque - ? WHERE id = ?', [item.quantidade, item.produto_id]);
            
            // NOVO: Verifica se o estoque chegou a zero e inativa o produto
            const [estoqueAtual] = await connection.query('SELECT estoque FROM produtos WHERE id = ?', [item.produto_id]);
            if (estoqueAtual[0].estoque === 0) {
                await connection.query('UPDATE produtos SET ativo = 0 WHERE id = ?', [item.produto_id]);
            }
        }

        // 3. Insere os métodos de pagamento
        for (const pagamento of pagamentos) {
            await connection.query(
                'INSERT INTO venda_pagamentos (venda_id, metodo, valor) VALUES (?, ?, ?)',
                [venda_id, pagamento.metodo, pagamento.valor]
            );
        }

        await connection.commit();
        res.status(201).json({ message: 'Venda registrada com sucesso!', vendaId: venda_id });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error(error);
        res.status(500).json({ message: error.message || 'Erro no servidor ao registrar a venda.' });
    } finally {
        if (connection) connection.release();
    }
};

exports.obterPorId = async (req, res) => {
    const { id } = req.params;
    try {
        const [vendaRows] = await pool.query(`
            SELECT v.id, v.valor_total, v.data_venda, c.id AS cliente_id, c.nome AS cliente_nome, u.nome AS usuario_nome 
            FROM vendas AS v 
            LEFT JOIN clientes AS c ON v.cliente_id = c.id 
            JOIN usuarios AS u ON v.usuario_id = u.id 
            WHERE v.id = ?`, [id]
        );
        if (vendaRows.length === 0) {
            return res.status(404).json({ message: 'Venda não encontrada.' });
        }

        const [itensRows] = await pool.query(`
            SELECT vi.quantidade, vi.preco_unitario, p.nome AS produto_nome 
            FROM venda_itens AS vi 
            JOIN produtos AS p ON vi.produto_id = p.id 
            WHERE vi.venda_id = ?`, [id]
        );

        // Busca os pagamentos associados
        const [pagamentosRows] = await pool.query(
            'SELECT metodo, valor FROM venda_pagamentos WHERE venda_id = ?', [id]
        );
        
        const vendaDetalhada = { 
            ...vendaRows[0], 
            itens: itensRows,
            pagamentos: pagamentosRows // Adiciona os pagamentos à resposta
        };
        res.status(200).json(vendaDetalhada);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro ao obter detalhes da venda.' });
    }
};

// A função listarTodas pode permanecer a mesma, pois ela só mostra um resumo.
exports.listarTodas = async (req, res) => {
    const { dataInicio, dataFim, cliente, vendedor } = req.query;
    let query = `
        SELECT 
            v.id, v.valor_total, v.data_venda, 
            c.nome AS cliente_nome, u.nome AS usuario_nome
        FROM vendas AS v
        LEFT JOIN clientes AS c ON v.cliente_id = c.id
        JOIN usuarios AS u ON v.usuario_id = u.id
        WHERE v.empresa_id = ?
    `;
    const params = [req.empresaId];

    if (dataInicio) {
        query += " AND v.data_venda >= ?";
        params.push(dataInicio);
    }
    if (dataFim) {
        query += " AND v.data_venda < DATE_ADD(?, INTERVAL 1 DAY)";
        params.push(dataFim);
    }
    if (cliente) {
        query += " AND c.nome LIKE ?";
        params.push(`%${cliente}%`);
    }
    if (vendedor) {
        query += " AND v.usuario_id = ?";
        params.push(vendedor);
    }
    query += " ORDER BY v.data_venda DESC";

    try {
        const [vendas] = await pool.query(query, params);
        res.status(200).json(vendas);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro ao listar vendas.' });
    }
};

// Nova função para cancelar uma venda
exports.cancelar = async (req, res) => {
    const { id } = req.params;
    const empresa_id = req.empresaId;

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        // 1. Obtém os itens da venda para reverter o estoque
        const [itens] = await connection.query('SELECT produto_id, quantidade FROM venda_itens WHERE venda_id = ?', [id]);
        if (itens.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: 'Venda não encontrada ou já cancelada.' });
        }

        // 2. Reverte o estoque e REATIVA o produto
        for (const item of itens) {
            // ***** MODIFICAÇÃO AQUI *****
            // Atualiza o estoque E define 'ativo = 1'
            await connection.query(
                'UPDATE produtos SET estoque = estoque + ?, ativo = 1 WHERE id = ? AND empresa_id = ?', 
                [item.quantidade, item.produto_id, empresa_id]
            );
            // ***** FIM DA MODIFICAÇÃO *****
        }

        // 3. Exclui os pagamentos, itens da venda e a própria venda
        await connection.query('DELETE FROM venda_pagamentos WHERE venda_id = ?', [id]);
        await connection.query('DELETE FROM venda_itens WHERE venda_id = ?', [id]);
        await connection.query('DELETE FROM vendas WHERE id = ? AND empresa_id = ?', [id, empresa_id]);
        
        await connection.commit();
        res.status(200).json({ message: 'Venda cancelada e estoque revertido com sucesso.' });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error(error);
        res.status(500).json({ message: 'Erro no servidor ao cancelar a venda.' });
    } finally {
        if (connection) connection.release();
    }
};
