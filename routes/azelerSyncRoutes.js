const express = require("express");
const router = express.Router();
const azelerAutoSyncService = require("../services/azelerAutoSyncService");

// 🚀 Sincronizar todos os produtos (com opção de matrículas específicas)
router.post("/sync-all", async (req, res) => {
  try {
    const { matriculas } = req.body; // pode mandar lista separada por vírgula
    const result = await azelerAutoSyncService.syncAllProducts(
      matriculas || ""
    );
    res.json(result);
  } catch (err) {
    console.error("❌ Erro em sync-all:", err.message);
    res
      .status(500)
      .json({ success: false, error: "Erro ao sincronizar todos os produtos" });
  }
});

// 🚀 Sincronizar um único produto
router.post("/sync-single", async (req, res) => {
  try {
    const { warehouseID, matricula } = req.body;
    if (!warehouseID || !matricula) {
      return res.status(400).json({
        success: false,
        error: "warehouseID e matricula são obrigatórios",
      });
    }

    const result = await azelerAutoSyncService.syncSingleProduct(
      warehouseID,
      matricula
    );
    res.json(result);
  } catch (err) {
    console.error("❌ Erro em sync-single:", err.message);
    res
      .status(500)
      .json({ success: false, error: "Erro ao sincronizar produto único" });
  }
});

// 🚀 Sincronizar apenas estoque crítico (0)
router.post("/sync-critical", async (req, res) => {
  try {
    const { matriculas } = req.body;
    const result = await azelerAutoSyncService.syncCriticalStock(
      matriculas || ""
    );
    res.json(result);
  } catch (err) {
    console.error("❌ Erro em sync-critical:", err.message);
    res
      .status(500)
      .json({ success: false, error: "Erro ao sincronizar estoque crítico" });
  }
});

module.exports = router;
