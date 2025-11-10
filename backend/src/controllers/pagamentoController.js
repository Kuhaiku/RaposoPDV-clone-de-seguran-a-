const pool = require('../config/database');

// Registra um novo pagamento para uma empresa específica
exports.registrarPagamento = async (req, res) => {
    const { empresaId, valorPago, mesReferencia, anoReferencia, observacao } = req.body;
    const dataPagamento = new Date();

    if (!empresaId || !valorPago || !mesReferencia || !anoReferencia) {
        return res.status(400).json({ message: 'Dados do pagamento incompletos.' });
    }

    try {
        const [result] = await pool.query(
            'INSERT INTO pagamentos_mensalidades (empresa_id, data_pagamento, valor_pago, mes_referencia, ano_referencia, observacao) VALUES (?, ?, ?, ?, ?, ?)',
            [empresaId, dataPagamento, valorPago, mesReferencia, anoReferencia, observacao]
        );
        res.status(201).json({ message: 'Pagamento registrado com sucesso!', id: result.insertId });
    } catch (error) {
        console.error('Erro ao registrar pagamento:', error);
        res.status(500).json({ message: 'Erro interno do servidor.' });
    }
};

// Lista todos os pagamentos de uma empresa específica
exports.listarPagamentosPorEmpresa = async (req, res) => {
    const { id } = req.params;

    try {
        const [pagamentos] = await pool.query(
            'SELECT * FROM pagamentos_mensalidades WHERE empresa_id = ? ORDER BY data_pagamento DESC',
            [id]
        );
        res.status(200).json(pagamentos);
    } catch (error) {
        console.error('Erro ao listar pagamentos:', error);
        res.status(500).json({ message: 'Erro interno do servidor.' });
    }
};