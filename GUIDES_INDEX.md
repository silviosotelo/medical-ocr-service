# Índice de Guías - Medical OCR SaaS Platform

## 🚀 Para Empezar

| Guía | Tiempo | Descripción |
|------|--------|-------------|
| **[Quick Start](./QUICK_START.md)** | 5 min | Inicio rápido con comandos esenciales |
| **[Installation](./INSTALLATION.md)** | 20 min | Instalación completa paso a paso |
| **[install.sh](./install.sh)** | 2 min | Script automático de instalación |

## ⚙️ Configuración y Deployment

| Guía | Para Quién | Descripción |
|------|------------|-------------|
| **[Service Setup (Linux)](./SERVICE_SETUP.md)** | DevOps | Configurar como servicio systemd |
| **[Service Setup (Windows)](./SERVICE_SETUP.md)** | DevOps | Configurar como servicio Windows |
| **[PM2 Guide](./PM2_GUIDE.md)** | Developers | Gestión de procesos con PM2 |
| **[Deployment](./DEPLOYMENT.md)** | DevOps | Deploy en producción con Nginx, SSL |
| **[ecosystem.config.js](./ecosystem.config.js)** | - | Archivo de configuración PM2 |
| **[docker-compose.yml](./docker-compose.yml)** | - | Configuración Docker |

## 📮 API y Testing

| Guía | Para Quién | Descripción |
|------|------------|-------------|
| **[Postman Collection](./postman_collection.json)** | Developers | Colección completa de endpoints |
| **[Postman Guide](./POSTMAN_GUIDE.md)** | Developers | Guía detallada de uso de Postman |
| **[Examples](./EXAMPLES.md)** | Developers | Ejemplos de uso de la API |
| **[test-api.sh](./test-api.sh)** | - | Script de pruebas bash |

## 🏗️ Arquitectura y Base de Datos

| Archivo | Descripción |
|---------|-------------|
| **[schema_matching.sql](./database/schema_matching.sql)** | Schema de datos de matching |
| **[migration_multitenant.sql](./database/migration_multitenant.sql)** | Migración multi-tenant |

## 📚 Documentación de Referencia

- **[README.md](./README.md)** - Documentación principal
- **[package.json](./package.json)** - Dependencias y scripts

---

## Flujos de Trabajo Recomendados

### 🆕 Primera Instalación

```bash
1. Quick Start (QUICK_START.md)
2. Installation (INSTALLATION.md)
3. Run: ./install.sh
4. Configure .env
5. Create database
6. Apply migrations
7. Start server: npm start
```

### 🐧 Setup en Linux Producción

```bash
1. Installation (INSTALLATION.md)
2. Service Setup - systemd (SERVICE_SETUP.md)
3. Configure Nginx (DEPLOYMENT.md)
4. SSL Setup (DEPLOYMENT.md)
5. Monitor: sudo journalctl -u medical-ocr -f
```

### 🔄 Setup con PM2

```bash
1. Installation (INSTALLATION.md)
2. PM2 Guide (PM2_GUIDE.md)
3. Configure ecosystem.config.js
4. Run: pm2 start ecosystem.config.js
5. Save: pm2 save && pm2 startup
6. Monitor: pm2 monit
```

### 🐳 Setup con Docker

```bash
1. Configure .env
2. Run: docker-compose up -d
3. Verify: docker-compose ps
4. Logs: docker-compose logs -f
5. Access: http://localhost:3000
```

### 🪟 Setup en Windows

```bash
1. Installation (INSTALLATION.md)
2. Service Setup - Windows (SERVICE_SETUP.md)
3. Option A: node-windows
4. Option B: NSSM
5. Verify in Services.msc
```

### 🧪 Testing con Postman

```bash
1. Import postman_collection.json
2. Read Postman Guide (POSTMAN_GUIDE.md)
3. Configure base_url variable
4. Run: Login endpoint
5. Explore other endpoints
```

### 🔧 Desarrollo Local

```bash
1. Installation (INSTALLATION.md)
2. Configure .env (development)
3. Run: npm run dev
4. Test with Postman Collection
5. Run tests: npm test
```

---

