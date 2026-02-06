const openai = require('../config/openai.config');
const { query, transaction } = require('../config/database.config');
const logger = require('../config/logger.config');
const fs = require('fs-extra');
const path = require('path');

class AutoTrainingService {
  constructor() {
    this.minExamplesForTraining = parseInt(process.env.MIN_TRAINING_EXAMPLES || '50');
    this.autoTrainingEnabled = process.env.AUTO_TRAINING_ENABLED === 'true';
    this.trainingCheckInterval = 24 * 60 * 60 * 1000; // 24 horas
    this.trainingDir = process.env.TRAINING_DIR || './training-data';
  }

  /**
   * Inicia el servicio de training automático
   */
  async start() {
    if (!this.autoTrainingEnabled) {
      logger.info('Auto-training is disabled');
      return;
    }

    logger.info('Auto-training service started', {
      minExamples: this.minExamplesForTraining,
      checkInterval: this.trainingCheckInterval / 1000 / 60 / 60 + ' hours'
    });

    // Verificar periódicamente si hay suficientes ejemplos
    setInterval(() => {
      this.verificarYEntrenar();
    }, this.trainingCheckInterval);

    // Primera verificación al inicio
    setTimeout(() => this.verificarYEntrenar(), 10000);
  }

  /**
   * Verifica si hay suficientes ejemplos validados y ejecuta training
   */
  async verificarYEntrenar() {
    try {
      // Contar ejemplos validados disponibles para training
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

      const ejemplosDisponibles = parseInt(countResult.rows[0].total);

      logger.info('Training check', {
        ejemplosDisponibles,
        minRequerido: this.minExamplesForTraining
      });

      if (ejemplosDisponibles >= this.minExamplesForTraining) {
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

  /**
   * Ejecuta el ciclo completo de training
   */
  async ejecutarTrainingCompleto() {
    try {
      logger.info('Starting complete training cycle');

      // 1. Generar dataset
      const datasetId = await this.generarDataset();
      logger.info('Dataset generated', { datasetId });

      // 2. Subir a OpenAI
      const openaiFileId = await this.subirDatasetOpenAI(datasetId);
      logger.info('Dataset uploaded to OpenAI', { openaiFileId });

      // 3. Crear job de fine-tuning
      const jobId = await this.crearFineTuneJob(datasetId, openaiFileId);
      logger.info('Fine-tune job created', { jobId });

      // 4. Monitorear progreso (async)
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

  /**
   * Genera dataset JSONL desde órdenes validadas
   */
  async generarDataset() {
    return await transaction(async (client) => {
      // Crear registro del dataset
      const datasetResult = await client.query(`
        INSERT INTO training_datasets (nombre, descripcion, estado)
        VALUES ($1, $2, 'generating')
        RETURNING id
      `, [
        `dataset_${Date.now()}`,
        `Auto-generated training dataset at ${new Date().toISOString()}`
      ]);

      const datasetId = datasetResult.rows[0].id;

      // Obtener órdenes validadas
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

      const ordenes = ordenesResult.rows;

      logger.info('Generating training examples', {
        datasetId,
        ordenesCount: ordenes.length
      });

      // Generar archivo JSONL
      await fs.ensureDir(this.trainingDir);
      const jsonlPath = path.join(this.trainingDir, `dataset_${datasetId}.jsonl`);
      const writeStream = fs.createWriteStream(jsonlPath);

      let ejemplosGenerados = 0;

      for (const orden of ordenes) {
        try {
          const ejemplo = await this.generarEjemploTraining(orden);
          if (ejemplo) {
            writeStream.write(JSON.stringify(ejemplo) + '\n');
            ejemplosGenerados++;
          }
        } catch (error) {
          logger.warn('Failed to generate training example', {
            ordenId: orden.id,
            error: error.message
          });
        }
      }

      writeStream.end();

      // Esperar a que termine de escribir
      await new Promise((resolve, reject) => {
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
      });

      // Obtener tamaño del archivo
      const stats = await fs.stat(jsonlPath);

      // Actualizar dataset
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

      logger.info('Dataset file generated', {
        datasetId,
        ejemplos: ejemplosGenerados,
        sizeKB: Math.round(stats.size / 1024)
      });

      return datasetId;
    });
  }

  /**
   * Genera un ejemplo de training en formato OpenAI
   */
  async generarEjemploTraining(orden) {
    try {
      // Usar corrección humana si existe, sino el resultado de IA
      const datosFinales = orden.correccion_humana || orden.resultado_ia;

      // Cargar imagen (si está disponible)
      let imageBase64 = null;
      if (orden.archivo_url && fs.existsSync(orden.archivo_url)) {
        const imageBuffer = await fs.readFile(orden.archivo_url);
        imageBase64 = imageBuffer.toString('base64');
      }

      if (!imageBase64) {
        return null;
      }

      // Formato para fine-tuning con visión
      const ejemplo = {
        messages: [
          {
            role: "system",
            content: "Eres un experto en análisis de órdenes médicas. Extrae información estructurada en formato JSON."
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Analiza esta orden médica y extrae toda la información."
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${imageBase64}`,
                  detail: "high"
                }
              }
            ]
          },
          {
            role: "assistant",
            content: JSON.stringify(datosFinales)
          }
        ]
      };

      return ejemplo;

    } catch (error) {
      logger.error('Failed to generate training example', {
        ordenId: orden.id,
        error: error.message
      });
      return null;
    }
  }

  /**
   * Sube dataset a OpenAI
   */
  async subirDatasetOpenAI(datasetId) {
    try {
      // Obtener info del dataset
      const result = await query(
        'SELECT archivo_jsonl_url FROM training_datasets WHERE id = $1',
        [datasetId]
      );

      const archivoPath = result.rows[0].archivo_jsonl_url;

      logger.info('Uploading dataset to OpenAI', {
        datasetId,
        archivo: archivoPath
      });

      // Subir archivo
      const file = await openai.files.create({
        file: fs.createReadStream(archivoPath),
        purpose: 'fine-tune'
      });

      logger.info('Dataset uploaded successfully', {
        datasetId,
        openaiFileId: file.id
      });

      // Actualizar en BD
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

  /**
   * Crea job de fine-tuning en OpenAI
   */
  async crearFineTuneJob(datasetId, openaiFileId) {
    return await transaction(async (client) => {
      // Obtener modelo base actual
      const modeloBase = process.env.FINE_TUNED_MODEL || 'gpt-4o-2024-08-06';

      logger.info('Creating fine-tune job', {
        datasetId,
        openaiFileId,
        modeloBase
      });

      // Crear job en OpenAI
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

      // Registrar en BD
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

  /**
   * Monitorea el progreso de un job de fine-tuning
   */
  async monitorearFineTuneJob(jobId) {
    const checkInterval = 60000; // 1 minuto
    const maxChecks = 720; // 12 horas máximo
    let checks = 0;

    const intervalId = setInterval(async () => {
      try {
        checks++;

        // Obtener info del job desde BD
        const result = await query(
          'SELECT openai_job_id FROM finetune_jobs WHERE id = $1',
          [jobId]
        );

        if (!result.rows.length) {
          clearInterval(intervalId);
          return;
        }

        const openaiJobId = result.rows[0].openai_job_id;

        // Consultar estado en OpenAI
        const job = await openai.fineTuning.jobs.retrieve(openaiJobId);

        logger.info('Fine-tune job status', {
          jobId,
          openaiJobId,
          status: job.status,
          trainedTokens: job.trained_tokens || 0
        });

        // Actualizar en BD
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

        // Si completó o falló, detener monitoreo
        if (job.status === 'succeeded' || job.status === 'failed' || job.status === 'cancelled') {
          clearInterval(intervalId);

          if (job.status === 'succeeded') {
            await this.handleTrainingSuccess(jobId, job);
          } else {
            await this.handleTrainingFailure(jobId, job);
          }
        }

        // Timeout
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

  /**
   * Maneja training exitoso
   */
  async handleTrainingSuccess(jobId, job) {
    try {
      logger.info('Fine-tune job succeeded!', {
        jobId,
        model: job.fine_tuned_model
      });

      // Actualizar BD
      await query(`
        UPDATE finetune_jobs
        SET 
          estado = 'succeeded',
          modelo_resultante = $1,
          completado_en = NOW(),
          progreso = 100
        WHERE id = $2
      `, [job.fine_tuned_model, jobId]);

      // Actualizar variable de entorno en .env (automático)
      await this.actualizarModeloEnProduccion(job.fine_tuned_model);

      logger.audit('New fine-tuned model available', {
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

  /**
   * Maneja training fallido
   */
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

  /**
   * Actualiza modelo en producción (escribe en .env)
   */
  async actualizarModeloEnProduccion(nuevoModelo) {
    try {
      const envPath = path.join(process.cwd(), '.env');
      let envContent = '';

      if (fs.existsSync(envPath)) {
        envContent = await fs.readFile(envPath, 'utf8');
      }

      // Buscar y actualizar FINE_TUNED_MODEL
      if (envContent.includes('FINE_TUNED_MODEL=')) {
        envContent = envContent.replace(
          /FINE_TUNED_MODEL=.*/,
          `FINE_TUNED_MODEL=${nuevoModelo}`
        );
      } else {
        envContent += `\n# Auto-updated by training service\nFINE_TUNED_MODEL=${nuevoModelo}\n`;
      }

      await fs.writeFile(envPath, envContent);

      logger.info('Production model updated in .env', {
        model: nuevoModelo
      });

      logger.warn('IMPORTANT: Restart service to use new model', {
        model: nuevoModelo
      });

    } catch (error) {
      logger.error('Failed to update .env', {
        error: error.message
      });
    }
  }

  /**
   * Trigger manual de training
   */
  async triggerManualTraining() {
    logger.info('Manual training triggered');
    return await this.ejecutarTrainingCompleto();
  }

  /**
   * Obtiene estadísticas de training
   */
  async getTrainingStats() {
    const result = await query(`
      SELECT 
        COUNT(*) FILTER (WHERE estado = 'succeeded') as trainings_exitosos,
        COUNT(*) FILTER (WHERE estado = 'running') as trainings_en_curso,
        COUNT(*) FILTER (WHERE estado = 'failed') as trainings_fallidos,
        MAX(completado_en) as ultimo_training,
        SUM(trained_tokens) as total_tokens_trained
      FROM finetune_jobs
    `);

    return result.rows[0];
  }
}

module.exports = new AutoTrainingService();
