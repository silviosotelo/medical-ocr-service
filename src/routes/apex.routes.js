const express = require('express');
const router = express.Router();
const apexController = require('../controllers/apex.controller');

router.get('/pendientes-sync', apexController.obtenerPendientesSinc);

router.post('/:id/sincronizar', apexController.sincronizarAprobada);

router.post('/sincronizar-bulk', apexController.sincronizarBulk);

router.get('/buscar/nomenclador', apexController.buscarNomenclador);

router.get('/buscar/prestador', apexController.buscarPrestador);

router.get('/buscar/acuerdo', apexController.verificarAcuerdo);

router.get('/estadisticas', apexController.estadisticas);

module.exports = router;
