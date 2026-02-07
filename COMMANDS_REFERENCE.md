# Referencia Rápida de Comandos

## 🚀 Instalación

```bash
# Clonar repositorio
git clone <repository-url>
cd medical-ocr-microservice

# Instalar dependencias
npm install
cd frontend && npm install && npm run build && cd ..

# O usar script automático
./install.sh
```

## 🗄️ Base de Datos

### Crear Base de Datos

```bash
# PostgreSQL
sudo -u postgres psql -c "CREATE DATABASE medical_ocr;"
sudo -u postgres psql -c "CREATE USER medical_ocr_user WITH PASSWORD 'password';"
sudo -u postgres psql -c "GRANT ALL ON DATABASE medical_ocr TO medical_ocr_user;"
```

### Aplicar Migraciones

```bash
# Schema principal
psql -U medical_ocr_user -d medical_ocr -f database/schema_matching.sql

# Multi-tenancy
psql -U medical_ocr_user -d medical_ocr -f database/migration_multitenant.sql
```

### Insertar Datos Iniciales (Seed)

```bash
# Método 1: npm (recomendado)
npm run db:seed

# Método 2: Script interactivo
./scripts/seed.sh

# Método 3: SQL directo
psql $DATABASE_URL -f database/seed_data.sql
```

## 🏃 Ejecución

### Desarrollo

```bash
npm run dev          # Con nodemon (auto-restart)
```

### Producción

```bash
npm start            # Direct
```

### Tests

```bash
npm test             # All tests
npm run test:watch   # Watch mode
npm run lint         # Linter
```

## 🔧 Gestión con PM2

### Básico

```bash
# Instalar PM2
npm install -g pm2

# Iniciar
pm2 start ecosystem.config.js

# Ver lista
pm2 list

# Ver logs
pm2 logs medical-ocr

# Monitorear
pm2 monit

# Detener
pm2 stop medical-ocr

# Reiniciar
pm2 restart medical-ocr

# Reload (zero downtime)
pm2 reload medical-ocr

# Eliminar
pm2 delete medical-ocr
```

### Persistencia

```bash
# Guardar configuración actual
pm2 save

# Configurar inicio automático
pm2 startup

# Verificar
systemctl status pm2-$USER
```

### Logs

```bash
# Ver logs en tiempo real
pm2 logs medical-ocr

# Últimas 100 líneas
pm2 logs medical-ocr --lines 100

# Limpiar logs
pm2 flush medical-ocr
```

## 🐧 Gestión con systemd (Linux)

### Comandos Básicos

```bash
# Iniciar servicio
sudo systemctl start medical-ocr

# Detener servicio
sudo systemctl stop medical-ocr

# Reiniciar servicio
sudo systemctl restart medical-ocr

# Ver estado
sudo systemctl status medical-ocr

# Habilitar inicio automático
sudo systemctl enable medical-ocr

# Deshabilitar inicio automático
sudo systemctl disable medical-ocr
```

### Logs

```bash
# Ver logs en tiempo real
sudo journalctl -u medical-ocr -f

# Últimas 100 líneas
sudo journalctl -u medical-ocr -n 100

# Logs desde fecha
sudo journalctl -u medical-ocr --since "2024-02-07 10:00:00"

# Solo errores
sudo journalctl -u medical-ocr -p err

# Exportar logs
sudo journalctl -u medical-ocr --since today > logs.txt
```

### Configuración

```bash
# Recargar configuración de systemd
sudo systemctl daemon-reload

# Editar service file
sudo nano /etc/systemd/system/medical-ocr.service
```

## 🐳 Docker

### Docker Compose

```bash
# Iniciar servicios
docker-compose up -d

# Ver logs
docker-compose logs -f

# Ver logs de servicio específico
docker-compose logs -f backend

# Detener servicios
docker-compose down

# Reiniciar
docker-compose restart

# Ver estado
docker-compose ps

# Rebuild
docker-compose up -d --build
```

### Docker Directo

```bash
# Build
docker build -t medical-ocr-service .

# Run
docker run -d -p 3000:3000 --env-file .env medical-ocr-service

# Ver logs
docker logs -f <container-id>

# Entrar al container
docker exec -it <container-id> bash

# Ver containers
docker ps
```

## 🪟 Windows Service

### Con NSSM

```powershell
# Instalar servicio
nssm install MedicalOCR "C:\Program Files\nodejs\node.exe" "C:\medical-ocr\server.js"

# Configurar
nssm set MedicalOCR AppDirectory C:\medical-ocr
nssm set MedicalOCR AppEnvironmentExtra NODE_ENV=production

# Iniciar
nssm start MedicalOCR

# Detener
nssm stop MedicalOCR

# Ver estado
nssm status MedicalOCR

# Eliminar
nssm remove MedicalOCR confirm
```

### Con PowerShell

```powershell
# Ver servicio
Get-Service MedicalOCR

# Iniciar
Start-Service MedicalOCR

# Detener
Stop-Service MedicalOCR

# Reiniciar
Restart-Service MedicalOCR

# Ver logs
Get-Content C:\medical-ocr\logs\*.log -Wait
```

## 🔍 Verificación y Debugging

### Health Checks

```bash
# Health check
curl http://localhost:3000/health

# Service info
curl http://localhost:3000/

# API version
curl http://localhost:3000/api/v1/version
```

### Login y Auth

```bash
# Login
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@demo.com", "password": "Admin123!"}'

# Guardar token
export TOKEN="your_token_here"

# Usar token
curl http://localhost:3000/api/v1/auth/me \
  -H "Authorization: Bearer $TOKEN"
```

