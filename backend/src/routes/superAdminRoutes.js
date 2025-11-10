const express = require('express');
const router = express.Router();
const superAdminController = require('../controllers/superAdminController');

// Rota para o Super Admin fazer login
// POST /api/superadmin/login
router.post('/login', superAdminController.login);

// Rota para CADASTRAR um novo Super Admin (protegida por chave secreta no corpo da requisição)
// POST /api/superadmin/registrar
router.post('/registrar', superAdminController.registrar);

module.exports = router;