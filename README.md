# Medical OCR Service

Plataforma de **visacion automatica de ordenes medicas** con arquitectura **API-First**. Utiliza **GPT-4o Vision** para extraccion OCR, **pgvector** para matching semantico de nomencladores/prestadores, y **webhooks** para comunicacion asincrona con sistemas externos.

## Arquitectura

```
Sistema Externo (APEX, Oracle ORDS, cualquier cliente HTTP)
    |
    |-- POST /api/v1/data/prestadores/batch    --> Sync datos maestros
    |-- POST /api/v1/data/nomencladores/batch  --> Sync nomencladores
    |-- POST /api/v1/data/acuerdos/batch       --> Sync acuerdos de precios
    |
    |-- POST /api/v1/ordenes/batch             --> Enviar ordenes medicas
    |       (procesamiento asincrono)
    |
    |-- <-- WEBHOOK: previsacion.generada      --> Recibir resultado
    |-- <-- WEBHOOK: previsacion.fallida       --> Recibir error
    |
    |-- POST /api/v1/ordenes/:id/feedback      --> Aprobar/Rechazar/Corregir
    |-- <-- WEBHOOK: previsacion.feedback_recibido
```

El microservicio **no tiene conexion directa a Oracle**. Toda la comunicacion es via HTTP REST + Webhooks.

## Stack Tecnologico

| Componente | Tecnologia |
|------------|-----------|
| Runtime | Node.js 20 LTS |
| Framework | Express.js 4.19 |
| Base de datos | PostgreSQL 15 + pgvector |
| IA/Vision | OpenAI GPT-4o |
| Embeddings | OpenAI text-embedding-3-small (1536 dims) |
| Procesamiento de imagenes | Sharp |
| Conversion PDF | poppler-utils (pdftoppm) |
| Validacion | Joi |
| Autenticacion | JWT + API Keys (HMAC-SHA256) |
| Logging | Winston (rotacion diaria) |
| Cola de trabajos | In-memory (sin Redis requerido) |
| Contenedores | Docker + Docker Compose |

## Inicio Rapido con Docker

```bash
# 1. Clonar repositorio
git clone https://github.com/silviosotelo/medical-ocr-service.git
cd medical-ocr-service

# 2. Configurar variables de entorno
cp .env.example .env
# Editar .env: configurar OPENAI_API_KEY (obligatorio)

# 3. Levantar todo
docker compose up -d

# 4. Verificar que esta corriendo
curl http://localhost:3000/health
```

Esto levanta:
- **PostgreSQL 16** con pgvector (puerto 5432)
- **Medical OCR Service** (puerto 3000)

### Ver logs
```bash
docker compose logs -f medical-ocr-service
```

### Detener
```bash
docker compose down
```

### Detener y borrar datos
```bash
docker compose down -v
```

## Inicio sin Docker

### Requisitos
- Node.js >= 20.0.0
- PostgreSQL 15+ con extensiones `vector` y `pg_trgm`
- poppler-utils (para PDFs)

### Instalacion

```bash
# Instalar poppler-utils
# Ubuntu/Debian:
sudo apt-get install poppler-utils
# macOS:
brew install poppler

# Instalar dependencias
npm install

# Configurar entorno
cp .env.example .env
# Editar .env con credenciales de DB y OPENAI_API_KEY

# Ejecutar migraciones
psql -U medical_ocr -d medical_ocr -f database/schema_matching.sql
psql -U medical_ocr -d medical_ocr -f database/migration_multitenant.sql
psql -U medical_ocr -d medical_ocr -f database/migration_ingestion_jobs.sql

# Iniciar en desarrollo
npm run dev

# Iniciar en produccion
npm start
```

## Endpoints API

Documentacion completa de contratos: **[README_API_CONTRACT.md](./README_API_CONTRACT.md)**

### Autenticacion

Todos los endpoints requieren una de estas formas de autenticacion:
- Header `Authorization: Bearer <JWT_TOKEN>` (obtenido via `/api/v1/auth/login`)
- Header `X-Api-Key: <API_KEY>` (creada via `/api/v1/api-keys`)

### Ingesta de Datos Maestros

| Metodo | Endpoint | Descripcion |
|--------|----------|-------------|
| POST | `/api/v1/data/prestadores/batch` | Upsert batch de prestadores (max 5000) |
| POST | `/api/v1/data/nomencladores/batch` | Upsert batch de nomencladores (max 5000) |
| POST | `/api/v1/data/acuerdos/batch` | Upsert batch de acuerdos de precios |
| GET | `/api/v1/data/jobs/:job_id/status` | Estado de job asincrono |
| GET | `/api/v1/data/stats` | Estadisticas de la BD |

