const fs = require('fs-extra');
const sharp = require('sharp');
const logger = require('../config/logger.config');
const { IMAGE_PROCESSING } = require('../utils/constants');

class ImageService {
  /**
   * Convierte imagen a Base64 con compresión opcional
   * @param {string} imagePath - Ruta de la imagen
   * @returns {Promise<Object>} - Datos de la imagen procesada
   */
  async toBase64(imagePath) {
    const startTime = Date.now();

    try {
      const stats = await fs.stat(imagePath);
      const originalSizeKB = stats.size / 1024;

      logger.info('Processing image', {
        path: imagePath,
        originalSizeKB: Math.round(originalSizeKB)
      });

      let buffer;
      let wasCompressed = false;

      // Comprimir si excede el límite
      if (stats.size > IMAGE_PROCESSING.COMPRESSION_THRESHOLD_BYTES) {
        logger.info('Compressing image (exceeds 5MB threshold)', {
          originalSizeKB: Math.round(originalSizeKB)
        });
        
        buffer = await sharp(imagePath)
          .jpeg({
            quality: IMAGE_PROCESSING.COMPRESSION_QUALITY,
            progressive: true,
            mozjpeg: true
          })
          .resize(IMAGE_PROCESSING.MAX_WIDTH, IMAGE_PROCESSING.MAX_HEIGHT, {
            fit: 'inside',
            withoutEnlargement: true
          })
          .toBuffer();

        wasCompressed = true;

        logger.info('Image compressed', {
          originalKB: Math.round(originalSizeKB),
          compressedKB: Math.round(buffer.length / 1024),
          reductionPercent: Math.round((1 - buffer.length / stats.size) * 100)
        });
      } else {
        buffer = await fs.readFile(imagePath);
      }

      // Obtener metadata de la imagen
      const metadata = await sharp(buffer).metadata();

      // Validar dimensiones mínimas
      if (metadata.width < IMAGE_PROCESSING.MIN_WIDTH || 
          metadata.height < IMAGE_PROCESSING.MIN_HEIGHT) {
        throw new Error(
          `Imagen muy pequeña: ${metadata.width}x${metadata.height}px ` +
          `(mínimo ${IMAGE_PROCESSING.MIN_WIDTH}x${IMAGE_PROCESSING.MIN_HEIGHT}px)`
        );
      }

      // Convertir a Base64
      const base64 = buffer.toString('base64');

      const processingTime = Date.now() - startTime;

      logger.info('Image processed successfully', {
        dimensions: `${metadata.width}x${metadata.height}`,
        format: metadata.format,
        finalSizeKB: Math.round(buffer.length / 1024),
        compressed: wasCompressed,
        processingTimeMs: processingTime
      });

      return {
        base64,
        originalSize: stats.size,
        processedSize: buffer.length,
        dimensions: {
          width: metadata.width,
          height: metadata.height
        },
        format: metadata.format,
        compressed: wasCompressed
      };

    } catch (error) {
      logger.error('Image processing failed', {
        error: error.message,
        imagePath
      });

      if (error.message.includes('Input buffer')) {
        throw new Error('Archivo de imagen corrupto o inválido');
      }

      throw new Error(`Error procesando imagen: ${error.message}`);
    }
  }

