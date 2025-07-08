const sparePartModel = require("../models/sparePartModel");
const { azelerApiService } = require("./azelerApiService");

// Função utilitária para dividir arrays em chunks
function chunkArray(array, size) {
  const result = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
}

const lowStockService = {
  // Buscar estoque crítico (apenas 0)
  async fetchCriticalStock() {
    return await sparePartModel.getLowStock(0); // Apenas estoque 0
  },

  // Buscar estoque baixo (customizável)
  async fetchLowStock(threshold = 0) {
    return await sparePartModel.getLowStock(threshold);
  },

  // NOVA: Buscar estoque baixo com paginação
  async getLowStockWithPagination(threshold = 0, page = 1, limit = 20) {
    return await sparePartModel.getLowStockPaginated(threshold, page, limit);
  },

  // NOVA: Buscar todas as peças com paginação
  async getAllPartsWithPagination(page = 1, limit = 50) {
    return await sparePartModel.getAllPartsPaginated(page, limit);
  },

  // Sincronizar com API externa - OTIMIZADA COM CHUNKS
  async syncWithAzelerApi() {
    try {
      console.log("🔄 Iniciando sincronização com Azeler...");

      // Busca IDs da API externa
      const externalData = await azelerApiService.getAllIds();
      const externalIds = externalData.warehouseIdList || [];
      console.log(`📥 IDs da Azeler: ${externalIds.length}`);

      // Busca dados locais usando chunks para evitar erro de parâmetros
      const localData = await this.syncWithExternalApiInChunks(externalIds);
      console.log(`💾 IDs locais encontrados: ${localData.length}`);

      // Compara e identifica divergências
      const localIds = localData.map((item) => item.warehouseID);
      const missingInLocal = externalIds.filter((id) => !localIds.includes(id));
      const missingInExternal = localIds.filter(
        (id) => !externalIds.includes(id)
      );

      console.log(`❌ Faltando localmente: ${missingInLocal.length}`);
      console.log(`❌ Faltando na Azeler: ${missingInExternal.length}`);

      return {
        totalExternal: externalIds.length,
        totalLocal: localData.length,
        missingInLocal,
        missingInExternal,
        criticalStockItems: await this.fetchCriticalStock(), // Apenas estoque 0
        lowStockItems: await this.fetchLowStock(1), // Para referência (estoque <= 1)
      };
    } catch (error) {
      console.error("Erro na sincronização:", error);
      throw error;
    }
  },

  // NOVA: Sincronizar usando chunks para evitar limite de parâmetros
  async syncWithExternalApiInChunks(externalIds) {
    if (!externalIds || externalIds.length === 0) {
      return [];
    }

    const CHUNK_SIZE = 1000; // Máximo 1000 IDs por consulta
    const chunks = chunkArray(externalIds, CHUNK_SIZE);
    let allLocalData = [];

    console.log(
      `🔄 Processando ${chunks.length} lotes de até ${CHUNK_SIZE} IDs...`
    );

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      console.log(
        `📦 Processando lote ${i + 1}/${chunks.length} (${chunk.length} IDs)...`
      );

      try {
        const chunkData = await sparePartModel.syncWithExternalApiChunk(chunk);
        allLocalData = allLocalData.concat(chunkData);

        // Pequena pausa entre chunks para não sobrecarregar o banco
        if (i < chunks.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      } catch (error) {
        console.error(`❌ Erro no lote ${i + 1}:`, error.message);
        // Continua com os próximos lotes mesmo se um falhar
      }
    }

    console.log(
      `✅ Sincronização concluída: ${allLocalData.length} registros processados`
    );
    return allLocalData;
  },

  // Obter estatísticas
  async getStats() {
    const allParts = await sparePartModel.getAllParts();
    const criticalStock = await sparePartModel.getLowStock(0); // Apenas 0
    const lowStock = await sparePartModel.getLowStock(1); // 0 e 1
    const normalStock = allParts.filter((part) => part.stock > 1);

    return {
      total: allParts.length,
      criticalStock: criticalStock.length, // Estoque 0 (crítico)
      lowStock: lowStock.length - criticalStock.length, // Estoque 1 (normal para você)
      normalStock: normalStock.length, // Estoque > 1
      lastUpdate: new Date().toISOString(),
    };
  },
};

module.exports = lowStockService;
