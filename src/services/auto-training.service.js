const openai = require('../config/openai.config');
const { query, transaction } = require('../config/database.config');
const logger = require('../config/logger.config');
const fs = require('fs-extra');
const path = require('path');
const SYSTEM_PROMPT = require('../prompts/system.prompt');

class AutoTrainingService {
  constructor() {
    this.minExamplesForTraining = parseInt(process.env.MIN_TRAINING_EXAMPLES || '50');
    this.autoTrainingEnabled = process.env.AUTO_TRAINING_ENABLED === 'true';
    this.trainingCheckInterval = 24 * 60 * 60 * 1000;
    this.trainingDir = process.env.TRAINING_DIR || './training-data';
    this._currentModel = process.env.FINE_TUNED_MODEL || null;
  }

  getCurrentModel() {
    return this._currentModel;
  }

  async start() {
    if (!this.autoTrainingEnabled) {
      logger.info('Auto-training is disabled');
      return;
    }

    logger.info('Auto-training service started', {
      minExamples: this.minExamplesForTraining,
      checkInterval: this.trainingCheckInterval / 1000 / 60 / 60 + ' hours'
    });

    setInterval(() => {
      this.verificarYEntrenar();
    }, this.trainingCheckInterval);

    setTimeout(() => this.verificarYEntrenar(), 10000);
  }

  async verificarYEntrenar() {
    try {
      const countResult = await query(`
        SELECT COUNT(*) as total
        FROM ordenes_procesadas op
        WHERE op.validado = true
          AND NOT EXISTS (
            SELECT 1 FROM training_datasets td
            JOIN finetune_jobs fj ON fj.training_dataset_id = td.id
            WHERE fj.estado = 'succeeded'
              AND op.created_at <= fj.completado_en
          )
      `);

      const matchFeedbackResult = await query(`
        SELECT COUNT(*) as total
        FROM feedback_matching fm
        WHERE fm.incluir_en_training = true
          AND fm.usado_en_training = false
      `);

      const ejemplosOCR = parseInt(countResult.rows[0].total);
      const ejemplosMatching = parseInt(matchFeedbackResult.rows[0].total);
      const totalEjemplos = ejemplosOCR + ejemplosMatching;

      logger.info('Training check', {
        ejemplosOCR,
        ejemplosMatching,
        totalEjemplos,
        minRequerido: this.minExamplesForTraining
      });

      if (totalEjemplos >= this.minExamplesForTraining) {
        logger.info('Sufficient examples for training, starting automatic fine-tune');
        await this.ejecutarTrainingCompleto();
      }

    } catch (error) {
      logger.error('Error in training check', {
        error: error.message,
        stack: error.stack
      });
    }
  }

