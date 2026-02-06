const { exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs-extra');
const { v4: uuidv4 } = require('uuid');
const logger = require('../config/logger.config');
const { PDF_CONVERSION } = require('../utils/constants');

const execAsync = promisify(exec);

class PDFService {
  /**
   * Convierte la primera página de un PDF a imagen JPG usando pdftoppm
   * @param {string} pdfPath - Ruta absoluta del archivo PDF
   * @returns {Promise<string>} - Ruta del archivo JPG generado
   */
  async convertToImage(pdfPath) {
    const startTime = Date.now();
    const outputPrefix = path.join(
      PDF_CONVERSION.TEMP_DIR,
      `pdf_${uuidv4()}`
    );
    
    const command = [
      'pdftoppm',
      '-jpeg',
      '-f 1',
      '-l 1',
      '-singlefile',
      `-r ${PDF_CONVERSION.DPI}`,
      `-jpegopt quality=${PDF_CONVERSION.JPEG_QUALITY}`,
      `"${pdfPath}"`,
      `"${outputPrefix}"`
    ].join(' ');

    try {
      logger.info('Starting PDF conversion', {
        pdfPath,
        outputPrefix,
        dpi: PDF_CONVERSION.DPI,
        quality: PDF_CONVERSION.JPEG_QUALITY
      });

      const { stdout, stderr } = await execAsync(command, {
        timeout: PDF_CONVERSION.TIMEOUT_MS,
        maxBuffer: PDF_CONVERSION.MAX_BUFFER_SIZE,
        encoding: 'utf8',
        shell: '/bin/bash'
      });

      // pdftoppm escribe información en stderr, verificar si es error real
      if (stderr && !stderr.includes('Page-') && !stderr.includes('Syntax Warning')) {
        logger.warn('pdftoppm stderr output', { stderr });
      }

      const outputPath = `${outputPrefix}.jpg`;
      
      // Verificar que el archivo existe
      const exists = await fs.pathExists(outputPath);
      if (!exists) {
        throw new Error('PDF conversion produced no output file');
      }

      // Validar tamaño mínimo del archivo
      const stats = await fs.stat(outputPath);
      if (stats.size < 1024) { // Menor a 1KB
        await fs.remove(outputPath);
        throw new Error('Generated image is too small - possible corrupted PDF');
      }

      const processingTime = Date.now() - startTime;

      logger.info('PDF converted successfully', {
        outputPath,
        sizeKB: Math.round(stats.size / 1024),
        processingTimeMs: processingTime
      });

      return outputPath;

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error('PDF conversion failed', {
        error: error.message,
        pdfPath,
        command,
        processingTimeMs: processingTime
      });

      if (error.code === 'ETIMEDOUT') {
        throw new Error('PDF conversion timeout - archivo muy grande o corrupto');
      }

      if (error.killed) {
        throw new Error('PDF conversion process killed - posible archivo corrupto');
      }

      if (error.stderr && error.stderr.includes('May not be a PDF file')) {
        throw new Error('El archivo no es un PDF válido');
      }

      if (error.stderr && error.stderr.includes('Couldn\'t open file')) {
        throw new Error('No se pudo abrir el archivo PDF - puede estar corrupto');
      }

      throw new Error(`Error convirtiendo PDF: ${error.message}`);
    }
  }

  /**
   * Verifica si poppler-utils está instalado en el sistema
   * @returns {Promise<boolean>}
   */
  async checkDependencies() {
    try {
      await execAsync('pdftoppm -v', { timeout: 5000 });
      logger.info('pdftoppm dependency check: OK');
      return true;
    } catch (error) {
      logger.error('pdftoppm not found', {
        error: error.message,
        hint: 'Install with: sudo apt-get install poppler-utils'
      });
      return false;
    }
  }

  /**
   * Obtiene información del PDF
   * @param {string} pdfPath - Ruta del PDF
   * @returns {Promise<Object>} - Información del PDF
   */
  async getPDFInfo(pdfPath) {
    try {
      const { stdout } = await execAsync(`pdfinfo "${pdfPath}"`, {
        timeout: 5000,
        encoding: 'utf8'
      });

      const info = {};
      const lines = stdout.split('\n');
      
      for (const line of lines) {
        const [key, ...valueParts] = line.split(':');
        if (key && valueParts.length > 0) {
          info[key.trim()] = valueParts.join(':').trim();
        }
      }

      return {
        pages: parseInt(info.Pages) || 1,
        title: info.Title || 'Unknown',
        author: info.Author || 'Unknown',
        creator: info.Creator || 'Unknown',
        producer: info.Producer || 'Unknown',
        creationDate: info.CreationDate || null
      };

    } catch (error) {
      logger.warn('Could not get PDF info', {
        pdfPath,
        error: error.message
      });
      return {
        pages: 1
      };
    }
  }
}

module.exports = new PDFService();
