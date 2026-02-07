# Guía de Instalación - Medical OCR SaaS Platform

## Tabla de Contenidos
1. [Requisitos Previos](#requisitos-previos)
2. [Instalación Rápida](#instalación-rápida)
3. [Configuración](#configuración)
4. [Base de Datos](#base-de-datos)
5. [Variables de Entorno](#variables-de-entorno)
6. [Verificación](#verificación)

---

## Requisitos Previos

### Software Requerido
- **Node.js**: 20.0.0 o superior
- **npm**: 10.0.0 o superior
- **PostgreSQL**: 14 o superior
- **Redis**: 6.0 o superior (opcional, para caché)
- **Git**: Para clonar el repositorio

### Software Opcional (Recomendado)
- **poppler-utils**: Para procesamiento de PDF
  ```bash
  # Ubuntu/Debian
  sudo apt-get install poppler-utils

  # CentOS/RHEL
  sudo yum install poppler-utils

  # macOS
  brew install poppler
  ```

- **OpenAI API Key**: Para funciones de AI/GPT

### Requisitos del Sistema
- **CPU**: 2 cores mínimo (4 cores recomendado)
- **RAM**: 4GB mínimo (8GB recomendado)
- **Disco**: 10GB mínimo
- **Sistema Operativo**: Linux, macOS, o Windows

---

## Instalación Rápida

### 1. Clonar el Repositorio
```bash
git clone <repository-url>
cd medical-ocr-microservice
```

### 2. Instalar Dependencias del Backend
```bash
npm install
```

### 3. Instalar Dependencias del Frontend
```bash
cd frontend
npm install
cd ..
```

### 4. Construir el Frontend
```bash
cd frontend
npm run build
cd ..
```

---

## Configuración

### 1. Crear Archivo de Configuración
Copiar el archivo de ejemplo y editarlo:
```bash
cp .env.example .env
```

### 2. Editar Variables de Entorno
Abrir `.env` con tu editor favorito:
```bash
nano .env
# o
vim .env
# o
code .env
```

---

## Base de Datos

### Opción A: PostgreSQL Local

#### 1. Instalar PostgreSQL
```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install postgresql postgresql-contrib

# CentOS/RHEL
sudo yum install postgresql-server postgresql-contrib
sudo postgresql-setup initdb
sudo systemctl start postgresql
sudo systemctl enable postgresql

# macOS
brew install postgresql
brew services start postgresql
```

#### 2. Crear Base de Datos y Usuario
```bash
# Acceder a PostgreSQL
sudo -u postgres psql

# Dentro de psql:
CREATE DATABASE medical_ocr;
CREATE USER medical_ocr_user WITH ENCRYPTED PASSWORD 'tu_password_segura';
GRANT ALL PRIVILEGES ON DATABASE medical_ocr TO medical_ocr_user;
\q
```

#### 3. Configurar Conexión
En tu archivo `.env`:
```env
DATABASE_URL=postgresql://medical_ocr_user:tu_password_segura@localhost:5432/medical_ocr
```

#### 4. Aplicar Migraciones
```bash
# Si usas el script SQL incluido
psql -U medical_ocr_user -d medical_ocr -f database/schema_matching.sql
psql -U medical_ocr_user -d medical_ocr -f database/migration_multitenant.sql
```

### Opción B: Docker PostgreSQL

```bash
# Crear contenedor PostgreSQL
docker run -d \
  --name medical-ocr-db \
  -e POSTGRES_DB=medical_ocr \
  -e POSTGRES_USER=medical_ocr_user \
  -e POSTGRES_PASSWORD=tu_password_segura \
  -p 5432:5432 \
  -v medical_ocr_data:/var/lib/postgresql/data \
  postgres:15-alpine

# Verificar que está corriendo
docker ps | grep medical-ocr-db
```

### Opción C: Docker Compose (Recomendado)

```bash
# Iniciar todos los servicios
docker-compose up -d

# Ver logs
docker-compose logs -f

# Detener servicios
docker-compose down
```

---

## Variables de Entorno

### Archivo `.env` Completo

```env
# ============================================
# SERVIDOR
# ============================================
NODE_ENV=production
PORT=3000
HOST=0.0.0.0

# ============================================
# BASE DE DATOS (PostgreSQL)
# ============================================
DATABASE_URL=postgresql://medical_ocr_user:password@localhost:5432/medical_ocr
DB_HOST=localhost
DB_PORT=5432
DB_NAME=medical_ocr
DB_USER=medical_ocr_user
DB_PASSWORD=tu_password_segura
DB_SSL=false

# ============================================
# REDIS (Opcional - Cache y Queues)
# ============================================
REDIS_URL=redis://localhost:6379
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# ============================================
# AUTENTICACIÓN JWT
# ============================================
JWT_SECRET=tu_jwt_secret_muy_seguro_minimo_32_caracteres
JWT_EXPIRE=15m
JWT_REFRESH_SECRET=tu_refresh_secret_muy_seguro_minimo_32_caracteres
JWT_REFRESH_EXPIRE=7d

# ============================================
# OPENAI API (Opcional - Funciones AI)
# ============================================
OPENAI_API_KEY=sk-your-openai-api-key-here
OPENAI_MODEL=gpt-4o
OPENAI_MAX_TOKENS=4096
OPENAI_TEMPERATURE=0.1

# ============================================
# ALMACENAMIENTO
# ============================================
TEMP_DIR=./temp
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=10485760

# ============================================
# CORS Y SEGURIDAD
# ============================================
ALLOWED_ORIGINS=http://localhost:3000,https://yourdomain.com

# ============================================
# LOGS
# ============================================
LOG_LEVEL=info
LOG_DIR=./logs
```

### Variables Críticas (OBLIGATORIAS)

1. **JWT_SECRET**: Generar con:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

2. **JWT_REFRESH_SECRET**: Generar con:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

3. **DATABASE_URL**: Debe apuntar a tu base de datos PostgreSQL

---

## Verificación

### 1. Verificar Sintaxis
```bash
npm run lint
```

### 2. Ejecutar Tests
```bash
npm test
```

### 3. Iniciar en Modo Desarrollo
```bash
npm run dev
```

### 4. Verificar Endpoints

#### Health Check
```bash
curl http://localhost:3000/health
```

Respuesta esperada:
```json
{
  "status": "ok",
  "timestamp": "2024-02-07T...",
  "uptime": 123.456,
  "service": "Medical OCR SaaS",
  "version": "3.0.0",
  "database": "connected",
  "redis": "connected",
  "dependencies": {
    "poppler": true,
    "openai": true
  }
}
```

#### Service Info
```bash
curl http://localhost:3000/
```

Respuesta esperada:
```json
{
  "service": "Medical OCR SaaS Platform",
  "version": "5.0.0",
  "status": "running",
  "endpoints": {
    "v1": "/api/v1",
    "legacy": "/api",
    "health": "/health",
    "portal": "/portal"
  }
}
```

### 5. Verificar Frontend
Abrir navegador en: `http://localhost:3000/portal`

---

## Crear Usuario Inicial (Super Admin)

### Opción A: Usando SQL Directamente
```sql
-- Conectar a la base de datos
psql -U medical_ocr_user -d medical_ocr

-- Insertar super admin
INSERT INTO users (
  id,
  tenant_id,
  email,
  password,
  name,
  role,
  status,
  created_at
) VALUES (
  gen_random_uuid(),
  NULL,
  'admin@example.com',
  '$2a$12$KIXx0yZvGbLqX/MK2vN.7OK8LQZaR1YZvF0IhD7sQmH9qvE6pqN.W', -- password: admin123
  'Super Administrator',
  'super_admin',
  'active',
  NOW()
);
```

### Opción B: Usando API (Después de crear el primer tenant)
```bash
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "Admin123!@#",
    "name": "Super Administrator",
    "role": "super_admin"
  }'
```

---

## Creación de Tenant Inicial

```bash
# Login como super admin
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "Admin123!@#"
  }'

# Guardar el accessToken de la respuesta
export TOKEN="tu_access_token_aqui"

# Crear tenant
curl -X POST http://localhost:3000/api/v1/tenants \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "name": "Mi Organización",
    "slug": "mi-org",
    "plan": "professional",
    "status": "active",
    "settings": {
      "max_users": 50,
      "max_requests_per_month": 100000
    }
  }'
```

---

## Problemas Comunes

### Error: "poppler-utils not installed"
```bash
# Ubuntu/Debian
sudo apt-get install poppler-utils

# Verificar instalación
pdftoppm -v
```

### Error: "Cannot connect to database"
```bash
# Verificar que PostgreSQL está corriendo
sudo systemctl status postgresql

# Verificar conexión
psql -U medical_ocr_user -d medical_ocr -h localhost

# Verificar configuración en pg_hba.conf
sudo nano /etc/postgresql/14/main/pg_hba.conf
# Agregar: host all all 0.0.0.0/0 md5
```

### Error: "Redis connection failed"
```bash
# Verificar Redis
redis-cli ping

# Si Redis no está instalado y no lo necesitas, comenta REDIS_URL en .env
```

### Error: "Port 3000 already in use"
```bash
# Cambiar puerto en .env
PORT=3001

# O detener proceso en ese puerto
lsof -ti:3000 | xargs kill -9
```

---

## Siguientes Pasos

1. ✅ [Configurar como servicio del sistema](./SERVICE_SETUP.md)
2. ✅ [Configurar PM2 para gestión de procesos](./PM2_GUIDE.md)
3. ✅ [Usar la colección Postman](./postman_collection.json)
4. ✅ [Revisar guía de deployment](./DEPLOYMENT.md)

---

## Soporte

- **Documentación**: Ver `/docs` en el proyecto
- **Logs**: `./logs/` directorio
- **Issues**: Reportar en el repositorio
- **Health Check**: `http://localhost:3000/health`
