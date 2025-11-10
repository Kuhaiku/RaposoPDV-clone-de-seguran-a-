const express = require('express');
const router = express.Router();
const publicController = require('../controllers/publicController');

// Rota para buscar um catálogo pelo slug da empresa
// GET /api/publico/catalogo/uze-moda-sustentavel
router.get('/catalogo/:slug', publicController.obterCatalogoPorSlug);

module.exports = router;