const pool = require('../config/database');

// Abre um novo caixa
exports.abrir = async (req, res) => {
    const { valor_inicial } = req.body;
    const usuario_id = req.usuarioId;
    const empresa_id = req.empresaId; // Pego do token

    if (valor_inicial === undefined || valor_inicial < 0) {
        return res.status(400).json({ message: 'O valor inicial é obrigatório e não pode ser negativo.' });
    }

    try {
        // Agora a verificação também leva em conta a empresa
        const [openCaixas] = await pool.query('SELECT id FROM caixas WHERE data_fechamento IS NULL AND empresa_id = ?', [empresa_id]);
        if (openCaixas.length > 0) {
            return res.status(409).json({ message: 'Já existe um caixa aberto para esta empresa.' });
        }

        // CORREÇÃO: Adicionamos a coluna `empresa_id` e o valor na query.
        const [result] = await pool.query(
            'INSERT INTO caixas (empresa_id, usuario_abertura_id, data_abertura, valor_inicial) VALUES (?, ?, NOW(), ?)',
            [empresa_id, usuario_id, valor_inicial]
        );

        res.status(201).json({ message: 'Caixa aberto com sucesso!', caixaId: result.insertId });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro ao abrir o caixa.' });
    }
};

// Verifica o status atual do caixa
exports.obterStatus = async (req, res) => {
    const empresa_id = req.empresaId;
    try {
        const [rows] = await pool.query(
            'SELECT * FROM caixas WHERE data_fechamento IS NULL AND empresa_id = ? ORDER BY data_abertura DESC LIMIT 1',
            [empresa_id]
        );
        if (rows.length === 0) {
            return res.status(200).json({ status: 'fechado', message: 'Nenhum caixa aberto no momento.' });
        }
        res.status(200).json({ status: 'aberto', caixa: rows[0] });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro ao verificar status do caixa.' });
    }
};

// Fecha o caixa atualmente aberto
exports.fechar = async (req, res) => {
    const { valor_final_apurado, observacoes } = req.body;
    const usuario_id = req.usuarioId;
    const empresa_id = req.empresaId;
    if (valor_final_apurado === undefined) {
        return res.status(400).json({ message: 'O valor final apurado é obrigatório.' });
    }
    try {
        const [openCaixas] = await pool.query('SELECT id FROM caixas WHERE data_fechamento IS NULL AND empresa_id = ? ORDER BY data_abertura DESC LIMIT 1', [empresa_id]);
        if (openCaixas.length === 0) {
            return res.status(404).json({ message: 'Nenhum caixa aberto para fechar.' });
        }
        const caixaId = openCaixas[0].id;
        await pool.query(
            'UPDATE caixas SET usuario_fechamento_id = ?, data_fechamento = NOW(), valor_final_apurado = ?, observacoes = ? WHERE id = ? AND empresa_id = ?',
            [usuario_id, valor_final_apurado, observacoes, caixaId, empresa_id]
        );
        res.status(200).json({ message: 'Caixa fechado com sucesso!', caixaId: caixaId });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro ao fechar o caixa.' });
    }
};

// Lista todos os caixas que já foram fechados
exports.listarFechados = async (req, res) => {
    const empresa_id = req.empresaId;
    try {
        const [rows] = await pool.query(`
            SELECT c.id, c.data_abertura, c.valor_inicial, c.data_fechamento, c.valor_final_apurado, c.observacoes, u_abertura.nome AS usuario_abertura_nome, u_fechamento.nome AS usuario_fechamento_nome
            FROM caixas AS c
            LEFT JOIN usuarios AS u_abertura ON c.usuario_abertura_id = u_abertura.id
            LEFT JOIN usuarios AS u_fechamento ON c.usuario_fechamento_id = u_fechamento.id
            WHERE c.data_fechamento IS NOT NULL AND c.empresa_id = ?
            ORDER BY c.data_fechamento DESC
        `, [empresa_id]);
        res.status(200).json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro ao buscar o histórico de caixas.' });
    }
};

// Retorna dados para o gráfico da página principal (mês inteiro)
exports.obterDadosGrafico = async (req, res) => {
    const empresa_id = req.empresaId;
    try {
        const [rows] = await pool.query(`
            SELECT DATE_FORMAT(data_fechamento, '%d/%m') AS dia, SUM(valor_final_apurado) AS valor_total_dia
            FROM caixas
            WHERE data_fechamento IS NOT NULL AND MONTH(data_fechamento) = MONTH(NOW()) AND YEAR(data_fechamento) = YEAR(NOW()) AND empresa_id = ?
            GROUP BY dia 
            ORDER BY MIN(data_fechamento) ASC
        `, [empresa_id]);
        res.status(200).json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro ao buscar dados para o gráfico.' });
    }
};

// Retorna uma lista de anos que possuem registros de caixas fechados
exports.listarAnosDisponiveis = async (req, res) => {
    const empresa_id = req.empresaId;
    try {
        const [rows] = await pool.query(`
            SELECT DISTINCT YEAR(data_fechamento) AS ano
            FROM caixas WHERE data_fechamento IS NOT NULL AND empresa_id = ? ORDER BY ano DESC
        `, [empresa_id]);
        const anos = rows.map(row => row.ano);
        res.status(200).json(anos);
    } catch (error) {
        res.status(500).json({ message: 'Erro ao buscar anos disponíveis.' });
    }
};

// Retorna o valor total apurado para cada mês de um ano específico
exports.obterHistoricoAnual = async (req, res) => {
    const { ano } = req.query;
    const empresa_id = req.empresaId;
    if (!ano) return res.status(400).json({ message: 'O ano é um parâmetro obrigatório.' });
    try {
        const [rows] = await pool.query(`
            SELECT MONTH(data_fechamento) AS mes, SUM(valor_final_apurado) AS total_apurado
            FROM caixas WHERE YEAR(data_fechamento) = ? AND empresa_id = ?
            GROUP BY MONTH(data_fechamento) ORDER BY mes ASC
        `, [ano, empresa_id]);
        res.status(200).json(rows);
    } catch (error) {
        res.status(500).json({ message: 'Erro ao buscar histórico anual.' });
    }
};

// Busca todos os detalhes de um único caixa pelo ID
exports.obterPorId = async (req, res) => {
    const { id } = req.params;
    const empresa_id = req.empresaId;
    try {
        const [rows] = await pool.query(`
            SELECT c.*, u_abertura.nome AS usuario_abertura_nome, u_fechamento.nome AS usuario_fechamento_nome
            FROM caixas AS c
            LEFT JOIN usuarios AS u_abertura ON c.usuario_abertura_id = u_abertura.id
            LEFT JOIN usuarios AS u_fechamento ON c.usuario_fechamento_id = u_fechamento.id
            WHERE c.id = ? AND c.empresa_id = ?
        `, [id, empresa_id]);
        if (rows.length === 0) {
            return res.status(404).json({ message: 'Registro de caixa não encontrado.' });
        }
        res.status(200).json(rows[0]);
    } catch (error) {
        res.status(500).json({ message: 'Erro ao buscar detalhes do caixa.' });
    }
};