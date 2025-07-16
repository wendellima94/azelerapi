const express = require("express");
const router = express.Router();
const { azelerApiService } = require("../services/azelerApiService");
const lowStockService = require("../services/lowStockService");
const sparePartModel = require("../models/sparePartModel");

// ==================== ROTAS ORIGINAIS ====================

/**
 * @swagger
 * /api/spare-parts/ids:
 *   get:
 *     summary: Buscar todos os IDs da API externa
 *     tags: [SpareParts]
 *     responses:
 *       200:
 *         description: IDs de peças obtidos com sucesso
 */
router.get("/spare-parts/ids", async (req, res) => {
  try {
    const data = await azelerApiService.getAllIds();
    res.status(200).json({
      success: true,
      data,
      message: "IDs de peças obtidos com sucesso",
    });
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * @swagger
 * /api/spare-parts/insert:
 *   post:
 *     summary: Inserir peça
 *     tags: [SpareParts]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [warehouseID, partDescription, vehicleType]
 *             properties:
 *               warehouseID:
 *                 type: integer
 *               partDescription:
 *                 type: string
 *               vehicleType:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Peça adicionada à fila de publicação com sucesso
 *       400:
 *         description: Campos obrigatórios ausentes
 */
router.post("/spare-parts/insert", async (req, res) => {
  try {
    const { warehouseID, partDescription, vehicleType } = req.body;

    if (!warehouseID || !partDescription || !vehicleType) {
      return res.status(400).json({
        success: false,
        error: "Campos obrigatórios ausentes",
        message: "warehouseID, partDescription e vehicleType são obrigatórios",
      });
    }

    const data = await azelerApiService.insertSparePart(req.body);
    res.status(200).json({
      success: true,
      data,
      message: "Peça adicionada à fila de publicação com sucesso",
    });
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * @swagger
 * /api/spare-parts/update:
 *   post:
 *     summary: Atualizar peça
 *     tags: [SpareParts]
 *     security:
 *         - basicAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [warehouseID, partDescription, vehicleType]
 *             properties:
 *               warehouseID:
 *                 type: integer
 *               partDescription:
 *                 type: string
 *               vehicleType:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Peça adicionada à fila de atualização com sucesso
 *       400:
 *         description: Campos obrigatórios ausentes
 */


router.post("/spare-parts/update", async (req, res) => {
  try {
    const { warehouseID, partDescription, vehicleType } = req.body;

    if (!warehouseID || !partDescription || !vehicleType) {
      return res.status(400).json({
        success: false,
        error: "Campos obrigatórios ausentes",
        message: "warehouseID, partDescription e vehicleType são obrigatórios",
      });
    }

    const data = await azelerApiService.updateSparePart(req.body);
    res.status(200).json({
      success: true,
      data,
      message: "Peça adicionada à fila de atualização com sucesso",
    });
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * @swagger
 * /api/spare-parts/delete:
 *   post:
 *     summary: Deletar peça
 *     tags: [SpareParts]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [warehouseID, externalPlatformName]
 *             properties:
 *               warehouseID:
 *                 type: integer
 *               externalPlatformName:
 *                 type: string
 *     responses:
 *       200:
 *         description: Peça adicionada à fila de exclusão com sucesso
 *       400:
 *         description: Campos obrigatórios ausentes
 */
router.post("/spare-parts/delete", async (req, res) => {
  try {
    const { warehouseID, externalPlatformName } = req.body;

    if (!warehouseID || !externalPlatformName) {
      return res.status(400).json({
        success: false,
        error: "Campos obrigatórios ausentes",
        message: "warehouseID e externalPlatformName são obrigatórios",
      });
    }

    const data = await azelerApiService.deleteSparePart(req.body);
    res.status(200).json({
      success: true,
      data,
      message: "Peça adicionada à fila de exclusão com sucesso",
    });
  } catch (error) {
    handleError(error, res);
  }
});

// ==================== NOVAS ROTAS DE MONITORAMENTO COM PAGINAÇÃO ====================

/**
 * @swagger
 * /api/spare-parts/critical-stock:
 *   get:
 *     summary: Buscar peças com estoque crítico (0 unidades) - com paginação
 *     tags: [SpareParts]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Página
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Limite por página
 *     responses:
 *       200:
 *         description: Peças com estoque crítico (0 unidades)
 */
router.get("/spare-parts/critical-stock", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;

    const result = await lowStockService.getLowStockWithPagination(
      0,
      page,
      limit
    );

    res.json({
      success: true,
      data: result.data,
      pagination: result.pagination,
      count: result.data.length,
      message: "Peças com estoque crítico (0 unidades)",
    });
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * @swagger
 * /api/spare-parts/low-stock:
 *   get:
 *     summary: Buscar peças com estoque baixo (customizável) - com paginação
 *     tags: [SpareParts]
 *     parameters:
 *       - in: query
 *         name: threshold
 *         schema:
 *           type: integer
 *         description: Valor máximo de estoque para considerar baixo
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Página
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Limite por página
 *     responses:
 *       200:
 *         description: Peças com estoque baixo
 */
router.get("/spare-parts/low-stock", async (req, res) => {
  try {
    const threshold = parseInt(req.query.threshold) || 0;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;

    const result = await lowStockService.getLowStockWithPagination(
      threshold,
      page,
      limit
    );

    res.json({
      success: true,
      data: result.data,
      pagination: result.pagination,
      count: result.data.length,
      threshold,
      message:
        threshold === 0
          ? "Peças sem estoque"
          : `Peças com estoque <= ${threshold}`,
    });
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * @swagger
 * /api/spare-parts/sync:
 *   get:
 *     summary: Sincronizar com API externa
 *     tags: [SpareParts]
 *     responses:
 *       200:
 *         description: Sincronização concluída
 */
router.get("/spare-parts/sync", async (req, res) => {
  try {
    const syncResult = await lowStockService.syncWithAzelerApi();
    res.json({
      success: true,
      data: syncResult,
      message: "Sincronização concluída",
    });
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * @swagger
 * /api/spare-parts/stats:
 *   get:
 *     summary: Estatísticas de estoque
 *     tags: [SpareParts]
 *     responses:
 *       200:
 *         description: Estatísticas retornadas
 */
router.get("/spare-parts/stats", async (req, res) => {
  try {
    const stats = await lowStockService.getStats();
    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * @swagger
 * /api/spare-parts/check-stock/{warehouseID}:
 *   get:
 *     summary: Verificar estoque de uma peça específica
 *     tags: [SpareParts]
 *     parameters:
 *       - in: path
 *         name: warehouseID
 *         required: true
 *         schema:
 *           type: integer
 *         description: WarehouseID da peça
 *     responses:
 *       200:
 *         description: Dados da peça e status de estoque
 *       404:
 *         description: Peça não encontrada
 */
router.get("/spare-parts/check-stock/:warehouseID", async (req, res) => {
  try {
    const { warehouseID } = req.params;
    const part = await sparePartModel.getByWarehouseId(parseInt(warehouseID));

    if (!part) {
      return res.status(404).json({
        success: false,
        message: "Peça não encontrada",
      });
    }

    // Nova lógica: apenas 0 é crítico
    let status;
    let statusMessage;

    if (part.stock === 0) {
      status = "CRITICO";
      statusMessage = "Sem estoque - ATENÇÃO NECESSÁRIA";
    } else if (part.stock === 1) {
      status = "NORMAL";
      statusMessage = "Estoque normal para seu negócio";
    } else {
      status = "ALTO";
      statusMessage = "Estoque acima do normal";
    }

    res.json({
      success: true,
      data: part,
      status,
      statusMessage,
      alert: part.stock === 0 ? "ALERTA: Peça sem estoque!" : null,
    });
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * @swagger
 * /api/spare-parts/update-stock/{warehouseID}:
 *   put:
 *     summary: Atualizar estoque de uma peça
 *     tags: [SpareParts]
 *     parameters:
 *       - in: path
 *         name: warehouseID
 *         required: true
 *         schema:
 *           type: integer
 *         description: WarehouseID da peça
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [stock]
 *             properties:
 *               stock:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Estoque atualizado com sucesso
 *       404:
 *         description: Peça não encontrada
 */
router.put("/spare-parts/update-stock/:warehouseID", async (req, res) => {
  try {
    const { warehouseID } = req.params;
    const { stock } = req.body;

    if (stock === undefined || stock < 0) {
      return res.status(400).json({
        success: false,
        message: "Stock deve ser um número >= 0",
      });
    }

    const updated = await sparePartModel.updateStock(
      parseInt(warehouseID),
      stock
    );

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: "Peça não encontrada",
      });
    }

    // Determina o status após atualização
    let statusMessage;
    if (stock === 0) {
      statusMessage = "ATENÇÃO: Estoque zerado!";
    } else if (stock === 1) {
      statusMessage = "Estoque normal (1 unidade)";
    } else {
      statusMessage = `Estoque alto (${stock} unidades)`;
    }

    res.json({
      success: true,
      message: "Estoque atualizado com sucesso",
      newStock: stock,
      statusMessage,
    });
  } catch (error) {
    handleError(error, res);
  }
});

// ==================== ROTAS ADICIONAIS ÚTEIS COM PAGINAÇÃO ====================

/**
 * @swagger
 * /api/spare-parts/all:
 *   get:
 *     summary: Buscar todas as peças (administração) - com paginação
 *     tags: [SpareParts]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Página
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Limite por página
 *     responses:
 *       200:
 *         description: Todas as peças obtidas com sucesso
 */
router.get("/spare-parts/all", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;

    const result = await lowStockService.getAllPartsWithPagination(page, limit);

    res.json({
      success: true,
      data: result.data,
      pagination: result.pagination,
      count: result.data.length,
      message: "Todas as peças obtidas com sucesso",
    });
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * @swagger
 * /api/spare-parts/by-status/{status}:
 *   get:
 *     summary: Buscar peças por status (crítico, normal, alto) - com paginação
 *     tags: [SpareParts]
 *     parameters:
 *       - in: path
 *         name: status
 *         required: true
 *         schema:
 *           type: string
 *           enum: [critico, normal, alto]
 *         description: Status do estoque
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Página
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Limite por página
 *     responses:
 *       200:
 *         description: Peças filtradas por status
 *       400:
 *         description: Status inválido
 */
router.get("/spare-parts/by-status/:status", async (req, res) => {
  try {
    const { status } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    let result;
    let message;

    switch (status.toLowerCase()) {
      case "critico":
        result = await lowStockService.getLowStockWithPagination(
          0,
          page,
          limit
        );
        message = "Peças com estoque crítico (0 unidades)";
        break;
      case "normal":
        // Busca peças com estoque = 1
        const normalParts = await sparePartModel.getByStockValue(
          1,
          page,
          limit
        );
        return res.json({
          success: true,
          data: normalParts,
          count: normalParts.length,
          message: "Peças com estoque normal (1 unidade)",
        });
      case "alto":
        // Busca peças com estoque > 1
        const highParts = await sparePartModel.getHighStock(page, limit);
        return res.json({
          success: true,
          data: highParts,
          count: highParts.length,
          message: "Peças com estoque alto (> 1 unidade)",
        });
      default:
        return res.status(400).json({
          success: false,
          message: "Status inválido. Use: critico, normal ou alto",
        });
    }

    res.json({
      success: true,
      data: result.data,
      pagination: result.pagination,
      count: result.data.length,
      message,
    });
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * @swagger
 * /api/spare-parts/dashboard:
 *   get:
 *     summary: Dashboard resumido de estoque
 *     tags: [SpareParts]
 *     responses:
 *       200:
 *         description: Dashboard obtido com sucesso
 */
router.get("/spare-parts/dashboard", async (req, res) => {
  try {
    const stats = await lowStockService.getStats();
    const criticalItems = await lowStockService.fetchCriticalStock();

    // Pega apenas os 5 primeiros itens críticos para o dashboard
    const topCritical = criticalItems.slice(0, 5);

    res.json({
      success: true,
      data: {
        stats,
        topCriticalItems: topCritical,
        hasAlerts: criticalItems.length > 0,
        alertMessage:
          criticalItems.length > 0
            ? `${criticalItems.length} peça(s) sem estoque!`
            : "Todos os estoques OK",
      },
      message: "Dashboard obtido com sucesso",
    });
  } catch (error) {
    handleError(error, res);
  }
});

// Função auxiliar para tratamento de erros
function handleError(error, res) {
  console.error("Erro na requisição:", error.message);

  if (error.response) {
    res.status(error.response.status).json({
      success: false,
      error: "Erro na API externa",
      details: error.response.data,
      status: error.response.status,
    });
  } else if (error.request) {
    res.status(500).json({
      success: false,
      error: "Erro de conexão com a API",
      message: "Não foi possível conectar com o servidor externo",
    });
  } else {
    res.status(500).json({
      success: false,
      error: "Erro interno do servidor",
      message: error.message,
    });
  }
}

module.exports = router;