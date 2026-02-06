# Usar Node.js 20 LTS Alpine para imagen ligera
FROM node:20-alpine

# Instalar dependencias del sistema necesarias
RUN apk add --no-cache \
    poppler-utils \
    curl \
    bash

# Establecer directorio de trabajo
WORKDIR /app

# Copiar archivos de dependencias
COPY package*.json ./

# Instalar dependencias de producción
RUN npm ci --only=production

# Copiar código fuente
COPY . .

# Crear directorios necesarios
RUN mkdir -p temp logs

# Exponer puerto
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Variables de entorno por defecto
ENV NODE_ENV=production \
    PORT=3000 \
    TEMP_DIR=/app/temp \
    LOG_DIR=/app/logs

# Usuario no-root para seguridad
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

USER nodejs

# Comando de inicio
CMD ["node", "server.js"]
