
-- ===== CONSULTAS PARA ANÁLISE DO BANCO DE DADOS INNOVA =====

-- 1. LISTAR TODAS AS TABELAS DO BANCO
SELECT 
    TABLE_SCHEMA,
    TABLE_NAME,
    TABLE_TYPE
FROM INFORMATION_SCHEMA.TABLES 
WHERE TABLE_TYPE = 'BASE TABLE'
ORDER BY TABLE_SCHEMA, TABLE_NAME;

-- 2. VISUALIZAR ESTRUTURA DA TABELA dbo.estpie (Estados das peças)
SELECT 
    COLUMN_NAME,
    DATA_TYPE,
    IS_NULLABLE,
    COLUMN_DEFAULT,
    CHARACTER_MAXIMUM_LENGTH
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_NAME = 'estpie' AND TABLE_SCHEMA = 'dbo'
ORDER BY ORDINAL_POSITION;

-- 3. VISUALIZAR DADOS DA TABELA dbo.estpie
SELECT * FROM dbo.estpie;

-- 4. VISUALIZAR ESTRUTURA DA TABELA dbo.vehiDespieceConcreto
SELECT 
    COLUMN_NAME,
    DATA_TYPE,
    IS_NULLABLE,
    COLUMN_DEFAULT,
    CHARACTER_MAXIMUM_LENGTH
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_NAME = 'vehiDespieceConcreto' AND TABLE_SCHEMA = 'dbo'
ORDER BY ORDINAL_POSITION;

-- 5. VISUALIZAR ESTRUTURA DA TABELA dbo.vehiPieza
SELECT 
    COLUMN_NAME,
    DATA_TYPE,
    IS_NULLABLE,
    COLUMN_DEFAULT,
    CHARACTER_MAXIMUM_LENGTH
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_NAME = 'vehiPieza' AND TABLE_SCHEMA = 'dbo'
ORDER BY ORDINAL_POSITION;

-- 6. CONSULTA DE EXEMPLO - PEÇAS ALMACENADAS (baseada na conversa)
SELECT
    st.idPiezaDesp    AS ID_Pieza,
    st.idVPieza       AS ID_VPieza,
    vp.descripcion    AS DescripciónPieza,
    st.matricula      AS Matrícula,
    e.nom             AS Estado,
    st.estpie_cod     AS CodigoEstado
FROM dbo.vehiDespieceConcreto AS st
JOIN dbo.estpie AS e
    ON st.estpie_cod = e.estpie_cod
LEFT JOIN dbo.vehiPieza AS vp
    ON st.idVPieza = vp.idVPieza
WHERE
    e.nom = 'Almacenada'
ORDER BY
    vp.descripcion,
    st.matricula;

-- 7. CONTAR PEÇAS POR ESTADO
SELECT 
    e.nom AS Estado,
    e.estpie_cod AS Codigo,
    COUNT(*) AS Quantidade
FROM dbo.vehiDespieceConcreto AS st
JOIN dbo.estpie AS e ON st.estpie_cod = e.estpie_cod
GROUP BY e.nom, e.estpie_cod
ORDER BY Quantidade DESC;

-- 8. VERIFICAR PEÇAS COM ESTADO = 1 (Almacenadas)
SELECT
    st.idPiezaDesp,
    st.idVPieza,
    st.matricula,
    st.estpie_cod,
    vp.descripcion
FROM dbo.vehiDespieceConcreto AS st
LEFT JOIN dbo.vehiPieza AS vp ON st.idVPieza = vp.idVPieza
WHERE st.estpie_cod = 1
LIMIT 10; -- Para ver apenas os primeiros 10 registros

-- 9. VISUALIZAR TODAS AS COLUNAS DA TABELA vehiDespieceConcreto (amostra)
SELECT TOP 5 * FROM dbo.vehiDespieceConcreto;

-- 10. VERIFICAR SE EXISTEM OUTRAS TABELAS RELACIONADAS
SELECT 
    TABLE_NAME
FROM INFORMATION_SCHEMA.TABLES 
WHERE TABLE_TYPE = 'BASE TABLE' 
    AND (TABLE_NAME LIKE '%pieza%' 
         OR TABLE_NAME LIKE '%vehi%' 
         OR TABLE_NAME LIKE '%stock%'
         OR TABLE_NAME LIKE '%almacen%')
ORDER BY TABLE_NAME;

-- ===== CONSULTAS PARA INTEGRAÇÃO COM AZELER =====

-- 11. DADOS NECESSÁRIOS PARA API AZELER (peças almacenadas)
SELECT
    st.idPiezaDesp    AS warehouse_id,
    st.idVPieza       AS internal_id,
    vp.descripcion    AS description,
    st.matricula      AS license_plate,
    e.nom             AS status,
    -- Adicione aqui outros campos necessários para a API
    st.* -- Temporário para ver todas as colunas disponíveis
FROM dbo.vehiDespieceConcreto AS st
JOIN dbo.estpie AS e ON st.estpie_cod = e.estpie_cod
LEFT JOIN dbo.vehiPieza AS vp ON st.idVPieza = vp.idVPieza
WHERE e.nom = 'Almacenada'
LIMIT 5; -- Para análise inicial

-- 12. VERIFICAR CAMPOS ADICIONAIS NECESSÁRIOS
-- (Execute esta consulta para ver todos os campos disponíveis)
SELECT TOP 1 * FROM dbo.vehiDespieceConcreto;
