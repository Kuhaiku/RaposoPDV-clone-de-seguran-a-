const pool = require('../config/database');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const transporter = require('../config/mailer'); // IMPORTA O NODEMAILER

// FUNÇÃO UTILITÁRIA: Converte o objeto Date do JavaScript para o formato MySQL DATETIME 'YYYY-MM-DD HH:MM:SS'
function toSqlDatetime(date) {
    if (!date) return null;
    // O objeto Date retornado pelo mysql2 já pode ser um objeto Date JS.
    // Garante a formatação correta do ISO (UTC) e substitui o 'T' para o formato SQL.
    return new Date(date).toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * Registra um novo funcionário (usuário) para uma empresa.
 * Esta rota foi desativada em favor do registro público unificado.
 */
// exports.registrar = async (req, res) => { ... };

/**
 * Autentica um funcionário (usuário) - AGORA O LOGIN PRINCIPAL.
 * Requer apenas e-mail do funcionário e senha.
 */
exports.login = async (req, res) => {
    // Altera os campos esperados
    const { email, senha } = req.body;

    if (!email || !senha) {
        return res.status(400).json({ message: 'E-mail e senha são obrigatórios.' });
    }

    try {
        // Modifica a query para buscar o usuário e o status da empresa
        const [rows] = await pool.query(
            `SELECT u.*, e.ativo AS empresa_ativa 
             FROM usuarios u 
             JOIN empresas e ON u.empresa_id = e.id 
             WHERE u.email = ?`,
            [email] // Busca apenas pelo email do usuário
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

        // NOVO: Verifica se a empresa está ativa (aprovada pelo superadmin)
        if (!usuario.empresa_ativa) {
            return res.status(403).json({ message: 'Sua conta está inativa ou aguardando aprovação do administrador.' });
        }

        // Gera o token de autenticação para o funcionário
        // Importante: o token agora contém tanto o ID do usuário quanto o ID da empresa
        const token = jwt.sign(
            { usuarioId: usuario.id, empresaId: usuario.empresa_id, nome: usuario.nome },
            process.env.JWT_SECRET,
            { expiresIn: '8h' }
        );

        res.status(200).json({ message: 'Login bem-sucedido!', token: token });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro no servidor durante o login.' });
    }
};


/**
 * Lista todos os funcionários de uma empresa específica.
 * Rota desativada.
 */
// exports.listarTodos = async (req, res) => { ... };

/**
 * Redefine a senha de um funcionário específico.
 * Rota desativada.
 */
// exports.redefinirSenha = async (req, res) => { ... };

/**
 * Permite que o próprio funcionário logado altere sua senha.
 * ATUALIZADO: Agora atualiza a senha na tabela 'empresas' também.
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

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        // Busca o hash da senha, email e empresa_id do usuário
        const [rows] = await connection.query('SELECT senha_hash, email, empresa_id FROM usuarios WHERE id = ?', [usuario_id]);
        const usuario = rows[0];

        if (!usuario) {
             await connection.rollback();
            return res.status(404).json({ message: 'Usuário não encontrado.' });
        }

        const senhaValida = await bcrypt.compare(senhaAtual, usuario.senha_hash);
        if (!senhaValida) {
             await connection.rollback();
            return res.status(401).json({ message: 'A senha atual está incorreta.' });
        }

        const novaSenhaHash = await bcrypt.hash(novaSenha, 10);
        
        // 1. Atualiza a senha na tabela USUARIOS
        await connection.query(
            'UPDATE usuarios SET senha_hash = ? WHERE id = ?',
            [novaSenhaHash, usuario_id]
        );

        // 2. Atualiza a senha na tabela EMPRESAS (pois o login é unificado)
        await connection.query(
            'UPDATE empresas SET senha_hash = ? WHERE email_contato = ? AND id = ?',
            [novaSenhaHash, usuario.email, usuario.empresa_id]
        );

        await connection.commit();
        res.status(200).json({ message: 'Sua senha foi alterada com sucesso.' });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error(error);
        res.status(500).json({ message: 'Erro no servidor ao alterar sua senha.' });
    } finally {
        if (connection) connection.release();
    }
};

/**
 * Busca os dados e métricas para o perfil do vendedor logado.
 * (Inalterado)
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
 * (Inalterado)
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
 * (Inalterado)
 */
exports.listarHistoricoPeriodos = async (req, res) => {
    const usuario_id = req.usuarioId;
    const empresa_id = req.empresaId; // Adiciona filtro de empresa
    try {
        // Filtra por usuario_id E empresa_id
        const [periodos] = await pool.query(
            'SELECT * FROM periodos_fechados WHERE usuario_id = ? AND empresa_id = ? ORDER BY data_fim DESC',
            [usuario_id, empresa_id]
        );
        res.status(200).json(periodos);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro ao buscar histórico de períodos.' });
    }
};


// --- NOVAS FUNÇÕES DE REDEFINIÇÃO DE SENHA (NODEMAILER) ---

/**
 * Envia um e-mail de redefinição de senha.
 */
exports.solicitarRedefinicaoSenha = async (req, res) => {
    const { email } = req.body;
    if (!email) {
        return res.status(400).json({ message: 'O e-mail é obrigatório.' });
    }

    try {
        const [rows] = await pool.query('SELECT id, nome, empresa_id FROM usuarios WHERE email = ?', [email]);
        const usuario = rows[0];

        if (!usuario) {
            // Não informe ao usuário se o e-mail existe ou não por segurança
            return res.status(200).json({ message: 'Se um usuário com este e-mail existir, um link de redefinição será enviado.' });
        }

        // Gera um token curto de 15 minutos
        const resetToken = jwt.sign(
            { usuarioId: usuario.id, empresaId: usuario.empresa_id },
            process.env.JWT_SECRET, // Use a mesma chave secreta
            { expiresIn: '15m' }
        );

        // URL do seu frontend (AJUSTE SE NECESSÁRIO)
        const resetUrl = `https://w-app-raposo-pdvclone.velmc0.easypanel.host/reset-senha.html?token=${resetToken}`;

        const mailOptions = {
            from: `"Raposo PDV" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: 'Redefinição de Senha - Raposo PDV',
            html: `
                <p>Olá, ${usuario.nome}!</p>
                <p>Recebemos uma solicitação para redefinir sua senha.</p>
                <p>Clique no link abaixo para criar uma nova senha. Este link expira em 15 minutos:</p>
                <p><a href="${resetUrl}" style="background-color: #3498db; color: white; padding: 10px 15px; text-decoration: none; border-radius: 5px;">Redefinir Minha Senha</a></p>
                <p>Se você não solicitou isso, por favor, ignore este e-mail.</p>
            `
        };

        await transporter.sendMail(mailOptions);
        
        res.status(200).json({ message: 'Se um usuário com este e-mail existir, um link de redefinição será enviado.' });

    } catch (error) {
        console.error('Erro ao solicitar redefinição de senha:', error);
        res.status(500).json({ message: 'Erro interno do servidor.' });
    }
};

/**
 * Redefine a senha usando um token JWT.
 */
exports.redefinirSenhaComToken = async (req, res) => {
    const { token, novaSenha } = req.body;

    if (!token || !novaSenha) {
        return res.status(400).json({ message: 'Token e nova senha são obrigatórios.' });
    }
    if (novaSenha.length < 6) {
        return res.status(400).json({ message: 'A nova senha deve ter no mínimo 6 caracteres.' });
    }

    let decoded;
    try {
        decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
        return res.status(401).json({ message: 'Token inválido ou expirado.' });
    }

    const { usuarioId, empresaId } = decoded;
    if (!usuarioId || !empresaId) {
        return res.status(401).json({ message: 'Token malformado.' });
    }

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        const senhaHash = await bcrypt.hash(novaSenha, 10);

        // 1. Atualiza USUARIOS
        const [userResult] = await connection.query(
            'UPDATE usuarios SET senha_hash = ? WHERE id = ? AND empresa_id = ?',
            [senhaHash, usuarioId, empresaId]
        );

        if (userResult.affectedRows === 0) {
            await connection.rollback();
            return res.status(404).json({ message: 'Usuário não encontrado.' });
        }

        // 2. Busca o email do usuário para atualizar a empresa
        const [userRows] = await connection.query('SELECT email FROM usuarios WHERE id = ?', [usuarioId]);
        const emailPrincipal = userRows[0].email;

        // 3. Atualiza EMPRESAS (pois o login é unificado)
        await connection.query(
            'UPDATE empresas SET senha_hash = ? WHERE email_contato = ? AND id = ?',
            [senhaHash, emailPrincipal, empresaId]
        );

        await connection.commit();
        res.status(200).json({ message: 'Senha redefinida com sucesso!' });

    } catch (error) {
        if (connection) await connection.rollback();
        console.error('Erro ao redefinir senha com token:', error);
        res.status(500).json({ message: 'Erro interno do servidor.' });
    } finally {
        if (connection) connection.release();
    }
};