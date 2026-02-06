const ExcelJS = require('exceljs');
const { query, transaction } = require('../config/database.config');
const logger = require('../config/logger.config');
const embeddingService = require('./embedding.service');

class DataImportService {
  async importPrestadores(tenantId, filePath) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const sheet = workbook.worksheets[0];

    const headers = [];
    sheet.getRow(1).eachCell((cell, colNumber) => {
      headers[colNumber] = String(cell.value || '').trim().toLowerCase();
    });

    let imported = 0;
    let errors = [];

    for (let r = 2; r <= sheet.rowCount; r++) {
      try {
        const row = sheet.getRow(r);
        const data = {};
        row.eachCell((cell, colNumber) => {
          data[headers[colNumber]] = cell.value;
        });

        const nombre = data['nombre'] || data['prestador'] || data['razon_social'] || '';
        const matricula = data['matricula_nacional'] || data['matricula'] || data['mn'] || '';
        const especialidad = data['especialidad'] || '';
        const tipo = data['tipo'] || data['tipo_prestador'] || '';

        if (!nombre) continue;

        await query(
          `INSERT INTO prestadores (tenant_id, nombre, matricula_nacional, especialidad, tipo_prestador, estado)
           VALUES ($1, $2, $3, $4, $5, 'ACTIVO')
           ON CONFLICT (matricula_nacional) DO UPDATE SET
             nombre = EXCLUDED.nombre,
             especialidad = EXCLUDED.especialidad,
             tipo_prestador = EXCLUDED.tipo_prestador,
             tenant_id = COALESCE(EXCLUDED.tenant_id, prestadores.tenant_id)`,
          [tenantId, nombre, matricula || `AUTO-${r}`, especialidad, tipo]
        );
        imported++;
      } catch (err) {
        errors.push({ row: r, error: err.message });
      }
    }

