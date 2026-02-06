// services/gpt-vision.service.js
const OpenAI = require('openai');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const logger = require('../config/logger.config');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

class GPTVisionService {
  async processOrder(imagePath) {
    try {
      logger.info('Procesando orden con GPT-4o Vision', { imagePath });

      // Leer archivo
      const imageBuffer = await fs.readFile(imagePath);
      const base64Image = imageBuffer.toString('base64');
      const mimeType = this.getMimeType(imagePath);

      // Generar hash
      const hash = crypto.createHash('sha256').update(imageBuffer).digest('hex');

      // Llamar a GPT-4o Vision
      const response = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `Eres un asistente experto en extraer información de órdenes médicas.
Extrae la siguiente información en formato JSON:
{
  "paciente": {
    "nombre": "string",
    "ci": "string",
    "edad": "number o null",
    "sexo": "M o F o null"
  },
  "prestador": {
    "nombre": "string",
    "matricula": "string o null"
  },
  "fecha_orden": "YYYY-MM-DD",
  "diagnostico": "string",
  "practicas": [
    {
      "descripcion": "string",
      "cantidad": "number"
    }
  ]
}

Reglas:
- Si no encuentras un dato, usar null
- Nombres en mayúsculas
- CI sin puntos ni guiones
- Fecha en formato ISO
- Prácticas: extraer todas las que veas`
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Extrae toda la información de esta orden médica:'
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType};base64,${base64Image}`
                }
              }
            ]
          }
        ],
        max_tokens: 2000,
        temperature: 0.1
      });

      const content = response.choices[0].message.content;
      
      // Parsear JSON
      let resultado;
      try {
        // Intentar extraer JSON del contenido
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          resultado = JSON.parse(jsonMatch[0]);
        } else {
          resultado = JSON.parse(content);
        }
      } catch (error) {
        logger.error('Error parseando respuesta GPT', { content });
        throw new Error('No se pudo parsear la respuesta de GPT-4o');
      }

      // Validar y normalizar
      resultado = this.normalizarResultado(resultado);

      // Calcular confianza
      const confianzaGeneral = this.calcularConfianza(resultado);

      return {
        ...resultado,
        hash_imagen: hash,
        metadata: {
          modelo: response.model,
          tokens_usados: response.usage.total_tokens,
          confianza_general: confianzaGeneral,
          timestamp: new Date().toISOString()
        }
      };

    } catch (error) {
      logger.error('Error procesando orden con GPT Vision', { 
        error: error.message,
        stack: error.stack 
      });
      throw error;
    }
  }

  normalizarResultado(resultado) {
    return {
      paciente: {
        nombre: resultado.paciente?.nombre || null,
        ci: resultado.paciente?.ci?.replace(/[.-]/g, '') || null,
        edad: resultado.paciente?.edad || null,
        sexo: resultado.paciente?.sexo || null
      },
      prestador: {
        nombre: resultado.prestador?.nombre || null,
        matricula: resultado.prestador?.matricula || null
      },
      fecha_orden: resultado.fecha_orden || new Date().toISOString().split('T')[0],
      diagnostico: resultado.diagnostico || null,
      practicas: (resultado.practicas || []).map(p => ({
        descripcion: p.descripcion,
        cantidad: p.cantidad || 1
      }))
    };
  }

  calcularConfianza(resultado) {
    let score = 0;
    let total = 0;

    // Paciente
    if (resultado.paciente?.nombre) { score++; total++; } else { total++; }
    if (resultado.paciente?.ci) { score++; total++; } else { total++; }

    // Prestador
    if (resultado.prestador?.nombre) { score++; total++; } else { total++; }

    // Prácticas
    if (resultado.practicas?.length > 0) { score++; total++; } else { total++; }

    return total > 0 ? score / total : 0;
  }

  getMimeType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.pdf': 'application/pdf'
    };
    return mimeTypes[ext] || 'image/jpeg';
  }
}

module.exports = new GPTVisionService();