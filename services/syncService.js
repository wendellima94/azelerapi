// syncService.js - Serviço de sincronização por fases (CommonJS)

const fs = require("node:fs");
const { PassThrough } = require("node:stream");
const { pipeline } = require("node:stream/promises");
const { URL } = require("node:url");

const BASE_URL = "https://agw.desguacesgp.es/api/innova";
const HEADERS = {
  "x-api-token": "LdAgpHwsMhM4NqWjIlRq6bxyLJPfnGMRCxGDze9Nwm0h34C1ra2Aqzan5Z7D",
  "Content-Type": "application/json",
  Accept: "application/json",
  "User-Agent": "AzelerSync/1.0",
  Connection: "keep-alive",
};

const PER_PAGE = 100;
const MAX_IMAGES_PER_ITEM = 5; 

// Concorrência para imagens reduzida
const MAX_CONCURRENCY_IMAGES_INITIAL = 3;
const MAX_CONCURRENCY_IMAGES_MIN = 1;
const MAX_CONCURRENCY_IMAGES_MAX = 6;

// Timeouts separados
const REQUEST_TIMEOUT_MS_PAGE = 45000;
const REQUEST_TIMEOUT_MS_IMAGES = 60000;

// Retries aumentados
const MAX_RETRIES_PAGE = 5;
const MAX_RETRIES_IMAGES = 5; // Aumentado para 5 tentativas por item

// Circuit breaker simples para /gesdoc
const CB_WINDOW = 30;
const CB_THRESHOLD_408 = 8;
const CB_COOLDOWN_MS = 15000;

// Deadlines e timeouts duros
const IMAGES_PHASE_DEADLINE_MS = 120000; // 2 minutos por página (aumentado)
const IMAGE_TASK_HARD_TIMEOUT_MS = 20000; // 20s por item (aumentado)
const SKIP_REST_ON_STALL = false; // Desabilitado para nunca parar

let imageConcurrency = MAX_CONCURRENCY_IMAGES_INITIAL;
const gesdocErrorsWindow = [];
let cbCoolingDownUntil = 0;

function now() {
  return Date.now();
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function recordGesdoc408() {
  const t = now();
  gesdocErrorsWindow.push(t);
  const twoMinAgo = t - 120000;
  while (gesdocErrorsWindow.length && gesdocErrorsWindow[0] < twoMinAgo) {
    gesdocErrorsWindow.shift();
  }
  if (gesdocErrorsWindow.length > 200) {
    gesdocErrorsWindow.splice(0, gesdocErrorsWindow.length - 200);
  }
}

function shouldCooldown() {
  const lastN = gesdocErrorsWindow.slice(-CB_WINDOW);
  return lastN.length >= CB_THRESHOLD_408;
}

// Helper de timeout duro por promessa
function withHardTimeout(promise, ms, label = "task") {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`[TIMEOUT] ${label} ultrapassou ${ms}ms`)),
      ms
    );
  });
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    timeoutPromise,
  ]);
}

async function fetchWithRetry(url, options = {}, maxRetries, timeoutMs) {
  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        const err = new Error(`HTTP ${res.status} on ${url} - ${text}`);
        err.status = res.status;
        throw err;
      }
      return res;
    } catch (err) {
      clearTimeout(timeout);
      lastErr = err;

      if (String(url).includes("/gesdoc")) {
        if (err.status === 408 || err.name === "AbortError") {
          recordGesdoc408();
          if (imageConcurrency > MAX_CONCURRENCY_IMAGES_MIN) {
            imageConcurrency = Math.max(
              MAX_CONCURRENCY_IMAGES_MIN,
              imageConcurrency - 1
            );
            console.warn(
              `[GESDOC] Reduzindo concorrência para ${imageConcurrency} devido a timeouts (tentativa ${
                attempt + 1
              }/${maxRetries + 1})`
            );
          }
        }
      }

      if (attempt < maxRetries) {
        const base = 1000 * Math.pow(2, attempt);
        const jitter = Math.floor(Math.random() * 500);
        const wait = Math.min(base + jitter, 12000);
        console.log(
          `[Retry] Tentativa ${attempt + 1}/${
            maxRetries + 1
          } falhou. Aguardando ${wait}ms antes de tentar novamente...`
        );
        await sleep(wait);
      }
    }
  }
  throw lastErr;
}

