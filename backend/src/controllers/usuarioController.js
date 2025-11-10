const pool = require('../config/database');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// FUNÇÃO UTILITÁRIA: Converte o objeto Date do JavaScript para o formato MySQL DATETIME 'YYYY-MM-DD HH:MM:SS'
function toSqlDatetime(date) {
    if (!date) return null;
    // O objeto Date retornado pelo mysql2 já pode ser um objeto Date JS.
    // Garante a formatação correta do ISO (UTC) e substitui o 'T' para o formato SQL.
    return new Date(date).toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * Registra um novo funcionário (usuário) para uma empresa.
 * Esta é uma rota protegida, acessível apenas por uma empresa autenticada.
 */
exports.registrar = async (req, res) => {
    // Pega o ID da empresa logada, que foi adicionado à requisição pelo middleware 'authEmpresaMiddleware'
    const empresa_id = req.empresaId;
    const { nome, email, senha } = req.body;

    if (!nome || !email || !senha) {
        return res.status(400).json({ message: 'Nome, email e senha do funcionário são obrigatórios.' });
    }

    try {
        // Criptografa a senha do funcionário antes de salvar
        const senhaHash = await bcrypt.hash(senha, 10);

        // Insere o novo funcionário, associando-o à empresa correta.
        // NOVO: Define a data de início do período atual como a data de registro
        const [result] = await pool.query(
            'INSERT INTO usuarios (empresa_id, nome, email, senha_hash, data_inicio_periodo_atual) VALUES (?, ?, ?, ?, NOW())',
            [empresa_id, nome, email, senhaHash]
        );

        res.status(201).json({ message: 'Funcionário registrado com sucesso!', usuarioId: result.insertId });
    } catch (error) {
        // Trata o erro caso o e-mail do funcionário já exista para esta empresa
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: 'Este e-mail já está em uso por outro funcionário nesta empresa.' });
        }
        console.error(error);
        res.status(500).json({ message: 'Erro ao registrar funcionário.' });
    }
};

/**
 * Autentica um funcionário (usuário).
 * Requer o e-mail da empresa, o e-mail do funcionário e a senha.
 */
exports.login = async (req, res) => {
    const { email_empresa, email_funcionario, senha } = req.body;

    if (!email_empresa || !email_funcionario || !senha) {
        return res.status(400).json({ message: 'Email da empresa, email do funcionário e senha são obrigatórios.' });
    }

    try {
        // Faz uma busca cruzada (JOIN) para garantir que o funcionário pertence à empresa informada
        const [rows] = await pool.query(
            `SELECT u.*, u.empresa_id 
             FROM usuarios u 
             JOIN empresas e ON u.empresa_id = e.id 
             WHERE e.email_contato = ? AND u.email = ?`,
            [email_empresa, email_funcionario]
        );
        const usuario = rows[0];

        // Se nenhum usuário for encontrado, as credenciais estão erradas
        if (!usuario) {
            return res.status(401).json({ message: 'Credenciais inválidas.' });
        }

        // Compara a senha enviada com a senha criptografada no banco
        const senhaValida = await bcrypt.compare(senha, usuario.senha_hash);
        if (!senhaValida) {
            return res.status(401).json({ message: 'Credenciais inválidas.' });
        }

        // Gera o token de autenticação para o funcionário
        // Importante: o token agora contém tanto o ID do usuário quanto o ID da empresa
        const token = jwt.sign(
            { usuarioId: usuario.id, empresaId: usuario.empresa_id, nome: usuario.nome },
            process.env.JWT_SECRET,
            { expiresIn: '8h' }
        );

        res.status(200).json({ message: 'Login do funcionário bem-sucedido!', token: token });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro no servidor durante o login do funcionário.' });
    }
};

/**
 * Lista todos os funcionários de uma empresa específica.
 * Rota protegida, acessível apenas pela empresa-mãe.
 */
