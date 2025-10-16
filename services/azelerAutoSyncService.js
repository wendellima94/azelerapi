const desguacesApi = require("./desguacesApiClient");
const { azelerApiService } = require("./azelerApiService");
const lowStockService = require("./lowStockService");

const azelerAutoSyncService = {
  /**
   * Sincroniza em lote todos os produtos da Desguaces → Azeler
   * @param {string} matriculas - lista de matrículas separadas por vírgula
   */
  async syncAllProducts(matriculas = "") {
    try {
      console.log("Iniciando sync automático Desguaces → Azeler...");

      // 1. Busca peças no Desguaces API (fonte oficial agora)
      const pecas = await desguacesApi.obterPecasComImagens(matriculas);
      console.log(`Total peças encontradas no Desguaces: ${pecas.length}`);

      if (!pecas.length) {
        return {
          success: false,
          message: "Nenhuma peça encontrada no Desguaces API",
        };
      }

      // 2. Atualiza no Azeler em chunks
      const produtoMap = pecas.map((p) => ({
        warehouseID: p.idPiezaDesp,
        partDescription: p.descricao,
        stock: p.stock || 0,
        price: p.preco || 0.0,
        status: (p.stock || 0) > 0 ? "ACTIVE" : "INACTIVE",
        isActive: (p.stock || 0) > 0,
        marca: p.marca,
        modelo: p.modelo,
        modelo_limpo: p.modelo_limpo,
        imagens: p.imagens || [],
      }));

      const results = await azelerApiService.updateMultipleProductStatus(
        produtoMap
      );

      console.log(
        `Sync concluída: ${results.filter((r) => r.success).length} ok, ${
          results.filter((r) => !r.success).length
        } falhas`
      );

      return {
        success: true,
        synced: results.filter((r) => r.success).length,
        failed: results.filter((r) => !r.success).length,
        details: results,
      };
    } catch (error) {
      console.error("Falha na sync automática:", error.message);
      return { success: false, error: error.message };
    }
  },

  /**
   * Sincroniza apenas um produto específico
   */
  async syncSingleProduct(warehouseID, matricula) {
    return await azelerApiService.syncSingleProduct(warehouseID, matricula);
  },

  /**
   * Sincroniza produtos com estoque crítico (zero) — exemplo de uso otimizado
   */
  async syncCriticalStock(matriculas = "") {
    const criticalParts = await lowStockService.fetchCriticalStock(matriculas);
    if (!criticalParts.length) {
      return {
        success: true,
        synced: 0,
        message: "Nenhum produto crítico para sincronizar",
      };
    }

    const produtoMap = criticalParts.map((p) => ({
      warehouseID: p.idPiezaDesp,
      stock: 0,
      price: p.preco || 0,
      status: "INACTIVE",
      isActive: false,
      partDescription: p.descricao,
    }));

    const results = await azelerApiService.updateMultipleProductStatus(
      produtoMap
    );

    return {
      success: true,
      synced: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
    };
  },
};

module.exports = azelerAutoSyncService;
