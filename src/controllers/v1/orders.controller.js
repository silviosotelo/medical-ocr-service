const { query } = require('../../config/database.config');

async function list(req, res, next) {
  try {
    const { page = 1, limit = 20, validado } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const params = [req.tenantId];
    let where = 'WHERE op.tenant_id = $1';

    if (validado !== undefined) {
      params.push(validado === 'true');
      where += ` AND op.validado = $${params.length}`;
    }

    params.push(parseInt(limit), offset);

    const result = await query(
      `SELECT op.id, op.archivo_nombre, op.archivo_tipo, op.confianza_promedio,
              op.modelo_usado, op.validado, op.requiere_correccion, op.created_at,
              op.validado_por, op.validado_en
       FROM ordenes_procesadas op
       ${where}
       ORDER BY op.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const countParams = validado !== undefined ? [req.tenantId, validado === 'true'] : [req.tenantId];
    const countWhere = validado !== undefined ? 'WHERE tenant_id = $1 AND validado = $2' : 'WHERE tenant_id = $1';
    const countResult = await query(
      `SELECT COUNT(*) FROM ordenes_procesadas ${countWhere}`,
      countParams
    );

    res.json({
      status: 'ok',
      data: result.rows,
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (err) {
    next(err);
  }
}

async function getById(req, res, next) {
  try {
    const result = await query(
      `SELECT op.*,
              COALESCE(
                json_agg(
                  json_build_object(
                    'id', fc.id, 'tipo', fc.tipo, 'campo', fc.campo_corregido,
                    'valorIA', fc.valor_ia, 'valorCorrecto', fc.valor_correcto,
                    'razon', fc.razon_correccion, 'usuario', fc.usuario_correccion, 'fecha', fc.created_at
                  )
                ) FILTER (WHERE fc.id IS NOT NULL), '[]'
              ) as correcciones
       FROM ordenes_procesadas op
       LEFT JOIN feedback_correcciones fc ON fc.orden_procesada_id = op.id
       WHERE op.id = $1 AND op.tenant_id = $2
       GROUP BY op.id`,
      [req.params.id, req.tenantId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ status: 'error', error: { message: 'Order not found' } });
    }

    res.json({ status: 'ok', data: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

async function getRecentStats(req, res, next) {
  try {
    const result = await query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE validado = true) as validated,
        COUNT(*) FILTER (WHERE requiere_correccion = true) as with_corrections,
        AVG(confianza_promedio)::numeric(4,2) as avg_confidence,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours') as last_24h,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') as last_7d
      FROM ordenes_procesadas
      WHERE tenant_id = $1
    `, [req.tenantId]);

    res.json({ status: 'ok', data: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, getById, getRecentStats };
