const express = require('express');
const router = express.Router();
const usuarioController = require('../controllers/usuarioController');
const authMiddleware = require('../middlewares/authMiddleware');
const authEmpresaMiddleware = require('../middlewares/authEmpresaMiddleware');

// Rota de login do FUNCIONÁRIO (pública)
router.post('/login', usuarioController.login);

// --- ROTA PARA O PRÓPRIO USUÁRIO/VENDEDOR ---
// NOVA ROTA - Busca os dados e métricas para o perfil do vendedor logado
router.get('/meu-perfil', authMiddleware, usuarioController.obterDadosPerfil);
router.put('/redefinir-senha-propria', authMiddleware, usuarioController.redefinirSenhaPropria);
// NOVAS ROTAS DE PERÍODO
router.post('/fechar-periodo', authMiddleware, usuarioController.fecharPeriodo);
router.get('/historico-periodos', authMiddleware, usuarioController.listarHistoricoPeriodos);

// --- ROTAS PROTEGIDAS POR LOGIN DE EMPRESA ---
router.post('/registrar', authEmpresaMiddleware, usuarioController.registrar);
router.get('/', authEmpresaMiddleware, usuarioController.listarTodos);
router.put('/:id/redefinir-senha', authEmpresaMiddleware, usuarioController.redefinirSenha);

module.exports = router;