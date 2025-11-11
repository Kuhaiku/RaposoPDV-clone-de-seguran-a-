const pool = require('../config/database');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Registra uma nova empresa (USADO PELO SUPER ADMIN - AGORA REMOVIDO/OBsoleto)
/*
exports.registrar = async (req, res) => {
    // ... (lógica antiga) ...
};
*/

// NOVA FUNÇÃO: Registro público da empresa
exports.registrarPublico = async (req, res) => {
    const { nome_empresa, email_contato, senha, telefone_comercial } = req.body;
    
    if (!nome_empresa || !email_contato || !senha) {
        return res.status(400).json({ message: 'Nome da empresa, e-mail e senha são obrigatórios.' });
    }
    if (senha.length < 6) {
        return res.status(400).json({ message: 'A senha deve ter no mínimo 6 caracteres.' });
    }

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        // 1. Gera o slug
        const slug = nome_empresa.toLowerCase().replace(/ /g, '-').replace(/[^\w-]+/g, '');
        const senhaHash = await bcrypt.hash(senha, 10);

        // 2. Insere a EMPRESA com status ativo = 0 (Aguardando Aprovação)
        // Define um dia de pagamento padrão (ex: 1)
        const [empresaResult] = await connection.query(
            'INSERT INTO empresas (nome_empresa, email_contato, senha_hash, telefone_comercial, slug, ativo, dia_pagamento_acordado) VALUES (?, ?, ?, ?, ?, 0, 1)', // ativo = 0
            [nome_empresa, email_contato, senhaHash, telefone_comercial, slug]
        );
        const empresaId = empresaResult.insertId;

        // 3. Insere o USUÁRIO vinculado (que é a própria empresa)
        const [usuarioResult] = await connection.query(
            'INSERT INTO usuarios (empresa_id, nome, email, senha_hash, data_inicio_periodo_atual) VALUES (?, ?, ?, ?, NOW())',
            [empresaId, nome_empresa, email_contato, senhaHash]
        );

        await connection.commit();
        res.status(201).json({ message: 'Empresa registrada com sucesso! Aguardando aprovação.' });

    } catch (error) {
        if (connection) await connection.rollback();
        
        if (error.code === 'ER_DUP_ENTRY') {
            // Verifica se a duplicata é no email da empresa ou do usuário
            if (error.message.includes('empresas.email_contato') || error.message.includes('usuarios.email')) {
                 return res.status(409).json({ message: 'Este e-mail já está em uso.' });
            }
        }
        console.error(error);
        res.status(500).json({ message: 'Erro no servidor ao registrar empresa.' });
    } finally {
        if (connection) connection.release();
    }
};

// Login de uma empresa (REMOVIDO / Obsoleto)
// exports.login = async (req, res) => { ... };


// Redefine a senha de uma empresa (só Super Admin pode fazer)
// ATUALIZADO: Agora atualiza a senha no usuário principal também.
exports.redefinirSenha = async (req, res) => {
    const { id } = req.params; // ID da Empresa
    const { novaSenha } = req.body;

    if (!novaSenha || novaSenha.length < 6) {
        return res.status(400).json({ message: 'A nova senha é obrigatória e deve ter no mínimo 6 caracteres.' });
    }

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        const senhaHash = await bcrypt.hash(novaSenha, 10);
        
        // 1. Atualiza a senha na tabela EMPRESAS
        const [resultEmpresa] = await connection.query(
            'UPDATE empresas SET senha_hash = ? WHERE id = ?',
            [senhaHash, id]
        );

        if (resultEmpresa.affectedRows === 0) {
            await connection.rollback();
            return res.status(404).json({ message: 'Empresa não encontrada.' });
        }

        // 2. BUSCA o email da empresa para encontrar o usuário principal
        const [empresaRows] = await connection.query('SELECT email_contato FROM empresas WHERE id = ?', [id]);
        if (empresaRows.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: 'Email da empresa não encontrado.' });
        }
        const emailPrincipal = empresaRows[0].email_contato;

        // 3. Atualiza a senha na tabela USUARIOS onde o email e empresa_id correspondem
        await connection.query(
            'UPDATE usuarios SET senha_hash = ? WHERE email = ? AND empresa_id = ?',
            [senhaHash, emailPrincipal, id]
        );

        await connection.commit();
        res.status(200).json({ message: 'Senha da empresa e do usuário principal atualizada com sucesso.' });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error(error);
        res.status(500).json({ message: 'Erro no servidor ao redefinir a senha.' });
    } finally {
        if (connection) connection.release();
    }
};