async function fetchDespiecePage(urlOrPageNum) {
  const url =
    typeof urlOrPageNum === "number"
      ? `${BASE_URL}/vehidespiececoncreto?page=${urlOrPageNum}&per_page=${PER_PAGE}`
      : urlOrPageNum;

  console.log(`[Fetch] Buscando página: ${url}`);
  const res = await fetchWithRetry(
    url,
    { headers: HEADERS },
    MAX_RETRIES_PAGE,
    REQUEST_TIMEOUT_MS_PAGE
  );
  const json = await res.json();
  if (!json || !json.data || !json.links) {
    throw new Error("Resposta inesperada em vehidespiececoncreto");
  }
  console.log(
    `[Fetch] Página ${json.links.current_page} obtida com ${json.data.length} itens`
  );
  return json;
}

async function fetchImagesForPieza(idPiezaDesp) {
  if (now() < cbCoolingDownUntil) {
    console.warn(
      `[GESDOC][SKIP-COOLDOWN] ${idPiezaDesp}: em cooldown até ${new Date(
        cbCoolingDownUntil
      ).toISOString()}`
    );
    return [];
  }
  const url = `${BASE_URL}/gesdoc?f_idPiezaDesp=${encodeURIComponent(
    idPiezaDesp
  )}`;
  try {
    const res = await fetchWithRetry(
      url,
      { headers: HEADERS },
      MAX_RETRIES_IMAGES,
      REQUEST_TIMEOUT_MS_IMAGES
    );
    const json = await res.json();
    const images = Array.isArray(json?.data) ? json.data : [];

    // Ordena com principal primeiro e limita a 5
    const sorted = images.slice().sort((a, b) => {
      const ap = a?.fotprin ? 1 : 0;
      const bp = b?.fotprin ? 1 : 0;
      return bp - ap; // principal primeiro
    });
    const limited = sorted.slice(0, MAX_IMAGES_PER_ITEM);

    // Logs detalhados
    if (!limited.length) {
      console.log(`[GESDOC][OK-S/IMG] ${idPiezaDesp}: 0 imagens retornadas`);
    } else {
      const main = limited.find((i) => i?.fotprin) || limited[0];
      console.log(
        `[GESDOC][OK] ${idPiezaDesp}: ${
          limited.length
        } imagem(ns) (limite=${MAX_IMAGES_PER_ITEM}). Principal: ${
          main?.nomFitxer || main?.rutaimgsrvsto || "n/a"
        }`
      );
    }

    // Normaliza o shape e retorna
    return limited.map((img) => ({
      rutaimgsrvsto: img?.rutaimgsrvsto || null,
      fotprin: !!img?.fotprin,
      nomFitxer: img?.nomFitxer || null,
      extensio: (img?.extensio || "").trim() || null,
      ultimaMod: img?.ultimaMod || null,
    }));
  } catch (err) {
    if (err.status === 408 || err.name === "AbortError") {
      console.warn(
        `[GESDOC][408] ${idPiezaDesp}: timeout após ${
          MAX_RETRIES_IMAGES + 1
        } tentativas (${err.name || "HTTP 408"})`
      );
      if (shouldCooldown()) {
        cbCoolingDownUntil = now() + CB_COOLDOWN_MS;
        console.warn(
          `[GESDOC] Saturação detectada. Cooldown por ${CB_COOLDOWN_MS}ms`
        );
      }
    } else {
      console.warn(
        `[GESDOC][ERRO] ${idPiezaDesp}: ${err.message} após ${
          MAX_RETRIES_IMAGES + 1
        } tentativas`
      );
    }
    throw err;
  }
}

