const express = require('express');
const router = express.Router();
const caixaController = require('../controllers/caixaController');
const authMiddleware = require('../middlewares/authMiddleware');

router.use(authMiddleware);

router.get('/status', caixaController.obterStatus);
router.post('/abrir', caixaController.abrir);
router.post('/fechar', caixaController.fechar);
router.get('/fechados', caixaController.listarFechados);
router.get('/grafico-historico', caixaController.obterDadosGrafico);
router.get('/anos', caixaController.listarAnosDisponiveis);
router.get('/historico-anual', caixaController.obterHistoricoAnual);
router.get('/:id', caixaController.obterPorId);

module.exports = router;