### Verificar Puerto

```bash
# Linux
lsof -i :3000
ss -tlnp | grep 3000

# Ver proceso
ps aux | grep "node.*server.js"

# Windows (PowerShell)
netstat -ano | findstr :3000
```

### Verificar Base de Datos

```bash
# Conectar
psql -U medical_ocr_user -d medical_ocr

# Contar registros
psql $DATABASE_URL -c "SELECT COUNT(*) FROM tenants;"
psql $DATABASE_URL -c "SELECT COUNT(*) FROM users;"

# Ver tenants
psql $DATABASE_URL -c "SELECT id, name, slug, plan FROM tenants;"

# Ver usuarios
psql $DATABASE_URL -c "SELECT email, name, role FROM users;"
```

## 🧹 Mantenimiento

### Limpiar Archivos Temporales

```bash
# Manual
npm run cleanup

# Forzar desde API
curl -X POST http://localhost:3000/health/cleanup
```

### Limpieza de Logs

```bash
# PM2
pm2 flush

# Archivos de log del proyecto
rm -rf logs/*.log

# systemd (requiere sudo)
sudo journalctl --vacuum-time=7d
```

### Actualizar Aplicación

```bash
# Detener servicio
pm2 stop medical-ocr
# o
sudo systemctl stop medical-ocr

# Backup
cp -r /opt/medical-ocr /opt/medical-ocr.backup

# Actualizar código
git pull
npm install
cd frontend && npm install && npm run build && cd ..

# Reiniciar
pm2 start ecosystem.config.js
# o
sudo systemctl start medical-ocr
```

## 🔐 Seguridad

### Generar Secrets

```bash
# JWT Secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# JWT Refresh Secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Cambiar Contraseña

```bash
# Login y obtener token
TOKEN=$(curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@demo.com","password":"Admin123!"}' \
  | jq -r '.data.accessToken')

# Cambiar password
curl -X PUT http://localhost:3000/api/v1/auth/password \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "currentPassword": "Admin123!",
    "newPassword": "NewSecurePassword123!@#"
  }'
```

## 📊 Monitoreo

### Ver Uso de Recursos

```bash
# PM2
pm2 monit

# systemd
systemctl show medical-ocr --property=MemoryCurrent,CPUUsageNSec

# Docker
docker stats
```

### Métricas de la Aplicación

```bash
# Estadísticas de uso
curl http://localhost:3000/api/v1/usage/summary \
  -H "Authorization: Bearer $TOKEN"

# Uso diario
curl http://localhost:3000/api/v1/usage/daily?days=30 \
  -H "Authorization: Bearer $TOKEN"

# Cuota
curl http://localhost:3000/api/v1/usage/quota \
  -H "Authorization: Bearer $TOKEN"
```

## 📮 Testing con Postman

```bash
# Importar colección
# File → Import → postman_collection.json

# Configurar variables
# Collection → Variables → base_url: http://localhost:3000

# Login (auto-guarda tokens)
# POST /auth/login

# Explorar endpoints
# Ver POSTMAN_GUIDE.md
```

## 🔗 URLs Importantes

```bash
# API
http://localhost:3000/health           # Health check
http://localhost:3000/                 # Service info
http://localhost:3000/api/v1/version   # API version

# Portal Web
http://localhost:3000/portal           # Frontend

# Documentación
./QUICK_START.md                       # Inicio rápido
./INSTALLATION.md                      # Instalación completa
./DATABASE_SEED_GUIDE.md               # Guía de seeding
./SERVICE_SETUP.md                     # Configurar servicio
./PM2_GUIDE.md                         # Gestión con PM2
./POSTMAN_GUIDE.md                     # Testing con Postman
./GUIDES_INDEX.md                      # Índice de guías
```

## 🆘 Troubleshooting Rápido

### Puerto en uso

```bash
# Linux
lsof -ti:3000 | xargs kill -9

# Windows
netstat -ano | findstr :3000
taskkill /PID <pid> /F
```

### DB no conecta

```bash
# Verificar PostgreSQL
sudo systemctl status postgresql

# Test conexión
psql $DATABASE_URL -c "SELECT 1;"

# Ver logs
sudo journalctl -u postgresql -n 50
```

### Reinstalar dependencias

```bash
rm -rf node_modules package-lock.json
npm install
```

### Reset completo

```bash
# Detener todo
pm2 delete all
sudo systemctl stop medical-ocr

# Limpiar
rm -rf node_modules logs/*.log temp/* uploads/*

# Reinstalar
npm install
cd frontend && npm install && npm run build && cd ..

# Base de datos (CUIDADO: borra todos los datos)
psql $DATABASE_URL -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
psql $DATABASE_URL -f database/schema_matching.sql
psql $DATABASE_URL -f database/migration_multitenant.sql
npm run db:seed

# Reiniciar
npm start
```

---

## 📚 Ver Más

- **[QUICK_START.md](./QUICK_START.md)** - Guía de inicio rápido
- **[INSTALLATION.md](./INSTALLATION.md)** - Instalación detallada
- **[DATABASE_SEED_GUIDE.md](./DATABASE_SEED_GUIDE.md)** - Seeding de base de datos
- **[SERVICE_SETUP.md](./SERVICE_SETUP.md)** - Setup como servicio
- **[PM2_GUIDE.md](./PM2_GUIDE.md)** - Gestión con PM2
- **[POSTMAN_GUIDE.md](./POSTMAN_GUIDE.md)** - Testing con Postman
- **[GUIDES_INDEX.md](./GUIDES_INDEX.md)** - Índice completo
