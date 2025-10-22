// syncService.js - Serviço de sincronização por fases + envio para Azeler (CommonJS)

const fs = require("node:fs");
const readline = require("node:readline");
const { PassThrough } = require("node:stream");
const { pipeline } = require("node:stream/promises");
const { URL } = require("node:url");

// =========================
// INNOVA (origem) - Config
// =========================
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

// Concorrência para imagens
const MAX_CONCURRENCY_IMAGES_INITIAL = 3;
const MAX_CONCURRENCY_IMAGES_MIN = 1;
const MAX_CONCURRENCY_IMAGES_MAX = 6;

// Timeouts INNOVA
const REQUEST_TIMEOUT_MS_PAGE = 45000;
const REQUEST_TIMEOUT_MS_IMAGES = 60000;

// Retries INNOVA
const MAX_RETRIES_PAGE = 5;
const MAX_RETRIES_IMAGES = 5;

// Circuit breaker simples para /gesdoc
const CB_WINDOW = 30;
const CB_THRESHOLD_408 = 8;
const CB_COOLDOWN_MS = 15000;

// Deadlines e timeouts duros
const IMAGES_PHASE_DEADLINE_MS = 120000;
const IMAGE_TASK_HARD_TIMEOUT_MS = 20000;
const SKIP_REST_ON_STALL = false;

let imageConcurrency = MAX_CONCURRENCY_IMAGES_INITIAL;
const gesdocErrorsWindow = [];
let cbCoolingDownUntil = 0;

// =========================
// AZELER (destino) - Config
// =========================
const API_CONFIG = {
  baseURL: "https://pre-apiapp.azelerecambios.com/api",
  username: "API_INNOVA",
  password: "TestInnova",
};

// Enviar por lotes de 5 itens
const AZELER_BATCH_SIZE = 5;
const AZELER_REQ_TIMEOUT_MS = 30000; // 30s
const AZELER_MAX_RETRIES = 5;

// Endpoint correto conforme seu código de exemplo
const AZELER_ENDPOINT = "/v1/spareParts/Insert";

// Se precisar montar URL de imagens quando só houver "nomFitxer" ou ruta relativa
const AZELER_IMAGE_BASE = process.env.AZELER_IMAGE_BASE || "";

// =========================
// Utils
// =========================
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

// Timeout duro por promessa
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

// =========================
// Fetch com retry (INNOVA)
// =========================
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

