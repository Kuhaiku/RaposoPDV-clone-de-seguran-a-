const express = require('express');
const router = express.Router();
const vendaController = require('../controllers/vendaController');
const authMiddleware = require('../middlewares/authMiddleware');

router.use(authMiddleware);

// Rota para criar uma nova venda
router.post('/', vendaController.criar);

// Rota para listar todas as vendas
router.get('/', vendaController.listarTodas);

// Rota para ver detalhes de uma venda
router.get('/:id', vendaController.obterPorId);

// NOVO: Rota para cancelar uma venda
router.delete('/:id', vendaController.cancelar);

module.exports = router;
