const dataImportService = require('../../services/data-import.service');
const webhookService = require('../../services/webhook.service');
const path = require('path');

async function importFile(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ status: 'error', error: { message: 'File required' } });
    }

    const type = req.body.type || req.query.type;
    if (!['prestadores', 'nomencladores', 'acuerdos'].includes(type)) {
      return res.status(400).json({ status: 'error', error: { message: 'type must be prestadores, nomencladores, or acuerdos' } });
    }

    let result;
    switch (type) {
      case 'prestadores':
        result = await dataImportService.importPrestadores(req.tenantId, req.file.path);
        break;
      case 'nomencladores':
        result = await dataImportService.importNomencladores(req.tenantId, req.file.path);
        break;
      case 'acuerdos':
        result = await dataImportService.importAcuerdos(req.tenantId, req.file.path);
        break;
    }

    await webhookService.dispatch(req.tenantId, 'data.imported', { type, ...result });
    res.json({ status: 'ok', data: result });
  } catch (err) {
    next(err);
  }
}

async function generateEmbeddings(req, res, next) {
  try {
    const result = await dataImportService.generateEmbeddings(req.tenantId);
    res.json({ status: 'ok', data: result });
  } catch (err) {
    next(err);
  }
}

async function exportData(req, res, next) {
  try {
    const type = req.params.type;
    if (!['prestadores', 'nomencladores', 'acuerdos'].includes(type)) {
      return res.status(400).json({ status: 'error', error: { message: 'Invalid type' } });
    }
    const data = await dataImportService.exportData(req.tenantId, type);
    res.json({ status: 'ok', data, count: data.length });
  } catch (err) {
    next(err);
  }
}

async function getStats(req, res, next) {
  try {
    const stats = await dataImportService.getImportStats(req.tenantId);
    res.json({ status: 'ok', data: stats });
  } catch (err) {
    next(err);
  }
}

module.exports = { importFile, generateEmbeddings, exportData, getStats };
