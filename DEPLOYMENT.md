# 🚀 Guía de Deployment y Mejores Prácticas

## Índice
- [Deployment en Producción](#deployment-en-producción)
- [Configuración de Nginx](#configuración-de-nginx)
- [Gestión con PM2](#gestión-con-pm2)
- [Optimización de Performance](#optimización-de-performance)
- [Seguridad](#seguridad)
- [Monitoreo](#monitoreo)
- [Backup y Disaster Recovery](#backup-y-disaster-recovery)
- [Escalabilidad](#escalabilidad)

---

## Deployment en Producción

### 1. Preparación del Servidor

**Requisitos mínimos:**
- Ubuntu 20.04+ / Debian 11+
- 4GB RAM mínimo (recomendado 8GB)
- 2 CPU cores mínimo (recomendado 4)
- 20GB disco disponible
- Node.js 20 LTS
- poppler-utils

**Instalación de dependencias:**
```bash
# Actualizar sistema
sudo apt update && sudo apt upgrade -y

# Instalar Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Instalar poppler-utils
sudo apt install -y poppler-utils

# Instalar build essentials (para sharp)
sudo apt install -y build-essential

# Verificar instalaciones
node --version
npm --version
pdftoppm -v
```

### 2. Deployment con PM2

**Instalación de PM2:**
```bash
npm install -g pm2
```

**Configuración de PM2 (ecosystem.config.js):**
```javascript
module.exports = {
  apps: [{
    name: 'medical-ocr-service',
    script: './server.js',
    instances: 'max', // Usar todos los CPU cores
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    max_memory_restart: '1G',
    watch: false,
    autorestart: true,
    max_restarts: 10,
    min_uptime: '10s'
  }]
};
```

**Comandos PM2:**
```bash
# Iniciar servicio
pm2 start ecosystem.config.js

# Ver status
pm2 status

# Ver logs
pm2 logs medical-ocr-service

# Reiniciar
pm2 restart medical-ocr-service

# Detener
pm2 stop medical-ocr-service

# Eliminar
pm2 delete medical-ocr-service

# Guardar configuración para auto-start
pm2 save
pm2 startup
```

### 3. Deployment con Docker

**Build y deploy:**
```bash
# Build imagen
docker build -t medical-ocr-service:latest .

# Run con docker-compose
docker-compose up -d

# Ver logs
docker-compose logs -f

# Reiniciar
docker-compose restart

# Detener
docker-compose down
```

---

## Configuración de Nginx

**Instalar Nginx:**
```bash
sudo apt install nginx -y
```

**Configuración como reverse proxy (/etc/nginx/sites-available/medical-ocr):**
```nginx
upstream medical_ocr_backend {
    least_conn;
    server localhost:3000 max_fails=3 fail_timeout=30s;
}

server {
    listen 80;
    server_name api.medical-ocr.com;

    # Tamaño máximo de body (para uploads)
    client_max_body_size 15M;
    
    # Timeouts
    proxy_connect_timeout 60s;
    proxy_send_timeout 60s;
    proxy_read_timeout 90s;

    # Logging
    access_log /var/log/nginx/medical-ocr-access.log;
    error_log /var/log/nginx/medical-ocr-error.log;

    # Rate limiting zone
    limit_req_zone $binary_remote_addr zone=medical_ocr_limit:10m rate=30r/m;
    limit_req zone=medical_ocr_limit burst=5 nodelay;

    location / {
        proxy_pass http://medical_ocr_backend;
        proxy_http_version 1.1;
        
        # Headers
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        proxy_cache_bypass $http_upgrade;
    }

    # Health check endpoint sin rate limit
    location /health {
        limit_req off;
        proxy_pass http://medical_ocr_backend;
    }
}
```

**Habilitar configuración:**
```bash
sudo ln -s /etc/nginx/sites-available/medical-ocr /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

**HTTPS con Let's Encrypt:**
```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d api.medical-ocr.com
sudo certbot renew --dry-run
```

---

## Optimización de Performance

### 1. Variables de Entorno para Producción

```env
NODE_ENV=production
PORT=3000
OPENAI_API_KEY=sk-xxx

# Optimizaciones
MAX_FILE_SIZE_MB=10
TEMP_FILE_CLEANUP_INTERVAL=30

# Rate limiting agresivo
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=20

# Logging moderado
LOG_LEVEL=warn
```

### 2. Optimización de Node.js

```bash
# Aumentar límite de memoria para Node.js
node --max-old-space-size=2048 server.js

# Con PM2
pm2 start server.js --node-args="--max-old-space-size=2048"
```

### 3. Cron Job para Limpieza Automática

```bash
# Editar crontab
crontab -e

# Agregar limpieza cada 30 minutos
*/30 * * * * cd /path/to/medical-ocr-service && node src/utils/cleanup-cron.js >> logs/cleanup-cron.log 2>&1
```

### 4. Caché de Respuestas (Opcional)

Si tienes Redis disponible, puedes agregar caché:

```bash
npm install redis
```

```javascript
// En src/config/redis.config.js
const redis = require('redis');
const client = redis.createClient({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379
});

// Cachear respuesta por hash de imagen
const cacheKey = crypto.createHash('md5').update(base64Image).digest('hex');
const cached = await client.get(cacheKey);
if (cached) return JSON.parse(cached);

// ... procesar con IA ...

// Cachear por 1 hora
await client.setex(cacheKey, 3600, JSON.stringify(result));
```

---

## Seguridad

### 1. Firewall (UFW)

```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

### 2. Fail2Ban para protección DDoS

```bash
sudo apt install fail2ban -y

# Configurar filtro para nginx
sudo nano /etc/fail2ban/filter.d/nginx-req-limit.conf
```

```ini
[Definition]
failregex = limiting requests, excess:.* by zone.*client: <HOST>
ignoreregex =
```

```bash
# Configurar jail
sudo nano /etc/fail2ban/jail.local
```

```ini
[nginx-req-limit]
enabled = true
filter = nginx-req-limit
logpath = /var/log/nginx/medical-ocr-error.log
maxretry = 5
findtime = 60
bantime = 3600
```

### 3. Variables de Entorno Seguras

```bash
# Usar secretos del sistema operativo
export OPENAI_API_KEY=$(cat /etc/secrets/openai_api_key)

# O usar vault como HashiCorp Vault
```

### 4. HTTPS Obligatorio

Forzar HTTPS en Nginx:

```nginx
server {
    listen 80;
    server_name api.medical-ocr.com;
    return 301 https://$server_name$request_uri;
}
```

---

## Monitoreo

### 1. Monitoreo con PM2

```bash
# Instalar PM2 Plus (opcional, gratis para monitoreo básico)
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

### 2. Monitoreo de Logs

**Configurar Logrotate:**

```bash
sudo nano /etc/logrotate.d/medical-ocr
```

```
/path/to/medical-ocr-service/logs/*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 nodejs nodejs
}
```

### 3. Alertas por Email

**Instalar sendmail:**
```bash
sudo apt install sendmail -y
```

**Script de alerta:**
```bash
#!/bin/bash
# check-service.sh

SERVICE_URL="http://localhost:3000/health"
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" $SERVICE_URL)

if [ $RESPONSE -ne 200 ]; then
    echo "Medical OCR Service is DOWN! HTTP Code: $RESPONSE" | \
    mail -s "ALERT: Medical OCR Service Down" admin@example.com
fi
```

**Agregar a cron:**
```bash
*/5 * * * * /path/to/check-service.sh
```

### 4. Integración con New Relic / Datadog

```bash
npm install newrelic

# Configurar en server.js
require('newrelic');
const app = require('./src/app');
```

---

## Backup y Disaster Recovery

### 1. Backup de Logs

```bash
#!/bin/bash
# backup-logs.sh

BACKUP_DIR="/backups/medical-ocr-logs"
DATE=$(date +%Y-%m-%d)

mkdir -p $BACKUP_DIR
tar -czf $BACKUP_DIR/logs-$DATE.tar.gz logs/
find $BACKUP_DIR -name "*.tar.gz" -mtime +30 -delete
```

### 2. Backup de Configuración

```bash
# Versionar configuración con Git
git add .env ecosystem.config.js
git commit -m "Production config backup"
git push origin production
```

---

## Escalabilidad

### 1. Horizontal Scaling con PM2 Cluster

Ya configurado en ecosystem.config.js con `instances: 'max'`

### 2. Load Balancing con Nginx

```nginx
upstream medical_ocr_backend {
    least_conn;
    server server1.example.com:3000 weight=3;
    server server2.example.com:3000 weight=2;
    server server3.example.com:3000 weight=1;
}
```

### 3. Auto-Scaling en AWS/GCP/Azure

**Ejemplo con AWS EC2 Auto Scaling:**
- Crear AMI con el servicio configurado
- Configurar Launch Template
- Crear Auto Scaling Group
- Configurar métricas (CPU > 70% → scale out)

### 4. Queue para Procesamiento Asíncrono

Para volúmenes muy altos, usar cola de mensajes:

```bash
npm install bull redis
```

```javascript
// En src/services/queue.service.js
const Queue = require('bull');

const ocrQueue = new Queue('medical-ocr', {
  redis: {
    host: 'localhost',
    port: 6379
  }
});

// Procesar en background
ocrQueue.process(async (job) => {
  const { imagePath, opciones } = job.data;
  return await processOrder(imagePath, opciones);
});

// Agregar job
ocrQueue.add({ imagePath, opciones });
```

---

## Checklist Final de Deployment

- [ ] Variables de entorno configuradas
- [ ] poppler-utils instalado
- [ ] PM2 configurado y auto-start habilitado
- [ ] Nginx configurado como reverse proxy
- [ ] HTTPS habilitado con Let's Encrypt
- [ ] Firewall (UFW) configurado
- [ ] Fail2Ban configurado
- [ ] Cron job de limpieza configurado
- [ ] Logrotate configurado
- [ ] Monitoreo de health check activo
- [ ] Backups automatizados
- [ ] Alertas por email configuradas
- [ ] Rate limiting ajustado
- [ ] Tests de carga realizados
- [ ] Documentación de runbooks actualizada

---

**¡Tu servicio está listo para producción!** 🎉
