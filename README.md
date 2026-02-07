# 🏥 Medical OCR SaaS Platform

Plataforma **multi-tenant** de **visación automática de órdenes médicas** utilizando **GPT-4o Vision** para extracción de información estructurada de documentos médicos impresos y manuscritos.

## 📚 Documentación Completa

| Guía | Descripción |
|------|-------------|
| **[🚀 Quick Start](./QUICK_START.md)** | Inicio rápido en 5 minutos |
| **[📦 Installation Guide](./INSTALLATION.md)** | Instalación paso a paso detallada |
| **[⚙️ Service Setup](./SERVICE_SETUP.md)** | Configurar como servicio (Linux/Windows) |
| **[🔄 PM2 Guide](./PM2_GUIDE.md)** | Gestión de procesos con PM2 |
| **[🚀 Deployment Guide](./DEPLOYMENT.md)** | Deployment en producción |
| **[📮 Postman Collection](./postman_collection.json)** | Colección completa de API |
| **[💡 Examples](./EXAMPLES.md)** | Ejemplos de uso |

## 🎯 Características

- ✅ Procesamiento de órdenes médicas impresas, manuscritas y mixtas
- ✅ Extracción inteligente de información estructurada
- ✅ Soporte para PDFs (conversión automática a imagen)
- ✅ Detección de letra manuscrita médica
- ✅ Identificación de prácticas con códigos de nomenclador
- ✅ Detección automática de urgencias
- ✅ Validación robusta de archivos (magic numbers)
- ✅ Rate limiting y seguridad
- ✅ Logging estructurado y métricas
- ✅ Limpieza automática de archivos temporales
- ✅ Dockerizado y listo para producción

## 🛠️ Stack Tecnológico

- **Runtime:** Node.js 20 LTS
- **Framework:** Express.js 4.19+
- **IA/Vision:** OpenAI GPT-4o
- **Procesamiento de Imágenes:** Sharp
- **Conversión PDF:** poppler-utils (pdftoppm)
- **Validación:** Joi
- **Logging:** Winston
- **Seguridad:** Helmet, CORS, Rate Limiting

## 📋 Requisitos Previos

### Sistema
- Node.js >= 20.0.0
- npm >= 10.0.0
- poppler-utils (para conversión de PDFs)

### Instalación de poppler-utils

**Ubuntu/Debian:**
```bash
sudo apt-get update
sudo apt-get install poppler-utils
```

**macOS:**
```bash
brew install poppler
```

**Verificar instalación:**
```bash
pdftoppm -v
```

