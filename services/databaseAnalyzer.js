const sql = require("mssql");

// Configuração do banco (copiada do db.js)
const config = {
  server: "localhost",
  database: "INNOVA",
  user: "test_user",
  password: "SenhaTeste123!",
  port: 1433,
  options: {
    encrypt: true,
    trustServerCertificate: true,
  },
  requestTimeout: 60000, // 60 segundos
  connectionTimeout: 30000, // 30 segundos
};
class DatabaseAnalyzer {
  async analisarBanco() {
    try {
      console.log("\n🔍 Iniciando análise do banco INNOVA...");

      await sql.connect(config); // <-- Passa a config aqui

      // 1. Listar todas as tabelas
      console.log("\n=== 1. TABELAS DO BANCO ===");
      const tabelas = await sql.query(`
        SELECT 
          TABLE_SCHEMA,
          TABLE_NAME,
          TABLE_TYPE
        FROM INFORMATION_SCHEMA.TABLES 
        WHERE TABLE_TYPE = 'BASE TABLE'
        ORDER BY TABLE_SCHEMA, TABLE_NAME
      `);
      console.table(tabelas.recordset);

      // 2. Estrutura da tabela estpie
      console.log("\n=== 2. ESTRUTURA DA TABELA dbo.estpie ===");
      const estruturaEstpie = await sql.query(`
        SELECT 
          COLUMN_NAME,
          DATA_TYPE,
          IS_NULLABLE,
          COLUMN_DEFAULT,
          CHARACTER_MAXIMUM_LENGTH
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'estpie' AND TABLE_SCHEMA = 'dbo'
        ORDER BY ORDINAL_POSITION
      `);
      console.table(estruturaEstpie.recordset);

      // 3. Dados da tabela estpie
      console.log("\n=== 3. DADOS DA TABELA dbo.estpie ===");
      const dadosEstpie = await sql.query("SELECT * FROM dbo.estpie");
      console.table(dadosEstpie.recordset);

      // 4. Estrutura da tabela vehiDespieceConcreto
      console.log("\n=== 4. ESTRUTURA DA TABELA dbo.vehiDespieceConcreto ===");
      const estruturaVehi = await sql.query(`
        SELECT 
          COLUMN_NAME,
          DATA_TYPE,
          IS_NULLABLE,
          COLUMN_DEFAULT,
          CHARACTER_MAXIMUM_LENGTH
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'vehiDespieceConcreto' AND TABLE_SCHEMA = 'dbo'
        ORDER BY ORDINAL_POSITION
      `);
      console.table(estruturaVehi.recordset);

      // 5. Amostra da tabela vehiDespieceConcreto
      console.log("\n=== 5. AMOSTRA DA TABELA dbo.vehiDespieceConcreto ===");
      const amostraVehi = await sql.query(
        "SELECT TOP 5 * FROM dbo.vehiDespieceConcreto"
      );
      console.table(amostraVehi.recordset);

      // 6. Contar peças por estado
      console.log("\n=== 6. CONTAGEM DE PEÇAS POR ESTADO ===");
      const contagemEstados = await sql.query(`
        SELECT 
          e.nom AS Estado,
          e.estpie_cod AS Codigo,
          COUNT(*) AS Quantidade
        FROM dbo.vehiDespieceConcreto AS st
        JOIN dbo.estpie AS e ON st.estpie_cod = e.estpie_cod
        GROUP BY e.nom, e.estpie_cod
        ORDER BY Quantidade DESC
      `);
      console.table(contagemEstados.recordset);

      // 7. Peças almacenadas
      console.log("\n=== 7. PEÇAS ALMACENADAS (PRIMEIRAS 10) ===");
      const pecasAlmacenadas = await sql.query(`
        SELECT TOP 10
          st.idPiezaDesp    AS ID_Pieza,
          st.idVPieza       AS ID_VPieza,
          vp.descripcion    AS DescripciónPieza,
          st.matricula      AS Matrícula,
          e.nom             AS Estado,
          st.estpie_cod     AS CodigoEstado
        FROM dbo.vehiDespieceConcreto AS st
        JOIN dbo.estpie AS e ON st.estpie_cod = e.estpie_cod
        LEFT JOIN dbo.vehiPieza AS vp ON st.idVPieza = vp.idVPieza
        WHERE e.nom = 'Almacenada'
        ORDER BY vp.descripcion, st.matricula
      `);
      console.table(pecasAlmacenadas.recordset);

      console.log("\n✅ Análise do banco concluída!");
    } catch (error) {
      console.error("❌ Erro durante a análise do banco:", error);
    } finally {
      await sql.close();
    }
  }

  async obterDadosAnalise() {
    try {
      await sql.connect(config); // <-- Passa a config aqui também

      const resultados = {};

      // 1. Tabelas do banco
      const tabelas = await sql.query(`
        SELECT TABLE_SCHEMA, TABLE_NAME, TABLE_TYPE
        FROM INFORMATION_SCHEMA.TABLES 
        WHERE TABLE_TYPE = 'BASE TABLE'
        ORDER BY TABLE_SCHEMA, TABLE_NAME
      `);
      resultados.tabelas = tabelas.recordset;

      // 2. Estrutura estpie
      const estruturaEstpie = await sql.query(`
        SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT, CHARACTER_MAXIMUM_LENGTH
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'estpie' AND TABLE_SCHEMA = 'dbo'
        ORDER BY ORDINAL_POSITION
      `);
      resultados.estruturaEstpie = estruturaEstpie.recordset;

      // 3. Dados estpie
      const dadosEstpie = await sql.query("SELECT * FROM dbo.estpie");
      resultados.dadosEstpie = dadosEstpie.recordset;

      // 4. Contagem por estado
      const contagemEstados = await sql.query(`
        SELECT e.nom AS Estado, e.estpie_cod AS Codigo, COUNT(*) AS Quantidade
        FROM dbo.vehiDespieceConcreto AS st
        JOIN dbo.estpie AS e ON st.estpie_cod = e.estpie_cod
        GROUP BY e.nom, e.estpie_cod
        ORDER BY Quantidade DESC
      `);
      resultados.contagemEstados = contagemEstados.recordset;

      // 5. Peças almacenadas
      const pecasAlmacenadas = await sql.query(`
        SELECT TOP 20
          st.idPiezaDesp AS ID_Pieza,
          st.idVPieza AS ID_VPieza,
          vp.descripcion AS DescripciónPieza,
          st.matricula AS Matrícula,
          e.nom AS Estado
        FROM dbo.vehiDespieceConcreto AS st
        JOIN dbo.estpie AS e ON st.estpie_cod = e.estpie_cod
        LEFT JOIN dbo.vehiPieza AS vp ON st.idVPieza = vp.idVPieza
        WHERE e.nom = 'Almacenada'
        ORDER BY vp.descripcion, st.matricula
      `);
      resultados.pecasAlmacenadas = pecasAlmacenadas.recordset;

      return resultados;
    } catch (error) {
      throw error;
    } finally {
      await sql.close();
    }
  }
}

module.exports = new DatabaseAnalyzer();
