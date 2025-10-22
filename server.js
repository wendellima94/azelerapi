// server.js - Servidor Express com rotas e logs detalhados (CommonJS)

const express = require("express");
const path = require("path");
const {
  syncDespiece,
  sendEnrichedNdjsonToAzeler,
} = require("./services/syncService.js");
const { ndjsonToExcel } = require("./services/exportRawToExcel.js");

const app = express();
const PORT = 3000;

app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

const activeSyncs = new Map();

// Middleware de logging para todas as requisições
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`\n[${timestamp}] ${req.method} ${req.url}`);
  console.log(`[${timestamp}] Headers:`, JSON.stringify(req.headers, null, 2));
  if (req.body && Object.keys(req.body).length > 0) {
    console.log(`[${timestamp}] Body:`, JSON.stringify(req.body, null, 2));
  }
  next();
});

// Rota GET com Server-Sent Events (SSE) - Progresso em tempo real
app.get("/api/sync/despiece/stream", async (req, res) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] Iniciando rota SSE /api/sync/despiece/stream`);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const syncId = Date.now().toString();
  activeSyncs.set(syncId, { status: "running", startTime: new Date() });
  console.log(`[${timestamp}] SyncId criado: ${syncId}`);

  const sendEvent = (data) => {
    try {
      const eventData = `data: ${JSON.stringify(data)}\n\n`;
      res.write(eventData);
      console.log(
        `[${new Date().toISOString()}] SSE Event enviado:`,
        data.status || data.message
      );
    } catch (err) {
      console.error(
        `[${new Date().toISOString()}] Erro ao enviar evento SSE:`,
        err
      );
    }
  };

  const sendComment = (text) => {
    try {
      res.write(`: ${text}\n\n`);
    } catch (err) {
      console.error(
        `[${new Date().toISOString()}] Erro ao enviar comentário SSE:`,
        err
      );
    }
  };

  const heartbeat = setInterval(() => {
    sendComment("ping");
  }, 15000);

  req.on("close", () => {
    clearInterval(heartbeat);
    activeSyncs.delete(syncId);
    console.log(
      `[${new Date().toISOString()}] Cliente desconectou. SyncId: ${syncId}`
    );
  });

  try {
    sendEvent({
      status: "connected",
      syncId,
      message: "Conexão SSE estabelecida. Iniciando sincronização...",
      timestamp: new Date().toISOString(),
    });

    console.log(`[${new Date().toISOString()}] Chamando syncDespiece...`);
    await syncDespiece({
      saveToFile: true,
      outputPathRaw: "despiece.raw.ndjson",
      outputPathEnriched: "despiece.enriched.ndjson",
      sendToAzelerPerPage: false,
      azelerSendLimit: 5,
      onProgress: (progress) => {
        const { items, ...progressWithoutItems } = progress;
        sendEvent({
          ...progressWithoutItems,
          syncId,
          itemCount: items?.length || 0,
        });
      },
    });

    console.log(
      `[${new Date().toISOString()}] syncDespiece concluído com sucesso`
    );
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
    console.error(
      `[${new Date().toISOString()}] Erro em /api/sync/despiece/stream:`,
      error
    );
    console.error(`[${new Date().toISOString()}] Stack trace:`, error.stack);
    clearInterval(heartbeat);
    sendEvent({
      status: "error",
      syncId,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
    });
    activeSyncs.delete(syncId);
    res.end();
  }
});

// Rota GET tradicional - Retorna resultado completo ao final
app.get("/api/sync/despiece", async (req, res) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] Iniciando rota GET /api/sync/despiece`);

  try {
    console.log(`[${timestamp}] Chamando syncDespiece...`);
    const result = await syncDespiece({
      saveToFile: true,
      outputPathRaw: "despiece.raw.ndjson",
      outputPathEnriched: "despiece.enriched.ndjson",
      sendToAzelerPerPage: false,
      azelerSendLimit: 5,
    });

    console.log(
      `[${new Date().toISOString()}] syncDespiece concluído:`,
      result
    );
    res.json({
      success: result.success,
      totalProcessed: result.totalProcessed,
      message: "Sincronização concluída",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error(
      `[${new Date().toISOString()}] Erro em /api/sync/despiece:`,
      error
    );
    console.error(`[${new Date().toISOString()}] Stack trace:`, error.stack);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
    });
  }
});

