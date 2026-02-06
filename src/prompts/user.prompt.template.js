/**
 * Genera el prompt de usuario basado en opciones específicas
 * @param {Object} opciones - Configuración de extracción
 * @returns {string} - Prompt formateado
 */
function generateUserPrompt(opciones = {}) {
  const {
    extraer_diagnostico = true,
    detectar_urgencias = true,
    validar_matricula = false
  } = opciones;

  let prompt = `Analiza esta orden médica y extrae la información según las instrucciones del sistema.

## CONFIGURACIÓN DE ANÁLISIS

`;

  if (extraer_diagnostico) {
    prompt += `✓ Extraer diagnóstico presuntivo y observaciones clínicas
`;
  } else {
    prompt += `✗ No es necesario extraer diagnóstico (enfócate en datos básicos)
`;
  }

  if (detectar_urgencias) {
    prompt += `✓ Detectar indicadores de urgencia (URGENTE, STAT, etc.)
`;
  } else {
    prompt += `✗ No analizar urgencias
`;
  }

  if (validar_matricula) {
    prompt += `✓ CRÍTICO: Validación estricta de matrícula profesional requerida
   - Busca con alta precisión el número de matrícula
   - Si no encuentras matrícula, marca requiere_revision_humana = true
   - Agrega advertencia si la matrícula es ambigua
`;
  }

  prompt += `
## INSTRUCCIONES ESPECÍFICAS

1. Analiza la imagen cuidadosamente
2. Identifica el tipo de escritura y legibilidad
3. Extrae TODOS los campos visibles
4. Usa contexto médico para inferencias razonables
5. Marca claramente en "advertencias" cualquier incertidumbre
6. Si la orden es muy ilegible (legibilidad BAJA), marca requiere_revision_humana = true

## RECORDATORIO

Devuelve ÚNICAMENTE un JSON válido sin texto adicional, siguiendo exactamente el esquema definido en el system prompt.`;

  return prompt;
}

module.exports = generateUserPrompt;
