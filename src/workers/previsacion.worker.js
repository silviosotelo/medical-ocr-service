const fs = require('fs').promises;
const path = require('path');
const { query } = require('../config/database.config');
const gptVisionService = require('../services/gpt-vision.service');
const pdfService = require('../services/pdf.service');
const preVisacionService = require('../services/pre-visacion.service');
const webhookService = require('../services/webhook.service');
const jobQueueService = require('../services/job-queue.service');
const ragService = require('../services/rag.service');
const logger = require('../config/logger.config');

class PrevisacionWorker {
  constructor() {
    jobQueueService.registerHandler('previsacion', this.process.bind(this));
    logger.info('PrevisacionWorker registered handler');
  }

  async process(job) {
    const startTime = Date.now();
    const {
      id_externo,
      archivo_base64,
      archivo_nombre,
      archivo_tipo,
      metadata,
      tenant_id,
      webhook_url,
    } = job.payload;

    const jobId = job.id;
    let tempFilePath = null;

    try {
      // 1. Decode base64 to buffer and save temp file
      const buffer = Buffer.from(archivo_base64, 'base64');
      const ext = path.extname(archivo_nombre || '.jpg').toLowerCase() || '.jpg';
      tempFilePath = path.join('/tmp', `ocr_${jobId}${ext}`);
      await fs.writeFile(tempFilePath, buffer);

      logger.info('Previsacion job: file saved', { jobId, tempFilePath, size: buffer.length });

      // 2. If PDF, convert to image
      let imagePath = tempFilePath;
      if (ext === '.pdf' || archivo_tipo === 'application/pdf') {
        const converted = await pdfService.convertToImage(tempFilePath);
        imagePath = typeof converted === 'string' ? converted : converted.imagePath || converted;
      }

      // 3. Generate RAG context (top nomencladores + prestadores) and call GPT Vision
      let contextoRAG = '';
      try {
        contextoRAG = await ragService.generarContextoGeneral(tenant_id);
      } catch (ragErr) {
        logger.warn('RAG context generation failed, continuing without it', { jobId, error: ragErr.message });
      }
      const resultadoIA = await gptVisionService.processOrder(imagePath, {
        planId: metadata?.plan_id,
        contextoRAG,
      });

      // 3b. Fallback: extraer practicas narrativas si GPT-4o devolvio practicas vacías
      if (!resultadoIA.practicas || resultadoIA.practicas.length === 0) {
        var textoObs = (resultadoIA.observaciones_ia && resultadoIA.observaciones_ia.texto_completo) || "";
        var practicasNarrativa = this._extraerPracticasNarrativa(textoObs);
        if (practicasNarrativa.length > 0) {
          resultadoIA.practicas = practicasNarrativa;
          if (!resultadoIA.metadatos_ia) { resultadoIA.metadatos_ia = {}; }
          if (!resultadoIA.metadatos_ia.advertencias) { resultadoIA.metadatos_ia.advertencias = []; }
          resultadoIA.metadatos_ia.advertencias.push("Practicas inferidas de texto narrativo - requieren confirmacion del auditor");
          logger.info("Practicas extraidas de texto narrativo", { jobId: jobId, practicas: practicasNarrativa.length });
        }
      }

      // 4. Save in ordenes_procesadas (with tenant_id)
      const ordenResult = await query(
        `INSERT INTO ordenes_procesadas (archivo_nombre, archivo_tipo, resultado_ia, modelo_usado, tokens_usados, tiempo_procesamiento_ms, confianza_promedio, tenant_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [
          archivo_nombre,
          archivo_tipo || 'image/jpeg',
          JSON.stringify(resultadoIA),
          resultadoIA.metadata?.modelo || 'gpt-4o',
          resultadoIA.metadata?.tokens_usados || 0,
          resultadoIA.metadata?.tiempo_procesamiento_ms || 0,
          resultadoIA.metadata?.confianza_general || 0,
          tenant_id || null,
        ]
      );

      const ordenId = ordenResult.rows[0].id;

      // 5. Generate pre-visacion (with tenant_id)
      const preVisacion = await preVisacionService.generarPreVisacion(ordenId, resultadoIA, tenant_id);

      // 6. Save result in ingestion_jobs.resultado
      const processingTime = Date.now() - startTime;
      const resultado = {
        id_visacion_previa: preVisacion.id_visacion_previa,
        orden_procesada_id: ordenId,
        confianza_general: preVisacion.confianza_general,
        items: preVisacion.detalles?.length || 0,
        processing_time_ms: processingTime,
      };

      // 7. Dispatch webhook: previsacion.generada
      const webhookPayload = {
        batch_id: job.batch_id,
        job_id: jobId,
        id_externo_orden: id_externo,
        id_visacion_previa: preVisacion.id_visacion_previa,
        estado: 'PENDIENTE',
        confianza_general: preVisacion.confianza_general,
        requiere_revision: preVisacion.requiere_revision,
        cabecera: {
          paciente: {
            ci: preVisacion.paciente?.ci || null,
            nombre: preVisacion.paciente?.nombre || null,
            fecha_nacimiento: preVisacion.paciente?.fecha_nacimiento || null,
          },
          medico: {
            nombre: preVisacion.medico?.nombre || null,
            matricula: preVisacion.medico?.matricula || null,
            id_prestador_encontrado: preVisacion.medico?.id_prestador || null,
            confianza: preVisacion.medico?.confianza || 0,
          },
          prestador_emisor: {
            nombre_original: preVisacion.prestador_sugerido ? null : resultadoIA.prestador_emisor?.nombre || null,
            id_prestador_encontrado: preVisacion.prestador_sugerido?.id_prestador || null,
            nombre_fantasia: preVisacion.prestador_sugerido?.nombre_fantasia || null,
            ruc: preVisacion.prestador_sugerido?.ruc || null,
            confianza: preVisacion.prestador_sugerido?.confianza || 0,
          },
          fecha_orden: preVisacion.fecha_orden || null,
          diagnostico: {
            descripcion: preVisacion.diagnostico?.descripcion || null,
            codigo_cie10: preVisacion.diagnostico?.codigo_cie10 || null,
          },
        },
        detalle_practicas: (preVisacion.detalles || []).map(d => ({
          item: d.item,
          descripcion_original: d.descripcion,
          cantidad: d.nomenclador?.cantidad || 1,
          nomenclador_sugerido: d.nomenclador ? {
            id_nomenclador: d.nomenclador.id_externo || null,
            id_externo: d.nomenclador.id_externo || null,
            descripcion: d.nomenclador.descripcion || null,
            especialidad: d.nomenclador.especialidad || null,
            grupo: d.nomenclador.grupo || null,
            subgrupo: d.nomenclador.subgrupo || null,
          } : null,
          confianza: d.confianza || 0,
          tiene_acuerdo: d.tiene_acuerdo || false,
          precio_acuerdo: d.precio_acuerdo || null,
          matches_alternativos: (d.matches_alternativos || []).map(m => ({
            id_nomenclador: m.id_nomenclador,
            descripcion: m.descripcion,
            similitud: m.similitud || m.especialidad_similitud || 0,
          })),
        })),
        alertas: resultadoIA.metadatos_ia?.advertencias || [],
        observaciones_ia: preVisacion.observaciones_ia || '',
        ia_metadata: {
          modelo_usado: resultadoIA.metadata?.modelo || 'gpt-4o',
          tokens_usados: resultadoIA.metadata?.tokens_usados || 0,
          tiempo_procesamiento_ms: processingTime,
        },
      };

      if (tenant_id) {
        if (webhookService.dispatchWithRetry) {
          await webhookService.dispatchWithRetry(tenant_id, 'previsacion.generada', webhookPayload);
        } else {
          await webhookService.dispatch(tenant_id, 'previsacion.generada', webhookPayload);
        }
      }

      // 8. Cleanup temp file
      await this._cleanupTempFile(tempFilePath);
      if (imagePath !== tempFilePath) {
        await this._cleanupTempFile(imagePath);
      }

      logger.info('Previsacion job completed', {
        jobId,
        idVisacion: preVisacion.id_visacion_previa,
        processingTimeMs: processingTime,
      });

      return resultado;
    } catch (error) {
      logger.error('Previsacion job failed', {
        jobId,
        error: error.message,
        stack: error.stack,
      });

      // Cleanup temp file on error
      await this._cleanupTempFile(tempFilePath);

      // Check if max retries reached - dispatch failure webhook
      const jobStatus = await jobQueueService.getJobStatus(jobId);
      if (jobStatus && jobStatus.intentos >= jobStatus.max_intentos) {
        if (tenant_id) {
          const failPayload = {
            batch_id: job.batch_id,
            job_id: jobId,
            id_externo_orden: id_externo,
            error: error.message,
            intentos: jobStatus.intentos,
          };

          try {
            if (webhookService.dispatchWithRetry) {
              await webhookService.dispatchWithRetry(tenant_id, 'previsacion.fallida', failPayload);
            } else {
              await webhookService.dispatch(tenant_id, 'previsacion.fallida', failPayload);
            }
          } catch (webhookError) {
            logger.error('Failed to dispatch failure webhook', { error: webhookError.message });
          }
        }
      }

      throw error;
    }
  }

  _extraerPracticasNarrativa(texto) {
    if (!texto || texto.trim().length < 5) { return []; }
    var PROCS = [
      { re: /radioterapia|RT/i,                            desc: "RADIOTERAPIA" },
      { re: /quimioterapia|QTx|QT/i,                desc: "QUIMIOTERAPIA" },
      { re: /inmunoterapia|IT/i,                          desc: "INMUNOTERAPIA" },
      { re: /hormonoterapia|HT/i,                         desc: "HORMONOTERAPIA" },
      { re: /cirug[iI]a|Cx|QX/i,                   desc: "CIRUGIA" },
      { re: /laparoscop[iI]a|LAP/i,                      desc: "LAPAROSCOPIA" },
      { re: /biopsia|Bx/i,                               desc: "BIOPSIA" },
      { re: /puncion lumbar|PL/i,                         desc: "PUNCION LUMBAR" },
      { re: /VEDA|video endoscopia/i,                     desc: "VIDEO ENDOSCOPIA DIGESTIVA ALTA" },
      { re: /colonoscopia|VCC/i,                          desc: "VIDEO COLONOSCOPIA" },
      { re: /ecocardiograma|ECOCG/i,                     desc: "ECOCARDIOGRAMA" },
      { re: /holter/i,                                    desc: "HOLTER" },
      { re: /ergometr[iI]a|prueba de esfuerzo/i,               desc: "ERGOMETRIA" },
      { re: /espirometr[iI]a|PFR/i,                      desc: "ESPIROMETRIA" },
      { re: /densitometr[iI]a/i,                               desc: "DENSITOMETRIA OSEA" },
      { re: /mamograf[iI]a/i,                                  desc: "MAMOGRAFIA" },
      { re: /papanicolau|PAP/i,                          desc: "PAPANICOLAU" },
      { re: /electromiograf[iI]a|EMG/i,                  desc: "ELECTROMIOGRAFIA" },
      { re: /electroencefalograma|EEG/i,                 desc: "ELECTROENCEFALOGRAMA" },
    ];
    var practicas = []; var vistos = {};
    for (var i = 0; i < PROCS.length; i++) {
      var p = PROCS[i];
      if (p.re.test(texto) && !vistos[p.desc]) {
        vistos[p.desc] = true;
        practicas.push({ descripcion: p.desc, descripcion_original: p.desc,
          cantidad: 1, codigo_sugerido: null, nomenclador: null, confianza: 0.6,
          prestador_ejecutor: null });
      }
    }
    return practicas;
  }

  async _cleanupTempFile(filePath) {
    if (!filePath) return;
    try {
      await fs.unlink(filePath);
    } catch (e) {
      // Ignore - file may already be cleaned up
    }
  }
}

module.exports = new PrevisacionWorker();
