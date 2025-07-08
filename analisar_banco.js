
const { sql } = require('./config/db');

async function analisarBanco() {
  try {
    console.log('🔍 Iniciando análise do banco INNOVA...');

    // Conectar ao banco
    await sql.connect();
    console.log('✅ Conectado ao banco');

    // 1. Listar todas as tabelas
    console.log('\n=== 1. TABELAS DO BANCO ===');
    const tabelas = await sql.query(`
      SELECT 
        TABLE_SCHEMA,
        TABLE_NAME,
        TABLE_TYPE
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_TYPE = 'BASE TABLE'
      ORDER BY TABLE_SCHEMA, TABLE_NAME
    `);
    console.table(tabelas.recordset);

    // 2. Estrutura da tabela estpie
    console.log('\n=== 2. ESTRUTURA DA TABELA dbo.estpie ===');
    const estruturaEstpie = await sql.query(`
      SELECT 
        COLUMN_NAME,
        DATA_TYPE,
        IS_NULLABLE,
        COLUMN_DEFAULT,
        CHARACTER_MAXIMUM_LENGTH
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'estpie' AND TABLE_SCHEMA = 'dbo'
      ORDER BY ORDINAL_POSITION
    `);
    console.table(estruturaEstpie.recordset);

    // 3. Dados da tabela estpie
    console.log('\n=== 3. DADOS DA TABELA dbo.estpie ===');
    const dadosEstpie = await sql.query('SELECT * FROM dbo.estpie');
    console.table(dadosEstpie.recordset);

    // 4. Estrutura da tabela vehiDespieceConcreto
    console.log('\n=== 4. ESTRUTURA DA TABELA dbo.vehiDespieceConcreto ===');
    const estruturaVehi = await sql.query(`
      SELECT 
        COLUMN_NAME,
        DATA_TYPE,
        IS_NULLABLE,
        COLUMN_DEFAULT,
        CHARACTER_MAXIMUM_LENGTH
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'vehiDespieceConcreto' AND TABLE_SCHEMA = 'dbo'
      ORDER BY ORDINAL_POSITION
    `);
    console.table(estruturaVehi.recordset);

    // 5. Amostra da tabela vehiDespieceConcreto
    console.log('\n=== 5. AMOSTRA DA TABELA dbo.vehiDespieceConcreto ===');
    const amostraVehi = await sql.query('SELECT TOP 5 * FROM dbo.vehiDespieceConcreto');
    console.table(amostraVehi.recordset);

    // 6. Contar peças por estado
    console.log('\n=== 6. CONTAGEM DE PEÇAS POR ESTADO ===');
    const contagemEstados = await sql.query(`
      SELECT 
        e.nom AS Estado,
        e.estpie_cod AS Codigo,
        COUNT(*) AS Quantidade
      FROM dbo.vehiDespieceConcreto AS st
      JOIN dbo.estpie AS e ON st.estpie_cod = e.estpie_cod
      GROUP BY e.nom, e.estpie_cod
      ORDER BY Quantidade DESC
    `);
    console.table(contagemEstados.recordset);

    // 7. Peças almacenadas (exemplo da conversa)
    console.log('\n=== 7. PEÇAS ALMACENADAS (PRIMEIRAS 10) ===');
    const pecasAlmacenadas = await sql.query(`
      SELECT TOP 10
        st.idPiezaDesp    AS ID_Pieza,
        st.idVPieza       AS ID_VPieza,
        vp.descripcion    AS DescripciónPieza,
        st.matricula      AS Matrícula,
        e.nom             AS Estado,
        st.estpie_cod     AS CodigoEstado
      FROM dbo.vehiDespieceConcreto AS st
      JOIN dbo.estpie AS e ON st.estpie_cod = e.estpie_cod
      LEFT JOIN dbo.vehiPieza AS vp ON st.idVPieza = vp.idVPieza
      WHERE e.nom = 'Almacenada'
      ORDER BY vp.descripcion, st.matricula
    `);
    console.table(pecasAlmacenadas.recordset);

    // 8. Verificar peças com estado = 1
    console.log('\n=== 8. PEÇAS COM ESTADO = 1 (PRIMEIRAS 10) ===');
    const pecasEstado1 = await sql.query(`
      SELECT TOP 10
        st.idPiezaDesp,
        st.idVPieza,
        st.matricula,
        st.estpie_cod,
        vp.descripcion
      FROM dbo.vehiDespieceConcreto AS st
      LEFT JOIN dbo.vehiPieza AS vp ON st.idVPieza = vp.idVPieza
      WHERE st.estpie_cod = 1
    `);
    console.table(pecasEstado1.recordset);

    // 9. Buscar tabelas relacionadas
    console.log('\n=== 9. TABELAS RELACIONADAS ===');
    const tabelasRelacionadas = await sql.query(`
      SELECT TABLE_NAME
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_TYPE = 'BASE TABLE' 
        AND (TABLE_NAME LIKE '%pieza%' 
             OR TABLE_NAME LIKE '%vehi%' 
             OR TABLE_NAME LIKE '%stock%'
             OR TABLE_NAME LIKE '%almacen%')
      ORDER BY TABLE_NAME
    `);
    console.table(tabelasRelacionadas.recordset);

    console.log('\n✅ Análise concluída!');

  } catch (error) {
    console.error('❌ Erro durante a análise:', error);
  } finally {
    await sql.close();
  }
}

// Função para testar consulta específica
async function testarConsulta(query, nome = 'Consulta personalizada') {
  try {
    await sql.connect();
    console.log(`\n=== ${nome.toUpperCase()} ===`);
    const resultado = await sql.query(query);
    console.table(resultado.recordset);
    await sql.close();
  } catch (error) {
    console.error(`❌ Erro na consulta ${nome}:`, error);
    await sql.close();
  }
}

// Executar análise completa
if (require.main === module) {
  analisarBanco();
}

module.exports = { analisarBanco, testarConsulta };
