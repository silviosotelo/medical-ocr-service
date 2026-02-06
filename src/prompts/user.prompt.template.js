function generateUserPrompt(opciones = {}) {
  const {
    extraer_diagnostico = true,
    detectar_urgencias = true,
    validar_matricula = false,
    contextoRAG = ''
  } = opciones;

  let prompt = `Analiza esta orden médica y extrae la información según las instrucciones del sistema.\n\n`;

  if (contextoRAG) {
    prompt += `## REFERENCIA DE NOMENCLADOR (Base de Datos)\n\n`;
    prompt += `Usa estas prácticas conocidas como referencia para mapear lo que veas en la orden:\n\n`;
    prompt += contextoRAG;
    prompt += `\nSi detectas prácticas similares a las de arriba, usa preferentemente esas descripciones estandarizadas.\n\n`;
  }

  prompt += `## CONFIGURACIÓN\n\n`;

  if (extraer_diagnostico) {
    prompt += `- Extraer diagnóstico presuntivo y observaciones clínicas\n`;
  }

  if (detectar_urgencias) {
    prompt += `- Detectar indicadores de urgencia\n`;
  }

  if (validar_matricula) {
    prompt += `- CRITICO: Validación estricta de matrícula. Si no encuentras matrícula, marca requiere_revision_humana = true\n`;
  }

  prompt += `\n## INSTRUCCIONES\n\n`;
  prompt += `1. Analiza la imagen cuidadosamente\n`;
  prompt += `2. Identifica tipo de escritura y legibilidad\n`;
  prompt += `3. Extrae TODOS los campos visibles\n`;
  prompt += `4. Usa contexto médico para inferencias razonables\n`;
  prompt += `5. Marca en "advertencias" cualquier incertidumbre\n`;
  prompt += `6. Si la orden es muy ilegible (legibilidad BAJA), marca requiere_revision_humana = true\n\n`;
  prompt += `Devuelve ÚNICAMENTE JSON válido siguiendo el esquema del system prompt.`;

  return prompt;
}

module.exports = generateUserPrompt;