// =========================
// INNOVA - Páginas e Imagens
// =========================
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

    const sorted = images.slice().sort((a, b) => {
      const ap = a?.fotprin ? 1 : 0;
      const bp = b?.fotprin ? 1 : 0;
      return bp - ap;
    });
    const limited = sorted.slice(0, MAX_IMAGES_PER_ITEM);

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

  const tasks = items.map((item) =>
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

      const elapsed = now() - startPhase;
      if (elapsed > IMAGES_PHASE_DEADLINE_MS) {
        console.warn(
          `[Images][DEADLINE-WARNING] Página ${pageIndex} excedeu ${IMAGES_PHASE_DEADLINE_MS}ms. Continuando mesmo assim...`
        );
      }

      const idPiezaDesp = item?.idPiezaDesp || item?.idPiezadesp;
      if (!idPiezaDesp) {
        console.log(`[IMG][SKIP] item sem idPiezaDesp`);
        withoutImages++;
        return { ...item, images: [] };
      }

      console.log(`[IMG][FETCH] ${idPiezaDesp}: buscando imagens...`);

      try {
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
        if (SKIP_REST_ON_STALL && imageConcurrency === 1) {
          const recent = gesdocErrorsWindow.slice(-CB_WINDOW).length;
          if (recent >= CB_THRESHOLD_408) {
            console.warn(
              `[Images][STALL-WARNING] Página ${pageIndex} aparenta estar travada (conc=1, ${recent} timeouts recentes). Continuando...`
            );
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

  const results = await Promise.allSettled(tasks);
  for (const r of results) {
    if (r.status === "fulfilled") {
      if (writerEnriched) writerEnriched.write(JSON.stringify(r.value) + "\n");
    } else {
      errors++;
      console.warn(
        `[IMG][TASK-REJECT] ${r.reason?.message || r.reason}. Continuando...`
      );
      if (writerEnriched) {
        writerEnriched.write(JSON.stringify({ images: [] }) + "\n");
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

// =========================
// AZELER - Auth e Envio
// =========================
function generateAuthToken(username, password) {
  const credentials = `${username}:${password}`;
  return Buffer.from(credentials).toString("base64");
}

function getRequestConfig(method, endpoint, data = null) {
  const authToken = generateAuthToken(API_CONFIG.username, API_CONFIG.password);
  const headers = {
    Authorization: `Basic ${authToken}`,
    "Content-Type": "application/json",
    Accept: "application/json",
    "User-Agent": "AzelerSync/1.0",
  };
  const url = `${API_CONFIG.baseURL}${endpoint}`;
  const body = data ? JSON.stringify(data) : undefined;
  return { method, url, headers, body };
}

async function fetchWithRetryAzeler(
  method,
  endpoint,
  data,
  maxRetries,
  timeoutMs
) {
  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const cfg = getRequestConfig(method, endpoint, data);

      console.log(`[Azeler] Tentativa ${attempt + 1}/${maxRetries + 1}`);
      console.log(`[Azeler] URL: ${cfg.url}`);
      console.log(`[Azeler] Method: ${cfg.method}`);
      console.log(
        `[Azeler] Payload (primeiros 500 chars):`,
        JSON.stringify(data).substring(0, 500)
      );

      const res = await fetch(cfg.url, {
        method: cfg.method,
        headers: cfg.headers,
        body: cfg.body,
        signal: controller.signal,
      });
      clearTimeout(timer);

      console.log(`[Azeler] Response Status: ${res.status}`);

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.error(`[Azeler] Response Body:`, text.substring(0, 500));
        const err = new Error(`HTTP ${res.status} - ${text.substring(0, 200)}`);
        err.status = res.status;
        throw err;
      }

      const responseText = await res.text();
      console.log(`[Azeler] Success Response:`, responseText.substring(0, 500));

      return {
        status: res.status,
        data: responseText ? JSON.parse(responseText) : {},
      };
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      console.error(
        `[Azeler][Erro] Tentativa ${attempt + 1} falhou:`,
        err.message
      );

      if (attempt < maxRetries) {
        const backoff = Math.min(
          1000 * Math.pow(2, attempt) + Math.random() * 300,
          8000
        );
        console.warn(
          `[Azeler][Retry] Aguardando ${backoff}ms antes de tentar novamente...`
        );
        await sleep(backoff);
      }
    }
  }
  throw lastErr;
}

// Normalização das fotos a partir do seu item enriquecido
function extractPhotosFromItem(item) {
  if (!Array.isArray(item.images)) return [];
  const urls = [];
  for (const img of item.images.slice(0, MAX_IMAGES_PER_ITEM)) {
    const ruta = img?.rutaimgsrvsto;
    const nom = img?.nomFitxer;
    if (ruta && /^https?:\/\//i.test(ruta)) {
      urls.push(ruta);
    } else if (ruta && !/^https?:\/\//i.test(ruta) && AZELER_IMAGE_BASE) {
      urls.push(
        AZELER_IMAGE_BASE.replace(/\/+$/, "") + "/" + ruta.replace(/^\/+/, "")
      );
    } else if (!ruta && nom && AZELER_IMAGE_BASE) {
      const ext = (img?.extensio || "").toLowerCase() || "jpg";
      urls.push(
        AZELER_IMAGE_BASE.replace(/\/+$/, "") +
          "/" +
          `${nom}.${ext.replace(/^\./, "")}`
      );
    }
  }
  return urls;
}

// Função auxiliar para extrair dados do campo metadatos
function parseMetadatos(metadatos) {
  if (!metadatos || typeof metadatos !== "string") {
    return { brand: null, model: null, version: null, motor: null };
  }

  // Exemplo de metadatos: "PEUGEOT 308 1.6 HDI 9HZ"
  // ou "AUDI A4 AVANT 1.9 TDI AVB"
  const parts = metadatos.trim().split(/\s+/);

  let brand = null;
  let model = null;
  let version = null;
  let motor = null;

  if (parts.length >= 1) {
    brand = parts[0]; // Primeira palavra = marca
  }

  if (parts.length >= 2) {
    // Se a terceira palavra existe e não começa com número, faz parte do modelo
    if (parts.length >= 3 && !/^\d/.test(parts[2])) {
      model = `${parts[1]} ${parts[2]}`; // Ex: "A4 AVANT"

      if (parts.length >= 4) {
        // Versão começa após o modelo
        const versionParts = [];

        for (let i = 3; i < parts.length; i++) {
          // Motor geralmente é a última parte e tem letras maiúsculas sem números no início
          if (i === parts.length - 1 && /^[A-Z0-9]{3,}$/.test(parts[i])) {
            motor = parts[i];
            break;
          }
          versionParts.push(parts[i]);
        }

        version = versionParts.join(" ") || null;
      }
    } else {
      model = parts[1]; // Ex: "308"

      if (parts.length >= 3) {
        const versionParts = [];

        for (let i = 2; i < parts.length; i++) {
          if (i === parts.length - 1 && /^[A-Z0-9]{3,}$/.test(parts[i])) {
            motor = parts[i];
            break;
          }
          versionParts.push(parts[i]);
        }

        version = versionParts.join(" ") || null;
      }
    }
  }

  return { brand, model, version, motor };
}

// Mapeia item enriquecido -> payload Azeler
function mapItemToAzelerPayload(item) {
  // Extrair dados do metadatos
  const metaData = parseMetadatos(item.metadatos);

  // warehouseId = idPiezaDesp (apenas números)
  const warehouseId =
    item.idPiezaDesp != null
      ? Number(String(item.idPiezaDesp).replace(/\D/g, "")) || 0
      : 0;

  // categoryId (se disponível)
  const categoryId =
    item.idVSubSubFam || item.idVSubFam || item.idVFam
      ? Number(
          String(item.idVSubSubFam || item.idVSubFam || item.idVFam).replace(
            /\D/g,
            ""
          )
        ) || null
      : null;

  // externalPlatformName fixo
  const externalPlatformName = "INNOVA_API";

  // partDescription = descripcion
  const partDescription = item.descripcion || item.desc || null;

  // vehicleType = 4 (padrão)
  const vehicleType = Number(item.vehicleType || 4);

  // brand, model, version, motor = extraídos de metadatos
  const brand = metaData.brand;
  const model = metaData.model;
  const version = metaData.version;
  const motor = metaData.motor;

  // price = precioV
  const price =
    item.precioV != null
      ? Number(String(item.precioV).replace(",", "."))
      : null;

  // disassembled = desmontado (1 = true, outros = false)
  const disassembled = String(item.desmontado || "").trim() === "1";

  // warehouseEntryDate = data atual
  const warehouseEntryDate = new Date().toISOString().slice(0, 10);

  // physicalState = 5 (Usada - pieza recuperada)
  const physicalState = 5;

  // observations = observ ou observaciones
  const observations = item.observ || item.observaciones || null;

  // referenceOE = refsOEM
  const referenceOE = item.refsOEM || item.refsOE || null;

  // referenceA = vazio
  const referenceA = "";

  // warrantyMonths = 6 (padrão)
  const warrantyMonths = 6;

  // Kms
  const Kms = item.kms != null ? Number(item.kms) : null;

  // year
  const year = item.year || null;

  // color
  const color = item.color || null;

  // quantity = cantidad ou cantidadV
  const quantity = Number(item.cantidad || item.cantidadV || 1) || 1;

  // weight = peso ou pesoExacto
  const weight =
    item.pesoExacto != null
      ? Number(String(item.pesoExacto).replace(",", "."))
      : item.peso != null
      ? Number(String(item.peso).replace(",", "."))
      : null;

  // photos = extraídas de images (rutaimgsrvsto)
  const photos = extractPhotosFromItem(item);

  // photosVeh = vazio por enquanto
  const photosVeh = [];

  // codVehiculo = idModel (número)
  const codVehiculo =
    item.idModel != null
      ? Number(String(item.idModel).replace(/\D/g, "")) || null
      : null;

  // fuel
  const fuel = item.fuel != null ? Number(item.fuel) : null;

  // vin = bastidor
  const vin = item.bastidor ? String(item.bastidor) : null;

  return {
    warehouseId,
    categoryId,
    externalPlatformName,
    partDescription,
    vehicleType,
    brand,
    model,
    version,
    motor,
    price,
    disassembled,
    warehouseEntryDate,
    physicalState,
    observations,
    referenceOE,
    referenceA,
    warrantyMonths,
    Kms,
    year,
    color,
    quantity,
    weight,
    photos,
    photosVeh,
    codVehiculo,
    fuel,
    vin,
  };
}

// Envia um lote de itens para o Azeler (em batch de 5)
async function sendBatchToAzeler(batch) {
  const method = "POST";
  const endpoint = AZELER_ENDPOINT;

  console.log(
    `[Azeler] Enviando lote (${batch.length}) -> ${API_CONFIG.baseURL}${endpoint}`
  );

  const result = await fetchWithRetryAzeler(
    method,
    endpoint,
    batch,
    AZELER_MAX_RETRIES,
    AZELER_REQ_TIMEOUT_MS
  );

  console.log(`[Azeler] Lote enviado com sucesso. Status: ${result.status}`);
  return result.data;
}

// Lê NDJSON enriquecido e envia em lotes de 5
async function sendEnrichedNdjsonToAzeler(
  path = "despiece.enriched.ndjson",
  limitItems = null
) {
  console.log(
    `\n[Azeler] Iniciando envio de ${
      limitItems ? limitItems + " itens" : "todos os itens"
    } de ${path} ao Azeler...`
  );

  if (!fs.existsSync(path)) {
    console.warn(`[Azeler] Arquivo não encontrado: ${path}`);
    return { read: 0, sent: 0, failed: 0 };
  }

  const rl = readline.createInterface({
    input: fs.createReadStream(path, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  let buffer = [];
  let count = 0;
  let sent = 0;
  let failed = 0;

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    try {
      const item = JSON.parse(trimmed);
      const payload = mapItemToAzelerPayload(item);
      buffer.push(payload);
      count++;

      if (buffer.length === AZELER_BATCH_SIZE) {
        try {
          await sendBatchToAzeler(buffer);
          sent += buffer.length;
        } catch (err) {
          console.error(`[Azeler][Erro Lote] ${err.message}. Continuando...`);
          failed += buffer.length;
        }
        buffer = [];
      }

      if (limitItems && count >= limitItems) break;
    } catch (err) {
      console.warn(`[Azeler][Parse] Ignorando linha inválida: ${err.message}`);
      failed++;
    }
  }

  if (buffer.length) {
    try {
      await sendBatchToAzeler(buffer);
      sent += buffer.length;
    } catch (err) {
      console.error(`[Azeler][Erro Lote-Final] ${err.message}. Continuando...`);
      failed += buffer.length;
    }
  }

  console.log(
    `[Azeler][Resumo] Total lido=${count} | enviado=${sent} | falhou=${failed}`
  );
  return { read: count, sent, failed };
}

// =========================
// Sincronização principal
// =========================
async function syncDespiece(options = {}) {
  const {
    onProgress = null,
    saveToFile = false,
    outputPathRaw = "despiece.raw.ndjson",
    outputPathEnriched = "despiece.enriched.ndjson",
    sendToAzelerPerPage = false,
    azelerSendLimit = 5,
  } = options;

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

  imageConcurrency = MAX_CONCURRENCY_IMAGES_INITIAL;
  gesdocErrorsWindow.length = 0;
  cbCoolingDownUntil = 0;

  console.log("[Sync] Iniciando sincronização (duas fases por página)...");

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

  async function writePageToTempAndSend(enrichedItems) {
    if (!sendToAzelerPerPage) return;

    const tmpPath = `.tmp.enriched.page.ndjson`;
    try {
      fs.writeFileSync(tmpPath, "", "utf8");
      const w = fs.createWriteStream(tmpPath, { flags: "a" });
      for (const it of enrichedItems) {
        w.write(JSON.stringify(it) + "\n");
      }
      await new Promise((res) => w.end(res));
      await sendEnrichedNdjsonToAzeler(tmpPath, null);
    } catch (e) {
      console.error(
        `[Azeler][PerPage] Falha ao enviar página: ${e.message}. Continuando...`
      );
    } finally {
      try {
        if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
      } catch {}
    }
  }

  try {
    while (currentPageUrl) {
      pageCount++;

      try {
        const pageJson = await fetchDespiecePage(currentPageUrl);

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
                status: progress.status,
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

        const enrPass = saveToFile ? new PassThrough() : null;
        let enrichedBufferForPage = [];
        if (saveToFile && enrPass) {
          pipeline(enrPass, enrStream, { end: false }).catch((err) =>
            console.error("[Write ENR] Erro:", err)
          );
        }

        await enrichPageImages(
          items,
          pageCount,
          {
            write: (line) => {
              if (enrPass) enrPass.write(line);
              try {
                const it = JSON.parse(line);
                enrichedBufferForPage.push(it);
              } catch {}
            },
          },
          (progress) => {
            if (onProgress) {
              const total = pageJson?.links?.total;
              const lastPage = pageJson?.links?.last_page;
              const currentPage = pageJson?.links?.current_page;

              onProgress({
                status: progress.status,
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
          }
        );

        if (enrPass) enrPass.end();

        await writePageToTempAndSend(enrichedBufferForPage);

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
        pageCount++;
        currentPageUrl = `${BASE_URL}/vehidespiececoncreto?page=${pageCount}&per_page=${PER_PAGE}`;
      }
    }

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
      `[Sync] Sincronização concluída. Total processado: ${totalProcessed} itens`
    );

    try {
      const resultAzeler = await sendEnrichedNdjsonToAzeler(
        outputPathEnriched,
        azelerSendLimit || 5
      );
      console.log(`[Sync->Azeler] Envio final concluído:`, resultAzeler);
    } catch (e) {
      console.error(
        `[Sync->Azeler] Falha no envio final: ${e.message}. Processo concluído mesmo assim.`
      );
    }

    return {
      success: true,
      totalProcessed,
    };
  } catch (error) {
    console.error(
      `[Sync] Erro na sincronização: ${error.message}. Encerrando com sucesso parcial.`
    );

    if (rawStream) rawStream.end();
    if (enrStream) enrStream.end();

    if (onProgress) {
      onProgress({
        status: "error",
        error: error.message,
        totalProcessed,
      });
    }

    return {
      success: false,
      totalProcessed,
      error: error.message,
    };
  }
}

module.exports = {
  syncDespiece,
  sendEnrichedNdjsonToAzeler,
  mapItemToAzelerPayload,
};
