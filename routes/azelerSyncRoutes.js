const express = require("express");
const router = express.Router();
const azelerAutoSyncService = require("../services/azelerAutoSyncService");

/**
 * @swagger
 * /api/azeler-sync/status:
 *   get:
 *     summary: Obter status da sincronização automática
 *     tags: [AzelerSync]
 *     responses:
 *       200:
 *         description: Status da sincronização
 */
router.get("/status", (req, res) => {
  try {
    const status = azelerAutoSyncService.getStatus();
    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @swagger
 * /api/azeler-sync/start:
 *   post:
 *     summary: Iniciar sincronização automática
 *     tags: [AzelerSync]
 *     responses:
 *       200:
 *         description: Sincronização iniciada
 */
router.post("/start", (req, res) => {
  try {
    azelerAutoSyncService.start(req.app.get('io'));
    res.json({
      success: true,
      message: "Sincronização automática iniciada"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @swagger
 * /api/azeler-sync/stop:
 *   post:
 *     summary: Parar sincronização automática
 *     tags: [AzelerSync]
 *     responses:
 *       200:
 *         description: Sincronização parada
 */
router.post("/stop", (req, res) => {
  try {
    azelerAutoSyncService.stop();
    res.json({
      success: true,
      message: "Sincronização automática parada"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @swagger
 * /api/azeler-sync/force-full:
 *   post:
 *     summary: Forçar sincronização completa
 *     tags: [AzelerSync]
 *     responses:
 *       200:
 *         description: Sincronização completa executada
 */
router.post("/force-full", async (req, res) => {
  try {
    const result = await azelerAutoSyncService.forceFullSync(req.app.get('io'));
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;