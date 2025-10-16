const axios = require("axios");
const desguacesApi = require("./desguacesApiClient");

// Configurações da API Azeler
const API_CONFIG = {
  baseURL: "https://pre-apiapp.azelerecambios.com/api",
  username: "API_INNOVA",
  password: "TestInnova",
};

// Função utilitária para gerar token Basic Auth
function generateAuthToken(username, password) {
  const credentials = `${username}:${password}`;
  return Buffer.from(credentials).toString("base64");
}

function getRequestConfig(method, endpoint, data = null) {
  const authToken = generateAuthToken(API_CONFIG.username, API_CONFIG.password);

  return {
    method,
    url: `${API_CONFIG.baseURL}${endpoint}`,
    headers: {
      Authorization: `Basic ${authToken}`,
      "Content-Type": "application/json",
    },
    ...(data && { data }),
  };
}

const azelerApiService = {
  // Buscar IDs de peças
  async getAllIds() {
    const config = getRequestConfig("GET", "/v1/spareParts/GetAllIds");
    const response = await axios(config);
    return response.data;
  },

  // Inserir peça
  async insertSparePart(data) {
    const config = getRequestConfig("POST", "/v1/spareParts/Insert", data);
    const response = await axios(config);
    return response.data;
  },

  // Atualizar peça
  async updateSparePart(data) {
    const config = getRequestConfig("POST", "/v1/spareParts/Update", data);
    const response = await axios(config);
    return response.data;
  },

  // Deletar peça
  async deleteSparePart(data) {
    const config = getRequestConfig("POST", "/v1/spareParts/Delete", data);
    const response = await axios(config);
    return response.data;
  },

  // Atualizar status de 1 produto
  async updateProductStatus(warehouseID, localProductData) {
    const azelerUpdateData = {
      warehouseID,
      stock: localProductData.stock || 0,
      price: localProductData.price || 0.0,
      status: localProductData.status || "ACTIVE",
      isActive: (localProductData.stock || 0) > 0,
      partDescription:
        localProductData.descricao || localProductData.partDescription,
      updated_at: new Date().toISOString(),
    };

    const config = getRequestConfig(
      "POST",
      "/v1/spareParts/UpdateStatus",
      azelerUpdateData
    );
    const response = await axios(config);

    return response.data;
  },

  // Atualizar múltiplos produtos (chunked)
  async updateMultipleProductStatus(productUpdates) {
    const results = [];
    const chunkSize = 10;

    for (let i = 0; i < productUpdates.length; i += chunkSize) {
      const chunk = productUpdates.slice(i, i + chunkSize);

      const chunkResults = await Promise.all(
        chunk.map(async (product) => {
          try {
            const result = await this.updateProductStatus(
              product.warehouseID,
              product
            );
            return { warehouseID: product.warehouseID, success: true, result };
          } catch (error) {
            return {
              warehouseID: product.warehouseID,
              success: false,
              error: error.message,
            };
          }
        })
      );

      results.push(...chunkResults);

      if (i + chunkSize < productUpdates.length) {
        await new Promise((res) => setTimeout(res, 1000));
      }
    }

    return results;
  },

  // 🚀 Novo: Sincronizar um produto usando dados do Desguaces API
  async syncSingleProduct(warehouseID, matricula) {
    try {
      // Busca dados do Desguaces API
      const pecas = await desguacesApi.obterPecasComImagens(matricula);

      const localProduct = pecas.find(
        (p) => String(p.idPiezaDesp) === String(warehouseID)
      );
      if (!localProduct) {
        throw new Error(
          `Produto com warehouseID=${warehouseID} não encontrado no Desguaces`
        );
      }

      const azelerResult = await this.updateProductStatus(
        warehouseID,
        localProduct
      );

      return {
        warehouseID,
        localData: localProduct,
        azelerResult,
        syncedAt: new Date().toISOString(),
      };
    } catch (error) {
      console.error(
        `Erro ao sincronizar produto ${warehouseID}:`,
        error.message
      );
      throw error;
    }
  },
};

module.exports = { azelerApiService, generateAuthToken };
