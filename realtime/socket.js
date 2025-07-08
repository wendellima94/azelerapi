const lowStockService = require("../services/lowStockService");

function socketHandler(io) {
  console.log("🔌 Socket.IO inicializado");

  io.on("connection", async (socket) => {
    console.log("👤 Cliente conectado:", socket.id);

    try {
      // Envia dados críticos imediatamente na conexão
      const criticalStockData = await lowStockService.fetchCriticalStock();
      const stats = await lowStockService.getStats();

      socket.emit("critical-stock-update", {
        items: criticalStockData,
        stats,
        timestamp: new Date().toISOString(),
      });

      // Atualização periódica a cada 30 segundos (apenas estoque crítico)
      const interval = setInterval(async () => {
        try {
          const criticalStockData = await lowStockService.fetchCriticalStock();
          const stats = await lowStockService.getStats();

          socket.emit("critical-stock-update", {
            items: criticalStockData,
            stats,
            timestamp: new Date().toISOString(),
          });
        } catch (error) {
          console.error("Erro ao enviar atualização:", error);
          socket.emit("error", { message: "Erro ao buscar dados" });
        }
      }, 30000); // 30 segundos

      socket.on("disconnect", () => {
        clearInterval(interval);
        console.log("👤 Cliente desconectado:", socket.id);
      });
    } catch (error) {
      console.error("Erro na conexão do socket:", error);
      socket.emit("error", { message: "Erro interno do servidor" });
    }
  });
}

module.exports = socketHandler;
