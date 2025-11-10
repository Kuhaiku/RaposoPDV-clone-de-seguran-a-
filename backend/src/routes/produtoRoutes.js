const express = require("express");
const router = express.Router();
const produtoController = require("../controllers/produtoController");
const authMiddleware = require("../middlewares/authMiddleware");
const { uploadImages, uploadCsv } = require("../config/multer"); 

router.use(authMiddleware);

router.get("/", produtoController.listarTodos);
router.post("/", uploadImages, produtoController.criar);

// Rotas específicas devem vir antes das rotas com parâmetros
router.post("/importar-csv", uploadCsv, produtoController.importarCSV);
router.get("/inativos", produtoController.listarInativos);
router.put("/inativar-em-massa", produtoController.inativarEmMassa);
router.post("/excluir-em-massa", produtoController.excluirEmMassa); 

// Rotas com parâmetros (mais genéricas) vêm depois
router.get("/:id", produtoController.obterPorId);
router.put("/:id", uploadImages, produtoController.atualizar);
router.put("/:id/reativar", produtoController.reativar);
router.delete("/:id", produtoController.excluir);

module.exports = router;
