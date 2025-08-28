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

const sparePartModel = {
  async getLowStock(threshold = 0) {
    try {
      const pool = await sql.connect(config);
      const result = await pool.request().input("threshold", sql.Int, threshold)
        .query(`
        SELECT TOP 1000
          st.idPiezaDesp AS warehouseID,
          st.idVPieza AS internalID,
          COALESCE(vp.descripcion, st.descripcion, 'Sin descripción') AS partDescription,
          st.matricula,
          ISNULL(st.cantidad, 0) AS stock,
          ISNULL(st.precioV, 0) AS price,
          st.fmod AS updated_at,
          e.nom AS estado,
          CASE 
            WHEN ISNULL(st.cantidad, 0) = 0 THEN 'CRITICO'
            WHEN ISNULL(st.cantidad, 0) = 1 THEN 'NORMAL'
            ELSE 'ALTO'
          END as status
        FROM dbo.vehiDespieceConcreto AS st
        JOIN dbo.estpie AS e ON st.estpie_cod = e.estpie_cod
        LEFT JOIN dbo.vehiPieza AS vp ON st.idVPieza = vp.idVPieza
        WHERE e.nom = 'Almacenada' 
        AND ISNULL(st.cantidad, 0) <= @threshold
        ORDER BY ISNULL(st.cantidad, 0) ASC, st.fmod DESC
        `);
      return result.recordset;
    } catch (error) {
      console.error("Erro em getLowStock:", error);
      throw error;
    }
  },

  async getLowStockPaginated(threshold = 0, page = 1, limit = 20) {
    try {
      const pool = await sql.connect(config);
      const offset = (page - 1) * limit;

      const countResult = await pool
        .request()
        .input("threshold", sql.Int, threshold).query(`
        SELECT COUNT(*) as total
        FROM dbo.vehiDespieceConcreto AS st
        JOIN dbo.estpie AS e ON st.estpie_cod = e.estpie_cod
        WHERE e.nom = 'Almacenada' 
        AND ISNULL(st.cantidad, 0) <= @threshold
        `);

      const total = countResult.recordset[0].total;
      const totalPages = Math.ceil(total / limit);

      // Busca os dados paginados
      const result = await pool
        .request()
        .input("threshold", sql.Int, threshold)
        .input("limit", sql.Int, limit)
        .input("offset", sql.Int, offset).query(`
        SELECT 
          st.idPiezaDesp AS warehouseID,
          st.idVPieza AS internalID,
          COALESCE(vp.descripcion, st.descripcion, 'Sin descripción') AS partDescription,
          st.matricula,
          ISNULL(st.cantidad, 0) AS stock,
          ISNULL(st.precioV, 0) AS price,
          st.fmod AS updated_at,
          e.nom AS estado,
          CASE 
            WHEN ISNULL(st.cantidad, 0) = 0 THEN 'CRITICO'
            WHEN ISNULL(st.cantidad, 0) = 1 THEN 'NORMAL'
            ELSE 'ALTO'
          END as status
        FROM dbo.vehiDespieceConcreto AS st
        JOIN dbo.estpie AS e ON st.estpie_cod = e.estpie_cod
        LEFT JOIN dbo.vehiPieza AS vp ON st.idVPieza = vp.idVPieza
        WHERE e.nom = 'Almacenada' 
        AND ISNULL(st.cantidad, 0) <= @threshold
        ORDER BY ISNULL(st.cantidad, 0) ASC, st.fmod DESC
        OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
        `);

      return {
        data: result.recordset,
        pagination: {
          page,
          limit,
          total,
          totalPages,
        },
      };
    } catch (error) {
      console.error("Erro em getLowStockPaginated:", error);
      throw error;
    }
  },

  async getAllParts() {
    try {
      const pool = await sql.connect(config);
      const result = await pool.request().query(`
        SELECT TOP 1000
          st.idPiezaDesp AS warehouseID,
          st.idVPieza AS internalID,
          COALESCE(vp.descripcion, st.descripcion, 'Sin descripción') AS partDescription,
          st.matricula,
          ISNULL(st.cantidad, 0) AS stock,
          ISNULL(st.precioV, 0) AS price,
          st.fmod AS updated_at,
          e.nom AS estado,
          CASE 
            WHEN ISNULL(st.cantidad, 0) = 0 THEN 'CRITICO'
            WHEN ISNULL(st.cantidad, 0) = 1 THEN 'NORMAL'
            ELSE 'ALTO'
          END as status
        FROM dbo.vehiDespieceConcreto AS st
        JOIN dbo.estpie AS e ON st.estpie_cod = e.estpie_cod
        LEFT JOIN dbo.vehiPieza AS vp ON st.idVPieza = vp.idVPieza
        WHERE e.nom = 'Almacenada'
        ORDER BY st.fmod DESC
        `);
      return result.recordset;
    } catch (error) {
      console.error("Erro em getAllParts:", error);
      throw error;
    }
  },

  // Versão paginada do getAllParts (SEM TOP 1000)
  async getAllPartsPaginated(page = 1, limit = 50) {
    try {
      const pool = await sql.connect(config);
      const offset = (page - 1) * limit;

      // Conta o total de registros
      const countResult = await pool.request().query(`
        SELECT COUNT(*) as total
        FROM dbo.vehiDespieceConcreto AS st
        JOIN dbo.estpie AS e ON st.estpie_cod = e.estpie_cod
        WHERE e.nom = 'Almacenada'
        `);

      const total = countResult.recordset[0].total;
      const totalPages = Math.ceil(total / limit);

      // Busca os dados paginados
      const result = await pool
        .request()
        .input("limit", sql.Int, limit)
        .input("offset", sql.Int, offset).query(`
        SELECT 
          st.idPiezaDesp AS warehouseID,
          st.idVPieza AS internalID,
          COALESCE(vp.descripcion, st.descripcion, 'Sin descripción') AS partDescription,
          st.matricula,
          ISNULL(st.cantidad, 0) AS stock,
          ISNULL(st.precioV, 0) AS price,
          st.fmod AS updated_at,
          e.nom AS estado,
          CASE 
            WHEN ISNULL(st.cantidad, 0) = 0 THEN 'CRITICO'
            WHEN ISNULL(st.cantidad, 0) = 1 THEN 'NORMAL'
            ELSE 'ALTO'
          END as status
        FROM dbo.vehiDespieceConcreto AS st
        JOIN dbo.estpie AS e ON st.estpie_cod = e.estpie_cod
        LEFT JOIN dbo.vehiPieza AS vp ON st.idVPieza = vp.idVPieza
        WHERE e.nom = 'Almacenada'
        ORDER BY st.fmod DESC
        OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
        `);

      return {
        data: result.recordset,
        pagination: {
          page,
          limit,
          total,
          totalPages,
        },
      };
    } catch (error) {
      console.error("Erro em getAllPartsPaginated:", error);
      throw error;
    }
  },

  async getByWarehouseId(warehouseID) {
    try {
      const pool = await sql.connect(config);
      const result = await pool
        .request()
        .input("warehouseID", sql.Int, warehouseID).query(`
        SELECT 
          st.idPiezaDesp AS warehouseID,
          st.idVPieza AS internalID,
          COALESCE(vp.descripcion, st.descripcion, 'Sin descripción') AS partDescription,
          st.matricula,
          ISNULL(st.cantidad, 0) AS stock,
          ISNULL(st.precioV, 0) AS price,
          st.fmod AS updated_at,
          e.nom AS estado,
          CASE 
            WHEN ISNULL(st.cantidad, 0) = 0 THEN 'CRITICO'
            WHEN ISNULL(st.cantidad, 0) = 1 THEN 'NORMAL'
            ELSE 'ALTO'
          END as status
        FROM dbo.vehiDespieceConcreto AS st
        JOIN dbo.estpie AS e ON st.estpie_cod = e.estpie_cod
        LEFT JOIN dbo.vehiPieza AS vp ON st.idVPieza = vp.idVPieza
        WHERE e.nom = 'Almacenada' 
        AND st.idPiezaDesp = @warehouseID
        `);
      return result.recordset[0];
    } catch (error) {
      console.error("Erro em getByWarehouseId:", error);
      throw error;
    }
  },

  async updateStock(warehouseID, newStock) {
    try {
      const pool = await sql.connect(config);
      const result = await pool
        .request()
        .input("newStock", sql.Int, newStock)
        .input("warehouseID", sql.Int, warehouseID).query(`
        UPDATE dbo.vehiDespieceConcreto
        SET cantidad = @newStock, fmod = GETDATE()
        WHERE idPiezaDesp = @warehouseID
        AND estpie_cod = 1
        `);
      return result.rowsAffected[0] > 0;
    } catch (error) {
      console.error("Erro em updateStock:", error);
      throw error;
    }
  },

  // Método para sincronizar com chunks (resolve o problema dos 2100 parâmetros)
  async syncWithExternalApiChunk(warehouseIdChunk) {
    try {
      if (!warehouseIdChunk || warehouseIdChunk.length === 0) {
        return [];
      }

      if (warehouseIdChunk.length > 1000) {
        throw new Error("Chunk muito grande. Máximo 1000 IDs por chunk.");
      }

      const pool = await sql.connect(config);
      const inClause = warehouseIdChunk.map((_, i) => `@id${i}`).join(",");
      const request = pool.request();

      warehouseIdChunk.forEach((id, i) => {
        request.input(`id${i}`, sql.Int, id);
      });

      const result = await request.query(`
        SELECT 
          st.idPiezaDesp AS warehouseID,
          ISNULL(st.cantidad, 0) AS stock
        FROM dbo.vehiDespieceConcreto AS st
        JOIN dbo.estpie AS e ON st.estpie_cod = e.estpie_cod
        WHERE e.nom = 'Almacenada' 
        AND st.idPiezaDesp IN (${inClause})
        `);

      return result.recordset;
    } catch (error) {
      console.error("Erro em syncWithExternalApiChunk:", error);
      throw error;
    }
  },

  async getByStockValue(stockValue) {
    try {
      const pool = await sql.connect(config);
      const result = await pool
        .request()
        .input("stockValue", sql.Int, stockValue).query(`
        SELECT TOP 1000
          st.idPiezaDesp AS warehouseID,
          st.idVPieza AS internalID,
          COALESCE(vp.descripcion, st.descripcion, 'Sin descripción') AS partDescription,
          st.matricula,
          ISNULL(st.cantidad, 0) AS stock,
          ISNULL(st.precioV, 0) AS price,
          st.fmod AS updated_at,
          e.nom AS estado
        FROM dbo.vehiDespieceConcreto AS st
        JOIN dbo.estpie AS e ON st.estpie_cod = e.estpie_cod
        LEFT JOIN dbo.vehiPieza AS vp ON st.idVPieza = vp.idVPieza
        WHERE e.nom = 'Almacenada' 
        AND ISNULL(st.cantidad, 0) = @stockValue
        ORDER BY st.fmod DESC
        `);
      return result.recordset;
    } catch (error) {
      console.error("Erro em getByStockValue:", error);
      throw error;
    }
  },

  async getHighStock() {
    try {
      const pool = await sql.connect(config);
      const result = await pool.request().query(`
        SELECT TOP 1000
          st.idPiezaDesp AS warehouseID,
          st.idVPieza AS internalID,
          COALESCE(vp.descripcion, st.descripcion, 'Sin descripción') AS partDescription,
          st.matricula,
          ISNULL(st.cantidad, 0) AS stock,
          ISNULL(st.precioV, 0) AS price,
          st.fmod AS updated_at,
          e.nom AS estado
        FROM dbo.vehiDespieceConcreto AS st
        JOIN dbo.estpie AS e ON st.estpie_cod = e.estpie_cod
        LEFT JOIN dbo.vehiPieza AS vp ON st.idVPieza = vp.idVPieza
        WHERE e.nom = 'Almacenada' 
        AND ISNULL(st.cantidad, 0) > 1
        ORDER BY ISNULL(st.cantidad, 0) DESC, st.fmod DESC
        `);
      return result.recordset;
    } catch (error) {
      console.error("Erro em getHighStock:", error);
      throw error;
    }
  },
};

module.exports = sparePartModel;