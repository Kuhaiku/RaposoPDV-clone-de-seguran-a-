const pool = require('../config/database');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Registra uma nova empresa
exports.registrar = async (req, res) => {
    const { nome_empresa, email_contato, senha, cnpj, telefone_comercial, endereco_comercial, cidade, estado, cep, dia_pagamento_acordado } = req.body;
    if (!nome_empresa || !email_contato || !senha) {
        return res.status(400).json({ message: 'Nome da empresa, e-mail de contato e senha são obrigatórios.' });
    }
    try {
        // Gera o slug a partir do nome da empresa
        const slug = nome_empresa.toLowerCase().replace(/ /g, '-').replace(/[^\w-]+/g, '');
        const senhaHash = await bcrypt.hash(senha, 10);
        const [result] = await pool.query(
            'INSERT INTO empresas (nome_empresa, email_contato, senha_hash, cnpj, telefone_comercial, endereco_comercial, cidade, estado, cep, dia_pagamento_acordado, slug) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [nome_empresa, email_contato, senhaHash, cnpj, telefone_comercial, endereco_comercial, cidade, estado, cep, dia_pagamento_acordado, slug]
        );
        res.status(201).json({ message: 'Empresa registrada com sucesso!', empresaId: result.insertId });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: 'Este e-mail de contato ou CNPJ já está em uso.' });
        }
        console.error(error);
        res.status(500).json({ message: 'Erro no servidor ao registrar empresa.' });
    }
};

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

// Ativa uma empresa
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

// Login de uma empresa
exports.login = async (req, res) => {
    const { email_contato, senha } = req.body;
    if (!email_contato || !senha) {
        return res.status(400).json({ message: 'E-mail e senha são obrigatórios.' });
    }
    try {
        const [rows] = await pool.query('SELECT * FROM empresas WHERE email_contato = ?', [email_contato]);
        const empresa = rows[0];
        if (!empresa) {
            return res.status(401).json({ message: 'Credenciais inválidas.' });
        }
        if (empresa.ativo === 0) {
            return res.status(403).json({ message: 'Esta empresa está inativa. Entre em contato com o suporte.' });
        }
        const senhaValida = await bcrypt.compare(senha, empresa.senha_hash);
        if (!senhaValida) {
            return res.status(401).json({ message: 'Credenciais inválidas.' });
        }
        const token = jwt.sign(
            { empresaId: empresa.id, nomeEmpresa: empresa.nome_empresa },
            process.env.JWT_SECRET,
            { expiresIn: '8h' }
        );
        res.status(200).json({ message: 'Login da empresa bem-sucedido!', token: token });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro no servidor durante o login da empresa.' });
    }
};

// Retorna os dados da empresa do funcionário atualmente logado
exports.obterDadosDaMinhaEmpresa = async (req, res) => {
    const empresa_id = req.empresaId;
    
    try {
        const [rows] = await pool.query('SELECT nome_empresa, slug FROM empresas WHERE id = ?', [empresa_id]);
        if (rows.length === 0) {
            return res.status(404).json({ message: 'Empresa não encontrada.' });
        }
        res.status(200).json(rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro no servidor ao obter dados da empresa.' });
    }
};

// Redefine a senha de uma empresa (só Super Admin pode fazer)
exports.redefinirSenha = async (req, res) => {
    const { id } = req.params;
    const { novaSenha } = req.body;

    if (!novaSenha || novaSenha.length < 6) {
        return res.status(400).json({ message: 'A nova senha é obrigatória e deve ter no mínimo 6 caracteres.' });
    }

    try {
        const senhaHash = await bcrypt.hash(novaSenha, 10);
        const [result] = await pool.query(
            'UPDATE empresas SET senha_hash = ? WHERE id = ?',
            [senhaHash, id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Empresa não encontrada.' });
        }

        res.status(200).json({ message: 'Senha da empresa atualizada com sucesso.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro no servidor ao redefinir a senha da empresa.' });
    }
};
// Permite que a própria empresa logada altere sua senha
exports.redefinirSenhaPropria = async (req, res) => {
    const { senhaAtual, novaSenha } = req.body;
    const empresa_id = req.empresaId; // ID da própria empresa logada

    if (!senhaAtual || !novaSenha) {
        return res.status(400).json({ message: 'A senha atual e a nova senha são obrigatórias.' });
    }
    if (novaSenha.length < 6) {
        return res.status(400).json({ message: 'A nova senha deve ter no mínimo 6 caracteres.' });
    }

    try {
        const [rows] = await pool.query('SELECT senha_hash FROM empresas WHERE id = ?', [empresa_id]);
        const empresa = rows[0];

        if (!empresa) {
            return res.status(404).json({ message: 'Empresa não encontrada.' });
        }

        const senhaValida = await bcrypt.compare(senhaAtual, empresa.senha_hash);
        if (!senhaValida) {
            return res.status(401).json({ message: 'A senha atual está incorreta.' });
        }

        const novaSenhaHash = await bcrypt.hash(novaSenha, 10);
        await pool.query(
            'UPDATE empresas SET senha_hash = ? WHERE id = ?',
            [novaSenhaHash, empresa_id]
        );

        res.status(200).json({ message: 'Sua senha foi alterada com sucesso.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro no servidor ao alterar sua senha.' });
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