    logger.info('Prestadores imported', { tenantId, imported, errors: errors.length });
    return { imported, errors };
  }

  async importNomencladores(tenantId, filePath) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const sheet = workbook.worksheets[0];

    const headers = [];
    sheet.getRow(1).eachCell((cell, colNumber) => {
      headers[colNumber] = String(cell.value || '').trim().toLowerCase();
    });

    let imported = 0;
    let errors = [];

    for (let r = 2; r <= sheet.rowCount; r++) {
      try {
        const row = sheet.getRow(r);
        const data = {};
        row.eachCell((cell, colNumber) => {
          data[headers[colNumber]] = cell.value;
        });

        const codigo = String(data['codigo'] || data['cod'] || data['codigo_nomenclador'] || '').trim();
        const descripcion = data['descripcion'] || data['practica'] || data['detalle'] || '';

        if (!codigo || !descripcion) continue;

        await query(
          `INSERT INTO nomencladores (tenant_id, codigo, descripcion, tipo, estado)
           VALUES ($1, $2, $3, $4, 'ACTIVO')
           ON CONFLICT (codigo) DO UPDATE SET
             descripcion = EXCLUDED.descripcion,
             tenant_id = COALESCE(EXCLUDED.tenant_id, nomencladores.tenant_id)`,
          [tenantId, codigo, descripcion, data['tipo'] || 'GENERAL']
        );
        imported++;
      } catch (err) {
        errors.push({ row: r, error: err.message });
      }
    }

    logger.info('Nomencladores imported', { tenantId, imported, errors: errors.length });
    return { imported, errors };
  }

  async importAcuerdos(tenantId, filePath) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const sheet = workbook.worksheets[0];

    const headers = [];
    sheet.getRow(1).eachCell((cell, colNumber) => {
      headers[colNumber] = String(cell.value || '').trim().toLowerCase();
    });

    let imported = 0;
    let errors = [];

    for (let r = 2; r <= sheet.rowCount; r++) {
      try {
        const row = sheet.getRow(r);
        const data = {};
        row.eachCell((cell, colNumber) => {
          data[headers[colNumber]] = cell.value;
        });

        const codigoNom = String(data['codigo'] || data['codigo_nomenclador'] || data['cod'] || '').trim();
        const precioAcuerdo = parseFloat(data['precio_acuerdo'] || data['precio'] || data['monto'] || 0);
        const prestadorId = data['prestador_id'] || null;

        if (!codigoNom) continue;

        const nomResult = await query(
          'SELECT id FROM nomencladores WHERE codigo = $1 AND (tenant_id = $2 OR tenant_id IS NULL) LIMIT 1',
          [codigoNom, tenantId]
        );

        const nomencladorId = nomResult.rows[0]?.id;
        if (!nomencladorId) {
          errors.push({ row: r, error: `Nomenclador not found: ${codigoNom}` });
          continue;
        }

        await query(
          `INSERT INTO acuerdos_prestador (tenant_id, nomenclador_id, prestador_id, precio_acuerdo, estado)
           VALUES ($1, $2, $3, $4, 'ACTIVO')
           ON CONFLICT (nomenclador_id, prestador_id) DO UPDATE SET
             precio_acuerdo = EXCLUDED.precio_acuerdo,
             tenant_id = COALESCE(EXCLUDED.tenant_id, acuerdos_prestador.tenant_id)`,
          [tenantId, nomencladorId, prestadorId, precioAcuerdo]
        );
        imported++;
      } catch (err) {
        errors.push({ row: r, error: err.message });
      }
    }

    logger.info('Acuerdos imported', { tenantId, imported, errors: errors.length });
    return { imported, errors };
  }

  async generateEmbeddings(tenantId) {
    const nomResult = await query(
      `SELECT id, codigo, descripcion FROM nomencladores
       WHERE (tenant_id = $1 OR tenant_id IS NULL) AND embedding IS NULL
       LIMIT 500`,
      [tenantId]
    );

    if (nomResult.rowCount === 0) return { generated: 0 };

    const texts = nomResult.rows.map((r) => `${r.codigo} ${r.descripcion}`);
    let generated = 0;

    const batchSize = 100;
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const ids = nomResult.rows.slice(i, i + batchSize).map((r) => r.id);

      try {
        const embeddings = await embeddingService.generateBatchEmbeddings(batch);

        for (let j = 0; j < embeddings.length; j++) {
          const vecStr = `[${embeddings[j].join(',')}]`;
          await query('UPDATE nomencladores SET embedding = $1 WHERE id = $2', [vecStr, ids[j]]);
          generated++;
        }
      } catch (err) {
        logger.warn('Embedding batch failed', { error: err.message, batch: i });
      }
    }

    logger.info('Embeddings generated', { tenantId, generated, total: nomResult.rowCount });
    return { generated, total: nomResult.rowCount };
  }

  async exportData(tenantId, type) {
    let result;
    switch (type) {
      case 'prestadores':
        result = await query(
          'SELECT * FROM prestadores WHERE tenant_id = $1 ORDER BY nombre',
          [tenantId]
        );
        break;
      case 'nomencladores':
        result = await query(
          'SELECT id, codigo, descripcion, tipo, estado, created_at FROM nomencladores WHERE (tenant_id = $1 OR tenant_id IS NULL) ORDER BY codigo',
          [tenantId]
        );
        break;
      case 'acuerdos':
        result = await query(
          `SELECT ap.*, n.codigo, n.descripcion as nom_descripcion, p.nombre as prestador_nombre
           FROM acuerdos_prestador ap
           LEFT JOIN nomencladores n ON n.id = ap.nomenclador_id
           LEFT JOIN prestadores p ON p.id = ap.prestador_id
           WHERE ap.tenant_id = $1
           ORDER BY n.codigo`,
          [tenantId]
        );
        break;
      default: {
        const err = new Error('Invalid export type');
        err.statusCode = 400;
        throw err;
      }
    }

    return result.rows;
  }

  async getImportStats(tenantId) {
    const result = await query(`
      SELECT
        (SELECT COUNT(*) FROM prestadores WHERE tenant_id = $1) as prestadores,
        (SELECT COUNT(*) FROM nomencladores WHERE tenant_id = $1 OR tenant_id IS NULL) as nomencladores,
        (SELECT COUNT(*) FROM nomencladores WHERE (tenant_id = $1 OR tenant_id IS NULL) AND embedding IS NOT NULL) as nom_with_embeddings,
        (SELECT COUNT(*) FROM acuerdos_prestador WHERE tenant_id = $1) as acuerdos
    `, [tenantId]);

    return result.rows[0];
  }
}

module.exports = new DataImportService();
