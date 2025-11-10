const pool = require('../config/database');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Função para registrar um novo Super Admin (protegida por chave secreta)
exports.registrar = async (req, res) => {
    const { nome, email, senha, secretKey } = req.body;

    // 1. Verificação de segurança PRIMÁRIA
    if (secretKey !== process.env.SUPER_ADMIN_SECRET_KEY) {
        return res.status(403).json({ message: 'Acesso negado. Chave secreta inválida.' });
    }

    if (!nome || !email || !senha) {
        return res.status(400).json({ message: 'Nome, e-mail e senha são obrigatórios.' });
    }

    try {
        const senhaHash = await bcrypt.hash(senha, 10);
        const [result] = await pool.query(
            'INSERT INTO superadmins (nome, email, senha_hash) VALUES (?, ?, ?)',
            [nome, email, senhaHash]
        );
        res.status(201).json({ message: 'Super Admin registrado com sucesso!', superAdminId: result.insertId });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: 'Este e-mail já está em uso.' });
        }
        console.error(error);
        res.status(500).json({ message: 'Erro no servidor ao registrar Super Admin.' });
    }
};


// Função de login para o Super Admin
exports.login = async (req, res) => {
    const { email, senha } = req.body;

    if (!email || !senha) {
        return res.status(400).json({ message: 'E-mail e senha são obrigatórios.' });
    }

    try {
        const [rows] = await pool.query('SELECT * FROM superadmins WHERE email = ?', [email]);
        const superAdmin = rows[0];

        if (!superAdmin) {
            return res.status(401).json({ message: 'Credenciais inválidas.' });
        }

        const senhaValida = await bcrypt.compare(senha, superAdmin.senha_hash);
        if (!senhaValida) {
            return res.status(401).json({ message: 'Credenciais inválidas.' });
        }

        const token = jwt.sign(
            { superAdminId: superAdmin.id, nome: superAdmin.nome },
            process.env.JWT_SECRET,
            { expiresIn: '8h' }
        );

        res.status(200).json({ message: 'Login de Super Admin bem-sucedido!', token: token });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro no servidor durante o login do Super Admin.' });
    }
};