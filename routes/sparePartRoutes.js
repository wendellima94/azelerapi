const express = require("express");
const router = express.Router();
const desguacesApiClient = require("../services/desguacesApiClient");
const azelerApiService = require("../services/azelerApiService");
const lowStockService = require("../services/lowStockService");

/**
 * 🔍 Rota de debug parecida com a do Flask (/processar)
 * POST /api/spare-parts/processar
 * Body ou Query: { "matriculas": "AAA1111,BBB2222" }
 */
router.post("/processar", async (req, res) => {
  try {
    const matriculas = req.body.matriculas || req.query.matriculas;

    if (!matriculas) {
      return res.status(400).json({
        success: false,
        error: "Parâmetro 'matriculas' é obrigatório",
      });
    }

    const pecas = await desguacesApiClient.obterPecasPorMatricula(matriculas);

    // separa com e sem OEM
    const comOEM = [];
    const semOEM = [];

    for (const p of pecas) {
      if (p.preco === 0.0) {
        comOEM.push({ ...p });
        semOEM.push({ ...p });
      } else {
        const oem = (p.OEM || "").toLowerCase();
        if (oem && !["nan", "null", "none"].includes(oem)) {
          comOEM.push(p);
        } else {
          semOEM.push(p);
        }
      }
    }

    return res.json({
      success: true,
      total: pecas.length,
      com_oem: comOEM,
      sem_oem: semOEM,
    });
  } catch (err) {
    console.error("❌ Erro rota /processar:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 🔍 Busca peças por matrícula (via parâmetro)
 * GET /api/spare-parts/by-matricula/:matriculas
 */
router.get("/by-matricula/:matriculas", async (req, res) => {
  try {
    const matriculas = req.params.matriculas;
    if (!matriculas) {
      return res.status(400).json({
        success: false,
        error: "Parâmetro 'matriculas' é obrigatório",
      });
    }

    const pecas = await desguacesApiClient.obterPecasPorMatricula(matriculas);
    res.json({ success: true, total: pecas.length, pecas });
  } catch (err) {
    console.error("❌ Erro rota by-matricula (param):", err.message);
    res.status(500).json({ success: false, error: "Erro ao buscar peças" });
  }
});

/**
 * 🔍 Busca peças por matrícula (via query string)
 * GET /api/spare-parts/by-matricula?matriculas=AAA1111,BBB2222
 */
router.get("/by-matricula", async (req, res) => {
  try {
    console.log(">>> req.query:", req.query);
    console.log(">>> req.params:", req.params);
    console.log(">>> req.body:", req.body);

    const matriculas =
      req.query.matriculas || req.params.matriculas || req.body.matriculas;

    if (!matriculas) {
      return res.status(400).json({
        success: false,
        error: "Parâmetro 'matriculas' é obrigatório",
      });
    }

    const pecas = await desguacesApiClient.obterPecasPorMatricula(matriculas);
    res.json({ success: true, total: pecas.length, pecas });
  } catch (err) {
    console.error("❌ Erro rota by-matricula (query):", err);
    res.status(500).json({ success: false, error: "Erro ao buscar peças" });
  }
});

/**
 * 🖼️ Busca imagens de uma peça (Desguaces API)
 * GET /api/spare-parts/images/:idPiezaDesp
 */
router.get("/images/:idPiezaDesp", async (req, res) => {
  try {
    const { idPiezaDesp } = req.params;
    if (!idPiezaDesp) {
      return res.status(400).json({
        success: false,
        error: "Parâmetro 'idPiezaDesp' é obrigatório",
      });
    }

    const imagens = await desguacesApiClient.obterImagensPorPeca(idPiezaDesp);
    res.json({ success: true, total: imagens.length, imagens });
  } catch (err) {
    console.error("❌ Erro rota images:", err.message);
    res.status(500).json({ success: false, error: "Erro ao buscar imagens" });
  }
});

/**
 * 📊 Estatísticas gerais (Azeler API)
 */
router.get("/stats", async (req, res) => {
  try {
    const stats = await azelerApiService.obterEstatisticas(() => null);
    res.json({ success: true, stats });
  } catch (err) {
    console.error("❌ Erro rota stats:", err.message);
    res
      .status(500)
      .json({ success: false, error: "Erro ao obter estatísticas" });
  }
});

/**
 * 📉 Estoque baixo
 */
router.get("/low-stock", async (req, res) => {
  try {
    const lowStock = await lowStockService.obterEstoqueBaixo(() => null);
    res.json({ success: true, total: lowStock.length, items: lowStock });
  } catch (err) {
    console.error("❌ Erro rota low-stock:", err.message);
    res
      .status(500)
      .json({ success: false, error: "Erro ao obter estoque baixo" });
  }
});

/**
 * 🔄 Sincronizar produto único com Azeler
 */
router.post("/sync-single", async (req, res) => {
  try {
    const { warehouseID, matricula } = req.body;
    if (!warehouseID || !matricula) {
      return res.status(400).json({
        success: false,
        error: "warehouseID e matricula são obrigatórios",
      });
    }

    const result = await azelerApiService.sincronizarProdutoUnico(
      warehouseID,
      matricula
    );
    res.json(result);
  } catch (err) {
    console.error("❌ Erro rota sync-single:", err.message);
    res
      .status(500)
      .json({ success: false, error: "Erro ao sincronizar produto" });
  }
});

/**
 * ➕ Inserir peça
 */
router.post("/insert", async (req, res) => {
  try {
    const peca = req.body;
    if (!peca || !peca.idPiezaDesp) {
      return res.status(400).json({
        success: false,
        error: "Dados da peça são obrigatórios",
      });
    }

    const result = await azelerApiService.inserirPeca(peca);
    res.json(result);
  } catch (err) {
    console.error("❌ Erro rota insert:", err.message);
    res.status(500).json({ success: false, error: "Erro ao inserir peça" });
  }
});

/**
 * ✏️ Atualizar peça
 */
router.post("/update", async (req, res) => {
  try {
    const { warehouseID, peca } = req.body;
    if (!warehouseID || !peca) {
      return res.status(400).json({
        success: false,
        error: "warehouseID e peca são obrigatórios",
      });
    }

    const result = await azelerApiService.atualizarPeca(warehouseID, peca);
    res.json(result);
  } catch (err) {
    console.error("❌ Erro rota update:", err.message);
    res.status(500).json({ success: false, error: "Erro ao atualizar peça" });
  }
});

/**
 * 🗑️ Deletar peça
 */
router.post("/delete", async (req, res) => {
  try {
    const { warehouseID } = req.body;
    if (!warehouseID) {
      return res.status(400).json({
        success: false,
        error: "warehouseID é obrigatório",
      });
    }

    const result = await azelerApiService.deletarPeca(warehouseID);
    res.json(result);
  } catch (err) {
    console.error("❌ Erro rota delete:", err.message);
    res.status(500).json({ success: false, error: "Erro ao deletar peça" });
  }
});

/**
 * 📦 Atualizar estoque
 */
router.put("/update-stock/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { stock } = req.body;
    if (!id || stock === undefined) {
      return res.status(400).json({
        success: false,
        error: "ID e stock são obrigatórios",
      });
    }

    const result = await azelerApiService.atualizarEstoque(id, stock);
    res.json(result);
  } catch (err) {
    console.error("❌ Erro rota update-stock:", err.message);
    res
      .status(500)
      .json({ success: false, error: "Erro ao atualizar estoque" });
  }
});

module.exports = router;
