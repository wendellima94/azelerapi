
DECLARE @warehouseID BIGINT = 2331379;

SELECT 
    -- === IDENTIFICADORES ===
    st.idPiezaDesp AS warehouseID,
    st.idVPieza AS internalPieceCode,
    st.matricula AS vehiclePlate,
    st.bastidor AS chassisNumber,
    st.idproducte AS productId,
    st.catnumber AS catalogNumber,
    st.eancode AS eanCode,

    -- === DESCRIÇÕES ===
    st.descripcion AS warehouseDescription,
    vp.descripcion AS pieceDescription,
    COALESCE(vp.descripcion, st.descripcion, 'Sin descripción') AS finalDescription,

    -- === ESTOQUE E QUANTIDADES ===
    ISNULL(st.cantidad, 0) AS currentStock,
    ISNULL(st.cantidadV, 0) AS soldQuantity,
    ISNULL(st.cantidadP, 0) AS pendingQuantity,
    ISNULL(st.cantidadR, 0) AS reservedQuantity,
    ISNULL(st.cantidadC, 0) AS purchaseQuantity,
    ISNULL(st.cantidadPC, 0) AS pendingPurchaseQuantity,
    ISNULL(st.cantidadRC, 0) AS reservedPurchaseQuantity,

    -- === PREÇOS ===
    ISNULL(st.precioV, 0) AS salePrice,
    ISNULL(st.precioF, 0) AS factoryPrice,
    ISNULL(st.precioC, 0) AS costPrice,
    ISNULL(st.precioVMil, 0) AS wholesalePrice,
    ISNULL(st.pvp, 0) AS retailPrice,
    ISNULL(vp.precio, 0) AS basePiecePrice,
    ISNULL(vp.precioFab, 0) AS pieceFactoryPrice,

    -- === REFERÊNCIAS E CÓDIGOS ===
    st.refsOEM AS oemReference,
    st.refsOE AS oeReference,
    st.refsIAM AS iamReference,
    st.refoemequ AS oemEquivalent,
    st.refiamequ AS iamEquivalent,

    -- === CARACTERÍSTICAS FÍSICAS ===
    ISNULL(st.peso, 0) AS weight,
    ISNULL(st.pesoExacto, 0) AS exactWeight,
    ISNULL(st.dimx, 0) AS dimensionX,
    ISNULL(st.dimy, 0) AS dimensionY,
    ISNULL(st.dimz, 0) AS dimensionZ,
    ISNULL(st.kms, 0) AS kilometers,
    ISNULL(vp.peso, 0) AS pieceWeight,

    -- === LOCALIZAÇÃO ===
    st.ubica AS currentLocation,
    st.ubicaant AS previousLocation,
    st.idMagatzem AS warehouseId,
    st.idSubMagatzem AS subWarehouseId,
    st.idSubSubMagatzem AS subSubWarehouseId,
    st.idSubSubMagatzemAnt AS previousSubSubWarehouseId,
    vp.zonaubicacion AS pieceZone,

    -- === DATAS ===
    st.fmod AS lastModified,
    st.falta AS createdDate,
    st.falm AS warehouseDate,
    st.fmatricVehi AS vehicleRegistrationDate,
    st.fechaetiq AS labelDate,
    st.fechadesm AS disassemblyDate,
    st.fecharevi AS reviewDate,
    st.fecsinactcrv AS inactiveDate,

    -- === ESTADO E FLAGS ===
    e.nom AS estado,
    st.estpie_cod AS statusCode,
    st.estpie_codantpedalb AS previousStatusCode,
    ISNULL(st.inactivo, 0) AS inactive,
    ISNULL(st.seleccionado, 0) AS selected,
    ISNULL(st.desmontado, 0) AS disassembled,
    ISNULL(st.revisado, 0) AS reviewed,
    ISNULL(st.actinv, 0) AS activeInventory,
    ISNULL(st.chklis, 0) AS checklist,
    ISNULL(st.preciauto, 0) AS autoPrice,
    ISNULL(st.recnue, 0) AS newRecord,
    ISNULL(st.noVendSot, 0) AS noSellUnder,
    ISNULL(st.sujrebu, 0) AS subjectToRebuild,
    ISNULL(vp.inactivo, 0) AS pieceInactive,
    ISNULL(vp.app, 0) AS appVisible,
    ISNULL(vp.desmontar, 0) AS toDisassemble,
    ISNULL(vp.predefgtm, 0) AS predefinedGtm,

    -- === OBSERVAÇÕES ===
    st.observ AS observations,
    st.obsint AS internalObservations,
    st.obsconj AS setObservations,
    st.metadatos AS metadata,
    vp.observ AS pieceObservations,
    vp.obsint AS pieceInternalObservations,

    -- === CÓDIGOS DE MOTOR E CAMBIO ===
    st.tMotor_cod AS motorCode,
    st.tCambio_cod AS gearboxCode,

    -- === IDENTIFICADORES DE MODELO E MARCA ===
    st.idModel AS modelId,
    st.idMarca AS brandId,

    -- === CÓDIGOS DE FAMÍLIA ===
    st.idVFam AS familyId,
    st.idVSubFam AS subFamilyId,
    st.idVSubSubFam AS subSubFamilyId,
    vp.idVFam AS pieceFamilyId,
    vp.idVSubFam AS pieceSubFamilyId,
    vp.idVSubSubFam AS pieceSubSubFamilyId,

    -- === CÓDIGOS EXTERNOS ===
    st.idArtCrv AS crvArticleId,
    vp.idArtCrv AS pieceCrvArticleId,
    st.idcatweb AS webCategoryId,
    vp.idcatweb AS pieceWebCategoryId,
    st.idcataexp AS exportCatalogId,
    vp.idcataexp AS pieceExportCatalogId,

    -- === OUTROS CÓDIGOS ===
    st.prove_cod AS providerCode,
    st.color_cod AS colorCode,
    st.tVe_cod AS vehicleTypeCode,

    -- === GARANTIA E QUALIDADE ===
    vp.garantia AS warranty,
    st.idvehidespcalidad AS qualityId,
    st.idmotivoestpie AS statusReasonId,

    -- === PEDIDOS E ALBARANES ===
    st.idpedidoV AS salesOrderId,
    st.serieP_codV AS salesOrderSeries,
    st.idalbaraV AS salesDeliveryId,
    st.serieA_codV AS salesDeliverySeries,
    st.idpedidoC AS purchaseOrderId,
    st.serieP_codC AS purchaseOrderSeries,
    st.idalbaraC AS purchaseDeliveryId,
    st.serieA_codC AS purchaseDeliverySeries,

    -- === EXERCÍCIOS ===
    st.ejercicioPedV AS salesOrderYear,
    st.ejercicioAlbV AS salesDeliveryYear,
    st.ejercicioPedC AS purchaseOrderYear,
    st.ejercicioAlbC AS purchaseDeliveryYear,

    -- === STATUS CALCULADOS ===
    CASE 
        WHEN ISNULL(st.cantidad, 0) = 0 THEN 'CRITICO'
        WHEN ISNULL(st.cantidad, 0) = 1 THEN 'NORMAL'
        ELSE 'ALTO'
    END as stockStatus,

    CASE 
        WHEN ISNULL(st.cantidad, 0) > 0 AND ISNULL(st.inactivo, 0) = 0 THEN 1 
        ELSE 0 
    END as isActive,

    -- === DATA DA CONSULTA ===
    GETDATE() as consultedAt

FROM dbo.vehiDespieceConcreto AS st
JOIN dbo.estpie AS e ON st.estpie_cod = e.estpie_cod
LEFT JOIN dbo.vehiPieza AS vp ON st.idVPieza = vp.idVPieza
WHERE e.nom = 'Almacenada' 
AND st.idPiezaDesp = @warehouseID;
