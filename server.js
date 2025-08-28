require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const swaggerUi = require("swagger-ui-express");
const swaggerSpec = require("./swagger");

const { testConnection } = require("./config/db");
const sparePartRoutes = require("./routes/sparePartRoutes");
const databaseRoutes = require("./routes/databaseRoutes");
const socketHandler = require("./realtime/socket");
const swaggerJSDoc = require("swagger-jsdoc");
const azelerSyncRoutes = require("./routes/azelerSyncRoutes");
const azelerAutoSyncService = require("./services/azelerAutoSyncService");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

app.use(cors());
app.use(express.json());

socketHandler(io);
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.use(express.static("public"));
app.use("/api", sparePartRoutes);
app.use("/", databaseRoutes);

app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    message: "Servidor funcionando",
    timestamp: new Date().toISOString(),
  });
});

// Adicione a nova rota
app.use("/api/azeler-sync", azelerSyncRoutes);

// Torna o io disponível para as rotas
app.set("io", io);

app.use((err, req, res, next) => {
  console.error("Erro não tratado:", err);
  res.status(500).json({
    success: false,
    error: "Erro interno do servidor",
    message: "Ocorreu um erro inesperado",
  });
});

const PORT = process.env.PORT || 3000;


async function startServer() {
  try {
    await testConnection();

    server.listen(PORT, () => {
      // Inicia sincronização automática após 5 segundos
      setTimeout(() => {
        // azelerAutoSyncService.start(io);
      }, 5000);

      console.log(`🚀 Servidor rodando na porta ${PORT}`);
      console.log(`🌐 WebSocket disponível em ws://localhost:${PORT}`);
      console.log(
        `🔍 Análise do banco disponível em: http://localhost:${PORT}/analise-banco`
      );
      console.log("POST /api/azeler-sync/start - Iniciar sincronização");
      console.log("POST /api/azeler-sync/stop - Parar sincronização");
      console.log("POST /api/azeler-sync/force-full - Sincronização completa");
      console.log("GET  /api/azeler-sync/status - Status da sincronização");

      console.log("\n=== ROTAS DISPONÍVEIS ===");
      console.log("GET  /health - Health check");
      console.log("GET  /analise-banco - Análise visual do banco");
      console.log("GET  /api/spare-parts/ids - Buscar IDs da API externa");
      console.log("GET  /api/spare-parts/low-stock - Estoque baixo");
      console.log("GET  /api/spare-parts/stats - Estatísticas");
      console.log("GET  /api/spare-parts/sync - Sincronizar com API");
      console.log("POST /api/spare-parts/insert - Inserir peça");
      console.log("POST /api/spare-parts/update - Atualizar peça");
      console.log("POST /api/spare-parts/delete - Deletar peça");
      console.log("PUT  /api/spare-parts/update-stock/:id - Atualizar estoque");
    });
  } catch (error) {
    console.error("❌ Erro ao iniciar servidor:", error);
    process.exit(1);
  }
}

startServer();

module.exports = app;