  /**
   * Valida que la imagen sea válida y legible
   * @param {string} imagePath - Ruta de la imagen
   * @returns {Promise<boolean>}
   */
  async validate(imagePath) {
    try {
      const metadata = await sharp(imagePath).metadata();
      
      const isValid = !!(
        metadata.width && 
        metadata.height && 
        metadata.format &&
        metadata.width >= IMAGE_PROCESSING.MIN_WIDTH &&
        metadata.height >= IMAGE_PROCESSING.MIN_HEIGHT
      );

      if (isValid) {
        logger.debug('Image validation passed', {
          imagePath,
          dimensions: `${metadata.width}x${metadata.height}`,
          format: metadata.format
        });
      } else {
        logger.warn('Image validation failed', {
          imagePath,
          metadata
        });
      }

      return isValid;

    } catch (error) {
      logger.warn('Image validation error', {
        imagePath,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Obtiene información detallada de la imagen
   * @param {string} imagePath - Ruta de la imagen
   * @returns {Promise<Object>} - Información de la imagen
   */
  async getImageInfo(imagePath) {
    try {
      const metadata = await sharp(imagePath).metadata();
      const stats = await fs.stat(imagePath);

      return {
        width: metadata.width,
        height: metadata.height,
        format: metadata.format,
        space: metadata.space,
        channels: metadata.channels,
        depth: metadata.depth,
        density: metadata.density,
        hasAlpha: metadata.hasAlpha,
        orientation: metadata.orientation,
        sizeBytes: stats.size,
        sizeKB: Math.round(stats.size / 1024),
        sizeMB: (stats.size / 1024 / 1024).toFixed(2)
      };
    } catch (error) {
      logger.error('Failed to get image info', {
        imagePath,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Procesa un buffer de imagen: compresión opcional y conversión a base64
   * @param {Buffer} imageBuffer - Buffer de la imagen
   * @returns {Promise<Object>} - { base64, mimeType }
   */
  async processImage(imageBuffer) {
    try {
      const metadata = await sharp(imageBuffer).metadata();

      // Validar dimensiones mínimas
      if (metadata.width < IMAGE_PROCESSING.MIN_WIDTH ||
          metadata.height < IMAGE_PROCESSING.MIN_HEIGHT) {
        throw new Error(
          `Imagen muy pequeña: ${metadata.width}x${metadata.height}px ` +
          `(mínimo ${IMAGE_PROCESSING.MIN_WIDTH}x${IMAGE_PROCESSING.MIN_HEIGHT}px)`
        );
      }

      let outputBuffer = imageBuffer;
      let mimeType = `image/${metadata.format === 'jpg' ? 'jpeg' : metadata.format}`;

      // Comprimir si excede el umbral
      if (imageBuffer.length > IMAGE_PROCESSING.COMPRESSION_THRESHOLD_BYTES) {
        logger.info('Compressing image buffer', {
          originalSizeKB: Math.round(imageBuffer.length / 1024)
        });

        outputBuffer = await sharp(imageBuffer)
          .jpeg({
            quality: IMAGE_PROCESSING.COMPRESSION_QUALITY,
            progressive: true,
            mozjpeg: true
          })
          .resize(IMAGE_PROCESSING.MAX_WIDTH, IMAGE_PROCESSING.MAX_HEIGHT, {
            fit: 'inside',
            withoutEnlargement: true
          })
          .toBuffer();

        mimeType = 'image/jpeg';

        logger.info('Image buffer compressed', {
          originalKB: Math.round(imageBuffer.length / 1024),
          compressedKB: Math.round(outputBuffer.length / 1024)
        });
      }

      return {
        base64: outputBuffer.toString('base64'),
        mimeType
      };
    } catch (error) {
      logger.error('processImage failed', { error: error.message });
      // Fallback: devolver el buffer original como base64
      return {
        base64: imageBuffer.toString('base64'),
        mimeType: 'image/jpeg'
      };
    }
  }

  /**
   * Convierte cualquier formato de imagen a JPEG
   * @param {string} imagePath - Ruta de la imagen
   * @param {string} outputPath - Ruta de salida
   * @returns {Promise<string>} - Ruta del archivo convertido
   */
  async convertToJPEG(imagePath, outputPath) {
    try {
      await sharp(imagePath)
        .jpeg({
          quality: 90,
          progressive: true
        })
        .toFile(outputPath);

      logger.info('Image converted to JPEG', {
        inputPath: imagePath,
        outputPath
      });

      return outputPath;
    } catch (error) {
      logger.error('Failed to convert image to JPEG', {
        imagePath,
        error: error.message
      });
      throw error;
    }
  }
}

module.exports = new ImageService();
