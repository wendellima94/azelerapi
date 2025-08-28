const sql = require("mssql");

const config = {
  server: "localhost",
  database: "INNOVA",
  user: "test_user",
  password: "SenhaTeste123!",
  port: 1433,
  requestTimeout: 60000,
  connectionTimeout: 30000,
  options: {
    encrypt: true,
    trustServerCertificate: true,
  },
};

const azelerSyncModel = {
  /**
   * Busca todos os produtos almacenados para sincronização
   */
  async getAllStoredProducts() {
    try {
      const pool = await sql.connect(config);
      const result = await pool.request().query(`
        SELECT 
          st.idPiezaDesp AS warehouseID,
          COALESCE(vp.descripcion, st.descripcion, 'Sin descripción') AS partDescription,
          ISNULL(st.precioV, 0) AS price,
          ISNULL(st.cantidad, 0) AS quantity,
          st.fmod AS updated_at,
          st.estpie_cod
        FROM dbo.vehiDespieceConcreto AS st
        JOIN dbo.estpie AS e ON st.estpie_cod = e.estpie_cod
        LEFT JOIN dbo.vehiPieza AS vp ON st.idVPieza = vp.idVPieza
        WHERE e.nom = 'Almacenada'
        ORDER BY st.fmod DESC
      `);
      return result.recordset;
    } catch (error) {
      console.error("❌ Erro em getAllStoredProducts:", error);
      throw error;
    }
  },

  /**
   * Busca produtos atualizados desde uma data específica
   */
  async getUpdatedProductsSince(lastSyncDate) {
    try {
      const pool = await sql.connect(config);
      const result = await pool
        .request()
        .input("lastSync", sql.DateTime, lastSyncDate)
        .query(`
          SELECT 
            st.idPiezaDesp AS warehouseID,
            COALESCE(vp.descripcion, st.descripcion, 'Sin descripción') AS partDescription,
            ISNULL(st.precioV, 0) AS price,
            ISNULL(st.cantidad, 0) AS quantity,
            st.fmod AS updated_at
          FROM dbo.vehiDespieceConcreto AS st
          JOIN dbo.estpie AS e ON st.estpie_cod = e.estpie_cod
          LEFT JOIN dbo.vehiPieza AS vp ON st.idVPieza = vp.idVPieza
          WHERE e.nom = 'Almacenada'
            AND st.fmod >= @lastSync
          ORDER BY st.fmod ASC
        `);
      return result.recordset;
    } catch (error) {
      console.error("❌ Erro em getUpdatedProductsSince:", error);
      throw error;
    }
  },

  /**
   * Marca um produto como sincronizado (opcional - para controle)
   */
  async markAsSynced(warehouseID) {
    try {
      const pool = await sql.connect(config);
      // Você pode criar uma tabela de controle de sync se necessário
      // Por enquanto, apenas retorna true
      return true;
    } catch (error) {
      console.error("❌ Erro em markAsSynced:", error);
      throw error;
    }
  }
};

module.exports = azelerSyncModel;