function pLimit(maxRef) {
  let active = 0;
  const queue = [];
  const next = () => {
    active--;
    if (queue.length) {
      const { fn, resolve, reject } = queue.shift();
      run(fn, resolve, reject);
    }
  };
  const run = (fn, resolve, reject) => {
    active++;
    fn().then(
      (val) => {
        resolve(val);
        next();
      },
      (err) => {
        reject(err);
        next();
      }
    );
  };
  return (fn) =>
    new Promise((resolve, reject) => {
      const max = typeof maxRef === "function" ? maxRef() : maxRef;
      if (active < max) run(fn, resolve, reject);
      else queue.push({ fn, resolve, reject });
    });
}

// Fase A: coletar itens (sem imagens) e salvar
async function collectPageItems(pageJson, pageIndex, writerRaw, onProgress) {
  const items = pageJson.data || [];

  if (writerRaw) {
    for (const obj of items) {
      writerRaw.write(JSON.stringify(obj) + "\n");
    }
  }

  if (onProgress) {
    onProgress({
      page: pageIndex,
      itemsInPage: items.length,
      status: "page_collected",
    });
  }

  console.log(`[Collect] Página ${pageIndex}: ${items.length} itens coletados`);
  return items;
}

// Fase B: enriquecer com imagens, concorrência controlada
async function enrichPageImages(items, pageIndex, writerEnriched, onProgress) {
  const limit = pLimit(() => imageConcurrency);
  console.log(
    `[Images] Enriquecendo página ${pageIndex} (${items.length} itens) | concorrência: ${imageConcurrency}`
  );

  let processed = 0;
  let withImages = 0;
  let withoutImages = 0;
  let errors = 0;

  const startPhase = now();
  let skipRest = false;

  const tasks = items.map((item, idx) =>
    limit(async () => {
      if (skipRest) {
        withoutImages++;
        console.log(
          `[IMG][SKIP-REST] ${
            item?.idPiezaDesp || item?.idPiezadesp || "?"
          }: pulado devido a deadline`
        );
        return { ...item, images: [] };
      }

      // deadline da fase (apenas warning, não para)
      const elapsed = now() - startPhase;
      if (elapsed > IMAGES_PHASE_DEADLINE_MS) {
        console.warn(
          `[Images][DEADLINE-WARNING] Página ${pageIndex} excedeu ${IMAGES_PHASE_DEADLINE_MS}ms. Continuando mesmo assim...`
        );
        // Não ativa skipRest, apenas avisa
      }

      const idPiezaDesp = item?.idPiezaDesp || item?.idPiezadesp;

      if (!idPiezaDesp) {
        console.log(`[IMG][SKIP] item sem idPiezaDesp`);
        withoutImages++;
        return { ...item, images: [] };
      }

      console.log(`[IMG][FETCH] ${idPiezaDesp}: buscando imagens...`);

      try {
        // timeout duro por item (com fallback, não para)
        const images = await withHardTimeout(
          fetchImagesForPieza(idPiezaDesp),
          IMAGE_TASK_HARD_TIMEOUT_MS,
          `gesdoc:${idPiezaDesp}`
        );

        if (images.length > 0) {
          withImages++;
          console.log(
            `[IMG][OK] ${idPiezaDesp}: associadas ${images.length} imagens`
          );
        } else {
          withoutImages++;
          console.log(`[IMG][S/IMG] ${idPiezaDesp}: nenhuma imagem associada`);
        }

        // Ajuste de concorrência para cima lentamente
        if (
          imageConcurrency < MAX_CONCURRENCY_IMAGES_MAX &&
          now() >= cbCoolingDownUntil
        ) {
          if (Math.random() < 0.1) {
            imageConcurrency += 1;
            console.log(
              `[GESDOC] Aumentando concorrência para ${imageConcurrency}`
            );
          }
        }

        return { ...item, images };
      } catch (err) {
        errors++;
        console.warn(
          `[IMG][ERRO] ${idPiezaDesp}: ${err.message}. Gravando sem imagens e continuando...`
        );

        // Heurística de "stall" (apenas se SKIP_REST_ON_STALL estiver true)
        if (SKIP_REST_ON_STALL && imageConcurrency === 1) {
          const recent = gesdocErrorsWindow.slice(-CB_WINDOW).length;
          if (recent >= CB_THRESHOLD_408) {
            console.warn(
              `[Images][STALL-WARNING] Página ${pageIndex} aparenta estar travada (conc=1, ${recent} timeouts recentes). Mas continuando mesmo assim...`
            );
            // Não ativa skipRest, apenas avisa
          }
        }

        return { ...item, images: [] };
      } finally {
        processed++;
        if (onProgress && processed % 10 === 0) {
          onProgress({
            page: pageIndex,
            status: "images_enriching",
            enrichedCount: processed,
            itemsInPage: items.length,
            withImages,
            withoutImages,
            errors,
            concurrency: imageConcurrency,
          });
        }
      }
    })
  );

  // Escreve conforme as tasks terminam; mesmo com erros, conclui
  const results = await Promise.allSettled(tasks);
  for (const r of results) {
    if (r.status === "fulfilled") {
      if (writerEnriched) writerEnriched.write(JSON.stringify(r.value) + "\n");
    } else {
      errors++;
      console.warn(
        `[IMG][TASK-REJECT] ${r.reason?.message || r.reason}. Continuando...`
      );
      // Grava item sem imagens mesmo em caso de rejeição total
      if (writerEnriched) {
        const failedItem = items[results.indexOf(r)] || {};
        writerEnriched.write(
          JSON.stringify({ ...failedItem, images: [] }) + "\n"
        );
      }
    }
  }

  console.log(
    `[Images][RESUMO] página ${pageIndex} | total=${items.length} | ok=${withImages} | sem_img=${withoutImages} | erros=${errors} | conc_final=${imageConcurrency}`
  );

  if (onProgress) {
    onProgress({
      page: pageIndex,
      status: "images_enriched",
      enrichedCount: processed,
      itemsInPage: items.length,
      withImages,
      withoutImages,
      errors,
      concurrency: imageConcurrency,
    });
  }
}

