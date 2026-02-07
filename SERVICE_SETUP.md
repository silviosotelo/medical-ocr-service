# Configuración como Servicio del Sistema

## Tabla de Contenidos
1. [Linux (systemd)](#linux-systemd)
2. [Windows (Windows Service)](#windows-windows-service)
3. [Gestión del Servicio](#gestión-del-servicio)
4. [Logs y Monitoreo](#logs-y-monitoreo)

---

## Linux (systemd)

### Requisitos Previos
- Sistema con **systemd** (Ubuntu 16.04+, CentOS 7+, Debian 8+)
- Permisos de **sudo/root**
- Aplicación instalada en `/opt/medical-ocr` (o ruta personalizada)

### 1. Crear Usuario del Sistema (Recomendado)

```bash
# Crear usuario sin shell para mayor seguridad
sudo useradd -r -s /bin/false medical-ocr

# Cambiar propietario de los archivos
sudo chown -R medical-ocr:medical-ocr /opt/medical-ocr
```

### 2. Crear Archivo de Servicio systemd

```bash
sudo nano /etc/systemd/system/medical-ocr.service
```

Contenido del archivo:

```ini
[Unit]
Description=Medical OCR SaaS Platform
Documentation=https://github.com/your-org/medical-ocr
After=network.target postgresql.service redis.service
Wants=postgresql.service redis.service

[Service]
Type=simple
User=medical-ocr
Group=medical-ocr
WorkingDirectory=/opt/medical-ocr
Environment=NODE_ENV=production
EnvironmentFile=/opt/medical-ocr/.env
ExecStart=/usr/bin/node /opt/medical-ocr/server.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=medical-ocr

# Límites de recursos
LimitNOFILE=65536
LimitNPROC=4096

# Seguridad
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/medical-ocr/temp /opt/medical-ocr/uploads /opt/medical-ocr/logs

[Install]
WantedBy=multi-user.target
```

### 3. Configurar Permisos

```bash
# Permisos del archivo de servicio
sudo chmod 644 /etc/systemd/system/medical-ocr.service

# Asegurar que .env tiene permisos restrictivos
sudo chmod 600 /opt/medical-ocr/.env
sudo chown medical-ocr:medical-ocr /opt/medical-ocr/.env

# Crear directorios necesarios
sudo mkdir -p /opt/medical-ocr/temp
sudo mkdir -p /opt/medical-ocr/uploads
sudo mkdir -p /opt/medical-ocr/logs
sudo chown -R medical-ocr:medical-ocr /opt/medical-ocr/temp
sudo chown -R medical-ocr:medical-ocr /opt/medical-ocr/uploads
sudo chown -R medical-ocr:medical-ocr /opt/medical-ocr/logs
```

### 4. Habilitar e Iniciar el Servicio

```bash
# Recargar configuración de systemd
sudo systemctl daemon-reload

# Habilitar inicio automático
sudo systemctl enable medical-ocr

# Iniciar el servicio
sudo systemctl start medical-ocr

# Verificar estado
sudo systemctl status medical-ocr
```

### 5. Verificar que Funciona

```bash
# Ver logs en tiempo real
sudo journalctl -u medical-ocr -f

# Ver últimas 100 líneas
sudo journalctl -u medical-ocr -n 100

# Ver logs de hoy
sudo journalctl -u medical-ocr --since today

# Verificar que el puerto está escuchando
sudo ss -tlnp | grep 3000
```

### Comandos de Gestión (Linux)

```bash
# Iniciar servicio
sudo systemctl start medical-ocr

# Detener servicio
sudo systemctl stop medical-ocr

# Reiniciar servicio
sudo systemctl restart medical-ocr

# Ver estado
sudo systemctl status medical-ocr

# Ver logs
sudo journalctl -u medical-ocr -f

# Deshabilitar inicio automático
sudo systemctl disable medical-ocr

# Recargar configuración si cambias el archivo .service
sudo systemctl daemon-reload
sudo systemctl restart medical-ocr
```

---

## Windows (Windows Service)

### Opción A: node-windows (Recomendado)

#### 1. Instalar node-windows

```bash
npm install -g node-windows
```

#### 2. Crear Script de Instalación

Crear archivo `install-service-windows.js`:

```javascript
const Service = require('node-windows').Service;

// Crear objeto de servicio
const svc = new Service({
  name: 'MedicalOCR',
  description: 'Medical OCR SaaS Platform - Automated medical document processing',
  script: 'C:\\medical-ocr\\server.js',
  nodeOptions: [
    '--harmony',
    '--max_old_space_size=4096'
  ],
  env: [
    {
      name: 'NODE_ENV',
      value: 'production'
    },
    {
      name: 'PORT',
      value: '3000'
    }
  ],
  workingDirectory: 'C:\\medical-ocr',
  allowServiceLogon: true
});

// Escuchar evento de instalación
svc.on('install', () => {
  console.log('Service installed successfully!');
  svc.start();
});

// Escuchar errores
svc.on('error', (err) => {
  console.error('Service error:', err);
});

// Instalar el servicio
svc.install();
```

#### 3. Instalar el Servicio

```bash
# Como Administrador en PowerShell
cd C:\medical-ocr
node install-service-windows.js
```

#### 4. Crear Script de Desinstalación

Crear archivo `uninstall-service-windows.js`:

```javascript
const Service = require('node-windows').Service;

const svc = new Service({
  name: 'MedicalOCR',
  script: 'C:\\medical-ocr\\server.js'
});

svc.on('uninstall', () => {
  console.log('Service uninstalled successfully!');
});

svc.uninstall();
```

#### Comandos de Gestión (Windows)

```powershell
# Ver servicios (PowerShell como Administrador)
Get-Service MedicalOCR

# Iniciar servicio
Start-Service MedicalOCR

# Detener servicio
Stop-Service MedicalOCR

# Reiniciar servicio
Restart-Service MedicalOCR

# Ver logs (ubicados en daemon/)
Get-Content C:\medical-ocr\daemon\*.log -Wait
```

### Opción B: NSSM (Non-Sucking Service Manager)

#### 1. Descargar e Instalar NSSM

```powershell
# Descargar desde https://nssm.cc/download
# O usando Chocolatey:
choco install nssm

# Verificar instalación
nssm version
```

#### 2. Instalar Servicio con NSSM

```powershell
# Como Administrador
nssm install MedicalOCR "C:\Program Files\nodejs\node.exe" "C:\medical-ocr\server.js"

# Configurar directorio de trabajo
nssm set MedicalOCR AppDirectory C:\medical-ocr

# Configurar variables de entorno
nssm set MedicalOCR AppEnvironmentExtra NODE_ENV=production

# Configurar reinicio automático
nssm set MedicalOCR AppRestartDelay 10000

# Configurar stdout y stderr
nssm set MedicalOCR AppStdout C:\medical-ocr\logs\service-out.log
nssm set MedicalOCR AppStderr C:\medical-ocr\logs\service-error.log

# Configurar rotación de logs
nssm set MedicalOCR AppStdoutCreationDisposition 4
nssm set MedicalOCR AppStderrCreationDisposition 4

# Iniciar servicio
nssm start MedicalOCR
```

#### Comandos NSSM

```powershell
# Ver configuración
nssm dump MedicalOCR

# Editar servicio (abre GUI)
nssm edit MedicalOCR

# Eliminar servicio
nssm remove MedicalOCR confirm

# Ver estado
nssm status MedicalOCR

# Iniciar
nssm start MedicalOCR

# Detener
nssm stop MedicalOCR

# Reiniciar
nssm restart MedicalOCR
```

---

## Configuración Avanzada

### Auto-Reinicio en Linux (systemd)

Editar `/etc/systemd/system/medical-ocr.service`:

```ini
[Service]
# Reiniciar siempre excepto cuando se detenga manualmente
Restart=on-failure
RestartSec=10s

# Intentar reiniciar hasta 5 veces en 10 minutos
StartLimitInterval=600
StartLimitBurst=5

# Configuración de watchdog (opcional)
WatchdogSec=30s
```

### Monitoreo de Recursos (Linux)

```bash
# Ver uso de recursos del servicio
systemctl show medical-ocr --property=MemoryCurrent,CPUUsageNSec

# Limitar memoria (agregar a [Service] en .service)
MemoryMax=2G
MemoryHigh=1.5G

# Limitar CPU
CPUQuota=200%  # 2 cores máximo
```

### Configurar Log Rotation (Linux)

Crear `/etc/logrotate.d/medical-ocr`:

```
/opt/medical-ocr/logs/*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 medical-ocr medical-ocr
    sharedscripts
    postrotate
        systemctl reload medical-ocr > /dev/null 2>&1 || true
    endscript
}
```

---

## Gestión del Servicio

### Verificar Estado del Servicio

#### Linux
```bash
# Estado detallado
sudo systemctl status medical-ocr

# Solo verificar si está activo
systemctl is-active medical-ocr

# Verificar si está habilitado
systemctl is-enabled medical-ocr

# Ver proceso
ps aux | grep "node.*server.js"
```

#### Windows
```powershell
# Estado
Get-Service MedicalOCR | Format-List

# Verificar proceso
Get-Process | Where-Object {$_.Name -like "*node*"}
```

### Actualizar la Aplicación

#### Linux
```bash
# 1. Detener servicio
sudo systemctl stop medical-ocr

# 2. Hacer backup
sudo cp -r /opt/medical-ocr /opt/medical-ocr.backup

# 3. Actualizar código
cd /opt/medical-ocr
sudo -u medical-ocr git pull
sudo -u medical-ocr npm install
cd frontend && sudo -u medical-ocr npm install && sudo -u medical-ocr npm run build && cd ..

# 4. Reiniciar servicio
sudo systemctl start medical-ocr

# 5. Verificar
sudo systemctl status medical-ocr
sudo journalctl -u medical-ocr -n 50
```

#### Windows
```powershell
# 1. Detener servicio
Stop-Service MedicalOCR

# 2. Actualizar código
cd C:\medical-ocr
git pull
npm install
cd frontend
npm install
npm run build
cd ..

# 3. Iniciar servicio
Start-Service MedicalOCR

# 4. Verificar logs
Get-Content C:\medical-ocr\logs\*.log -Wait -Tail 50
```

---

## Logs y Monitoreo

### Ver Logs (Linux)

```bash
# Tiempo real
sudo journalctl -u medical-ocr -f

# Últimas 100 líneas
sudo journalctl -u medical-ocr -n 100

# Desde fecha específica
sudo journalctl -u medical-ocr --since "2024-02-07 10:00:00"

# Solo errores
sudo journalctl -u medical-ocr -p err

# Exportar logs
sudo journalctl -u medical-ocr --since today > medical-ocr-logs.txt
```

### Ver Logs (Windows)

```powershell
# Con node-windows (logs en daemon/)
Get-Content C:\medical-ocr\daemon\*.log -Wait

# Con NSSM
Get-Content C:\medical-ocr\logs\service-out.log -Wait -Tail 50
Get-Content C:\medical-ocr\logs\service-error.log -Wait -Tail 50

# Event Viewer
eventvwr.msc
# Buscar: Windows Logs -> Application -> Source: MedicalOCR
```

### Monitoreo de Salud

Crear script de monitoreo `check-health.sh`:

```bash
#!/bin/bash

HEALTH_URL="http://localhost:3000/health"
TIMEOUT=10

response=$(curl -s -o /dev/null -w "%{http_code}" --max-time $TIMEOUT $HEALTH_URL)

if [ "$response" = "200" ]; then
    echo "Service is healthy"
    exit 0
else
    echo "Service is unhealthy (HTTP $response)"
    # Reiniciar servicio
    systemctl restart medical-ocr
    exit 1
fi
```

Agregar a cron:
```bash
# Verificar cada 5 minutos
*/5 * * * * /opt/medical-ocr/check-health.sh >> /var/log/medical-ocr-health.log 2>&1
```

---

## Troubleshooting

### Servicio no inicia (Linux)

```bash
# Ver errores detallados
sudo journalctl -u medical-ocr -n 200 --no-pager

# Verificar permisos
ls -la /opt/medical-ocr
ls -la /opt/medical-ocr/.env

# Verificar sintaxis del archivo .service
sudo systemd-analyze verify medical-ocr.service

# Probar iniciar manualmente
sudo -u medical-ocr bash
cd /opt/medical-ocr
node server.js
```

### Servicio no inicia (Windows)

```powershell
# Ver errores en Event Viewer
eventvwr.msc

# Probar iniciar manualmente
cd C:\medical-ocr
node server.js

# Verificar permisos de usuario del servicio
Get-Service MedicalOCR | Select-Object -Property *
```

### Puerto en uso

```bash
# Linux: Ver qué proceso usa el puerto
sudo lsof -i :3000
sudo ss -tlnp | grep 3000

# Windows: Ver qué proceso usa el puerto
netstat -ano | findstr :3000
```

---

## Siguientes Pasos

- ✅ [Usar PM2 como alternativa](./PM2_GUIDE.md)
- ✅ [Configurar Nginx como proxy reverso](./DEPLOYMENT.md)
- ✅ [Importar colección Postman](./postman_collection.json)
