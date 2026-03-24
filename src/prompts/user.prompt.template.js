function generateUserPrompt(opciones = {}) {
  const {
    extraer_diagnostico = true,
    detectar_urgencias = true,
    validar_matricula = false,
    contextoRAG = ''
  } = opciones;

  let prompt = `Analiza esta orden medica y extrae la informacion segun las instrucciones del sistema.\n\n`;

  if (contextoRAG) {
    prompt += `## REFERENCIA DE NOMENCLADOR (Base de Datos)\n\n`;
    prompt += `Usa estas practicas conocidas como referencia para mapear lo que veas en la orden:\n\n`;
    prompt += contextoRAG;
    prompt += `\nSi detectas practicas similares a las de arriba, usa preferentemente esas descripciones estandarizadas.\n\n`;
  }

  prompt += `## CONFIGURACION\n\n`;

  if (extraer_diagnostico) {
    prompt += `- Extraer diagnostico presuntivo y observaciones clinicas\n`;
  }

  if (detectar_urgencias) {
    prompt += `- Detectar indicadores de urgencia\n`;
  }

  if (validar_matricula) {
    prompt += `- CRITICO: Validacion estricta de matricula. Si no encuentras matricula, marca requiere_revision_humana = true\n`;
  }

  prompt += `\n## INSTRUCCIONES\n\n`;
  prompt += `1. Analiza la imagen cuidadosamente\n`;
  prompt += `2. Identifica tipo de escritura y legibilidad\n`;
  prompt += `3. Extrae TODOS los campos visibles\n`;
  prompt += `4. Usa contexto medico para inferencias razonables\n`;
  prompt += `5. Marca en "advertencias" cualquier incertidumbre\n`;
  prompt += `6. Si la orden es muy ilegible (legibilidad BAJA), marca requiere_revision_humana = true\n\n`;
  prompt += `Devuelve UNICAMENTE JSON valido siguiendo el esquema del system prompt.`;

  return prompt;
}

module.exports = generateUserPrompt;
