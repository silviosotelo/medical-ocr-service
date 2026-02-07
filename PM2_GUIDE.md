# Guía de PM2 - Process Manager

## Tabla de Contenidos
1. [¿Qué es PM2?](#qué-es-pm2)
2. [Instalación](#instalación)
3. [Configuración Básica](#configuración-básica)
4. [Configuración Avanzada](#configuración-avanzada)
5. [Comandos Esenciales](#comandos-esenciales)
6. [Monitoreo](#monitoreo)
7. [Logs](#logs)
8. [Clustering](#clustering)
9. [Inicio Automático](#inicio-automático)
10. [Mejores Prácticas](#mejores-prácticas)

---

## ¿Qué es PM2?

**PM2** es un gestor de procesos de producción para aplicaciones Node.js con:
- ✅ Auto-reinicio en caso de crash
- ✅ Balanceo de carga integrado (cluster mode)
- ✅ Logs centralizados
- ✅ Monitoreo en tiempo real
- ✅ Inicio automático al reiniciar el sistema
- ✅ Zero-downtime reload

---

## Instalación

### Instalación Global (Recomendado)

```bash
# Instalar PM2 globalmente
npm install -g pm2

# Verificar instalación
pm2 --version

# Ver ayuda
pm2 --help
```

### Actualizar PM2

```bash
# Guardar lista de procesos actual
pm2 save

# Actualizar PM2
npm install -g pm2@latest

# Actualizar PM2 en memoria
pm2 update
```

---

## Configuración Básica

### Método 1: Comando Directo (Inicio Rápido)

```bash
# Navegar al directorio del proyecto
cd /opt/medical-ocr

# Iniciar aplicación
pm2 start server.js --name medical-ocr

# Verificar que está corriendo
pm2 list
```

### Método 2: Archivo de Configuración (Recomendado)

Crear archivo `ecosystem.config.js` en la raíz del proyecto:

```javascript
module.exports = {
  apps: [
    {
      name: 'medical-ocr',
      script: './server.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      listen_timeout: 3000,
      kill_timeout: 5000,
    },
  ],
};
```

Iniciar con el archivo de configuración:

```bash
pm2 start ecosystem.config.js
```

---

## Configuración Avanzada

### ecosystem.config.js Completo

```javascript
module.exports = {
  apps: [
    {
      // ============================================
      // CONFIGURACIÓN BÁSICA
      // ============================================
      name: 'medical-ocr',
      script: './server.js',
      cwd: '/opt/medical-ocr',

      // ============================================
      // MODO DE EJECUCIÓN
      // ============================================
      instances: 4,           // Número de instancias (0 = número de CPUs)
      exec_mode: 'cluster',   // 'fork' o 'cluster'

      // ============================================
      // VARIABLES DE ENTORNO
      // ============================================
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      env_development: {
        NODE_ENV: 'development',
        PORT: 3001,
      },
      env_staging: {
        NODE_ENV: 'staging',
        PORT: 3002,
      },

      // ============================================
      // LOGS
      // ============================================
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_file: './logs/pm2-combined.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,

      // ============================================
      // REINICIO Y MONITOREO
      // ============================================
      autorestart: true,
      watch: false,           // true solo en desarrollo
      ignore_watch: ['node_modules', 'logs', 'temp', 'uploads'],
      max_memory_restart: '1G',
      max_restarts: 10,
      min_uptime: '10s',

      // ============================================
      // TIMEOUTS
      // ============================================
      listen_timeout: 3000,   // Tiempo para escuchar puerto
      kill_timeout: 5000,     // Tiempo antes de SIGKILL
      shutdown_with_message: true,

      // ============================================
      // SOURCE CONTROL (Opcional)
      // ============================================
      // post_update: ['npm install', 'npm run build'],

      // ============================================
      // ADVANCED OPTIONS
      // ============================================
      node_args: '--max-old-space-size=4096',
      args: '',
      interpreter: 'node',
      interpreter_args: '',

      // ============================================
      // CRON (Restart Programado)
      // ============================================
      // cron_restart: '0 0 * * *',  // Reiniciar diariamente a medianoche

      // ============================================
      // MÉTRICAS
      // ============================================
      instance_var: 'INSTANCE_ID',
      pmx: true,
    },
  ],

  // ============================================
  // DEPLOYMENT (Opcional)
  // ============================================
  deploy: {
    production: {
      user: 'deploy',
      host: 'your-server.com',
      ref: 'origin/main',
      repo: 'git@github.com:your-org/medical-ocr.git',
      path: '/opt/medical-ocr',
      'post-deploy': 'npm install && cd frontend && npm install && npm run build && cd .. && pm2 reload ecosystem.config.js --env production',
    },
    staging: {
      user: 'deploy',
      host: 'staging-server.com',
      ref: 'origin/develop',
      repo: 'git@github.com:your-org/medical-ocr.git',
      path: '/opt/medical-ocr-staging',
      'post-deploy': 'npm install && cd frontend && npm install && npm run build && cd .. && pm2 reload ecosystem.config.js --env staging',
    },
  },
};
```

---

## Comandos Esenciales

### Gestión de Procesos

```bash
# Iniciar aplicación
pm2 start ecosystem.config.js
pm2 start server.js --name medical-ocr

# Detener aplicación
pm2 stop medical-ocr
pm2 stop all

# Reiniciar aplicación
pm2 restart medical-ocr
pm2 restart all

# Recargar (zero downtime - solo cluster mode)
pm2 reload medical-ocr

# Eliminar de PM2
pm2 delete medical-ocr
pm2 delete all

# Ver lista de procesos
pm2 list
pm2 ls
pm2 status

# Ver información detallada
pm2 show medical-ocr
pm2 describe medical-ocr
```

### Iniciar con diferentes entornos

```bash
# Producción (por defecto)
pm2 start ecosystem.config.js

# Desarrollo
pm2 start ecosystem.config.js --env development

# Staging
pm2 start ecosystem.config.js --env staging
```

### Escalado (Clustering)

```bash
# Escalar a 4 instancias
pm2 scale medical-ocr 4

# Escalar según CPUs disponibles
pm2 scale medical-ocr max

# Reducir a 1 instancia
pm2 scale medical-ocr 1
```

---

## Monitoreo

### Monitor en Terminal

```bash
# Monitoreo en tiempo real
pm2 monit

# Ver uso de CPU y memoria
pm2 list
```

### Dashboard Web (PM2 Plus)

```bash
# Conectar a PM2 Plus (gratis para proyectos pequeños)
pm2 plus

# O registrarse en https://pm2.io
pm2 link <secret_key> <public_key>
```

### Información del Sistema

```bash
# Información general del sistema
pm2 info

# Uso de recursos
pm2 describe medical-ocr
```

---

## Logs

### Ver Logs en Tiempo Real

```bash
# Todos los procesos
pm2 logs

# Proceso específico
pm2 logs medical-ocr

# Últimas 100 líneas
pm2 logs --lines 100

# Solo errores
pm2 logs --err

# Solo salida estándar
pm2 logs --out

# Con timestamp
pm2 logs --timestamp

# JSON format
pm2 logs --json
```

### Limpiar Logs

```bash
# Limpiar todos los logs
pm2 flush

# Limpiar logs de un proceso específico
pm2 flush medical-ocr
```

### Rotación de Logs

```bash
# Instalar módulo de rotación
pm2 install pm2-logrotate

# Configurar rotación
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
pm2 set pm2-logrotate:compress true
pm2 set pm2-logrotate:dateFormat YYYY-MM-DD_HH-mm-ss
pm2 set pm2-logrotate:workerInterval 30
pm2 set pm2-logrotate:rotateInterval '0 0 * * *'

# Ver configuración
pm2 conf pm2-logrotate
```

---

## Clustering

### ¿Cuándo usar Cluster Mode?

✅ **Usar cluster mode cuando:**
- Aplicación puede correr en múltiples procesos sin estado compartido
- Necesitas aprovechar todos los cores del CPU
- Requieres alta disponibilidad

❌ **No usar cluster mode cuando:**
- Aplicación mantiene estado en memoria
- Usas WebSockets sin un adaptador como Socket.io con Redis
- Procesas tareas background pesadas

### Configurar Cluster Mode

```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'medical-ocr',
    script: './server.js',
    instances: 'max',        // O número específico: 4
    exec_mode: 'cluster',
    max_memory_restart: '1G',
  }],
};
```

```bash
# Iniciar en cluster mode
pm2 start ecosystem.config.js

# Escalar dinámicamente
pm2 scale medical-ocr +2  # Agregar 2 instancias
pm2 scale medical-ocr -1  # Quitar 1 instancia
```

### Zero Downtime Reload

```bash
# Recargar sin downtime (solo cluster mode)
pm2 reload medical-ocr

# O actualizar todo el cluster
pm2 reload all
```

---

## Inicio Automático

### Linux (systemd)

```bash
# Generar script de inicio
pm2 startup

# Esto mostrará un comando como:
# sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u youruser --hp /home/youruser

# Copiar y ejecutar ese comando

# Guardar lista actual de procesos
pm2 save

# Verificar
systemctl status pm2-youruser
```

### Actualizar startup script

```bash
# Si cambias de usuario o instalas Node en otra ubicación
pm2 unstartup
pm2 startup
pm2 save
```

### Windows

```bash
# Instalar pm2-windows-startup globalmente
npm install -g pm2-windows-startup

# Configurar
pm2-startup install

# Guardar procesos
pm2 save
```

---

## Mejores Prácticas

### 1. Usar Archivo de Configuración

✅ **Hacer:**
```bash
pm2 start ecosystem.config.js
```

❌ **Evitar:**
```bash
pm2 start server.js
```

### 2. Configurar Logs Apropiadamente

```javascript
{
  error_file: './logs/pm2-error.log',
  out_file: './logs/pm2-out.log',
  merge_logs: true,
  log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
}
```

### 3. Limitar Memoria

```javascript
{
  max_memory_restart: '1G',  // Reiniciar si excede 1GB
}
```

### 4. Usar Cluster Mode en Producción

```javascript
{
  instances: 4,              // O 'max' para usar todos los CPUs
  exec_mode: 'cluster',
}
```

### 5. Configurar Variables de Entorno

```javascript
{
  env: {
    NODE_ENV: 'production',
    PORT: 3000,
  },
  env_staging: {
    NODE_ENV: 'staging',
    PORT: 3001,
  },
}
```

### 6. Implementar Health Checks

```bash
# Script para verificar salud
pm2 install pm2-auto-pull  # Auto-update desde git

# O crear tu propio healthcheck
# Ver guía en SERVICE_SETUP.md
```

---

## Troubleshooting

### Proceso no inicia

```bash
# Ver logs de error
pm2 logs medical-ocr --err --lines 50

# Ver información detallada
pm2 describe medical-ocr

# Eliminar y reiniciar
pm2 delete medical-ocr
pm2 start ecosystem.config.js

# Verificar sintaxis de ecosystem.config.js
node -c ecosystem.config.js
```

### Alto uso de memoria

```bash
# Ver uso actual
pm2 list

# Ver detalles
pm2 describe medical-ocr

# Reducir número de instancias
pm2 scale medical-ocr 2

# Configurar límite
pm2 restart medical-ocr --max-memory-restart 500M
```

### Reinicio constante

```bash
# Ver logs para identificar el problema
pm2 logs medical-ocr --lines 100

# Verificar configuración
pm2 describe medical-ocr

# Aumentar min_uptime si la app tarda en iniciar
# En ecosystem.config.js:
{
  min_uptime: '30s',
  max_restarts: 5,
}
```

### Limpiar todo y empezar de nuevo

```bash
# Detener todo
pm2 stop all

# Eliminar todo
pm2 delete all

# Limpiar dumps
pm2 cleardump

# Matar daemon de PM2
pm2 kill

# Reiniciar desde cero
pm2 start ecosystem.config.js
pm2 save
```

---

## Comandos Útiles de Referencia Rápida

```bash
# Gestión básica
pm2 start ecosystem.config.js
pm2 stop medical-ocr
pm2 restart medical-ocr
pm2 reload medical-ocr
pm2 delete medical-ocr
pm2 list

# Logs
pm2 logs medical-ocr
pm2 logs --lines 100
pm2 flush

# Monitoreo
pm2 monit
pm2 describe medical-ocr

# Cluster
pm2 scale medical-ocr 4
pm2 reload medical-ocr

# Persistencia
pm2 save
pm2 resurrect

# Startup
pm2 startup
pm2 unstartup

# Actualización
pm2 update
pm2 save

# Limpieza
pm2 delete all
pm2 kill
```

---

## Comparación: PM2 vs systemd

| Característica | PM2 | systemd |
|----------------|-----|---------|
| **Clustering** | ✅ Nativo | ❌ Manual |
| **Zero downtime reload** | ✅ Sí | ❌ No |
| **Monitoreo integrado** | ✅ Dashboard web | ⚠️ Journalctl |
| **Multi-plataforma** | ✅ Linux, Mac, Windows | ❌ Solo Linux |
| **Logs centralizados** | ✅ Sí | ✅ Sí (journald) |
| **Recursos** | ⚠️ Más memoria | ✅ Más ligero |
| **Integración SO** | ⚠️ Layer extra | ✅ Nativo |

**Recomendación:**
- **PM2**: Desarrollo, staging, y producción simple
- **systemd**: Producción enterprise con infraestructura compleja

---

## Siguientes Pasos

- ✅ [Ver guía de systemd](./SERVICE_SETUP.md)
- ✅ [Probar API con Postman](./postman_collection.json)
- ✅ [Desplegar en producción](./DEPLOYMENT.md)
