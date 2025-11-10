const express = require('express');
const router = express.Router();
const clienteController = require('../controllers/clienteController');
const authMiddleware = require('../middlewares/authMiddleware');

// Aplica o middleware de autenticação a todas as rotas de clientes
router.use(authMiddleware);

// Rotas do CRUD de Clientes
router.post('/', clienteController.criar);
router.get('/', clienteController.listarTodos);
router.get('/:id', clienteController.obterPorId);
router.put('/:id', clienteController.atualizar);
router.delete('/:id', clienteController.excluir);

// Rotas de Detalhes e Histórico
router.get('/:id/vendas', clienteController.obterVendasPorCliente);
router.get('/:id/detalhes', clienteController.obterDetalhes);

module.exports = router;