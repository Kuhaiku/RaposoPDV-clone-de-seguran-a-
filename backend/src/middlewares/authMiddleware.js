const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).json({ message: 'Token de funcionário não fornecido.' });
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
            return res.status(401).json({ message: 'Token de funcionário inválido ou expirado.' });
        }

        // MUDANÇA CRÍTICA AQUI: Verificamos e anexamos ambos os IDs
        if (!decoded.usuarioId || !decoded.empresaId) {
            return res.status(401).json({ message: 'Token inválido. Acesso negado.' });
        }

        req.usuarioId = decoded.usuarioId;
        req.empresaId = decoded.empresaId; // Agora toda rota protegida saberá a qual empresa o usuário pertence
        return next();
    });
};