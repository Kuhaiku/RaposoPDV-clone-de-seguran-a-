const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).json({ message: 'Token de Super Admin não fornecido.' });
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || !/^Bearer$/i.test(parts[0])) {
        return res.status(401).json({ message: 'Token com formato inválido.' });
    }

    const [, token] = parts;

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) {
            return res.status(401).json({ message: 'Token de Super Admin inválido ou expirado.' });
        }

        // A verificação crucial: o token DEVE conter a propriedade 'superAdminId'
        if (!decoded.superAdminId) {
            return res.status(403).json({ message: 'Acesso negado. Permissões insuficientes.' });
        }

        req.superAdminId = decoded.superAdminId;
        return next();
    });
};