// server.js - Servidor Express com rotas (CommonJS)

const express = require("express");
const path = require("path");
const { syncDespiece } = require("./services/syncService.js");

const app = express();
const PORT = 3000;

// Serve arquivos estáticos da pasta "public"
app.use(express.static(path.join(__dirname, "public")));

// Armazena sincronizações em andamento
const activeSyncs = new Map();

// Rota GET com Server-Sent Events (SSE) - Recomendado para progresso em tempo real
app.get("/api/sync/despiece/stream", async (req, res) => {
  // Configura SSE
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // Nginx compatibility
  res.flushHeaders();

  const syncId = Date.now().toString();
  activeSyncs.set(syncId, { status: "running", startTime: new Date() });

  // Funções auxiliares
  const sendEvent = (data) => {
    try {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch (err) {
      console.error("Erro ao enviar evento SSE:", err);
    }
  };

  const sendComment = (text) => {
    try {
      res.write(`: ${text}\n\n`);
    } catch (err) {
      console.error("Erro ao enviar comentário SSE:", err);
    }
  };

  // Heartbeat para evitar timeouts por inatividade (15s)
  const heartbeat = setInterval(() => {
    sendComment("ping");
  }, 15000);

  // Cleanup ao fechar conexão
  req.on("close", () => {
    clearInterval(heartbeat);
    activeSyncs.delete(syncId);
    console.log(`[SSE] Cliente desconectou. SyncId: ${syncId}`);
  });

  try {
    // Mensagem imediata para o cliente não considerar "sem resposta"
    sendEvent({
      status: "connected",
      syncId,
      message: "Conexão SSE estabelecida. Iniciando sincronização...",
      timestamp: new Date().toISOString(),
    });

    await syncDespiece({
      saveToFile: true,
      outputPath: `despiece_${syncId}.ndjson`,
      onProgress: (progress) => {
        // Remove items do payload SSE para evitar payloads muito grandes
        const { items, ...progressWithoutItems } = progress;
        sendEvent({
          ...progressWithoutItems,
          syncId,
          itemCount: items?.length || 0,
        });
      },
    });

    clearInterval(heartbeat);
    sendEvent({
      status: "completed",
      syncId,
      message: "Sincronização concluída com sucesso",
      timestamp: new Date().toISOString(),
    });
    activeSyncs.delete(syncId);
    res.end();
  } catch (error) {
    clearInterval(heartbeat);
    sendEvent({
      status: "error",
      syncId,
      error: error.message,
      timestamp: new Date().toISOString(),
    });
    activeSyncs.delete(syncId);
    res.end();
  }
});

// Rota GET tradicional - Retorna resultado completo ao final
app.get("/api/sync/despiece", async (req, res) => {
  try {
    const result = await syncDespiece({
      saveToFile: false,
    });

    res.json({
      success: true,
      totalProcessed: result.totalProcessed,
      message: "Sincronização concluída",
      dataCount: result.data.length,
      timestamp: new Date().toISOString(),
      // data: result.data // Descomente se quiser retornar tudo (cuidado com tamanho)
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// Rota GET com paginação - Retorna apenas uma página específica
app.get("/api/sync/despiece/page/:pageNum", async (req, res) => {
  try {
    const pageNum = parseInt(req.params.pageNum) || 1;
    let pageData = null;

    await syncDespiece({
      saveToFile: false,
      onProgress: (progress) => {
        if (progress.currentPage === pageNum) {
          pageData = progress;
        }
      },
    });

    if (pageData) {
      res.json({
        success: true,
        page: pageData.currentPage,
        totalPages: pageData.lastPage,
        items: pageData.items,
        totalProcessed: pageData.totalProcessed,
        timestamp: new Date().toISOString(),
      });
    } else {
      res.status(404).json({
        success: false,
        error: "Página não encontrada",
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// Rota para verificar sincronizações ativas
app.get("/api/sync/status", (req, res) => {
  const syncs = Array.from(activeSyncs.entries()).map(([id, data]) => ({
    syncId: id,
    ...data,
    duration: Date.now() - new Date(data.startTime).getTime(),
  }));

  res.json({
    activeSyncs: syncs.length,
    syncs,
    timestamp: new Date().toISOString(),
  });
});

// Configurações de timeout do servidor
const server = app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
  console.log(`🏠 Interface SSE: http://localhost:${PORT}/`);
  console.log(
    `📊 SSE Stream: http://localhost:${PORT}/api/sync/despiece/stream`
  );
  console.log(`📦 Sync completo: http://localhost:${PORT}/api/sync/despiece`);
  console.log(
    `📄 Sync por página: http://localhost:${PORT}/api/sync/despiece/page/1`
  );
  console.log(`📈 Status: http://localhost:${PORT}/api/sync/status`);
});

// Aumenta timeouts para suportar conexões SSE longas
server.keepAliveTimeout = 120 * 1000; // 120 segundos
server.headersTimeout = 125 * 1000; // Deve ser maior que keepAliveTimeout
