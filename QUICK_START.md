# Quick Start Guide - Medical OCR SaaS Platform

## Inicio Rápido (5 minutos)

### 1. Requisitos
```bash
node --version  # >= 20.0.0
npm --version   # >= 10.0.0
psql --version  # >= 14
```

### 2. Clonar e Instalar
```bash
git clone <repository-url>
cd medical-ocr-microservice
npm install
cd frontend && npm install && npm run build && cd ..
```

### 3. Configurar
```bash
cp .env.example .env
nano .env  # Editar DATABASE_URL, JWT_SECRET, JWT_REFRESH_SECRET
```

### 4. Base de Datos
```bash
# Crear DB
sudo -u postgres psql -c "CREATE DATABASE medical_ocr;"
sudo -u postgres psql -c "CREATE USER medical_ocr_user WITH PASSWORD 'password';"
sudo -u postgres psql -c "GRANT ALL ON DATABASE medical_ocr TO medical_ocr_user;"

# Aplicar migraciones
psql -U medical_ocr_user -d medical_ocr -f database/schema_matching.sql
psql -U medical_ocr_user -d medical_ocr -f database/migration_multitenant.sql

# Insertar datos iniciales (usuarios de prueba)
npm run db:seed
```

**Credenciales creadas:**
- Super Admin: `superadmin@platform.com` / `SuperAdmin123!`
- Admin: `admin@demo.com` / `Admin123!`
- Operator: `operator@demo.com` / `Operator123!`
- Viewer: `viewer@demo.com` / `Viewer123!`

### 5. Iniciar
```bash
npm start
# O en desarrollo:
npm run dev
```

### 6. Verificar
```bash
curl http://localhost:3000/health
```

Abrir navegador: `http://localhost:3000/portal`

---

## Opciones de Deployment

### Opción 1: systemd (Linux Producción)
```bash
# Ver guía completa
cat SERVICE_SETUP.md

# Resumen rápido:
sudo cp medical-ocr.service /etc/systemd/system/
sudo systemctl enable medical-ocr
sudo systemctl start medical-ocr
sudo systemctl status medical-ocr
```

### Opción 2: PM2 (Multiplataforma)
```bash
# Ver guía completa
cat PM2_GUIDE.md

# Resumen rápido:
npm install -g pm2
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### Opción 3: Docker Compose
```bash
# Ver DEPLOYMENT.md

# Resumen rápido:
docker-compose up -d
docker-compose logs -f
```

### Opción 4: Windows Service
```bash
# Ver SERVICE_SETUP.md

