require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const swaggerUi = require("swagger-ui-express");
const swaggerSpec = require("./swagger");

// Rotas
const sparePartRoutes = require("./routes/sparePartRoutes");
const azelerSyncRoutes = require("./routes/azelerSyncRoutes");

// Handler de Socket
const socketHandler = require("./realtime/socket");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// ==== Middlewares Globais ====
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// ==== Socket.IO ====
socketHandler(io);
app.set("io", io);

// ==== Swagger ====
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// ==== Rotas principais (com prefixos claros) ====
app.use("/api/spare-parts", sparePartRoutes);
app.use("/api/azeler-sync", azelerSyncRoutes);

// ==== Health check ====
app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
  });
});

// ==== Middleware de erro global ====
app.use((err, req, res, next) => {
  console.error("❌ Erro não tratado:", err);
  res.status(500).json({
    success: false,
    error: "Erro interno no servidor",
    message: err.message,
  });
});

const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    server.listen(PORT, () => {
      console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
      console.log(`🌐 WebSocket em ws://localhost:${PORT}`);
      console.log(`📖 Swagger disponível em http://localhost:${PORT}/api-docs`);

      console.log("\n=== Rotas Principais ===");
      console.log(`GET  /api/spare-parts/by-matricula/:matriculas`);
      console.log(
        `GET  /api/spare-parts/by-matricula?matriculas=AAA1111,BBB2222`
      );
      console.log(`POST /api/spare-parts/processar`);
      console.log(`GET  /api/spare-parts/images/:idPiezaDesp`);
      console.log(`GET  /api/spare-parts/stats`);
      console.log(`GET  /api/spare-parts/low-stock`);
      console.log(`POST /api/spare-parts/sync-single`);
      console.log(`POST /api/spare-parts/insert | update | delete`);
      console.log(`PUT  /api/spare-parts/update-stock/:id`);
      console.log(`\n[Azeler Sync] /api/azeler-sync/*`);
    });
  } catch (error) {
    console.error("❌ Erro ao iniciar servidor:", error);
    process.exit(1);
  }
}

startServer();

module.exports = app;
