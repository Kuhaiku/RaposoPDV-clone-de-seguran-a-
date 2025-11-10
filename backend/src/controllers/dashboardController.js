// kuhaiku/raposopdv/RaposoPDV-769745521c52e0c8dd0eaa6a76ce386c5a6d5e4d/backend/src/controllers/dashboardController.js
const pool = require('../config/database');

exports.obterMetricas = async (req, res) => {
    const empresa_id = req.empresaId; // Obtém o ID da empresa do token de autenticação
    const usuario_id = req.usuarioId; // Adiciona ID do usuário logado

    try {
        // NOVO: 1. Busca a data de início do período atual do usuário
        const [usuarioRow] = await pool.query('SELECT data_inicio_periodo_atual FROM usuarios WHERE id = ?', [usuario_id]);
        const dataInicioPeriodo = usuarioRow[0].data_inicio_periodo_atual || new Date(0); // Usa 0 se for nulo

        // 2. Novos clientes no mês (últimos 30 dias) - Lógica inalterada
        const [novosClientesResult] = await pool.query(
            "SELECT COUNT(id) AS novosClientes FROM clientes WHERE criado_em >= DATE_SUB(NOW(), INTERVAL 30 DAY) AND empresa_id = ?",
            [empresa_id]
        );

        // NOVO: 3. Total de faturamento no PERÍODO ATUAL (desde dataInicioPeriodo)
        const [faturamentoPeriodoResult] = await pool.query(
            "SELECT IFNULL(SUM(valor_total), 0) AS faturamentoPeriodo FROM vendas WHERE data_venda >= ? AND empresa_id = ?",
            [dataInicioPeriodo, empresa_id]
        );

        // 4. Gráfico de QUANTIDADE de vendas diárias no mês atual - Lógica inalterada
        const [vendasPorDiaResult] = await pool.query(`
            SELECT 
                DAY(data_venda) AS dia, 
                COUNT(id) AS quantidade
            FROM vendas
            WHERE MONTH(data_venda) = MONTH(NOW()) AND YEAR(data_venda) = YEAR(NOW()) AND empresa_id = ?
            GROUP BY DAY(data_venda)
            ORDER BY dia ASC
        `, [empresa_id]);

        // 5. NOVO: Gráfico de VALOR (R$) faturado por dia no mês atual - Lógica inalterada
        const [faturamentoPorDiaResult] = await pool.query(`
            SELECT 
                DAY(data_venda) AS dia, 
                SUM(valor_total) AS total
            FROM vendas
            WHERE MONTH(data_venda) = MONTH(NOW()) AND YEAR(data_venda) = YEAR(NOW()) AND empresa_id = ?
            GROUP BY DAY(data_venda)
            ORDER BY dia ASC
        `, [empresa_id]);

        // Monta o objeto final com todos os dados
        const metricas = {
            novosClientes: novosClientesResult[0].novosClientes || 0,
            faturamentoPeriodo: faturamentoPeriodoResult[0].faturamentoPeriodo, // Alterado de faturamentoMes
            vendasPorDia: vendasPorDiaResult,
            faturamentoPorDia: faturamentoPorDiaResult
        };

        res.status(200).json(metricas);
    } catch (error) {
        console.error("Erro no dashboardController:", error);
        res.status(500).json({ message: 'Erro ao buscar métricas do dashboard.' });
    }
};
