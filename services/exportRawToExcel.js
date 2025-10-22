// exportRawToExcel.js - Módulo para exportar NDJSON para Excel (CommonJS)

const fs = require("node:fs");
const readline = require("node:readline");
const XLSX = require("xlsx");

/**
 * Lê o arquivo despiece.raw.ndjson e gera um Excel com colunas principais.
 * @param {string} inputPath - Caminho do arquivo NDJSON.
 * @param {string} outputPath - Caminho de saída (.xlsx).
 * @param {number|null} limit - Limite de linhas (ex: 500 para testes).
 */
async function ndjsonToExcel(
  inputPath = "despiece.raw.ndjson",
  outputPath = "despiece_raw.xlsx",
  limit = null
) {
  if (!fs.existsSync(inputPath)) {
    console.error(`[Excel] Arquivo não encontrado: ${inputPath}`);
    throw new Error(`Arquivo não encontrado: ${inputPath}`);
  }

  console.log(`[Excel] Lendo ${inputPath}...`);
  const rl = readline.createInterface({
    input: fs.createReadStream(inputPath, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  const rows = [];
  let count = 0;

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    try {
      const obj = JSON.parse(trimmed);

      // ✅ Selecione aqui as colunas que quiser exportar
      rows.push({
        idPiezaDesp: obj.idPiezaDesp || obj.idPiezadesp || "",
        idVehiculo: obj.idVehiculo || "",
        descripcion: obj.descripcion || obj.desc || "",
        precioV: obj.precioV || "",
        idVSubFam: obj.idVSubFam || "",
        family: obj.nomVSubFam || obj.nomVFam || "",
        bastidor: obj.bastidor || "",
        marca: obj.marca || "",
        modelo: obj.modelo || "",
        year: obj.year || "",
        kms: obj.kms || "",
        desmontado: obj.desmontado || "",
        metadatos: obj.metadatos || "",
        refsOEM: obj.refsOEM || "",
        cantidad: obj.cantidad || obj.cantidadV || "",
        peso: obj.peso || obj.pesoExacto || "",
      });

      count++;
      if (limit && count >= limit) break;
    } catch (err) {
      console.warn(`[Excel] Linha inválida ignorada (${err.message})`);
    }
  }

  console.log(`[Excel] ${rows.length} linhas processadas. Gerando planilha...`);
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Despiece RAW");

  XLSX.writeFile(workbook, outputPath);
  console.log(`[Excel] Arquivo Excel criado com sucesso: ${outputPath}`);

  return { success: true, rows: rows.length, outputPath };
}

module.exports = { ndjsonToExcel };