// Função principal por páginas, em duas fases
async function syncDespiece(options = {}) {
  const {
    onProgress = null,
    saveToFile = false,
    outputPathRaw = "despiece.raw.ndjson",
    outputPathEnriched = "despiece.enriched.ndjson",
  } = options;

  // Arquivos fixos (limpar no início)
  if (saveToFile) {
    if (fs.existsSync(outputPathRaw)) {
      fs.unlinkSync(outputPathRaw);
      console.log(
        `[Init] Arquivo ${outputPathRaw} removido para nova sincronização`
      );
    }
    if (fs.existsSync(outputPathEnriched)) {
      fs.unlinkSync(outputPathEnriched);
      console.log(
        `[Init] Arquivo ${outputPathEnriched} removido para nova sincronização`
      );
    }
  }

  let currentPageUrl = `${BASE_URL}/vehidespiececoncreto?page=1&per_page=${PER_PAGE}`;
  let totalProcessed = 0;
  let pageCount = 0;

  // reset controladores
  imageConcurrency = MAX_CONCURRENCY_IMAGES_INITIAL;
  gesdocErrorsWindow.length = 0;
  cbCoolingDownUntil = 0;

  console.log("[Sync] Iniciando sincronização (duas fases por página)...");

  // Streams persistentes (append mode)
  let rawStream = null;
  let enrStream = null;

  if (saveToFile) {
    rawStream = fs.createWriteStream(outputPathRaw, { flags: "a" });
    enrStream = fs.createWriteStream(outputPathEnriched, { flags: "a" });

    rawStream.on("finish", () =>
      console.log(`[Write] ${outputPathRaw} finalizado`)
    );
    enrStream.on("finish", () =>
      console.log(`[Write] ${outputPathEnriched} finalizado`)
    );
  }

  try {
    while (currentPageUrl) {
      pageCount++;

      try {
        const pageJson = await fetchDespiecePage(currentPageUrl);

        // Fase A: coletar itens e gravar raw
        const rawPass = saveToFile ? new PassThrough() : null;
        if (saveToFile && rawPass) {
          pipeline(rawPass, rawStream, { end: false }).catch((err) =>
            console.error("[Write RAW] Erro:", err)
          );
        }

        const items = await collectPageItems(
          pageJson,
          pageCount,
          rawPass,
          (progress) => {
            if (onProgress) {
              const total = pageJson?.links?.total;
              const lastPage = pageJson?.links?.last_page;
              const currentPage = pageJson?.links?.current_page;

              onProgress({
                status: progress.status, // page_collected
                currentPage,
                lastPage,
                total,
                itemsInPage: progress.itemsInPage,
                totalProcessed: totalProcessed + progress.itemsInPage,
                percentage: total
                  ? (
                      ((totalProcessed + progress.itemsInPage) / total) *
                      100
                    ).toFixed(2)
                  : 0,
              });
            }
          }
        );

        if (rawPass) rawPass.end();
        totalProcessed += items.length;

        // Fase B: enriquecer com imagens e gravar enriched
        const enrPass = saveToFile ? new PassThrough() : null;
        if (saveToFile && enrPass) {
          pipeline(enrPass, enrStream, { end: false }).catch((err) =>
            console.error("[Write ENR] Erro:", err)
          );
        }

        await enrichPageImages(items, pageCount, enrPass, (progress) => {
          if (onProgress) {
            const total = pageJson?.links?.total;
            const lastPage = pageJson?.links?.last_page;
            const currentPage = pageJson?.links?.current_page;

            onProgress({
              status: progress.status, // images_enriching | images_enriched
              currentPage,
              lastPage,
              total,
              itemsInPage: progress.itemsInPage,
              enrichedCount: progress.enrichedCount ?? 0,
              withImages: progress.withImages ?? 0,
              withoutImages: progress.withoutImages ?? 0,
              errors: progress.errors ?? 0,
              concurrency: progress.concurrency ?? imageConcurrency,
              totalProcessed,
              percentage: total
                ? ((totalProcessed / total) * 100).toFixed(2)
                : 0,
            });
          }
        });

        if (enrPass) enrPass.end();

        // Avança para a próxima página
        let nextUrl = pageJson?.links?.next_page_url || null;
        if (nextUrl) {
          try {
            const u = new URL(nextUrl);
            u.protocol = "https:";
            if (!u.searchParams.has("per_page")) {
              u.searchParams.set("per_page", String(PER_PAGE));
            }
            currentPageUrl = u.toString();
          } catch {
            currentPageUrl = nextUrl;
          }
        } else {
          currentPageUrl = null;
        }
      } catch (pageError) {
        console.error(
          `[Sync][ERRO-PÁGINA] Erro ao processar página ${pageCount}: ${pageError.message}. Continuando para a próxima...`
        );
        // Tenta avançar para a próxima página mesmo com erro
        pageCount++;
        currentPageUrl = `${BASE_URL}/vehidespiececoncreto?page=${pageCount}&per_page=${PER_PAGE}`;
      }
    }

    // Fecha os streams
    if (rawStream) rawStream.end();
    if (enrStream) enrStream.end();

    if (onProgress) {
      onProgress({
        status: "completed",
        totalProcessed,
        message: "Sincronização concluída com sucesso",
      });
    }

    console.log(
      `[Sync] ✅ Sincronização concluída! Total processado: ${totalProcessed} itens`
    );

    return {
      success: true,
      totalProcessed,
    };
  } catch (error) {
    console.error(
      `[Sync] ⚠️ Erro na sincronização: ${error.message}. Mas continuando...`
    );

    // Fecha os streams em caso de erro
    if (rawStream) rawStream.end();
    if (enrStream) enrStream.end();

    if (onProgress) {
      onProgress({
        status: "error",
        error: error.message,
        totalProcessed,
      });
    }

    // NÃO lança o erro, apenas retorna com sucesso parcial
    return {
      success: false,
      totalProcessed,
      error: error.message,
    };
  }
}

module.exports = { syncDespiece };
