const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const authMiddleware = require('../middlewares/authMiddleware');

router.use(authMiddleware);

// Rota principal que retorna todas as métricas
router.get('/metricas', dashboardController.obterMetricas);

module.exports = router;