### API Key de OpenAI
- Registrarse en [OpenAI Platform](https://platform.openai.com/)
- Crear una API Key
- Asegurarse de tener acceso al modelo `gpt-4o`

## 🚀 Instalación y Configuración

### 1. Clonar el repositorio
```bash
git clone <repository-url>
cd medical-ocr-service
```

### 2. Instalar dependencias
```bash
npm install
```

### 3. Configurar variables de entorno
```bash
cp .env.example .env
```

Editar `.env` y configurar:
```env
OPENAI_API_KEY=sk-your-actual-api-key-here
NODE_ENV=development
PORT=3000
```

### 4. Iniciar el servidor

**Modo desarrollo (con auto-reload):**
```bash
npm run dev
```

**Modo producción:**
```bash
npm start
```

El servidor estará disponible en `http://localhost:3000`

## 🐳 Despliegue con Docker

### Build de la imagen
```bash
docker build -t medical-ocr-service .
```

### Ejecutar con Docker Compose
```bash
# Configurar OPENAI_API_KEY en .env primero
docker-compose up -d
```

### Ver logs
```bash
docker-compose logs -f
```

### Detener el servicio
```bash
docker-compose down
```

## 📡 API Endpoints

### 1. Procesar Orden Médica

**Endpoint:** `POST /api/visar`

**Content-Type:** `multipart/form-data`

**Parámetros:**
- `archivo` (required): Archivo JPG, PNG o PDF (máx. 10MB)
- `opciones` (optional): JSON string con opciones de procesamiento

**Ejemplo con cURL:**
```bash
curl -X POST http://localhost:3000/api/visar \
  -F "archivo=@orden_medica.pdf" \
  -F 'opciones={"extraer_diagnostico":true,"detectar_urgencias":true,"validar_matricula":false}'
```

**Ejemplo con JavaScript/Fetch:**
```javascript
const formData = new FormData();
formData.append('archivo', fileInput.files[0]);
formData.append('opciones', JSON.stringify({
  extraer_diagnostico: true,
  detectar_urgencias: true,
  validar_matricula: false
}));

const response = await fetch('http://localhost:3000/api/visar', {
  method: 'POST',
  body: formData
});

const result = await response.json();
console.log(result);
```

**Respuesta exitosa (200 OK):**
```json
{
  "status": "success",
  "timestamp": "2026-01-28T08:20:00Z",
  "processingTime": "8.50",
  "data": {
    "metadatos": {
      "tipo_escritura": "MANUSCRITA",
      "legibilidad": "ALTA",
      "confianza_ia": 0.95,
      "advertencias": [],
      "requiere_revision_humana": false,
      "es_urgente": false
    },
    "cabecera": {
      "medico": {
        "nombre": "Dr. Juan Carlos Pérez",
        "matricula": "12345",
        "especialidad_inferida": "Cardiólogo"
      },
      "paciente": {
        "nombre": "María González",
        "identificacion": "12345678",
        "tipo_identificacion": "DNI"
      },
      "fecha_emision": "2026-01-15",
      "diagnostico_presuntivo": "Dolor torácico atípico",
      "institucion_solicitante": "Sanatorio ABC"
    },
    "detalle_practicas": [
      {
        "orden": 1,
        "descripcion": "Radiografía de Tórax Frente y Perfil",
        "cantidad": 1,
        "codigo_sugerido": "420101",
        "nomenclador": "EMER",
        "confianza": 0.98
      }
    ],
    "observaciones": {
      "texto_completo": "Paciente con antecedentes de HTA",
      "flags_detectados": ["HTA"]
    }
  },
  "archivo_procesado": {
    "nombre_original": "orden_medica.pdf",
    "tipo": "application/pdf",
    "tamaño_kb": 245,
    "dimensiones": { "width": 1700, "height": 2200 },
    "formato": "jpeg",
    "comprimido": false,
    "paginas_procesadas": 1
  },
  "ia_metadata": {
    "modelo": "gpt-4o",
    "tokens_usados": 1523,
    "tokens_prompt": 1200,
    "tokens_completion": 323,
    "tiempo_ia_ms": 6200,
    "finish_reason": "stop"
  }
}
```

### 2. Health Check

**Endpoint:** `GET /health`

**Respuesta:**
```json
{
  "status": "healthy",
  "timestamp": "2026-01-28T08:20:00Z",
  "dependencies": {
    "poppler": true,
    "openai": true,
    "apiKeyConfigured": true
  },
  "uptime": 3600.5,
  "environment": "production"
}
```

### 3. Métricas del Servicio

**Endpoint:** `GET /health/metrics`

**Respuesta:**
```json
{
  "status": "ok",
  "timestamp": "2026-01-28T08:20:00Z",
  "metrics": {
    "uptime": {
      "hours": 2,
      "minutes": 120,
      "formatted": "2h 0m"
    },
    "requests": {
      "total": 150,
      "successful": 145,
      "failed": 5,
      "successRate": "96.67%"
    },
    "tokens": {
      "total": 225000,
      "prompt": 180000,
      "completion": 45000,
      "averagePerRequest": 1500
    },
    "performance": {
      "averageProcessingTimeMs": 8500,
      "averageProcessingTimeSec": "8.50"
    },
    "cost": {
      "estimatedUSD": "1.2500",
      "averagePerRequest": "0.008333"
    }
  }
}
```

### 4. Información de Versión

**Endpoint:** `GET /api/version`

**Respuesta:**
```json
{
  "service": "Medical OCR Microservice",
  "version": "1.0.0",
  "model": "gpt-4o",
  "features": [
    "PDF to Image conversion",
    "Handwritten text recognition",
    "Medical terminology extraction",
    "Practice code suggestion",
    "Urgency detection"
  ]
}
```

## 🔧 Opciones de Procesamiento

El parámetro `opciones` acepta un objeto JSON con las siguientes propiedades:

```typescript
{
  extraer_diagnostico?: boolean;   // default: true
  detectar_urgencias?: boolean;    // default: true
  validar_matricula?: boolean;     // default: false
}
```

**Descripción:**
- `extraer_diagnostico`: Extrae diagnóstico presuntivo y observaciones clínicas
- `detectar_urgencias`: Detecta palabras clave de urgencia (URGENTE, STAT, etc.)
- `validar_matricula`: Requiere validación estricta de matrícula del médico

## 📊 Estructura de Datos Extraídos

### Metadatos
- `tipo_escritura`: IMPRESA | MANUSCRITA | MIXTA
- `legibilidad`: ALTA | MEDIA | BAJA
- `confianza_ia`: 0.0 - 1.0 (confianza del modelo)
- `advertencias`: Array de strings con advertencias
- `requiere_revision_humana`: boolean
- `es_urgente`: boolean

### Cabecera
- **Médico**: nombre, matrícula, especialidad
- **Paciente**: nombre, identificación, tipo_identificacion
- **Fecha de emisión**: formato YYYY-MM-DD
- **Diagnóstico presuntivo**: string
- **Institución**: nombre del centro médico

### Detalle de Prácticas
Array de prácticas solicitadas:
- `orden`: número de secuencia
- `descripcion`: nombre del estudio/práctica
- `cantidad`: número de estudios
- `codigo_sugerido`: código de nomenclador (si se detecta)
- `nomenclador`: EMER | PMO | SWISS_MEDICAL | OSDE | PAMI | IOMA
- `confianza`: 0.0 - 1.0

### Observaciones
- `texto_completo`: observaciones del médico
- `flags_detectados`: keywords detectados (HTA, URGENTE, etc.)

## 🔒 Seguridad

### Validación de Archivos
- ✅ Validación de MIME type
- ✅ Verificación de magic numbers (previene spoofing)
- ✅ Límite de tamaño de archivo (10MB configurable)
- ✅ Sanitización de nombres de archivo

### Rate Limiting
- 30 requests por minuto por IP (configurable)
- Headers de rate limit en las respuestas

### Headers de Seguridad
- Helmet.js configurado con CSP
- CORS con origins permitidos
- HSTS habilitado

## 📈 Monitoreo y Logs

### Logs Estructurados
Los logs se escriben en `./logs/` con rotación diaria:
- `combined-YYYY-MM-DD.log`: Todos los logs
- `error-YYYY-MM-DD.log`: Solo errores
- `audit-YYYY-MM-DD.log`: Auditoría de operaciones críticas

### Formato de Logs
```json
{
  "timestamp": "2026-01-28 08:20:00",
  "level": "info",
  "message": "Order processed successfully",
  "filename": "orden_001.pdf",
  "processingTimeMs": 8500,
  "tokensUsed": 1523,
  "service": "medical-ocr-service"
}
```

### Métricas Disponibles
- Total de requests (exitosos/fallidos)
- Tokens consumidos (prompt/completion)
- Tiempo de procesamiento promedio
- Costos estimados en USD
- Distribución de requests por hora
- Errores por tipo

## 🧪 Testing

### Ejecutar tests
```bash
npm test
```

### Tests de integración
```bash
npm run test:integration
```

### Coverage
```bash
npm test -- --coverage
```

## 🐛 Troubleshooting

### Error: "pdftoppm not found"
**Solución:** Instalar poppler-utils
```bash
sudo apt-get install poppler-utils
```

### Error: "OpenAI API Key invalid"
**Solución:** Verificar que `OPENAI_API_KEY` en `.env` sea válida

### Error: "Rate limit exceeded"
**Solución:** Esperar 60 segundos o ajustar `RATE_LIMIT_MAX_REQUESTS` en `.env`

### Archivos temporales no se limpian
**Solución:** Forzar limpieza manual
```bash
curl -X POST http://localhost:3000/health/cleanup
```

### Alto consumo de memoria
**Solución:** Reducir `MAX_FILE_SIZE_MB` o aumentar límites del sistema

## 🔐 Sistema de Roles y Permisos (RBAC)

La plataforma incluye un sistema completo de control de acceso basado en roles (RBAC) con 4 niveles:

### Roles Disponibles

| Rol | Nivel | Dashboard | Permisos Principales |
|-----|-------|-----------|---------------------|
| **super_admin** | 100 | Panel Global (todos los tenants) | Gestión completa de la plataforma, crear tenants, ver métricas globales |
| **admin** | 80 | Dashboard de Organización | Gestionar usuarios, API keys, datos, webhooks, órdenes de su tenant |
| **operator** | 50 | Centro de Operaciones | Procesar y validar órdenes, ver datos y estadísticas de uso |
| **viewer** | 10 | Resumen de Solo Lectura | Ver órdenes procesadas (sin modificar) |

### Dashboards por Rol

#### Super Admin Dashboard
- Vista de todos los tenants de la plataforma
- Métricas globales (requests, tokens, errores)
- Gráfico de actividad global
- Lista de tenants con estado
- Performance y almacenamiento general

#### Admin Dashboard
- Estadísticas del tenant (órdenes, usuarios, API keys)
- Datos cargados (prestadores, nomencladores, acuerdos)
- Gráfico de actividad del tenant
- Uso de requests y tokens
- Órdenes recientes

#### Operator Dashboard
- Métricas de operación (órdenes totales, validadas, con correcciones)
- Confianza promedio de procesamiento
- Estadísticas de últimos 7 días y 24 horas
- Lista de órdenes recientes para procesar
- Tokens utilizados

#### Viewer Dashboard
- Resumen simple con contadores
- Órdenes totales y validadas
- Órdenes de últimas 24 horas
- Lista de últimas 5 órdenes (solo lectura)

### Permisos Detallados

Cada rol tiene permisos específicos que se validan en backend:

- **Tenants**: `tenants:read`, `tenants:write`, `tenants:delete`
- **Usuarios**: `users:read`, `users:write`, `users:delete`
- **API Keys**: `api_keys:read`, `api_keys:write`, `api_keys:delete`
- **Órdenes**: `orders:read`, `orders:write`, `orders:validate`
- **Datos**: `data:read`, `data:import`, `data:export`, `data:embeddings`
- **Uso**: `usage:read`
- **Webhooks**: `webhooks:read`, `webhooks:write`, `webhooks:delete`
- **Training**: `training:read`, `training:write`
- **Settings**: `settings:read`, `settings:write`
- **Dashboard**: `dashboard:global`, `dashboard:tenant`

## 🏢 Multi-Tenancy

La plataforma está diseñada como sistema multi-tenant con aislamiento completo de datos:

### Características Multi-Tenant

- ✅ **Aislamiento de Datos**: Cada tenant tiene sus propios usuarios, órdenes, configuraciones
- ✅ **Subdominios**: Detección automática de tenant por subdomain
- ✅ **Planes Flexibles**: starter, professional, enterprise con límites configurables
- ✅ **Métricas Aisladas**: Cada tenant solo ve sus propias estadísticas
- ✅ **API Keys por Tenant**: Las API keys solo acceden a datos de su tenant
- ✅ **Configuración Individual**: Cada tenant puede tener sus propias configuraciones

### Estructura de Base de Datos

Todas las tablas principales incluyen `tenant_id` para aislamiento:
- `users` (usuarios por tenant)
- `api_keys` (llaves API por tenant)
- `orders` (órdenes médicas por tenant)
- `data_*` (prestadores, nomencladores, etc. por tenant)
- `webhooks` (webhooks por tenant)
- `usage_logs` (logs de uso por tenant)

## 📮 Colección Postman

La colección incluye:
- ✅ **Variables automáticas**: Los tokens se guardan automáticamente al login
- ✅ **Todos los endpoints organizados**: Por categorías (Auth, Tenants, Users, etc.)
- ✅ **Ejemplos completos**: Request bodies prellenados
- ✅ **Tests automatizados**: Scripts para extraer y guardar tokens

### Importar en Postman
1. Abrir Postman
2. File → Import
3. Seleccionar `postman_collection.json`
4. Configurar variable `base_url` (default: http://localhost:3000)
5. Hacer Login → Los tokens se guardan automáticamente

## 🚀 Deployment en Producción

### Opciones de Deployment

1. **systemd (Linux)** - Servicio nativo del sistema
   - Ver guía: [SERVICE_SETUP.md](./SERVICE_SETUP.md)
   - Ideal para: Servidores Linux dedicados

2. **PM2** - Process Manager multiplataforma
   - Ver guía: [PM2_GUIDE.md](./PM2_GUIDE.md)
   - Ideal para: Desarrollo, staging, producción simple
   - Incluye: Clustering, zero-downtime reload, monitoreo

3. **Docker Compose** - Containerización completa
   - Ver archivo: [docker-compose.yml](./docker-compose.yml)
   - Ideal para: Desarrollo y producción dockerizada

4. **Windows Service** - Servicio de Windows
   - Ver guía: [SERVICE_SETUP.md](./SERVICE_SETUP.md#windows-windows-service)
   - Ideal para: Servidores Windows

### Quick Commands

```bash
# systemd
sudo systemctl start medical-ocr
sudo journalctl -u medical-ocr -f

# PM2
pm2 start ecosystem.config.js
pm2 monit

# Docker
docker-compose up -d
docker-compose logs -f
```

## 📝 Contribuir

1. Fork del repositorio
2. Crear branch de feature (`git checkout -b feature/amazing-feature`)
3. Commit de cambios (`git commit -m 'Add amazing feature'`)
4. Push al branch (`git push origin feature/amazing-feature`)
5. Abrir Pull Request

## 📄 Licencia

MIT License - ver archivo `LICENSE` para detalles

## 🤝 Soporte

Para reportar bugs o solicitar features:
- Abrir un issue en GitHub
- Email: support@medical-ocr.com

## 🔗 Links Útiles

- [Documentación OpenAI GPT-4o](https://platform.openai.com/docs/models/gpt-4o)
- [Express.js Documentation](https://expressjs.com/)
- [Sharp Image Processing](https://sharp.pixelplumbing.com/)
- [Winston Logger](https://github.com/winstonjs/winston)

---

**Desarrollado con ❤️ para mejorar la eficiencia en el sector salud**
#   m e d i c a l - o c r - s e r v i c e  
 #   m e d i c a l - o c r - s e r v i c e  
 