exports.listarTodos = async (req, res) => {
    // Pega o ID da empresa logada a partir do token
    const empresa_id = req.empresaId;

    try {
        const [usuarios] = await pool.query(
            'SELECT id, nome, email FROM usuarios WHERE empresa_id = ? ORDER BY nome ASC',
            [empresa_id]
        );
        res.status(200).json(usuarios);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro ao listar funcionários.' });
    }
};

/**
 * Redefine a senha de um funcionário específico.
 * Apenas a empresa-mãe pode fazer isso.
 */
exports.redefinirSenha = async (req, res) => {
    const { id } = req.params; // ID do funcionário a ser alterado
    const { novaSenha } = req.body;
    const empresa_id = req.empresaId; // ID da empresa que está logada

    if (!novaSenha || novaSenha.length < 6) {
        return res.status(400).json({ message: 'A nova senha é obrigatória e deve ter no mínimo 6 caracteres.' });
    }

    try {
        const senhaHash = await bcrypt.hash(novaSenha, 10);
        // Garante que a empresa só pode alterar senhas de seus próprios funcionários
        const [result] = await pool.query(
            'UPDATE usuarios SET senha_hash = ? WHERE id = ? AND empresa_id = ?',
            [senhaHash, id, empresa_id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Funcionário não encontrado ou não pertence a esta empresa.' });
        }

        res.status(200).json({ message: 'Senha do funcionário atualizada com sucesso.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro no servidor ao redefinir a senha do funcionário.' });
    }
};

/**
 * Permite que o próprio funcionário logado altere sua senha.
 */
exports.redefinirSenhaPropria = async (req, res) => {
    const { senhaAtual, novaSenha } = req.body;
    const usuario_id = req.usuarioId; // ID do próprio usuário logado

    if (!senhaAtual || !novaSenha) {
        return res.status(400).json({ message: 'A senha atual e a nova senha são obrigatórias.' });
    }
    if (novaSenha.length < 6) {
        return res.status(400).json({ message: 'A nova senha deve ter no mínimo 6 caracteres.' });
    }

    try {
        const [rows] = await pool.query('SELECT senha_hash FROM usuarios WHERE id = ?', [usuario_id]);
        const usuario = rows[0];

        if (!usuario) {
            return res.status(404).json({ message: 'Usuário não encontrado.' });
        }

        const senhaValida = await bcrypt.compare(senhaAtual, usuario.senha_hash);
        if (!senhaValida) {
            return res.status(401).json({ message: 'A senha atual está incorreta.' });
        }

        const novaSenhaHash = await bcrypt.hash(novaSenha, 10);
        await pool.query(
            'UPDATE usuarios SET senha_hash = ? WHERE id = ?',
            [novaSenhaHash, usuario_id]
        );

        res.status(200).json({ message: 'Sua senha foi alterada com sucesso.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro no servidor ao alterar sua senha.' });
    }
};

/**
 * Busca os dados e métricas para o perfil do vendedor logado.
 */
exports.obterDadosPerfil = async (req, res) => {
    const usuario_id = req.usuarioId;
    const empresa_id = req.empresaId; // NOVO: Captura o ID da empresa
    const { periodo = 'periodo_atual' } = req.query; // 'hoje', 'semana', 'mes', 'periodo_atual' (novo padrão)

    let dateFilter = '';
    let startQuery = '';

    try {
        const [usuarioRow] = await pool.query('SELECT nome, senha_hash, data_inicio_periodo_atual FROM usuarios WHERE id = ?', [usuario_id]);
        const { nome: nomeVendedor, data_inicio_periodo_atual, senha_hash } = usuarioRow[0];

        // CORREÇÃO CRÍTICA AQUI: Formata a data para o SQL antes de usar na string da query
        const dataSql = toSqlDatetime(data_inicio_periodo_atual);
        
        // NOVO: Filtro de segurança obrigatório (empresa_id) e filtro de data
        let whereClause = `v.usuario_id = ? AND v.empresa_id = ?`;
        let params = [usuario_id, empresa_id];

        if (periodo === 'periodo_atual') {
            dateFilter = `AND v.data_venda >= ?`;
            params.push(dataSql);
        } else if (periodo === 'hoje') {
            dateFilter = 'AND DATE(v.data_venda) = CURDATE()';
        } else if (periodo === 'semana') {
            dateFilter = 'AND YEARWEEK(v.data_venda, 1) = YEARWEEK(CURDATE(), 1)';
        } else if (periodo === 'mes') { 
            dateFilter = 'AND MONTH(v.data_venda) = MONTH(CURDATE()) AND YEAR(v.data_venda) = YEAR(CURDATE())';
        }

        const connection = await pool.getConnection();

        // 1. Query principal para métricas de vendas (CORRIGIDA)
        const queryMetricas = `
            SELECT
                IFNULL(SUM(DISTINCT v.valor_total), 0) AS totalFaturado,
                COUNT(DISTINCT v.id) AS numeroVendas,
                IFNULL(SUM(vi.quantidade), 0) AS itensVendidos
            FROM vendas AS v
            LEFT JOIN venda_itens AS vi ON v.id = vi.venda_id
            WHERE ${whereClause} ${dateFilter};
        `;
        const [metricasResult] = await connection.query(queryMetricas, params); // Usa o array params

        // 3. Query para top 5 produtos
        const queryTopProdutos = `
            SELECT p.nome, SUM(vi.quantidade) as totalVendido
            FROM venda_itens AS vi
            JOIN vendas AS v ON vi.venda_id = v.id
            JOIN produtos AS p ON vi.produto_id = p.id
            WHERE ${whereClause} ${dateFilter}
            GROUP BY p.nome
            ORDER BY totalVendido DESC
            LIMIT 5;
        `;
        const [topProdutos] = await connection.query(queryTopProdutos, params); // Usa o array params

        // 4. Query para últimas 5 vendas (Sempre as últimas DA EMPRESA e do VENDEDOR)
        const queryUltimasVendas = `
            SELECT v.data_venda, c.nome AS cliente_nome, v.valor_total
            FROM vendas AS v
            LEFT JOIN clientes AS c ON v.cliente_id = c.id
            WHERE v.usuario_id = ? AND v.empresa_id = ?
            ORDER BY v.data_venda DESC
            LIMIT 5;
        `;
        const [ultimasVendas] = await connection.query(queryUltimasVendas, [usuario_id, empresa_id]); 

        // 5. Query para gráfico de desempenho diário (sempre do mês atual DA EMPRESA)
        const queryGrafico = `
            SELECT 
                DAY(data_venda) AS dia, 
                SUM(valor_total) AS total
            FROM vendas
            WHERE usuario_id = ? AND empresa_id = ? AND MONTH(data_venda) = MONTH(CURDATE()) AND YEAR(data_venda) = YEAR(CURDATE())
            GROUP BY DAY(data_venda)
            ORDER BY dia ASC;
        `;
        const [graficoData] = await connection.query(queryGrafico, [usuario_id, empresa_id]);

        connection.release();

        const metricasData = metricasResult[0];
        const rawTotalFaturado = metricasData ? metricasData.totalFaturado : 0;
        const totalFaturado = parseFloat(rawTotalFaturado) || 0;
        const numeroVendas = metricasData ? metricasData.numeroVendas : 0;
        const itensVendidos = metricasData ? parseInt(metricasData.itensVendidos, 10) : 0;
        const ticketMedio = numeroVendas > 0 ? totalFaturado / numeroVendas : 0;
        const comissaoVendedor = totalFaturado * 0.35;

        res.status(200).json({
            nomeVendedor,
            totalFaturado: totalFaturado,
            numeroVendas: numeroVendas,
            ticketMedio: ticketMedio,
            itensVendidos: itensVendidos,
            comissaoVendedor: comissaoVendedor,
            topProdutos,
            ultimasVendas,
            graficoData,
            dataInicioPeriodo: data_inicio_periodo_atual 
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro no servidor ao buscar dados do perfil.' });
    }
};

/**
 * NOVA FUNÇÃO: Fecha o período de vendas atual do vendedor logado.
 */
exports.fecharPeriodo = async (req, res) => {
    const usuario_id = req.usuarioId;
    const empresa_id = req.empresaId;
    const { senha } = req.body;

    if (!senha) {
        return res.status(400).json({ message: 'A senha é obrigatória para confirmar o fechamento.' });
    }

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        // 1. Autenticar a senha do usuário
        const [authRows] = await connection.query('SELECT senha_hash, data_inicio_periodo_atual FROM usuarios WHERE id = ?', [usuario_id]);
        const usuario = authRows[0];

        if (!usuario) {
            await connection.rollback();
            return res.status(404).json({ message: 'Usuário não encontrado.' });
        }
        
        const senhaValida = await bcrypt.compare(senha, usuario.senha_hash);
        if (!senhaValida) {
            await connection.rollback();
            return res.status(401).json({ message: 'Senha incorreta. Fechamento de período cancelado.' });
        }

        const data_inicio = toSqlDatetime(usuario.data_inicio_periodo_atual);
        const data_fim = toSqlDatetime(new Date());

        // 2. Calcular as métricas do período atual (CORRIGIDA)
        const queryMetricas = `
            SELECT
                IFNULL(SUM(DISTINCT v.valor_total), 0) AS totalFaturado,
                COUNT(DISTINCT v.id) AS numeroVendas,
                IFNULL(SUM(vi.quantidade), 0) AS itensVendidos
            FROM vendas AS v
            LEFT JOIN venda_itens AS vi ON v.id = vi.venda_id
            -- CORREÇÃO CRÍTICA AQUI: Adiciona o filtro de empresa
            WHERE v.usuario_id = ? AND v.empresa_id = ? AND v.data_venda >= ? AND v.data_venda <= NOW();
        `;
        // Usa placeholder (?) para os parâmetros
        const [metricasResult] = await connection.query(queryMetricas, [usuario_id, empresa_id, data_inicio]);
        
        const { totalFaturado, numeroVendas, itensVendidos } = metricasResult[0];
        const faturamento = parseFloat(totalFaturado) || 0;
        const comissao = faturamento * 0.35;
        const ticketMedio = numeroVendas > 0 ? faturamento / numeroVendas : 0;

        // 3. Salvar o período fechado na nova tabela (periodos_fechados)
        await connection.query(
            'INSERT INTO periodos_fechados (empresa_id, usuario_id, data_inicio, data_fim, total_faturado, numero_vendas, ticket_medio, itens_vendidos, comissao_vendedor) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [empresa_id, usuario_id, data_inicio, data_fim, faturamento, numeroVendas, ticketMedio, itensVendidos, comissao]
        );

        // 4. Atualizar o `data_inicio_periodo_atual` do usuário
        await connection.query(
            'UPDATE usuarios SET data_inicio_periodo_atual = NOW() WHERE id = ?',
            [usuario_id]
        );

        await connection.commit();
        res.status(200).json({ message: 'Período de vendas encerrado com sucesso!' });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error(error);
        res.status(500).json({ message: error.message || 'Erro no servidor ao fechar o período.' });
    } finally {
        if (connection) connection.release();
    }
};

/**
 * NOVA FUNÇÃO: Lista o histórico de períodos fechados para o vendedor.
 */
exports.listarHistoricoPeriodos = async (req, res) => {
    const usuario_id = req.usuarioId;
    const empresa_id = req.empresaId; // Adiciona filtro de empresa
    try {
        // Filtra por usuario_id E empresa_id
        const [periodos] = await pool.query(
            'SELECT id, data_inicio, data_fim, total_faturado, numero_vendas, comissao_vendedor FROM periodos_fechados WHERE usuario_id = ? AND empresa_id = ? ORDER BY data_fim DESC',
            [usuario_id, empresa_id]
        );
        res.status(200).json(periodos);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro ao buscar histórico de períodos.' });
    }
};
