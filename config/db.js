const sql = require("mssql");

const config = {
  server: "localhost", // ou "DESKTOP-MRQK25R"
  database: "INNOVA",
  user: "test_user", // ou "nodejs_user"
  password: "SenhaTeste123!",
  port: 1433,
  options: {
    encrypt: true,
    trustServerCertificate: true,
  },
};

async function testConnection() {
  try {
    await sql.connect(config);
    console.log("✅ Conexão com SQL Server estabelecida");
    await sql.close();
  } catch (error) {
    console.error("❌ Erro ao conectar com SQL Server:");
    console.error("Mensagem:", error.message);
    if (error.code) console.error("Código:", error.code);
    if (error.originalError) {
      console.error("Erro original:", error.originalError);
      if (error.originalError.info) {
        console.error("Info:", error.originalError.info);
      }
    }
    console.error("Stack:", error.stack);
    console.error("Objeto de erro completo:", error);
  }
}

module.exports = { sql, testConnection };
