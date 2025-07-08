const express = require("express");
const router = express.Router();
const databaseAnalyzer = require("../services/databaseAnalyzer");

// Rota para visualizar análise no navegador
router.get("/analise-banco", async (req, res) => {
  try {
    const resultados = await databaseAnalyzer.obterDadosAnalise();

    // HTML para exibir os resultados
    const html = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Análise do Banco INNOVA</title>
        <style>
            body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
            .container { max-width: 1200px; margin: 0 auto; }
            .section { background: white; margin: 20px 0; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
            h1 { color: #333; text-align: center; }
            h2 { color: #666; border-bottom: 2px solid #007bff; padding-bottom: 10px; }
            table { width: 100%; border-collapse: collapse; margin: 10px 0; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #007bff; color: white; }
            tr:nth-child(even) { background-color: #f9f9f9; }
            .stats { display: flex; gap: 20px; flex-wrap: wrap; }
            .stat-card { background: #007bff; color: white; padding: 20px; border-radius: 8px; flex: 1; min-width: 200px; }
            .refresh-btn { background: #28a745; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer; }
            .refresh-btn:hover { background: #218838; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🔍 Análise do Banco INNOVA</h1>
            
            <div class="section">
                <button class="refresh-btn" onclick="location.reload()">🔄 Atualizar Dados</button>
            </div>

            <div class="section">
                <h2>📊 Estatísticas Gerais</h2>
                <div class="stats">
                    <div class="stat-card">
                        <h3>Total de Tabelas</h3>
                        <h2>${resultados.tabelas.length}</h2>
                    </div>
                    <div class="stat-card">
                        <h3>Estados Disponíveis</h3>
                        <h2>${resultados.dadosEstpie.length}</h2>
                    </div>
                    <div class="stat-card">
                        <h3>Peças Almacenadas</h3>
                        <h2>${resultados.pecasAlmacenadas.length}</h2>
                    </div>
                </div>
            </div>

            <div class="section">
                <h2>📋 Tabelas do Banco</h2>
                <table>
                    <thead>
                        <tr><th>Schema</th><th>Nome da Tabela</th><th>Tipo</th></tr>
                    </thead>
                    <tbody>
                        ${resultados.tabelas
                          .map(
                            (t) =>
                              `<tr><td>${t.TABLE_SCHEMA}</td><td>${t.TABLE_NAME}</td><td>${t.TABLE_TYPE}</td></tr>`
                          )
                          .join("")}
                    </tbody>
                </table>
            </div>

            <div class="section">
                <h2>🏷️ Estados das Peças (dbo.estpie)</h2>
                <table>
                    <thead>
                        <tr><th>Código</th><th>Nome</th></tr>
                    </thead>
                    <tbody>
                        ${resultados.dadosEstpie
                          .map(
                            (e) =>
                              `<tr><td>${e.estpie_cod}</td><td>${e.nom}</td></tr>`
                          )
                          .join("")}
                    </tbody>
                </table>
            </div>

            <div class="section">
                <h2>📈 Contagem de Peças por Estado</h2>
                <table>
                    <thead>
                        <tr><th>Estado</th><th>Código</th><th>Quantidade</th></tr>
                    </thead>
                    <tbody>
                        ${resultados.contagemEstados
                          .map(
                            (c) =>
                              `<tr><td>${c.Estado}</td><td>${c.Codigo}</td><td>${c.Quantidade}</td></tr>`
                          )
                          .join("")}
                    </tbody>
                </table>
            </div>

            <div class="section">
                <h2>📦 Peças Almacenadas (Primeiras 20)</h2>
                <table>
                    <thead>
                        <tr><th>ID Peça</th><th>ID VPieza</th><th>Descrição</th><th>Matrícula</th><th>Estado</th></tr>
                    </thead>
                    <tbody>
                        ${resultados.pecasAlmacenadas
                          .map(
                            (p) =>
                              `<tr><td>${p.ID_Pieza}</td><td>${
                                p.ID_VPieza
                              }</td><td>${
                                p.DescripciónPieza || "N/A"
                              }</td><td>${p.Matrícula}</td><td>${
                                p.Estado
                              }</td></tr>`
                          )
                          .join("")}
                    </tbody>
                </table>
            </div>

            <div class="section">
                <h2>🔧 Estrutura da Tabela dbo.estpie</h2>
                <table>
                    <thead>
                        <tr><th>Coluna</th><th>Tipo</th><th>Nulo?</th><th>Padrão</th><th>Tamanho</th></tr>
                    </thead>
                    <tbody>
                        ${resultados.estruturaEstpie
                          .map(
                            (e) =>
                              `<tr><td>${e.COLUMN_NAME}</td><td>${
                                e.DATA_TYPE
                              }</td><td>${e.IS_NULLABLE}</td><td>${
                                e.COLUMN_DEFAULT || "N/A"
                              }</td><td>${
                                e.CHARACTER_MAXIMUM_LENGTH || "N/A"
                              }</td></tr>`
                          )
                          .join("")}
                    </tbody>
                </table>
            </div>
        </div>
    </body>
    </html>
    `;

    res.send(html);
  } catch (error) {
    res
      .status(500)
      .json({ error: "Erro ao analisar banco", details: error.message });
  }
});

module.exports = router;