// Permite que a própria empresa logada altere sua senha (REMOVIDO / Obsoleto)
// exports.redefinirSenhaPropria = async (req, res) => { ... };

//
// --- FUNÇÕES INALTERADAS (Usadas pelo Super Admin e Painel de Vendas) ---
//

// Obtém os detalhes de uma única empresa pelo ID
exports.obterDetalhes = async (req, res) => {
    const { id } = req.params;
    try {
        const [rows] = await pool.query('SELECT id, nome_empresa, email_contato, cnpj, telefone_comercial, endereco_comercial, cidade, estado, cep, dia_pagamento_acordado, ativo FROM empresas WHERE id = ?', [id]);
        if (rows.length === 0) {
            return res.status(404).json({ message: 'Empresa não encontrada.' });
        }
        res.status(200).json(rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro no servidor ao obter detalhes da empresa.' });
    }
};

// Lista todas as empresas ativas COM O STATUS DE PAGAMENTO
exports.listarAtivas = async (req, res) => {
    try {
        const [empresas] = await pool.query('SELECT id, nome_empresa, email_contato, telefone_comercial, dia_pagamento_acordado FROM empresas WHERE ativo = 1 ORDER BY nome_empresa ASC');

        const hoje = new Date();
        const mesAtual = hoje.getMonth() + 1;
        const anoAtual = hoje.getFullYear();

        // Para cada empresa, vamos verificar seu status de pagamento
        const empresasComStatus = await Promise.all(empresas.map(async (empresa) => {
            const [pagamentos] = await pool.query(
                'SELECT id FROM pagamentos_mensalidades WHERE empresa_id = ? AND mes_referencia = ? AND ano_referencia = ?',
                [empresa.id, mesAtual, anoAtual]
            );

            let status_pagamento = 'Aguardando Pagamento';
            if (pagamentos.length > 0) {
                status_pagamento = 'Em Dia';
            } else if (empresa.dia_pagamento_acordado) { // Só verifica atraso se houver um dia acordado
                let vencimento = new Date(anoAtual, mesAtual - 1, empresa.dia_pagamento_acordado);
                
                // Regra do dia útil: 0 é Domingo, 6 é Sábado.
                let diaDaSemana = vencimento.getDay();
                if (diaDaSemana === 0) { // Se for Domingo
                    vencimento.setDate(vencimento.getDate() + 1); // Pula para Segunda
                } else if (diaDaSemana === 6) { // Se for Sábado
                    vencimento.setDate(vencimento.getDate() + 2); // Pula para Segunda
                }

                if (hoje > vencimento) {
                    status_pagamento = 'Atrasado';
                }
            }
            return { ...empresa, status_pagamento };
        }));

        res.status(200).json(empresasComStatus);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro ao listar empresas ativas.' });
    }
};


// Lista todas as empresas inativas
exports.listarInativas = async (req, res) => {
    try {
        const [empresas] = await pool.query('SELECT id, nome_empresa, email_contato, telefone_comercial, dia_pagamento_acordado FROM empresas WHERE ativo = 0 ORDER BY nome_empresa ASC');
        res.status(200).json(empresas);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro ao listar empresas inativas.' });
    }
};

// Inativa uma empresa
exports.inativar = async (req, res) => {
    const { id } = req.params;
    try {
        const [result] = await pool.query('UPDATE empresas SET ativo = 0 WHERE id = ?', [id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Empresa não encontrada.' });
        }
        res.status(200).json({ message: 'Empresa inativada com sucesso.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro ao inativar empresa.' });
    }
};

// Ativa uma empresa (Usado para aprovar novos cadastros)
exports.ativar = async (req, res) => {
    const { id } = req.params;
    try {
        const [result] = await pool.query('UPDATE empresas SET ativo = 1 WHERE id = ?', [id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Empresa não encontrada.' });
        }
        res.status(200).json({ message: 'Empresa ativada com sucesso.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro ao ativar empresa.' });
    }
};

// Retorna os dados da empresa do funcionário atualmente logado
exports.obterDadosDaMinhaEmpresa = async (req, res) => {
    // O req.empresaId é adicionado pelo middleware de autenticação do funcionário
    const empresa_id = req.empresaId;
    
    try {
        // Query ATUALIZADA para buscar mais campos
        const [rows] = await pool.query(
            'SELECT nome_empresa, slug, endereco_comercial, telefone_comercial FROM empresas WHERE id = ?', 
            [empresa_id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ message: 'Empresa não encontrada.' });
        }
        res.status(200).json(rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro no servidor ao obter dados da empresa.' });
    }
};