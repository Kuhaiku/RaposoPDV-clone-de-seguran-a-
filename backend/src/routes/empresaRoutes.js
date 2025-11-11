const express = require('express');
const router = express.Router();
const empresaController = require('../controllers/empresaController');
const authSuperAdminMiddleware = require('../middlewares/authSuperAdminMiddleware');
const authMiddleware = require('../middlewares/authMiddleware');
// REMOVIDO: const authEmpresaMiddleware = require('../middlewares/authEmpresaMiddleware');

// --- ROTAS PÚBLICAS ---
// router.post('/login', empresaController.login); // Rota de login da empresa removida
router.post('/registrar-publico', empresaController.registrarPublico); // Nova rota de registro público

// --- ROTA PARA FUNCIONÁRIO LOGADO ---
// Usada pelo painel de vendas (authMiddleware) para buscar dados do catálogo, recibo, etc.
router.get('/meus-dados', authMiddleware, empresaController.obterDadosDaMinhaEmpresa);

// --- ROTA DE EMPRESA (Obsoleta) ---
// router.put('/redefinir-senha-propria', authEmpresaMiddleware, empresaController.redefinirSenhaPropria); // Removida

// --- ROTAS PROTEGIDAS (SÓ O SUPER ADMIN ACESSA) ---
router.use(authSuperAdminMiddleware);
// router.post('/registrar', empresaController.registrar); // Rota de registro de superadmin removida/obsoleta
router.get('/ativas', empresaController.listarAtivas);
router.get('/inativas', empresaController.listarInativas);
router.get('/detalhes/:id', empresaController.obterDetalhes);
router.put('/inativar/:id', empresaController.inativar);
router.put('/ativar/:id', empresaController.ativar); // Esta rota agora serve para APROVAR empresas
router.put('/:id/redefinir-senha', empresaController.redefinirSenha); // Esta rota agora atualiza ambas as tabelas

module.exports = router;