# 🚀 INICIO RÁPIDO - Medical OCR SaaS Platform

## ✅ El servidor está corriendo!

El backend y frontend están disponibles en:

**🌐 URLs:**
- **Portal Web**: http://localhost:3000/portal
- **API**: http://localhost:3000/api/v1
- **Health Check**: http://localhost:3000/health

---

## 🔐 Credenciales de Acceso

### Super Admin (acceso completo)
```
Email: superadmin@platform.com
Password: SuperAdmin123!
```

### Admin (Hospital Demo)
```
Email: admin@demo.com
Password: Admin123!
```

### Operator (Hospital Demo)
```
Email: operator@demo.com
Password: Operator123!
```

### Viewer (Hospital Demo)
```
Email: viewer@demo.com
Password: Viewer123!
```

---

## 📋 Cómo Usar

### 1. Acceder al Portal Web

Abre tu navegador y ve a:
```
http://localhost:3000/portal
```

### 2. Iniciar Sesión

Usa cualquiera de las credenciales de arriba para entrar.

### 3. Explorar el Dashboard

Una vez dentro, verás el panel de control según tu rol:
- **Super Admin**: Gestión de todos los tenants y configuración global
- **Admin**: Gestión completa del tenant (Hospital Demo)
- **Operator**: Procesamiento de órdenes y operaciones
- **Viewer**: Solo visualización de datos

---

## 🛠️ Comandos Útiles

### Iniciar el Servidor

```bash
# Servidor simple (recomendado para demo)
node server-simple.js

# Servidor completo (requiere base de datos configurada)
npm start
```

### Detener el Servidor

```bash
# Encontrar el proceso
ps aux | grep node

# Matar el proceso
kill <PID>

# O usar pkill
pkill -f "node server"
```

### Ver Logs

```bash
# Logs del servidor (si está en background)
tail -f /tmp/server.log

# O iniciar en foreground para ver logs en tiempo real
node server-simple.js
```

---

## 📡 Probar la API

### Login

```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  --data-binary @- << EOF
{
  "email": "admin@demo.com",
  "password": "Admin123!"
}
EOF
```

### Health Check

```bash
curl http://localhost:3000/health | jq .
```

### Service Info

```bash
curl http://localhost:3000/ | jq .
```

---

## 🔧 Modo de Operación Actual

**DEMO MODE: ACTIVADO**

El sistema está corriendo en modo demostración:
- ✅ No requiere base de datos externa
- ✅ Usuarios precargados en memoria
- ✅ Perfecto para pruebas y desarrollo
- ✅ Funciona en cualquier host sin configuración adicional

Para usar con base de datos real:
1. Configurar `DATABASE_URL` en `.env`
2. Aplicar migraciones: `psql $DATABASE_URL -f database/migration_multitenant.sql`
3. Ejecutar seed: `npm run db:seed`
4. Cambiar `DEMO_MODE=false` en `.env`
5. Usar `npm start` en lugar de `node server-simple.js`

---

## 📚 Documentación Adicional

- **[QUICK_START.md](./QUICK_START.md)** - Guía de inicio rápido completa
- **[DATABASE_SEED_GUIDE.md](./DATABASE_SEED_GUIDE.md)** - Guía de configuración de base de datos
- **[COMMANDS_REFERENCE.md](./COMMANDS_REFERENCE.md)** - Referencia completa de comandos
- **[POSTMAN_GUIDE.md](./POSTMAN_GUIDE.md)** - Guía de testing con Postman
- **[GUIDES_INDEX.md](./GUIDES_INDEX.md)** - Índice completo de guías

---

## 🐛 Troubleshooting

### El portal no carga

1. Verificar que el servidor está corriendo:
   ```bash
   curl http://localhost:3000/health
   ```

2. Verificar que el frontend está compilado:
   ```bash
   ls -la frontend/dist/
   ```

3. Si falta, compilar el frontend:
   ```bash
   cd frontend && npm run build
   ```

### Error de login

1. Verificar que estás usando las credenciales exactas (case-sensitive)
2. Verificar que `DEMO_MODE=true` en `.env`
3. Reiniciar el servidor

### Puerto 3000 en uso

```bash
# Ver qué está usando el puerto
lsof -i:3000

# O cambiar el puerto en .env
PORT=8080 node server-simple.js
```

---

## 💡 Tips

1. **Para desarrollo rápido**: Usa `server-simple.js` (no requiere base de datos)
2. **Para producción**: Usa `npm start` con base de datos real
3. **Para testing**: Usa Postman con la colección incluida
4. **Para deploy**: Ver [DEPLOYMENT.md](./DEPLOYMENT.md)

---

## 📞 Soporte

Si tienes problemas:
1. Revisa los logs: `cat /tmp/server.log`
2. Verifica la configuración: `cat .env`
3. Consulta la documentación en la carpeta del proyecto

---

## ✨ Características

- ✅ Autenticación JWT
- ✅ Multi-tenancy
- ✅ Roles y permisos (RBAC)
- ✅ Portal web moderno
- ✅ API RESTful
- ✅ Modo demo sin base de datos
- ✅ CORS configurado para desarrollo
- ✅ Documentación completa

---

**¡Disfruta explorando la plataforma!** 🎉
