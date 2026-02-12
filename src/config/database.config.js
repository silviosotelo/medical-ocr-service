// config/database.config.js
const { Pool } = require('pg');
const logger = require('./logger.config');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('supabase') ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
});

// Test de conexión
pool.on('connect', () => {
  logger.info('PostgreSQL conectado');
});

pool.on('error', (err) => {
  logger.error('Error inesperado en PostgreSQL', { error: err.message });
});

// Función helper para queries
const query = async (text, params) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    
    if (duration > 1000) {
      logger.warn('Query lenta detectada', { 
        duration, 
        text: text.substring(0, 100) 
      });
    }
    
    return res;
  } catch (error) {
    logger.error('Error en query', { 
      error: error.message,
      text: text.substring(0, 100)
    });
    throw error;
  }
};

// Test de conexión inicial
const testConnection = async () => {
  try {
    await pool.query('SELECT NOW()');
    logger.info('Conexión a PostgreSQL verificada');
    return true;
  } catch (error) {
    logger.error('No se pudo conectar a PostgreSQL', { error: error.message });
    return false;
  }
};

/**
 * Helper para manejar transacciones de forma segura
 * @param {Function} callback - Función asíncrona que recibe el cliente de la DB
 */
const transaction = async (callback) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Ejecutamos la lógica que pasamos por parámetro
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error en transacción, se realizó ROLLBACK', { 
      error: error.message 
    });
    throw error;
  } finally {
    // Es vital liberar el cliente de vuelta al pool
    client.release();
  }
};

module.exports = {
  query,
  pool,
  testConnection,
  transaction
};