// Rota GET com paginação - Retorna apenas uma página específica
app.get("/api/sync/despiece/page/:pageNum", async (req, res) => {
  const timestamp = new Date().toISOString();
  console.log(
    `[${timestamp}] Iniciando rota GET /api/sync/despiece/page/:pageNum`
  );

  try {
    const pageNum = parseInt(req.params.pageNum) || 1;
    console.log(`[${timestamp}] Página solicitada: ${pageNum}`);
    let pageData = null;

    await syncDespiece({
      saveToFile: false,
      onProgress: (progress) => {
        if (progress.currentPage === pageNum) {
          pageData = progress;
          console.log(
            `[${new Date().toISOString()}] Página ${pageNum} encontrada`
          );
        }
      },
    });

    if (pageData) {
      console.log(
        `[${new Date().toISOString()}] Retornando dados da página ${pageNum}`
      );
      res.json({
        success: true,
        page: pageData.currentPage,
        totalPages: pageData.lastPage,
        items: pageData.items,
        totalProcessed: pageData.totalProcessed,
        timestamp: new Date().toISOString(),
      });
    } else {
      console.log(
        `[${new Date().toISOString()}] Página ${pageNum} não encontrada`
      );
      res.status(404).json({
        success: false,
        error: "Página não encontrada",
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    console.error(
      `[${new Date().toISOString()}] Erro em /api/sync/despiece/page/:pageNum:`,
      error
    );
    console.error(`[${new Date().toISOString()}] Stack trace:`, error.stack);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
    });
  }
});

// Rota para verificar sincronizações ativas
app.get("/api/sync/status", (req, res) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] Iniciando rota GET /api/sync/status`);

  try {
    const syncs = Array.from(activeSyncs.entries()).map(([id, data]) => ({
      syncId: id,
      ...data,
      duration: Date.now() - new Date(data.startTime).getTime(),
    }));

    console.log(`[${timestamp}] Sincronizações ativas:`, syncs.length);
    res.json({
      activeSyncs: syncs.length,
      syncs,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error(`[${timestamp}] Erro em /api/sync/status:`, error);
    console.error(`[${timestamp}] Stack trace:`, error.stack);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
    });
  }
});

app.post("/api/azeler/send", async (req, res) => {
  const t = new Date().toISOString();
  try {
    if (!req.is("application/json")) {
      return res.status(400).json({
        success: false,
        error: "Content-Type deve ser application/json",
      });
    }
    if (!req.body || typeof req.body !== "object") {
      return res
        .status(400)
        .json({ success: false, error: "Body JSON ausente ou inválido" });
    }

    console.log(`[${t}] /api/azeler/send body recebido:`, req.body);

    const limit = Number.isFinite(parseInt(req.body.limit))
      ? parseInt(req.body.limit)
      : 5;
    const filePath =
      typeof req.body.filePath === "string"
        ? req.body.filePath
        : "despiece.enriched.ndjson";

    console.log(
      `[${t}] parâmetros normalizados: limit=${limit}, filePath=${filePath}`
    );

    const result = await sendEnrichedNdjsonToAzeler(filePath, limit);

    return res.json({
      success: true,
      message: "Envio ao Azeler concluído",
      read: result.read,
      sent: result.sent,
      failed: result.failed,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error(`[${t}] erro em /api/azeler/send:`, error);
    return res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
    });
  }
});

// Rota POST para enviar todos os dados enriquecidos ao Azeler (sem limite)
app.post("/api/azeler/send-all", async (req, res) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] Iniciando rota POST /api/azeler/send-all`);

  try {
    const filePath = req.body.filePath || "despiece.enriched.ndjson";
    console.log(`[${timestamp}] Parâmetros: filePath=${filePath}`);

    console.log(
      `[${timestamp}] Chamando sendEnrichedNdjsonToAzeler (sem limite)...`
    );
    const result = await sendEnrichedNdjsonToAzeler(filePath, null);

    console.log(
      `[${new Date().toISOString()}] sendEnrichedNdjsonToAzeler concluído:`,
      result
    );
    res.json({
      success: true,
      message: "Envio completo ao Azeler concluído",
      read: result.read,
      sent: result.sent,
      failed: result.failed,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error(
      `[${new Date().toISOString()}] Erro em /api/azeler/send-all:`,
      error
    );
    console.error(`[${new Date().toISOString()}] Stack trace:`, error.stack);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
    });
  }
});

