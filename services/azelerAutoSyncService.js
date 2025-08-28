const azelerSyncModel = require("../models/azelerSyncModel");
const { azelerApiService } = require("./azelerApiService");

class AzelerAutoSyncService {
  constructor() {
    this.isRunning = false;
    this.syncInterval = null;
    this.lastSyncDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24h atrás
    this.SYNC_INTERVAL_MS = 30000;
    this.BATCH_SIZE = 10; 
    this.EXTERNAL_PLATFORM_NAME = "DesguacesGP";
  }

  /**
   * Inicia a sincronização automática
   */
  start(io = null) {
    if (this.isRunning) {
      console.log("⚠️ Sincronização já está rodando");
      return;
    }

    this.isRunning = true;
    console.log("🚀 Iniciando sincronização automática com Azeler...");

    // Primeira execução imediata
    this.performSync(io);

    // Configura execução periódica
    this.syncInterval = setInterval(() => {
      this.performSync(io);
    }, this.SYNC_INTERVAL_MS);
  }

  /**
   * Para a sincronização automática
   */
  stop() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    this.isRunning = false;
    console.log("⏹️ Sincronização automática parada");
  }

  /**
   * Executa uma rodada de sincronização
   */
  async performSync(io = null) {
    try {
      console.log("🔄 Iniciando ciclo de sincronização...");

      // Busca produtos atualizados desde a última sincronização
      const updatedProducts = await azelerSyncModel.getUpdatedProductsSince(
        this.lastSyncDate
      );

      if (updatedProducts.length === 0) {
        console.log("✅ Nenhum produto para sincronizar");
        return;
      }

      console.log(
        `📦 Encontrados ${updatedProducts.length} produtos para sincronizar`
      );

      // Processa em lotes para não sobrecarregar a API
      const batches = this.createBatches(updatedProducts, this.BATCH_SIZE);
      let successCount = 0;
      let errorCount = 0;

      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        console.log(
          `🔄 Processando lote ${i + 1}/${batches.length} (${
            batch.length
          } produtos)`
        );

        const results = await this.processBatch(batch);
        successCount += results.success;
        errorCount += results.errors;

        // Pausa entre lotes para não sobrecarregar a API
        if (i < batches.length - 1) {
          await this.sleep(1000); // 1 segundo entre lotes
        }
      }

      // Atualiza a data da última sincronização
      this.lastSyncDate = new Date();

      const syncResult = {
        timestamp: this.lastSyncDate.toISOString(),
        totalProcessed: updatedProducts.length,
        successful: successCount,
        errors: errorCount,
        batches: batches.length,
      };

      console.log(
        `✅ Sincronização concluída: ${successCount}/${updatedProducts.length} produtos sincronizados`
      );

      // Emite resultado via WebSocket se disponível
      if (io) {
        io.emit("azeler-auto-sync-result", syncResult);
      }

      return syncResult;
    } catch (error) {
      console.error("❌ Erro na sincronização automática:", error);

      if (io) {
        io.emit("azeler-auto-sync-error", {
          timestamp: new Date().toISOString(),
          error: error.message,
        });
      }
    }
  }

  /**
   * Processa um lote de produtos
   */
  async processBatch(products) {
    let successCount = 0;
    let errorCount = 0;

    for (const product of products) {
      try {
        const azelerPayload = this.transformToAzelerFormat(product);
        const response = await azelerApiService.updateSparePart(azelerPayload);
        console.log(
          `✅ Produto ${product.warehouseID} | Status HTTP: ${
            response.status
          } | Resposta Azeler: ${JSON.stringify(response.data)}`
        );
        successCount++;
      } catch (error) {
        errorCount++;
        if (error.response) {
          // Erro HTTP da Azeler
          console.error(
            `❌ Erro ao sincronizar produto ${
              product.warehouseID
            } | Status HTTP: ${
              error.response.status
            } | Resposta Azeler: ${JSON.stringify(error.response.data)}`
          );
        } else {
          // Erro de rede ou outro
          console.error(
            `❌ Erro ao sincronizar produto ${product.warehouseID}: ${error.message}`
          );
        }
      }
    }

    return { success: successCount, errors: errorCount };
  }

  /**
   * Transforma o produto do formato do banco para o formato da Azeler
   */
  transformToAzelerFormat(product) {
    return {
      warehouseID: product.warehouseID,
      externalPlatformName: this.EXTERNAL_PLATFORM_NAME,
      partDescription: product.partDescription,
      price: parseFloat(product.price) || 0.0,
      quantity: parseInt(product.quantity) || 0,
      vehicleType: 4, // Valor padrão conforme documentação
    };
  }

  /**
   * Divide array em lotes menores
   */
  createBatches(array, batchSize) {
    const batches = [];
    for (let i = 0; i < array.length; i += batchSize) {
      batches.push(array.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Função utilitária para pausas
   */
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Sincronização manual (força sincronização de todos os produtos)
   */
  async forceFullSync(io = null) {
    try {
      console.log("🔄 Iniciando sincronização completa forçada...");

      const allProducts = await azelerSyncModel.getAllStoredProducts();
      console.log(
        `📦 Encontrados ${allProducts.length} produtos para sincronização completa`
      );

      if (allProducts.length === 0) {
        return { message: "Nenhum produto encontrado para sincronizar" };
      }

      const batches = this.createBatches(allProducts, this.BATCH_SIZE);
      let successCount = 0;
      let errorCount = 0;

      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        console.log(`🔄 Processando lote ${i + 1}/${batches.length}`);

        const results = await this.processBatch(batch);
        successCount += results.success;
        errorCount += results.errors;

        // Pausa entre lotes
        if (i < batches.length - 1) {
          await this.sleep(2000); // 2 segundos para sync completa
        }
      }

      const result = {
        timestamp: new Date().toISOString(),
        totalProcessed: allProducts.length,
        successful: successCount,
        errors: errorCount,
        type: "full_sync",
      };

      console.log(
        `✅ Sincronização completa finalizada: ${successCount}/${allProducts.length} produtos`
      );

      if (io) {
        io.emit("azeler-full-sync-result", result);
      }

      return result;
    } catch (error) {
      console.error("❌ Erro na sincronização completa:", error);
      throw error;
    }
  }

  /**
   * Retorna status da sincronização
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      lastSyncDate: this.lastSyncDate.toISOString(),
      syncIntervalMs: this.SYNC_INTERVAL_MS,
      batchSize: this.BATCH_SIZE,
      externalPlatformName: this.EXTERNAL_PLATFORM_NAME,
    };
  }
}

// Singleton instance
const azelerAutoSyncService = new AzelerAutoSyncService();

module.exports = azelerAutoSyncService;