## Por Rol/Responsabilidad

### 👨‍💼 Project Manager
- [ ] README.md (overview del proyecto)
- [ ] QUICK_START.md (entender capacidades)
- [ ] EXAMPLES.md (casos de uso)

### 👨‍💻 Backend Developer
- [ ] INSTALLATION.md
- [ ] QUICK_START.md
- [ ] POSTMAN_GUIDE.md
- [ ] EXAMPLES.md
- [ ] Database schemas

### 🎨 Frontend Developer
- [ ] INSTALLATION.md
- [ ] QUICK_START.md
- [ ] POSTMAN_GUIDE.md (para entender API)

### 🚀 DevOps Engineer
- [ ] INSTALLATION.md
- [ ] SERVICE_SETUP.md (Linux/Windows)
- [ ] PM2_GUIDE.md
- [ ] DEPLOYMENT.md
- [ ] docker-compose.yml

### 🧪 QA Engineer
- [ ] POSTMAN_GUIDE.md
- [ ] POSTMAN_COLLECTION.json
- [ ] EXAMPLES.md
- [ ] test-api.sh

### 👨‍🔬 System Administrator
- [ ] SERVICE_SETUP.md
- [ ] PM2_GUIDE.md
- [ ] DEPLOYMENT.md (Nginx, SSL, monitoring)

---

## Preguntas Frecuentes

### ¿Por dónde empiezo?
→ **QUICK_START.md** (5 minutos)

### ¿Cómo instalo en mi laptop para desarrollo?
→ **INSTALLATION.md** + `npm run dev`

### ¿Cómo pongo esto en producción?
→ **INSTALLATION.md** → **SERVICE_SETUP.md** o **PM2_GUIDE.md**

### ¿Cómo pruebo la API?
→ **POSTMAN_GUIDE.md** + importar **postman_collection.json**

### ¿Cómo funciona el sistema de roles?
→ **README.md** (sección "Sistema de Roles y Permisos")

### ¿Cómo creo un tenant?
→ **POSTMAN_GUIDE.md** (Caso de Uso 1)

### ¿Cómo configuro como servicio en Linux?
→ **SERVICE_SETUP.md** (sección Linux systemd)

### ¿Cómo uso PM2?
→ **PM2_GUIDE.md**

### ¿Dónde están los ejemplos de código?
→ **EXAMPLES.md**

### ¿Cómo configuro SSL/HTTPS?
→ **DEPLOYMENT.md**

---

## Comandos de Referencia Rápida

### Desarrollo
```bash
npm install              # Instalar dependencias
npm run dev              # Modo desarrollo
npm test                 # Ejecutar tests
npm run lint             # Linter
curl localhost:3000/health  # Health check
```

### systemd (Linux)
```bash
sudo systemctl start medical-ocr
sudo systemctl status medical-ocr
sudo journalctl -u medical-ocr -f
```

### PM2
```bash
pm2 start ecosystem.config.js
pm2 logs medical-ocr
pm2 monit
pm2 reload medical-ocr
```

### Docker
```bash
docker-compose up -d
docker-compose logs -f
docker-compose restart
docker-compose down
```

---

## Estructura de Documentación

```
docs/
├── QUICK_START.md          → Inicio rápido (5 min)
├── INSTALLATION.md         → Instalación completa
├── SERVICE_SETUP.md        → systemd y Windows Service
├── PM2_GUIDE.md            → Gestión con PM2
├── DEPLOYMENT.md           → Producción (Nginx, SSL)
├── POSTMAN_GUIDE.md        → Cómo usar Postman
├── EXAMPLES.md             → Ejemplos de código
├── README.md               → Documentación principal
├── GUIDES_INDEX.md         → Este archivo (índice)
│
├── postman_collection.json → Colección Postman
├── ecosystem.config.js     → Config PM2
├── docker-compose.yml      → Config Docker
├── install.sh              → Script instalación
└── test-api.sh             → Script tests bash
```

---

## Soporte y Recursos

- **GitHub Issues**: Para reportar bugs
- **Logs**: `./logs/` directory
- **Health Endpoint**: http://localhost:3000/health
- **API Documentation**: En cada guía