// Rota POST para sincronizar INNOVA e enviar ao Azeler em uma única operação
app.post("/api/sync-and-send", async (req, res) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] Iniciando rota POST /api/sync-and-send`);

  try {
    const azelerLimit = parseInt(req.body.azelerLimit) || null;
    const sendPerPage = req.body.sendPerPage === true;
    console.log(
      `[${timestamp}] Parâmetros: azelerLimit=${azelerLimit}, sendPerPage=${sendPerPage}`
    );

    console.log(`[${timestamp}] Chamando syncDespiece...`);
    const syncResult = await syncDespiece({
      saveToFile: true,
      outputPathRaw: "despiece.raw.ndjson",
      outputPathEnriched: "despiece.enriched.ndjson",
      sendToAzelerPerPage: sendPerPage,
      azelerSendLimit: azelerLimit,
    });

    console.log(
      `[${new Date().toISOString()}] syncDespiece concluído:`,
      syncResult
    );

    let azelerResult = { read: 0, sent: 0, failed: 0 };
    if (!sendPerPage) {
      console.log(
        `[${new Date().toISOString()}] Chamando sendEnrichedNdjsonToAzeler...`
      );
      azelerResult = await sendEnrichedNdjsonToAzeler(
        "despiece.enriched.ndjson",
        azelerLimit
      );
      console.log(
        `[${new Date().toISOString()}] sendEnrichedNdjsonToAzeler concluído:`,
        azelerResult
      );
    }

    res.json({
      success: syncResult.success,
      message: "Sincronização e envio ao Azeler concluídos",
      sync: {
        totalProcessed: syncResult.totalProcessed,
      },
      azeler: azelerResult,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error(
      `[${new Date().toISOString()}] Erro em /api/sync-and-send:`,
      error
    );
    console.error(`[${new Date().toISOString()}] Stack trace:`, error.stack);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
    });
  }
});

// Rota POST com SSE para sincronizar e enviar ao Azeler com progresso em tempo real
app.post("/api/sync-and-send/stream", async (req, res) => {
  const timestamp = new Date().toISOString();
  console.log(
    `[${timestamp}] Iniciando rota POST SSE /api/sync-and-send/stream`
  );

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const syncId = Date.now().toString();
  activeSyncs.set(syncId, { status: "running", startTime: new Date() });
  console.log(`[${timestamp}] SyncId criado: ${syncId}`);

  const sendEvent = (data) => {
    try {
      const eventData = `data: ${JSON.stringify(data)}\n\n`;
      res.write(eventData);
      console.log(
        `[${new Date().toISOString()}] SSE Event enviado:`,
        data.status || data.message
      );
    } catch (err) {
      console.error(
        `[${new Date().toISOString()}] Erro ao enviar evento SSE:`,
        err
      );
    }
  };

  const sendComment = (text) => {
    try {
      res.write(`: ${text}\n\n`);
    } catch (err) {
      console.error(
        `[${new Date().toISOString()}] Erro ao enviar comentário SSE:`,
        err
      );
    }
  };

  const heartbeat = setInterval(() => {
    sendComment("ping");
  }, 15000);

  req.on("close", () => {
    clearInterval(heartbeat);
    activeSyncs.delete(syncId);
    console.log(
      `[${new Date().toISOString()}] Cliente desconectou. SyncId: ${syncId}`
    );
  });

  try {
    const azelerLimit = req.body.azelerLimit
      ? parseInt(req.body.azelerLimit)
      : null;
    const sendPerPage = req.body.sendPerPage === true;
    console.log(
      `[${timestamp}] Parâmetros: azelerLimit=${azelerLimit}, sendPerPage=${sendPerPage}`
    );

    sendEvent({
      status: "connected",
      syncId,
      message: "Conexão SSE estabelecida. Iniciando sincronização e envio...",
      timestamp: new Date().toISOString(),
    });

    console.log(`[${new Date().toISOString()}] Chamando syncDespiece...`);
    const syncResult = await syncDespiece({
      saveToFile: true,
      outputPathRaw: "despiece.raw.ndjson",
      outputPathEnriched: "despiece.enriched.ndjson",
      sendToAzelerPerPage: sendPerPage,
      azelerSendLimit: azelerLimit,
      onProgress: (progress) => {
        const { items, ...progressWithoutItems } = progress;
        sendEvent({
          ...progressWithoutItems,
          syncId,
          itemCount: items?.length || 0,
        });
      },
    });

    console.log(
      `[${new Date().toISOString()}] syncDespiece concluído:`,
      syncResult
    );

    sendEvent({
      status: "sync_completed",
      syncId,
      message: "Sincronização INNOVA concluída. Iniciando envio ao Azeler...",
      totalProcessed: syncResult.totalProcessed,
      timestamp: new Date().toISOString(),
    });

    let azelerResult = { read: 0, sent: 0, failed: 0 };
    if (!sendPerPage) {
      console.log(
        `[${new Date().toISOString()}] Chamando sendEnrichedNdjsonToAzeler...`
      );
      azelerResult = await sendEnrichedNdjsonToAzeler(
        "despiece.enriched.ndjson",
        azelerLimit
      );
      console.log(
        `[${new Date().toISOString()}] sendEnrichedNdjsonToAzeler concluído:`,
        azelerResult
      );
    }

    clearInterval(heartbeat);
    sendEvent({
      status: "completed",
      syncId,
      message: "Sincronização e envio ao Azeler concluídos",
      sync: { totalProcessed: syncResult.totalProcessed },
      azeler: azelerResult,
      timestamp: new Date().toISOString(),
    });
    activeSyncs.delete(syncId);
    res.end();
  } catch (error) {
    console.error(
      `[${new Date().toISOString()}] Erro em /api/sync-and-send/stream:`,
      error
    );
    console.error(`[${new Date().toISOString()}] Stack trace:`, error.stack);
    clearInterval(heartbeat);
    sendEvent({
      status: "error",
      syncId,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
    });
    activeSyncs.delete(syncId);
    res.end();
  }
});

// Middleware de tratamento de erros global
app.use((err, req, res, next) => {
  const timestamp = new Date().toISOString();
  console.error(`[${timestamp}] Erro não tratado:`, err);
  console.error(`[${timestamp}] Stack trace:`, err.stack);
  res.status(500).json({
    success: false,
    error: err.message,
    stack: err.stack,
    timestamp: new Date().toISOString(),
  });
});

app.get("/api/export/raw-excel", async (req, res) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit) : null;
    const inputPath = "despiece.raw.ndjson";
    const outputPath = "despiece_raw.xlsx";

    console.log(`[API] Gerando Excel a partir de ${inputPath}...`);

    const result = await ndjsonToExcel(inputPath, outputPath, limit);

    console.log(`[API] Excel gerado: ${result.rows} linhas`);

    // Envia o arquivo para download
    res.download(path.resolve(outputPath), "despiece_raw.xlsx", (err) => {
      if (err) {
        console.error("[API] Erro ao enviar arquivo:", err);
        if (!res.headersSent) {
          res.status(500).json({ error: "Erro ao enviar arquivo" });
        }
      }
    });
  } catch (error) {
    console.error("[API] Erro ao gerar Excel:", error.message);
    res.status(500).json({
      error: "Erro ao gerar Excel",
      message: error.message,
    });
  }
});

// ✅ Rota GET alternativa que retorna JSON com status
app.get("/api/export/raw-excel-status", async (req, res) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit) : null;
    const inputPath = "despiece.raw.ndjson";
    const outputPath = "despiece_raw.xlsx";

    console.log(`[API] Gerando Excel a partir de ${inputPath}...`);

    const result = await ndjsonToExcel(inputPath, outputPath, limit);

    res.json({
      success: true,
      message: "Excel gerado com sucesso",
      rows: result.rows,
      downloadUrl: `/download/${path.basename(outputPath)}`,
    });
  } catch (error) {
    console.error("[API] Erro ao gerar Excel:", error.message);
    res.status(500).json({
      success: false,
      error: "Erro ao gerar Excel",
      message: error.message,
    });
  }
});

// ✅ Rota para servir arquivos gerados (opcional)
app.get("/download/:filename", (req, res) => {
  const filename = req.params.filename;
  const filepath = path.resolve(filename);

  if (!fs.existsSync(filepath)) {
    return res.status(404).json({ error: "Arquivo não encontrado" });
  }

  res.download(filepath);
});

const server = app.listen(PORT, () => {
  console.log(`\n========================================`);
  console.log(`Servidor rodando em http://localhost:${PORT}`);
  console.log(`========================================\n`);
  console.log(`Interface SSE: http://localhost:${PORT}/`);
  console.log(`\nROTAS GET:`);
  console.log(
    `  SSE Stream: http://localhost:${PORT}/api/sync/despiece/stream`
  );
  console.log(`  Sync completo: http://localhost:${PORT}/api/sync/despiece`);
  console.log(
    `  Sync por página: http://localhost:${PORT}/api/sync/despiece/page/1`
  );
  console.log(`  Status: http://localhost:${PORT}/api/sync/status`);
  console.log(`\nROTAS POST:`);
  console.log(
    `  Enviar ao Azeler (teste): POST http://localhost:${PORT}/api/azeler/send`
  );
  console.log(
    `  Enviar tudo ao Azeler: POST http://localhost:${PORT}/api/azeler/send-all`
  );
  console.log(
    `  Sync + Envio: POST http://localhost:${PORT}/api/sync-and-send`
  );
  console.log(
    `  Sync + Envio (SSE): POST http://localhost:${PORT}/api/sync-and-send/stream`
  );
  console.log(`\n========================================\n`);
});

server.keepAliveTimeout = 120 * 1000;
server.headersTimeout = 125 * 1000;

console.log(`Timeouts configurados:`);
console.log(`  keepAliveTimeout: ${server.keepAliveTimeout}ms`);
console.log(`  headersTimeout: ${server.headersTimeout}ms\n`);
