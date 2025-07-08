const axios = require("axios");

// Configurações da API externa
const API_CONFIG = {
  baseURL: "https://apiapp.azelerecambios.com/api",
  username: "desguacesgp",
  password: "456440Dgp",
};

// Função para gerar o token Base64
function generateAuthToken(username, password) {
  const credentials = `${username}:${password}`;
  return Buffer.from(credentials).toString("base64");
}

// Função auxiliar para configuração padrão das requisições
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

// Serviços da API
const azelerApiService = {
  // Buscar todos os IDs
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

  async updateProductStatus(warehouseID, localProductData){
    try {

      const azelerUpdateData = {
        warehouseID: warehouseID,
        stock: localProductData.stock,
        price: localProductData.price,
        status: localProductData.status,
        isActive: localProductData.stock > 0,
        partDescription: localProductData.partDescription,
        updated_at: new Date().toISOString(),
      };

      const config = getRequestConfig("POST", "/v1/spareParts/UpdateStatus", azelerUpdateData);
      const response = await axios(config);
      return response.data;
    } catch (error) {
      console.error(`Error en la atualizacion de status en Azeler para warehouse ID ${warehouseID}:`, error.message);
      throw error;
    }
  },

  async updateMultipleProductStatus(productUpdates){
    try {
      const results = [];

      const chunkSize = 10;
      for (let i = 0; i < productUpdates.length; i += chunkSize) {
        const chunk = productUpdates.slice(i, i + chunkSize);

        const chunkPromises = chunk.map(async (product) => {
          try {
            const result = await this.updateProductStatus(product.warehouseID, product);
            return {
              warehouseID: product.warehouseID,
              sucess: true,
              result: result
            };
          } catch (error) {
            return {
              warehouseID: product.warehouseID,
              success: false,
              error: error.message
            };
          }
        });

        const chunkResults = await Promise.all(chunkPromises);
        result.push(...chunkResults);

        //pausa entre chunks
        if (i + chunkSize < productUpdates.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      return results;
    } catch (error) {
      console.error("Erro ao atualizar multiplos produtos no azeler:", error.message);
      throw error;
    }
  }, 

  async syncSingleProduct(warehouseID, sparePartModel) {
    try {
      const localProduct = await sparePartModel.getByWarehouseId(warehouseID);

      if (!localProduct) {
        throw new Error(`Produto com warehouse ID ${warehouseID} nao encontrado no banco local`);

      }

      const azelerResult = await this.updateProductStatus(warehouseID, localProduct);

      return {
        warehouseID: warehouseID,
        localData: localProduct,
        azelerResult: azelerResult,
        syncedAt: new Date().toISOString()
      };
    } catch(error) {
      console.error(`Erro ao sincronizar produto ${warehouseID}:`, error.message);
      throw error;
    }
  }
};

module.exports = { azelerApiService, generateAuthToken };
