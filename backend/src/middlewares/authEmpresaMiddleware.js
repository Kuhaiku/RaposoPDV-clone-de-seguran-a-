const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).json({ message: 'Token de empresa não fornecido.' });
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2) {
        return res.status(401).json({ message: 'Erro no formato do token.' });
    }

    const [scheme, token] = parts;
    if (!/^Bearer$/i.test(scheme)) {
        return res.status(401).json({ message: 'Token mal formatado.' });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) {
            return res.status(401).json({ message: 'Token de empresa inválido ou expirado.' });
        }

        // Verifica se o token tem o 'empresaId'
        if (!decoded.empresaId) {
            return res.status(401).json({ message: 'Token inválido. Acesso negado para esta operação.' });
        }

        // Anexa o ID da empresa na requisição para ser usado no controller
        req.empresaId = decoded.empresaId;
        return next();
    });
};