# Resumen rápido:
npm install -g node-windows
node install-service-windows.js
```

---

## Testing con Postman

### 1. Importar Colección
1. Abrir Postman
2. Click "Import"
3. Seleccionar `postman_collection.json`
4. La colección incluye variables y auto-actualización de tokens

### 2. Configurar Variables
En Postman, ir a la colección > Variables:
- `base_url`: http://localhost:3000
- Los demás se auto-completan al hacer login

### 3. Flujo de Prueba
1. **Health Check** → Verificar servicio
2. **Login** → Auto-guarda token
3. **Get User Permissions** → Ver tu rol
4. **Create Tenant** → Si eres super_admin
5. **Create API Key** → Para acceso API
6. Explorar otros endpoints según tu rol

---

## Estructura de Roles

| Rol | Acceso | Uso Principal |
|-----|--------|---------------|
| **super_admin** | Todo el sistema, todos los tenants | Gestión plataforma |
| **admin** | Su tenant completo | Administrar organización |
| **operator** | Órdenes, datos, uso | Operaciones diarias |
| **viewer** | Solo lectura de órdenes | Consulta |

---

## Documentación Completa

### 📖 Guías Principales
- **[INSTALLATION.md](./INSTALLATION.md)** - Instalación detallada paso a paso
- **[SERVICE_SETUP.md](./SERVICE_SETUP.md)** - Configurar como servicio (Linux/Windows)
- **[PM2_GUIDE.md](./PM2_GUIDE.md)** - Gestión con PM2
- **[DEPLOYMENT.md](./DEPLOYMENT.md)** - Deployment en producción
- **[EXAMPLES.md](./EXAMPLES.md)** - Ejemplos de uso de API

### 🔧 Archivos de Configuración
- **[ecosystem.config.js](./ecosystem.config.js)** - Configuración PM2
- **[docker-compose.yml](./docker-compose.yml)** - Configuración Docker
- **[postman_collection.json](./postman_collection.json)** - Colección Postman

### 📊 Scripts Disponibles
```bash
npm start              # Producción
npm run dev            # Desarrollo con nodemon
npm test               # Ejecutar tests
npm run lint           # Linter
npm run cleanup        # Limpieza de archivos temp
```

---

## Comandos de Gestión Rápida

### systemd (Linux)
```bash
sudo systemctl start medical-ocr
sudo systemctl stop medical-ocr
sudo systemctl restart medical-ocr
sudo systemctl status medical-ocr
sudo journalctl -u medical-ocr -f
```

### PM2
```bash
pm2 start ecosystem.config.js
pm2 stop medical-ocr
pm2 restart medical-ocr
pm2 reload medical-ocr      # Zero downtime
pm2 logs medical-ocr
pm2 monit
```

### Docker
```bash
docker-compose up -d
docker-compose down
docker-compose logs -f
docker-compose restart
```

---

## Crear Primer Usuario Super Admin

```bash
# Opción 1: SQL directo
psql -U medical_ocr_user -d medical_ocr
```
```sql
INSERT INTO users (id, email, password, name, role, status, created_at)
VALUES (
  gen_random_uuid(),
  'admin@example.com',
  '$2a$12$KIXx0yZvGbLqX/MK2vN.7OK8LQZaR1YZvF0IhD7sQmH9qvE6pqN.W',
  'Super Administrator',
  'super_admin',
  'active',
  NOW()
);
```

```bash
# Opción 2: Usando API
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "Admin123!@#",
    "name": "Super Administrator",
    "role": "super_admin"
  }'
```

Usuario por defecto (si usas SQL):
- Email: `admin@example.com`
- Password: `admin123`

---

## Troubleshooting Rápido

### Servicio no inicia
```bash
# Verificar logs
tail -100 logs/combined.log

# Verificar puerto
lsof -i :3000

# Verificar DB
psql -U medical_ocr_user -d medical_ocr -c "SELECT 1;"
```

### Error de permisos
```bash
sudo chown -R $USER:$USER /opt/medical-ocr
chmod 600 .env
```

### Puerto en uso
```bash
# Cambiar puerto en .env
PORT=3001

# O detener proceso
lsof -ti:3000 | xargs kill -9
```

### Base de datos no conecta
```bash
# Verificar PostgreSQL
sudo systemctl status postgresql

# Verificar conexión
psql -U medical_ocr_user -d medical_ocr -h localhost

# Ver logs de PostgreSQL
sudo journalctl -u postgresql -n 50
```

---

## URLs Importantes

- **API Base**: http://localhost:3000
- **API v1**: http://localhost:3000/api/v1
- **Portal Web**: http://localhost:3000/portal
- **Health Check**: http://localhost:3000/health
- **API Legacy**: http://localhost:3000/api

---

## Siguientes Pasos

### 1. Configuración Inicial
- ✅ [Instalar poppler-utils](./INSTALLATION.md#requisitos-previos) para PDF
- ✅ [Configurar OpenAI API Key](./INSTALLATION.md#variables-de-entorno) para AI
- ✅ [Crear tenant inicial](./INSTALLATION.md#creación-de-tenant-inicial)

### 2. Deployment
- ✅ [Configurar como servicio](./SERVICE_SETUP.md)
- ✅ [Configurar PM2](./PM2_GUIDE.md)
- ✅ [Configurar Nginx proxy](./DEPLOYMENT.md)
- ✅ [Configurar SSL/HTTPS](./DEPLOYMENT.md)

### 3. Producción
- ✅ [Configurar backups automáticos](./DEPLOYMENT.md)
- ✅ [Configurar monitoreo](./DEPLOYMENT.md)
- ✅ [Configurar log rotation](./SERVICE_SETUP.md)

---

## Soporte

- **Documentación**: Ver carpeta `/docs`
- **Issues**: GitHub Issues
- **Logs**: `./logs/` directorio
- **Health**: http://localhost:3000/health

---

## Licencia

MIT License - Ver LICENSE file
