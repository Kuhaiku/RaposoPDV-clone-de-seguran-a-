const express = require('express');
const router = express.Router();
const usuarioController = require('../controllers/usuarioController');
const authMiddleware = require('../middlewares/authMiddleware');
// REMOVIDO: const authEmpresaMiddleware = require('../middlewares/authEmpresaMiddleware');

// --- ROTAS PÚBLICAS ---
router.post('/login', usuarioController.login); // Rota de login principal (modificada)
router.post('/solicitar-redefinicao-senha', usuarioController.solicitarRedefinicaoSenha); // Nova
router.post('/redefinir-senha-com-token', usuarioController.redefinirSenhaComToken); // Nova

// --- ROTA PARA O PRÓPRIO USUÁRIO/VENDEDOR ---
router.get('/meu-perfil', authMiddleware, usuarioController.obterDadosPerfil);
router.put('/redefinir-senha-propria', authMiddleware, usuarioController.redefinirSenhaPropria);
router.post('/fechar-periodo', authMiddleware, usuarioController.fecharPeriodo);
router.get('/historico-periodos', authMiddleware, usuarioController.listarHistoricoPeriodos);

// --- ROTAS PROTEGIDAS POR LOGIN DE EMPRESA (REMOVIDAS) ---
// router.post('/registrar', authEmpresaMiddleware, usuarioController.registrar);
// router.get('/', authEmpresaMiddleware, usuarioController.listarTodos);
// router.put('/:id/redefinir-senha', authEmpresaMiddleware, usuarioController.redefinirSenha);

module.exports = router;