### Procesamiento de Ordenes

| Metodo | Endpoint | Descripcion |
|--------|----------|-------------|
| POST | `/api/v1/ordenes/batch` | Enviar batch de ordenes (max 50, 10MB/archivo) |
| GET | `/api/v1/ordenes/batch/:batch_id/status` | Estado del batch |
| POST | `/api/v1/ordenes/:id_visacion/feedback` | Aprobar/Rechazar/Corregir |

### Gestion de Plataforma

| Metodo | Endpoint | Descripcion |
|--------|----------|-------------|
| POST | `/api/v1/auth/login` | Login (retorna JWT) |
| POST | `/api/v1/auth/register` | Registro de usuario |
| GET | `/api/v1/auth/me` | Perfil del usuario |
| CRUD | `/api/v1/tenants` | Gestion de tenants |
| CRUD | `/api/v1/users` | Gestion de usuarios |
| CRUD | `/api/v1/api-keys` | Gestion de API keys |
| CRUD | `/api/v1/webhooks` | Gestion de webhooks |
| GET | `/api/v1/usage/*` | Metricas de uso |
| GET | `/api/v1/orders` | Listar ordenes procesadas |

### Health & Info

| Metodo | Endpoint | Descripcion |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/health/metrics` | Metricas del servicio |
| GET | `/api/v1/version` | Version e info de la API |

## Webhooks

El servicio envia webhooks a URLs configuradas por tenant. Headers incluidos:

| Header | Descripcion |
|--------|-------------|
| `X-Webhook-Event` | Nombre del evento |
| `X-Webhook-Timestamp` | Unix timestamp |
| `X-Webhook-Signature` | `sha256={HMAC-SHA256 del body}` |
| `X-Webhook-Retry` | Numero de intento (0-based) |

### Eventos

| Evento | Cuando |
|--------|--------|
| `previsacion.generada` | Orden procesada exitosamente |
| `previsacion.fallida` | Orden fallo tras todos los reintentos |
| `previsacion.feedback_recibido` | Feedback recibido sobre una pre-visacion |

Politica de reintentos: hasta 5 intentos con backoff exponencial (5s, 15s, 30s, 60s, 120s).

## Estructura del Proyecto

```
medical-ocr-service/
├── database/
│   ├── schema_matching.sql              # Schema principal (pgvector)
│   ├── migration_multitenant.sql        # Multi-tenancy
│   └── migration_ingestion_jobs.sql     # Cola de trabajos
├── src/
│   ├── app.js                           # Express app
│   ├── config/
│   │   ├── database.config.js           # Pool PostgreSQL
│   │   ├── openai.config.js             # Cliente OpenAI
│   │   ├── logger.config.js             # Winston logger
│   │   ├── redis.config.js              # Redis (opcional)
│   │   ├── multer.config.js             # Upload de archivos
│   │   └── demo-mode.js                 # Modo demo
│   ├── routes/
│   │   ├── v1/
│   │   │   ├── index.js                 # Agregador de rutas v1
│   │   │   ├── data-ingest.routes.js    # Ingesta batch de datos
│   │   │   ├── ordenes-batch.routes.js  # Procesamiento de ordenes
│   │   │   ├── feedback.routes.js       # Feedback de pre-visaciones
│   │   │   ├── auth.routes.js           # Autenticacion
│   │   │   ├── tenant.routes.js         # Multi-tenancy
│   │   │   ├── user.routes.js           # Usuarios
│   │   │   ├── apikey.routes.js         # API keys
│   │   │   ├── webhook.routes.js        # Gestion de webhooks
│   │   │   ├── usage.routes.js          # Metricas de uso
│   │   │   └── orders.routes.js         # Consulta de ordenes
│   │   ├── api.routes.js               # API legacy
│   │   ├── health.routes.js            # Health checks
│   │   ├── pre-visacion.routes.js      # Pre-visacion legacy
│   │   └── training.routes.js          # Fine-tuning
│   ├── services/
│   │   ├── job-queue.service.js         # Cola de trabajos in-memory
│   │   ├── embedding.service.js         # Generacion de embeddings
│   │   ├── webhook.service.js           # Dispatch con retry
│   │   ├── pre-visacion.service.js      # Generacion de pre-visaciones
│   │   ├── matching.service.js          # Matching de nomencladores
│   │   ├── gpt-vision.service.js        # OCR con GPT-4o Vision
│   │   ├── pdf.service.js              # Conversion PDF a imagen
│   │   ├── auto-training.service.js     # Fine-tuning automatico
│   │   ├── rag.service.js              # RAG con pgvector
│   │   └── ...                          # Auth, tenant, cache, etc.
│   ├── workers/
│   │   ├── embedding.worker.js          # Worker de embeddings
│   │   └── previsacion.worker.js        # Worker de pre-visacion
│   ├── middlewares/
│   │   ├── auth.middleware.js           # JWT + API Key
│   │   ├── rate-limiter.middleware.js   # Rate limiting
│   │   ├── tenant.middleware.js         # Aislamiento multi-tenant
│   │   ├── rbac.middleware.js           # Control de acceso por rol
│   │   └── ...
│   ├── schemas/
│   │   └── contracts/                   # JSON Schema de contratos
│   └── prompts/                         # Prompts para GPT-4o
├── server.js                            # Entry point
├── docker-compose.yml                   # Docker Compose
├── Dockerfile                           # Imagen Docker
├── ecosystem.config.js                  # Configuracion PM2
├── postman_collection.json              # Coleccion Postman
├── README_API_CONTRACT.md               # Documentacion de contratos
└── package.json
```

## Base de Datos

### Tablas Principales

| Tabla | Descripcion |
|-------|-------------|
| `prestadores` | Proveedores medicos con embeddings vectoriales |
| `nomencladores` | Codigos de procedimientos con embeddings |
| `acuerdos_prestador` | Acuerdos de precios prestador-nomenclador |
| `ordenes_procesadas` | Ordenes procesadas con resultado de IA |
| `visacion_previa` | Pre-visaciones generadas (cabecera) |
| `det_visacion_previa` | Detalle de practicas en pre-visaciones |
| `feedback_matching` | Feedback para fine-tuning de IA |
| `ingestion_jobs` | Cola de trabajos asincronos |
| `webhook_configs` | Configuracion de webhooks por tenant |
| `webhook_failures` | Registro de webhooks fallidos |

### Indices Vectoriales

Los indices IVFFlat se crean automaticamente cuando hay suficientes registros (>300):
- `idx_prestadores_embedding` - Busqueda de prestadores por nombre
- `idx_nomencladores_embedding` - Busqueda de nomencladores por descripcion

## Variables de Entorno

| Variable | Requerido | Default | Descripcion |
|----------|-----------|---------|-------------|
| `OPENAI_API_KEY` | Si | - | API key de OpenAI |
| `DATABASE_URL` | Si | - | URL de conexion PostgreSQL |
| `JWT_SECRET` | Si | - | Secreto para firmar JWT |
| `JWT_REFRESH_SECRET` | Si | - | Secreto para refresh tokens |
| `PORT` | No | 3000 | Puerto del servidor |
| `NODE_ENV` | No | development | Entorno |
| `WORKER_CONCURRENCY` | No | 3 | Concurrencia de workers |
| `MAX_FILE_SIZE_MB` | No | 10 | Tamano max de archivo (MB) |
| `RATE_LIMIT_MAX_REQUESTS` | No | 30 | Requests/minuto global |
| `LOG_LEVEL` | No | info | Nivel de logging |
| `REDIS_URL` | No | - | URL de Redis (opcional) |
| `DEFAULT_PRESTADOR_ID` | No | 0 | Prestador por defecto |

## Testing

```bash
# Tests unitarios
npm test

# Tests con coverage
npm test -- --coverage

# Lint
npm run lint
```

## PM2 (Produccion sin Docker)

```bash
# Instalar PM2
npm install -g pm2

# Iniciar con cluster mode
pm2 start ecosystem.config.js --env production

# Monitorear
pm2 monit

# Logs
pm2 logs medical-ocr

# Reiniciar sin downtime
pm2 reload medical-ocr
```

## Coleccion Postman

El archivo `postman_collection.json` incluye todos los endpoints organizados. Para importar:

1. Abrir Postman
2. File > Import > seleccionar `postman_collection.json`
3. Configurar variable `base_url` (default: `http://localhost:3000`)
4. Ejecutar "Login" primero - el token se guarda automaticamente

## Licencia

MIT