  async ejecutarTrainingCompleto() {
    try {
      logger.info('Starting complete training cycle');

      const datasetId = await this.generarDataset();
      logger.info('Dataset generated', { datasetId });

      const validacion = await this.validarDataset(datasetId);
      if (!validacion.valid) {
        logger.error('Dataset validation failed', { errores: validacion.errores });
        await query(
          "UPDATE training_datasets SET estado = 'validation_failed' WHERE id = $1",
          [datasetId]
        );
        return null;
      }
      logger.info('Dataset validated', { ejemplos: validacion.ejemplos });

      const costoEstimado = this.estimarCosto(validacion.tokensEstimados);
      logger.info('Estimated training cost', { costoEstimado });

      const openaiFileId = await this.subirDatasetOpenAI(datasetId);
      logger.info('Dataset uploaded to OpenAI', { openaiFileId });

      const jobId = await this.crearFineTuneJob(datasetId, openaiFileId);
      logger.info('Fine-tune job created', { jobId });

      this.monitorearFineTuneJob(jobId);

      return jobId;

    } catch (error) {
      logger.error('Complete training cycle failed', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  async generarDataset() {
    return await transaction(async (client) => {
      const datasetResult = await client.query(`
        INSERT INTO training_datasets (nombre, descripcion, estado)
        VALUES ($1, $2, 'generating')
        RETURNING id
      `, [
        `dataset_${Date.now()}`,
        `Auto-generated training dataset at ${new Date().toISOString()}`
      ]);

      const datasetId = datasetResult.rows[0].id;

      const ordenesResult = await client.query(`
        SELECT
          op.id,
          op.resultado_ia,
          op.correccion_humana,
          op.archivo_url
        FROM ordenes_procesadas op
        WHERE op.validado = true
          AND NOT EXISTS (
            SELECT 1 FROM training_datasets td
            JOIN finetune_jobs fj ON fj.training_dataset_id = td.id
            WHERE fj.estado = 'succeeded'
              AND op.created_at <= fj.completado_en
          )
        ORDER BY op.created_at DESC
        LIMIT 500
      `);

      const matchFeedbackResult = await client.query(`
        SELECT
          fm.id_feedback,
          fm.descripcion_original,
          fm.id_correcto,
          fm.tipo,
          n.descripcion as nomenclador_correcto,
          n.especialidad,
          p.nombre_fantasia as prestador_correcto
        FROM feedback_matching fm
        LEFT JOIN nomencladores n ON n.id_nomenclador = fm.id_correcto AND fm.tipo = 'nomenclador'
        LEFT JOIN prestadores p ON p.id_prestador = fm.id_correcto AND fm.tipo = 'prestador'
        WHERE fm.incluir_en_training = true
          AND fm.usado_en_training = false
        ORDER BY fm.created_at DESC
        LIMIT 500
      `);

      const ordenes = ordenesResult.rows;
      const matchFeedback = matchFeedbackResult.rows;

      logger.info('Generating training examples', {
        datasetId,
        ordenesCount: ordenes.length,
        matchFeedbackCount: matchFeedback.length
      });

      await fs.ensureDir(this.trainingDir);
      const jsonlPath = path.join(this.trainingDir, `dataset_${datasetId}.jsonl`);
      const writeStream = fs.createWriteStream(jsonlPath);

      let ejemplosGenerados = 0;

      for (const orden of ordenes) {
        try {
          const ejemplo = this.generarEjemploOCR(orden);
          if (ejemplo) {
            writeStream.write(JSON.stringify(ejemplo) + '\n');
            ejemplosGenerados++;
          }
        } catch (error) {
          logger.warn('Failed to generate OCR training example', {
            ordenId: orden.id,
            error: error.message
          });
        }
      }

      for (const feedback of matchFeedback) {
        try {
          const ejemplo = this.generarEjemploMatching(feedback);
          if (ejemplo) {
            writeStream.write(JSON.stringify(ejemplo) + '\n');
            ejemplosGenerados++;
          }
        } catch (error) {
          logger.warn('Failed to generate matching training example', {
            feedbackId: feedback.id_feedback,
            error: error.message
          });
        }
      }

      writeStream.end();

      await new Promise((resolve, reject) => {
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
      });

      const stats = await fs.stat(jsonlPath);

      await client.query(`
        UPDATE training_datasets
        SET
          total_ejemplos = $1,
          ejemplos_validados = $1,
          fecha_generacion = NOW(),
          archivo_jsonl_url = $2,
          archivo_size_bytes = $3,
          estado = 'ready'
        WHERE id = $4
      `, [ejemplosGenerados, jsonlPath, stats.size, datasetId]);

      if (matchFeedback.length > 0) {
        const feedbackIds = matchFeedback.map(f => f.id_feedback);
        await client.query(`
          UPDATE feedback_matching
          SET usado_en_training = true, fecha_usado_training = NOW()
          WHERE id_feedback = ANY($1)
        `, [feedbackIds]);
      }

      logger.info('Dataset file generated', {
        datasetId,
        ejemplos: ejemplosGenerados,
        sizeKB: Math.round(stats.size / 1024)
      });

      return datasetId;
    });
  }

  generarEjemploOCR(orden) {
    const datosFinales = orden.correccion_humana || orden.resultado_ia;

    if (!datosFinales) {
      return null;
    }

    return {
      messages: [
        {
          role: "system",
          content: SYSTEM_PROMPT
        },
        {
          role: "user",
          content: "Analiza esta orden médica y extrae toda la información estructurada en formato JSON."
        },
        {
          role: "assistant",
          content: JSON.stringify(datosFinales)
        }
      ]
    };
  }

  generarEjemploMatching(feedback) {
    if (!feedback.descripcion_original) {
      return null;
    }

    const tipo = feedback.tipo;
    let userContent;
    let assistantContent;

    if (tipo === 'nomenclador' && feedback.nomenclador_correcto) {
      userContent = `Identifica el nomenclador correcto para la siguiente práctica médica extraída de una orden:\n\nPráctica: "${feedback.descripcion_original}"`;
      assistantContent = JSON.stringify({
        id_nomenclador: feedback.id_correcto,
        descripcion: feedback.nomenclador_correcto,
        especialidad: feedback.especialidad || null,
        confianza: 1.0
      });
    } else if (tipo === 'prestador' && feedback.prestador_correcto) {
      userContent = `Identifica el prestador correcto para el siguiente nombre extraído de una orden:\n\nPrestador: "${feedback.descripcion_original}"`;
      assistantContent = JSON.stringify({
        id_prestador: feedback.id_correcto,
        nombre: feedback.prestador_correcto,
        confianza: 1.0
      });
    } else {
      return null;
    }

    return {
      messages: [
        {
          role: "system",
          content: "Eres un experto en matching de nomencladores y prestadores médicos en el sistema de salud de Paraguay. Dado un texto extraído de una orden médica, identifica el registro correcto de la base de datos."
        },
        {
          role: "user",
          content: userContent
        },
        {
          role: "assistant",
          content: assistantContent
        }
      ]
    };
  }

  async validarDataset(datasetId) {
    try {
      const result = await query(
        'SELECT archivo_jsonl_url, total_ejemplos FROM training_datasets WHERE id = $1',
        [datasetId]
      );

      const archivoPath = result.rows[0].archivo_jsonl_url;
      const content = await fs.readFile(archivoPath, 'utf8');
      const lines = content.trim().split('\n').filter(l => l.trim());

      const errores = [];
      let tokensEstimados = 0;

      for (let i = 0; i < lines.length; i++) {
        try {
          const obj = JSON.parse(lines[i]);

          if (!obj.messages || !Array.isArray(obj.messages)) {
            errores.push(`Linea ${i + 1}: falta campo 'messages'`);
            continue;
          }

          const roles = obj.messages.map(m => m.role);
          if (!roles.includes('system') || !roles.includes('user') || !roles.includes('assistant')) {
            errores.push(`Linea ${i + 1}: faltan roles requeridos (system, user, assistant)`);
          }

          for (const msg of obj.messages) {
            if (!msg.content || typeof msg.content !== 'string') {
              errores.push(`Linea ${i + 1}: mensaje con content vacio o invalido`);
            }
            tokensEstimados += Math.ceil((msg.content || '').length / 4);
          }
        } catch (e) {
          errores.push(`Linea ${i + 1}: JSON invalido - ${e.message}`);
        }
      }

      return {
        valid: errores.length === 0,
        ejemplos: lines.length,
        tokensEstimados,
        errores
      };
    } catch (error) {
      return {
        valid: false,
        ejemplos: 0,
        tokensEstimados: 0,
        errores: [`Error leyendo archivo: ${error.message}`]
      };
    }
  }

  estimarCosto(tokensEstimados) {
    const epochs = parseInt(process.env.FINETUNE_EPOCHS || '3');
    const costoPerToken = 0.008 / 1000;
    const totalTokens = tokensEstimados * epochs;
    const costoUSD = totalTokens * costoPerToken;

    return {
      tokensEntrenamiento: totalTokens,
      epochs,
      costoEstimadoUSD: Math.round(costoUSD * 100) / 100,
      nota: 'Costo aproximado basado en precios de OpenAI para gpt-4o fine-tuning'
    };
  }

  async subirDatasetOpenAI(datasetId) {
    try {
      const result = await query(
        'SELECT archivo_jsonl_url FROM training_datasets WHERE id = $1',
        [datasetId]
      );

      const archivoPath = result.rows[0].archivo_jsonl_url;

      logger.info('Uploading dataset to OpenAI', {
        datasetId,
        archivo: archivoPath
      });

      const file = await openai.files.create({
        file: fs.createReadStream(archivoPath),
        purpose: 'fine-tune'
      });

      logger.info('Dataset uploaded successfully', {
        datasetId,
        openaiFileId: file.id
      });

      await query(
        'UPDATE training_datasets SET openai_file_id = $1, estado = $2 WHERE id = $3',
        [file.id, 'uploaded', datasetId]
      );

      return file.id;

    } catch (error) {
      logger.error('Failed to upload dataset to OpenAI', {
        datasetId,
        error: error.message
      });
      throw error;
    }
  }

  async crearFineTuneJob(datasetId, openaiFileId) {
    return await transaction(async (client) => {
      const modeloBase = process.env.FINE_TUNED_MODEL || 'gpt-4o-2024-08-06';

      logger.info('Creating fine-tune job', {
        datasetId,
        openaiFileId,
        modeloBase
      });

      const fineTune = await openai.fineTuning.jobs.create({
        training_file: openaiFileId,
        model: modeloBase.startsWith('ft:') ? 'gpt-4o-2024-08-06' : modeloBase,
        hyperparameters: {
          n_epochs: parseInt(process.env.FINETUNE_EPOCHS || '3'),
          batch_size: parseInt(process.env.FINETUNE_BATCH_SIZE || '1'),
          learning_rate_multiplier: parseFloat(process.env.FINETUNE_LEARNING_RATE || '0.1')
        },
        suffix: `medical-ocr-${Date.now()}`
      });

      logger.info('Fine-tune job created in OpenAI', {
        jobId: fineTune.id,
        status: fineTune.status
      });

      const result = await client.query(`
        INSERT INTO finetune_jobs (
          training_dataset_id,
          openai_job_id,
          modelo_base,
          estado,
          n_epochs,
          batch_size,
          learning_rate_multiplier,
          iniciado_en
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        RETURNING id
      `, [
        datasetId,
        fineTune.id,
        modeloBase,
        fineTune.status,
        fineTune.hyperparameters.n_epochs,
        fineTune.hyperparameters.batch_size,
        fineTune.hyperparameters.learning_rate_multiplier
      ]);

      return result.rows[0].id;
    });
  }

  async monitorearFineTuneJob(jobId) {
    const checkInterval = 60000;
    const maxChecks = 720;
    let checks = 0;

    const intervalId = setInterval(async () => {
      try {
        checks++;

        const result = await query(
          'SELECT openai_job_id FROM finetune_jobs WHERE id = $1',
          [jobId]
        );

        if (!result.rows.length) {
          clearInterval(intervalId);
          return;
        }

        const openaiJobId = result.rows[0].openai_job_id;

        const job = await openai.fineTuning.jobs.retrieve(openaiJobId);

        logger.info('Fine-tune job status', {
          jobId,
          openaiJobId,
          status: job.status,
          trainedTokens: job.trained_tokens || 0
        });

        await query(`
          UPDATE finetune_jobs
          SET
            estado = $1,
            trained_tokens = $2,
            modelo_resultante = $3,
            progreso = $4
          WHERE id = $5
        `, [
          job.status,
          job.trained_tokens || 0,
          job.fine_tuned_model || null,
          job.status === 'running' ? 50 : (job.status === 'succeeded' ? 100 : 0),
          jobId
        ]);

        if (job.status === 'succeeded' || job.status === 'failed' || job.status === 'cancelled') {
          clearInterval(intervalId);

          if (job.status === 'succeeded') {
            await this.handleTrainingSuccess(jobId, job);
          } else {
            await this.handleTrainingFailure(jobId, job);
          }
        }

        if (checks >= maxChecks) {
          logger.warn('Fine-tune monitoring timeout', { jobId });
          clearInterval(intervalId);
        }

      } catch (error) {
        logger.error('Error monitoring fine-tune job', {
          jobId,
          error: error.message
        });
      }
    }, checkInterval);
  }

  async handleTrainingSuccess(jobId, job) {
    try {
      logger.info('Fine-tune job succeeded!', {
        jobId,
        model: job.fine_tuned_model
      });

      await query(`
        UPDATE finetune_jobs
        SET
          estado = 'succeeded',
          modelo_resultante = $1,
          completado_en = NOW(),
          progreso = 100
        WHERE id = $2
      `, [job.fine_tuned_model, jobId]);

      this._currentModel = job.fine_tuned_model;
      process.env.FINE_TUNED_MODEL = job.fine_tuned_model;

      await this.actualizarModeloEnProduccion(job.fine_tuned_model);

      await this.registrarMetricas(jobId);

      logger.audit('New fine-tuned model available and hot-loaded', {
        jobId,
        model: job.fine_tuned_model
      });

    } catch (error) {
      logger.error('Failed to handle training success', {
        jobId,
        error: error.message
      });
    }
  }

  async handleTrainingFailure(jobId, job) {
    logger.error('Fine-tune job failed', {
      jobId,
      status: job.status,
      error: job.error
    });

    await query(`
      UPDATE finetune_jobs
      SET
        estado = $1,
        error_message = $2,
        completado_en = NOW()
      WHERE id = $3
    `, [job.status, job.error?.message || 'Unknown error', jobId]);
  }

  async registrarMetricas(jobId) {
    try {
      const jobResult = await query(
        'SELECT modelo_resultante, modelo_base FROM finetune_jobs WHERE id = $1',
        [jobId]
      );

      if (!jobResult.rows.length) return;

      const { modelo_resultante } = jobResult.rows[0];

      const statsResult = await query(`
        SELECT
          COUNT(*) as total_procesados,
          COUNT(*) FILTER (WHERE validado = true) as total_validados,
          ROUND(
            100.0 * COUNT(*) FILTER (WHERE validado = true AND NOT requiere_correccion)
            / NULLIF(COUNT(*) FILTER (WHERE validado = true), 0),
            2
          ) as tasa_acierto,
          ROUND(AVG(confianza_promedio)::numeric, 2) as confianza_promedio
        FROM ordenes_procesadas
        WHERE modelo_usado = $1 OR modelo_usado IS NOT NULL
      `, [modelo_resultante]);

      const stats = statsResult.rows[0];

      await query(`
        INSERT INTO metricas_precision (
          fecha, modelo, total_procesados, total_validados,
          tasa_acierto, confianza_promedio
        ) VALUES (CURRENT_DATE, $1, $2, $3, $4, $5)
        ON CONFLICT (fecha, modelo) DO UPDATE SET
          total_procesados = EXCLUDED.total_procesados,
          total_validados = EXCLUDED.total_validados,
          tasa_acierto = EXCLUDED.tasa_acierto,
          confianza_promedio = EXCLUDED.confianza_promedio
      `, [
        modelo_resultante,
        stats.total_procesados || 0,
        stats.total_validados || 0,
        stats.tasa_acierto || 0,
        stats.confianza_promedio || 0
      ]);

    } catch (error) {
      logger.error('Error registering metrics', { jobId, error: error.message });
    }
  }

  async actualizarModeloEnProduccion(nuevoModelo) {
    try {
      const envPath = path.join(process.cwd(), '.env');
      let envContent = '';

      if (fs.existsSync(envPath)) {
        envContent = await fs.readFile(envPath, 'utf8');
      }

      if (envContent.includes('FINE_TUNED_MODEL=')) {
        envContent = envContent.replace(
          /FINE_TUNED_MODEL=.*/,
          `FINE_TUNED_MODEL=${nuevoModelo}`
        );
      } else {
        envContent += `\nFINE_TUNED_MODEL=${nuevoModelo}\n`;
      }

      await fs.writeFile(envPath, envContent);

      logger.info('Production model updated in .env and hot-loaded in memory', {
        model: nuevoModelo
      });

    } catch (error) {
      logger.error('Failed to update .env (model still active in memory)', {
        error: error.message
      });
    }
  }

  async triggerManualTraining() {
    logger.info('Manual training triggered');
    return await this.ejecutarTrainingCompleto();
  }

  async getTrainingStats() {
    const jobsResult = await query(`
      SELECT
        COUNT(*) FILTER (WHERE estado = 'succeeded') as trainings_exitosos,
        COUNT(*) FILTER (WHERE estado = 'running') as trainings_en_curso,
        COUNT(*) FILTER (WHERE estado = 'failed') as trainings_fallidos,
        MAX(completado_en) as ultimo_training,
        SUM(trained_tokens) as total_tokens_trained,
        MAX(modelo_resultante) FILTER (WHERE estado = 'succeeded') as ultimo_modelo
      FROM finetune_jobs
    `);

    const feedbackResult = await query(`
      SELECT
        COUNT(*) as total_feedback_matching,
        COUNT(*) FILTER (WHERE usado_en_training = true) as feedback_usado,
        COUNT(*) FILTER (WHERE usado_en_training = false AND incluir_en_training = true) as feedback_pendiente
      FROM feedback_matching
    `);

    const datasetsResult = await query(`
      SELECT
        COUNT(*) as total_datasets,
        COALESCE(SUM(total_ejemplos), 0) as total_ejemplos_generados,
        MAX(fecha_generacion) as ultimo_dataset
      FROM training_datasets
      WHERE estado IN ('ready', 'uploaded')
    `);

    return {
      jobs: jobsResult.rows[0],
      feedback: feedbackResult.rows[0],
      datasets: datasetsResult.rows[0],
      modelo_actual: this._currentModel || process.env.FINE_TUNED_MODEL || 'gpt-4o (base)',
      auto_training_habilitado: this.autoTrainingEnabled,
      min_ejemplos: this.minExamplesForTraining
    };
  }

  async getTrainingHistory() {
    const result = await query(`
      SELECT
        fj.id,
        fj.openai_job_id,
        fj.modelo_base,
        fj.modelo_resultante,
        fj.estado,
        fj.progreso,
        fj.trained_tokens,
        fj.costo_usd,
        fj.error_message,
        fj.n_epochs,
        fj.iniciado_en,
        fj.completado_en,
        td.nombre as dataset_nombre,
        td.total_ejemplos
      FROM finetune_jobs fj
      LEFT JOIN training_datasets td ON td.id = fj.training_dataset_id
      ORDER BY fj.created_at DESC
      LIMIT 20
    `);

    return result.rows;
  }
}

module.exports = new AutoTrainingService();
