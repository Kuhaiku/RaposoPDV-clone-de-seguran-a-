const pool = require('../config/database');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const transporter = require('../config/mailer'); // IMPORTA O NODEMAILER
const crypto = require('crypto'); // IMPORTA CRYPTO PARA O HASH DO TOKEN

// FUNÇÃO UTILITÁRIA: Converte o objeto Date do JavaScript para o formato MySQL DATETIME 'YYYY-MM-DD HH:MM:SS'
function toSqlDatetime(date) {
    if (!date) return null;
    return new Date(date).toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * Autentica um funcionário (usuário) - AGORA O LOGIN PRINCIPAL.
 * Requer apenas e-mail do funcionário e senha.
 */
exports.login = async (req, res) => {
    const { email, senha } = req.body;

    if (!email || !senha) {
        return res.status(400).json({ message: 'E-mail e senha são obrigatórios.' });
    }

    try {
        const [rows] = await pool.query(
            `SELECT u.*, e.ativo AS empresa_ativa 
             FROM usuarios u 
             JOIN empresas e ON u.empresa_id = e.id 
             WHERE u.email = ?`,
            [email]
        );
        const usuario = rows[0];

        if (!usuario) {
            return res.status(401).json({ message: 'Credenciais inválidas.' });
        }

        const senhaValida = await bcrypt.compare(senha, usuario.senha_hash);
        if (!senhaValida) {
            return res.status(401).json({ message: 'Credenciais inválidas.' });
        }

        if (!usuario.empresa_ativa) {
            return res.status(403).json({ message: 'Sua conta está inativa ou aguardando aprovação do administrador.' });
        }

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
 * Permite que o próprio funcionário logado altere sua senha.
 */
exports.redefinirSenhaPropria = async (req, res) => {
    const { senhaAtual, novaSenha } = req.body;
    const usuario_id = req.usuarioId; 

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
        
        // 1. Atualiza USUARIOS
        await connection.query(
            'UPDATE usuarios SET senha_hash = ? WHERE id = ?',
            [novaSenhaHash, usuario_id]
        );

        // 2. Atualiza EMPRESAS (pois o login é unificado)
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
 */
exports.obterDadosPerfil = async (req, res) => {
    const usuario_id = req.usuarioId;
    const empresa_id = req.empresaId;
    const { periodo = 'periodo_atual' } = req.query; 

    let dateFilter = '';
    let startQuery = '';

    try {
        const [usuarioRow] = await pool.query('SELECT nome, senha_hash, data_inicio_periodo_atual FROM usuarios WHERE id = ?', [usuario_id]);
        const { nome: nomeVendedor, data_inicio_periodo_atual, senha_hash } = usuarioRow[0];

        const dataSql = toSqlDatetime(data_inicio_periodo_atual);
        
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

        const queryMetricas = `
            SELECT
                IFNULL(SUM(DISTINCT v.valor_total), 0) AS totalFaturado,
                COUNT(DISTINCT v.id) AS numeroVendas,
                IFNULL(SUM(vi.quantidade), 0) AS itensVendidos
            FROM vendas AS v
            LEFT JOIN venda_itens AS vi ON v.id = vi.venda_id
            WHERE ${whereClause} ${dateFilter};
        `;
        const [metricasResult] = await connection.query(queryMetricas, params); 

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
        const [topProdutos] = await connection.query(queryTopProdutos, params); 

        const queryUltimasVendas = `
            SELECT v.data_venda, c.nome AS cliente_nome, v.valor_total
            FROM vendas AS v
            LEFT JOIN clientes AS c ON v.cliente_id = c.id
            WHERE v.usuario_id = ? AND v.empresa_id = ?
            ORDER BY v.data_venda DESC
            LIMIT 5;
        `;
        const [ultimasVendas] = await connection.query(queryUltimasVendas, [usuario_id, empresa_id]); 

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
 * Fecha o período de vendas atual do vendedor logado.
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

        const queryMetricas = `
            SELECT
                IFNULL(SUM(DISTINCT v.valor_total), 0) AS totalFaturado,
                COUNT(DISTINCT v.id) AS numeroVendas,
                IFNULL(SUM(vi.quantidade), 0) AS itensVendidos
            FROM vendas AS v
            LEFT JOIN venda_itens AS vi ON v.id = vi.venda_id
            WHERE v.usuario_id = ? AND v.empresa_id = ? AND v.data_venda >= ? AND v.data_venda <= NOW();
        `;
        const [metricasResult] = await connection.query(queryMetricas, [usuario_id, empresa_id, data_inicio]);
        
        const { totalFaturado, numeroVendas, itensVendidos } = metricasResult[0];
        const faturamento = parseFloat(totalFaturado) || 0;
        const comissao = faturamento * 0.35;
        const ticketMedio = numeroVendas > 0 ? faturamento / numeroVendas : 0;

        await connection.query(
            'INSERT INTO periodos_fechados (empresa_id, usuario_id, data_inicio, data_fim, total_faturado, numero_vendas, ticket_medio, itens_vendidos, comissao_vendedor) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [empresa_id, usuario_id, data_inicio, data_fim, faturamento, numeroVendas, ticketMedio, itensVendidos, comissao]
        );

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
 * Lista o histórico de períodos fechados para o vendedor.
 */
exports.listarHistoricoPeriodos = async (req, res) => {
    const usuario_id = req.usuarioId;
    const empresa_id = req.empresaId; 
    try {
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
 * Envia um e-mail de redefinição de senha com um TOKEN DE 8 DÍGITOS.
 */
exports.solicitarRedefinicaoSenha = async (req, res) => {
    const { email } = req.body;
    if (!email) {
        return res.status(400).json({ message: 'O e-mail é obrigatório.' });
    }

    try {
        const [rows] = await pool.query('SELECT id, nome FROM usuarios WHERE email = ?', [email]);
        const usuario = rows[0];

        if (!usuario) {
            return res.status(200).json({ message: 'Se um usuário com este e-mail existir, um link de redefinição será enviado.' });
        }

        // 1. Gera um token de 8 dígitos
        const token = Math.floor(10000000 + Math.random() * 90000000).toString();
        
        // 2. Cria um hash seguro do token para salvar no DB
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

        // 3. Define a expiração (15 minutos)
        const expires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutos a partir de agora

        // 4. Salva o HASH e a expiração no banco
        await pool.query(
            'UPDATE usuarios SET reset_token = ?, reset_token_expires = ? WHERE id = ?',
            [tokenHash, expires, usuario.id]
        );

        // 5. Envia o e-mail com o token (NÃO O HASH)
        const mailOptions = {
            from: `"Raposo PDV" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: 'Seu Código de Redefinição de Senha - Raposo PDV',
            html: `
                <p>Olá, ${usuario.nome}!</p>
                <p>Recebemos uma solicitação para redefinir sua senha.</p>
                <p>Use o código de 8 dígitos abaixo para criar uma nova senha. Este código expira em 15 minutos:</p>
                <h2 style="font-size: 24px; letter-spacing: 2px; text-align: center; background-color: #f4f4f4; padding: 10px; border-radius: 5px;">
                    ${token}
                </h2>
                <p>Se você não solicitou isso, por favor, ignore este e-mail.</p>
            `
        };

        await transporter.sendMail(mailOptions);
        
        res.status(200).json({ message: 'Um código de 8 dígitos foi enviado para o seu e-mail.' });

    } catch (error) {
        console.error('Erro ao solicitar redefinição de senha:', error);
        res.status(500).json({ message: 'Erro interno do servidor.' });
    }
};

/**
 * Redefine a senha usando um TOKEN DE 8 DÍGITOS.
 */
exports.redefinirSenhaComToken = async (req, res) => {
    const { email, token, novaSenha } = req.body;

    if (!email || !token || !novaSenha) {
        return res.status(400).json({ message: 'E-mail, token e nova senha são obrigatórios.' });
    }
    if (novaSenha.length < 6) {
        return res.status(400).json({ message: 'A nova senha deve ter no mínimo 6 caracteres.' });
    }

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        // 1. Encontra o usuário pelo e-mail
        const [rows] = await connection.query(
            'SELECT * FROM usuarios WHERE email = ?',
            [email]
        );
        const usuario = rows[0];

        if (!usuario) {
            await connection.rollback();
            return res.status(400).json({ message: 'Token ou e-mail inválido.' });
        }

        // 2. Verifica se o token existe e não expirou
        if (!usuario.reset_token || !usuario.reset_token_expires) {
            await connection.rollback();
            return res.status(400).json({ message: 'Nenhuma solicitação de redefinição ativa. Por favor, solicite novamente.' });
        }

        if (new Date() > new Date(usuario.reset_token_expires)) {
            await connection.rollback();
            return res.status(400).json({ message: 'O código expirou. Por favor, solicite um novo.' });
        }

        // 3. Compara o hash do token enviado com o hash salvo no DB
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        if (tokenHash !== usuario.reset_token) {
            await connection.rollback();
            return res.status(400).json({ message: 'O código de 8 dígitos está incorreto.' });
        }

        // 4. Se tudo estiver correto, atualiza a senha
        const novaSenhaHash = await bcrypt.hash(novaSenha, 10);

        // 5. Atualiza USUARIOS e limpa o token
        await connection.query(
            'UPDATE usuarios SET senha_hash = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?',
            [novaSenhaHash, usuario.id]
        );

        // 6. Atualiza EMPRESAS (pois o login é unificado)
        await connection.query(
            'UPDATE empresas SET senha_hash = ? WHERE id = ? AND email_contato = ?',
            [novaSenhaHash, usuario.empresa_id, usuario.email]
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