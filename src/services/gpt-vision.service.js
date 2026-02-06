const openai = require('../config/openai.config');
const logger = require('../config/logger.config');
const { retryWithBackoff } = require('../utils/retry');
const { trackTokenUsage } = require('../utils/metrics');
const { OPENAI } = require('../utils/constants');
const SYSTEM_PROMPT = require('../prompts/system.prompt');
const generateUserPrompt = require('../prompts/user.prompt.template');
const imageService = require('./image.service');
const pdfService = require('./pdf.service');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class GPTVisionService {
  async processOrder(imagePath, opciones = {}) {
    const startTime = Date.now();

    try {
      logger.info('Procesando orden con GPT-4o Vision', { imagePath });

      const imageBuffer = await fs.readFile(imagePath);
      const hash = crypto.createHash('sha256').update(imageBuffer).digest('hex');

      let base64Image;
      let mimeType = this.getMimeType(imagePath);

      if (mimeType === 'application/pdf') {
        const pdfResult = await pdfService.convertToImage(imagePath);
        const imgBuffer = await fs.readFile(pdfResult.imagePath);
        base64Image = imgBuffer.toString('base64');
        mimeType = 'image/jpeg';
        try { await fs.unlink(pdfResult.imagePath); } catch (e) { /* ignore */ }
      } else {
        const processed = await imageService.processImage(imageBuffer);
        base64Image = processed.base64 || imageBuffer.toString('base64');
        mimeType = processed.mimeType || mimeType;
      }

      const contextoRAG = opciones.contextoRAG || '';
      const userPrompt = generateUserPrompt({
        ...opciones,
        contextoRAG
      });

      const response = await retryWithBackoff(
        async () => {
          return await openai.chat.completions.create({
            model: process.env.FINE_TUNED_MODEL || OPENAI.MODEL,
            messages: [
              {
                role: 'system',
                content: SYSTEM_PROMPT
              },
              {
                role: 'user',
                content: [
                  {
                    type: 'text',
                    text: userPrompt
                  },
                  {
                    type: 'image_url',
                    image_url: {
                      url: `data:${mimeType};base64,${base64Image}`,
                      detail: OPENAI.DETAIL_LEVEL
                    }
                  }
                ]
              }
            ],
            max_tokens: OPENAI.MAX_TOKENS,
            temperature: OPENAI.TEMPERATURE,
            response_format: { type: 'json_object' }
          });
        },
        OPENAI.RETRY_ATTEMPTS,
        OPENAI.RETRY_DELAY_MS
      );

      const processingTime = Date.now() - startTime;
      const content = response.choices[0].message.content;

      let parsedData;
      try {
        parsedData = JSON.parse(content);
      } catch (parseError) {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsedData = JSON.parse(jsonMatch[0]);
        } else {
          logger.error('GPT-4o devolvió JSON inválido', { content });
          throw new Error('IA devolvió respuesta inválida');
        }
      }

      trackTokenUsage({
        promptTokens: response.usage.prompt_tokens,
        completionTokens: response.usage.completion_tokens,
        totalTokens: response.usage.total_tokens,
        model: response.model,
        processingTimeMs: processingTime
      });

      const resultado = this.normalizarResultado(parsedData);
      const confianzaGeneral = this.calcularConfianza(resultado, parsedData);

      logger.info('Orden procesada exitosamente', {
        processingTimeMs: processingTime,
        tokensUsed: response.usage.total_tokens,
        confianza: confianzaGeneral,
        tipoEscritura: parsedData?.metadatos?.tipo_escritura,
        practicas: resultado.practicas?.length || 0
      });

      return {
        ...resultado,
        metadatos_ia: parsedData.metadatos || {},
        observaciones_ia: parsedData.observaciones || {},
        resultado_completo: parsedData,
        hash_imagen: hash,
        metadata: {
          modelo: response.model,
          tokens_prompt: response.usage.prompt_tokens,
          tokens_completion: response.usage.completion_tokens,
          tokens_usados: response.usage.total_tokens,
          tiempo_procesamiento_ms: processingTime,
          confianza_general: confianzaGeneral,
          finish_reason: response.choices[0].finish_reason,
          timestamp: new Date().toISOString()
        }
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      logger.error('Error procesando orden con GPT Vision', {
        error: error.message,
        stack: error.stack,
        processingTimeMs: processingTime
      });

      if (error.status === 429) {
        throw new Error('Rate limit excedido en OpenAI - intente nuevamente en unos segundos');
      }
      if (error.status === 400) {
        throw new Error('Imagen inválida para OpenAI API - verifique el formato');
      }
      if (error.status === 401) {
        throw new Error('API Key de OpenAI inválida o expirada');
      }

      throw error;
    }
  }

  normalizarResultado(parsedData) {
    const cabecera = parsedData.cabecera || {};
    const detalle = parsedData.detalle_practicas || [];

    const paciente = cabecera.paciente || parsedData.paciente || {};
    const medico = cabecera.medico || parsedData.prestador || {};
    const practicasRaw = detalle.length > 0 ? detalle : (parsedData.practicas || []);

    return {
      paciente: {
        nombre: paciente.nombre || null,
        ci: paciente.identificacion?.replace(/[.-]/g, '') || paciente.ci?.replace(/[.-]/g, '') || null,
        tipo_identificacion: paciente.tipo_identificacion || 'CI',
        edad: paciente.edad || null,
        sexo: paciente.sexo || null,
        numero_afiliado: paciente.numero_afiliado || null
      },
      prestador_emisor: {
        nombre: medico.nombre || null,
        matricula: medico.matricula || null,
        especialidad: medico.especialidad_inferida || medico.especialidad || null,
        ruc: medico.ruc || null
      },
      medico_solicitante: {
        nombre_completo: medico.nombre || null,
        matricula_nacional: medico.matricula || null,
        especialidad: medico.especialidad_inferida || medico.especialidad || null
      },
      fecha_orden: cabecera.fecha_emision || parsedData.fecha_orden || null,
      diagnostico: {
        descripcion: cabecera.diagnostico_presuntivo || (typeof parsedData.diagnostico === 'string' ? parsedData.diagnostico : parsedData.diagnostico?.descripcion) || null,
        codigo_cie10: parsedData.diagnostico?.codigo_cie10 || null
      },
      institucion: cabecera.institucion_solicitante || null,
      practicas: practicasRaw.map(p => ({
        descripcion: p.descripcion,
        descripcion_original: p.descripcion,
        cantidad: p.cantidad || 1,
        codigo_sugerido: p.codigo_sugerido || null,
        nomenclador: p.nomenclador || null,
        confianza: p.confianza || 0.8,
        prestador_ejecutor: p.prestador_ejecutor || null
      })),
      orden: {
        fecha_emision: cabecera.fecha_emision || parsedData.fecha_orden || null
      }
    };
  }

  calcularConfianza(resultado, parsedData) {
    if (parsedData?.metadatos?.confianza_ia) {
      return parsedData.metadatos.confianza_ia;
    }

    let score = 0;
    let total = 0;

    const checks = [
      { val: resultado.paciente?.nombre, weight: 2 },
      { val: resultado.paciente?.ci, weight: 2 },
      { val: resultado.prestador_emisor?.nombre, weight: 1.5 },
      { val: resultado.prestador_emisor?.matricula, weight: 1 },
      { val: resultado.fecha_orden, weight: 0.5 },
      { val: resultado.diagnostico?.descripcion, weight: 0.5 },
      { val: resultado.practicas?.length > 0, weight: 3 }
    ];

    for (const check of checks) {
      total += check.weight;
      if (check.val) score += check.weight;
    }

    if (resultado.practicas?.length > 0) {
      const avgPracticaConf = resultado.practicas.reduce((sum, p) => sum + (p.confianza || 0.8), 0) / resultado.practicas.length;
      score += avgPracticaConf * 2;
      total += 2;
    }

    const legibilidad = parsedData?.metadatos?.legibilidad;
    if (legibilidad === 'BAJA') score *= 0.7;
    else if (legibilidad === 'MEDIA') score *= 0.85;

    return Math.min(Math.round((score / total) * 100) / 100, 1.0);
  }

  getMimeType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.pdf': 'application/pdf'
    };
    return mimeTypes[ext] || 'image/jpeg';
  }
}

module.exports = new GPTVisionService();
