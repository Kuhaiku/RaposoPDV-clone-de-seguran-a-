const pool = require('../config/database');

// Cria um novo cliente para a empresa logada
exports.criar = async (req, res) => {
    const empresa_id = req.empresaId;
    const { nome, telefone, cpf, email, logradouro, numero, bairro, cidade, estado, cep } = req.body;
    if (!nome) return res.status(400).json({ message: 'O campo nome é obrigatório.' });
    try {
        const [result] = await pool.query('INSERT INTO clientes (empresa_id, nome, telefone, cpf, email, logradouro, numero, bairro, cidade, estado, cep) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [empresa_id, nome, telefone, cpf, email, logradouro, numero, bairro, cidade, estado, cep]);
        res.status(201).json({ message: 'Cliente criado com sucesso!', clienteId: result.insertId });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'Este CPF já está cadastrado nesta empresa.' });
        console.error(error);
        res.status(500).json({ message: 'Erro ao criar cliente.' });
    }
};

// Lista todos os clientes da empresa logada
exports.listarTodos = async (req, res) => {
    const empresa_id = req.empresaId;
    try {
        const [rows] = await pool.query('SELECT * FROM clientes WHERE empresa_id = ? ORDER BY nome ASC', [empresa_id]);
        res.status(200).json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro ao listar clientes.' });
    }
};

// Obtém um cliente específico pelo ID
exports.obterPorId = async (req, res) => {
    const { id } = req.params;
    const empresa_id = req.empresaId;
    try {
        const [rows] = await pool.query('SELECT * FROM clientes WHERE id = ? AND empresa_id = ?', [id, empresa_id]);
        if (rows.length === 0) return res.status(404).json({ message: 'Cliente não encontrado.' });
        res.status(200).json(rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro ao obter cliente.' });
    }
};

// Atualiza um cliente
exports.atualizar = async (req, res) => {
    const { id } = req.params;
    const empresa_id = req.empresaId;
    const { nome, telefone, cpf, email, logradouro, numero, bairro, cidade, estado, cep } = req.body;
    try {
        const [result] = await pool.query('UPDATE clientes SET nome = ?, telefone = ?, cpf = ?, email = ?, logradouro = ?, numero = ?, bairro = ?, cidade = ?, estado = ?, cep = ? WHERE id = ? AND empresa_id = ?', [nome, telefone, cpf, email, logradouro, numero, bairro, cidade, estado, cep, id, empresa_id]);
        if (result.affectedRows === 0) return res.status(404).json({ message: 'Cliente não encontrado ou não pertence à sua empresa.' });
        res.status(200).json({ message: 'Cliente atualizado com sucesso.' });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'Este CPF já pertence a outro cadastro nesta empresa.' });
        console.error(error);
        res.status(500).json({ message: 'Erro ao atualizar cliente.' });
    }
};

// Exclui um cliente
exports.excluir = async (req, res) => {
    const { id } = req.params;
    const empresa_id = req.empresaId;
    try {
        const [result] = await pool.query('DELETE FROM clientes WHERE id = ? AND empresa_id = ?', [id, empresa_id]);
        if (result.affectedRows === 0) return res.status(404).json({ message: 'Cliente não encontrado ou não pertence à sua empresa.' });
        res.status(200).json({ message: 'Cliente excluído com sucesso.' });
    } catch (error) {
        if (error.code === 'ER_ROW_IS_REFERENCED_2') return res.status(400).json({ message: 'Não é possível excluir este cliente pois ele está associado a vendas existentes.' });
        console.error(error);
        res.status(500).json({ message: 'Erro ao excluir cliente.' });
    }
};

// FUNÇÃO ADICIONADA DE VOLTA
exports.obterVendasPorCliente = async (req, res) => {
    const { id } = req.params;
    const empresa_id = req.empresaId;
    try {
        const [vendas] = await pool.query(
            'SELECT id, valor_total, data_venda FROM vendas WHERE cliente_id = ? AND empresa_id = ? ORDER BY data_venda DESC',
            [id, empresa_id]
        );
        res.status(200).json(vendas);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro ao buscar histórico de vendas do cliente.' });
    }
};

// Obtém os detalhes completos de um cliente
exports.obterDetalhes = async (req, res) => {
    const { id } = req.params;
    const empresa_id = req.empresaId;
    try {
        const [clienteRows] = await pool.query('SELECT * FROM clientes WHERE id = ? AND empresa_id = ?', [id, empresa_id]);
        if (clienteRows.length === 0) {
            return res.status(404).json({ message: 'Cliente não encontrado.' });
        }
        const [vendasRows] = await pool.query('SELECT id, valor_total, data_venda FROM vendas WHERE cliente_id = ? AND empresa_id = ? ORDER BY data_venda DESC', [id, empresa_id]);
        const [totalGastoRows] = await pool.query('SELECT SUM(valor_total) AS total_gasto FROM vendas WHERE cliente_id = ? AND empresa_id = ?', [id, empresa_id]);
        res.status(200).json({
            ...clienteRows[0],
            total_gasto: totalGastoRows[0].total_gasto || 0,
            historico_compras: vendasRows
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro ao buscar detalhes do cliente.' });
    }
};