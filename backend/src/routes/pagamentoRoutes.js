const express = require('express');
const router = express.Router();
const pagamentoController = require('../controllers/pagamentoController');
const authSuperAdminMiddleware = require('../middlewares/authSuperAdminMiddleware');

// Protege todas as rotas de pagamento com o middleware do Super Admin
router.use(authSuperAdminMiddleware);

// Rota para registrar um novo pagamento
// POST /api/pagamentos/registrar
router.post('/registrar', pagamentoController.registrarPagamento);

// Rota para listar os pagamentos de uma empresa específica
// GET /api/pagamentos/:id
router.get('/:id', pagamentoController.listarPagamentosPorEmpresa);

module.exports = router;