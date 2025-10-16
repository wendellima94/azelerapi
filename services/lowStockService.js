const desguacesApi = require("./desguacesApiClient");
const { azelerApiService } = require("./azelerApiService");

// Função utilitária para chunks grandes
function chunkArray(array, size) {
  const result = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
}

const lowStockService = {
  /**
   * Busca peças com estoque crítico (0)
   * 🚀 Agora baseados direto do Desguaces API
   */
  async fetchCriticalStock(matriculas) {
    const pecas = await desguacesApi.obterPecasComImagens(matriculas);
    return pecas.filter((p) => (p.stock || 0) === 0);
  },

  /**
   * Estoque baixo customizável
   */
  async fetchLowStock(matriculas, threshold = 0) {
    const pecas = await desguacesApi.obterPecasComImagens(matriculas);
    return pecas.filter((p) => (p.stock || 0) <= threshold);
  },

  /**
   * Estoque baixo com paginação
   */
  async getLowStockWithPagination(
    threshold = 0,
    page = 1,
    limit = 20,
    matriculas = ""
  ) {
    const pecas = await desguacesApi.obterPecasComImagens(matriculas);
    const filtered = pecas.filter((p) => (p.stock || 0) <= threshold);

    const start = (page - 1) * limit;
    const end = start + limit;
    return {
      data: filtered.slice(start, end),
      pagination: { page, limit, total: filtered.length },
    };
  },

  /**
   * Buscar todas as peças com paginação
   */
  async getAllPartsWithPagination(page = 1, limit = 50, matriculas = "") {
    const pecas = await desguacesApi.obterPecasComImagens(matriculas);

    const start = (page - 1) * limit;
    const end = start + limit;
    return {
      data: pecas.slice(start, end),
      pagination: { page, limit, total: pecas.length },
    };
  },

  /**
   * Sincronizar com API Azeler (comparando dados locais x externos)
   */
  async syncWithAzelerApi(matriculas = "") {
    console.log("🔄 Iniciando sincronização com Azeler...");

    const externalData = await azelerApiService.getAllIds();
    const externalIds = externalData.warehouseIdList || [];
    console.log(`📥 IDs da Azeler: ${externalIds.length}`);

    // Busca de Desguaces
    const localData = await desguacesApi.obterPecasComImagens(matriculas);
    const localIds = localData.map((p) => String(p.idPiezaDesp));

    const missingInLocal = externalIds.filter(
      (id) => !localIds.includes(String(id))
    );
    const missingInExternal = localIds.filter(
      (id) => !externalIds.includes(String(id))
    );

    console.log(`❌ Faltando localmente: ${missingInLocal.length}`);
    console.log(`❌ Faltando na Azeler: ${missingInExternal.length}`);

    return {
      totalExternal: externalIds.length,
      totalLocal: localData.length,
      missingInLocal,
      missingInExternal,
      criticalStockItems: await this.fetchCriticalStock(matriculas),
      lowStockItems: await this.fetchLowStock(matriculas, 1),
    };
  },

  /**
   * Estatísticas de estoque
   */
  async getStats(matriculas = "") {
    const pecas = await desguacesApi.obterPecasComImagens(matriculas);

    const criticalStock = pecas.filter((p) => (p.stock || 0) === 0);
    const lowStock = pecas.filter((p) => (p.stock || 0) <= 1);
    const normalStock = pecas.filter((p) => (p.stock || 0) > 1);

    return {
      total: pecas.length,
      criticalStock: criticalStock.length,
      lowStock: lowStock.length - criticalStock.length,
      normalStock: normalStock.length,
      lastUpdate: new Date().toISOString(),
    };
  },
};

module.exports = lowStockService;
