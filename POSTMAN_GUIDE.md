# Guía de Uso de Postman Collection

## Importar la Colección

### 1. Abrir Postman
- Descarga Postman desde: https://www.postman.com/downloads/
- O usa la versión web: https://web.postman.com/

### 2. Importar Archivo
```
Postman → File → Import → Select File
→ Seleccionar "postman_collection.json"
→ Click "Import"
```

### 3. Verificar Importación
La colección "Medical OCR SaaS Platform API" aparecerá en el panel izquierdo con estas carpetas:
- Health & Info
- Authentication
- Tenants (Super Admin)
- Users
- API Keys
- Orders
- Data Management
- Usage & Metrics
- Webhooks
- Legacy API (v0)

---

## Configurar Variables

### Variables de la Colección

Click derecho en la colección → Edit → Variables:

| Variable | Valor Inicial | Descripción |
|----------|---------------|-------------|
| `base_url` | http://localhost:3000 | URL base del servidor |
| `api_v1` | {{base_url}}/api/v1 | URL API v1 (auto-calculada) |
| `access_token` | (vacío) | Se auto-completa al hacer login |
| `refresh_token` | (vacío) | Se auto-completa al hacer login |
| `tenant_id` | (vacío) | Se auto-completa según usuario |
| `user_id` | (vacío) | Se auto-completa al login |

**Importante**: Solo necesitas configurar `base_url`. Las demás variables se llenan automáticamente.

---

## Flujo de Trabajo Básico

### 1. Verificar Servidor (Health Check)

**Request**: `GET {{base_url}}/health`

**Resultado Esperado**:
```json
{
  "status": "ok",
  "timestamp": "2024-02-07T...",
  "uptime": 123.456,
  "service": "Medical OCR SaaS",
  "version": "3.0.0",
  "database": "connected",
  "redis": "connected"
}
```

### 2. Registro (Primera Vez)

**Request**: `POST {{api_v1}}/auth/register`

**Body**:
```json
{
  "email": "admin@example.com",
  "password": "Admin123!@#",
  "name": "Super Administrator",
  "role": "super_admin"
}
```

**Scripts Automáticos**:
- ✅ Guarda `access_token` automáticamente
- ✅ Guarda `refresh_token` automáticamente
- ✅ Guarda `user_id` automáticamente

### 3. Login (Usuarios Existentes)

**Request**: `POST {{api_v1}}/auth/login`

**Body**:
```json
{
  "email": "admin@example.com",
  "password": "Admin123!@#"
}
```

**Respuesta**:
```json
{
  "status": "ok",
  "data": {
    "user": {
      "id": "uuid...",
      "email": "admin@example.com",
      "name": "Super Administrator",
      "role": "super_admin",
      "tenant_id": null
    },
    "accessToken": "eyJhbGci...",
    "refreshToken": "eyJhbGci..."
  }
}
```

**Scripts Automáticos**:
- ✅ Extrae y guarda todos los tokens
- ✅ Extrae y guarda `tenant_id` (si existe)
- ✅ Todos los requests siguientes usan estos tokens automáticamente

### 4. Ver Permisos del Usuario

**Request**: `GET {{api_v1}}/auth/permissions`

**Respuesta**:
```json
{
  "status": "ok",
  "data": {
    "role": "super_admin",
    "label": "Super Admin",
    "level": 100,
    "permissions": [
      "tenants:read",
      "tenants:write",
      "users:read",
      "users:write",
      "orders:read",
      "..."
    ]
  }
}
```

---

## Casos de Uso Comunes

### Caso 1: Super Admin - Crear Tenant

1. **Login como super_admin**
   ```
   POST /auth/login
   ```

2. **Crear nuevo tenant**
   ```
   POST /tenants
   Body: {
     "name": "Hospital Central",
     "slug": "hospital-central",
     "plan": "professional",
     "status": "active"
   }
   ```

3. **Verificar tenant creado**
   ```
   GET /tenants
   ```

### Caso 2: Admin - Crear Usuario

1. **Login como admin**
   ```
   POST /auth/login
   ```

2. **Crear usuario operador**
   ```
   POST /users
   Body: {
     "email": "operator@hospital.com",
     "password": "Operator123!",
     "name": "Juan Perez",
     "role": "operator"
   }
   ```

3. **Listar usuarios del tenant**
   ```
   GET /users
   ```

### Caso 3: Admin - Crear API Key

1. **Login como admin**
   ```
   POST /auth/login
   ```

2. **Crear API key**
   ```
   POST /api-keys
   Body: {
     "name": "Production API Key",
     "scopes": ["read", "write", "validate"],
     "expiresInDays": 365
   }
   ```

3. **Copiar la key de la respuesta** (solo se muestra una vez):
   ```json
   {
     "status": "ok",
     "data": {
       "id": "uuid...",
       "key": "mk_live_abc123xyz...",  // ← COPIAR ESTO
       "name": "Production API Key",
       "scopes": ["read", "write", "validate"]
     }
   }
   ```

### Caso 4: Usar API Key para OCR

1. **Ir a "Legacy API (v0)" → "Process Medical Order"**

2. **Cambiar Authentication**:
   ```
   Authorization → API Key
   Key: x-api-key
   Value: mk_live_abc123xyz...  (tu API key)
   Add to: Header
   ```

3. **Subir archivo**:
   ```
   Body → form-data
   Key: file (tipo: File)
   Value: Seleccionar archivo PDF/imagen
   ```

4. **Enviar request**

### Caso 5: Ver Estadísticas de Uso

1. **Login**
   ```
   POST /auth/login
   ```

2. **Ver resumen de uso**
   ```
   GET /usage/summary
   ```

3. **Ver uso diario (últimos 30 días)**
   ```
   GET /usage/daily?days=30
   ```

4. **Ver cuota actual**
   ```
   GET /usage/quota
   ```

---

## Autenticación

### Método 1: Bearer Token (Automático)

La colección usa Bearer Token por defecto:

```
Authorization: Bearer {{access_token}}
```

Esto se configura automáticamente al nivel de colección y se aplica a todos los requests.

### Método 2: API Key (Para Legacy API)

Para endpoints `/api/*` (legacy), usar API Key:

1. En el request específico:
   - Authorization → Type: API Key
   - Key: `x-api-key`
   - Value: `tu_api_key_aqui`
   - Add to: Header

2. O agregar header manualmente:
   ```
   x-api-key: mk_live_abc123xyz...
   ```

---

## Renovar Token Expirado

Si el `access_token` expira (después de 15 minutos):

**Request**: `POST {{api_v1}}/auth/refresh`

**Body**:
```json
{
  "refreshToken": "{{refresh_token}}"
}
```

**Scripts Automáticos**:
- ✅ Actualiza `access_token` automáticamente
- ✅ Mantiene `refresh_token` para próximas renovaciones

---

## Variables de Entorno (Environments)

### Crear Environments para diferentes ambientes:

#### Development
```
base_url: http://localhost:3001
```

#### Staging
```
base_url: https://staging.yourdomain.com
```

#### Production
```
base_url: https://api.yourdomain.com
```

**Cambiar entre environments**:
```
Top-right corner → Select environment dropdown
```

---

## Tests Automáticos

Algunos requests incluyen tests automáticos que se ejecutan después de cada llamada:

### Login Request Test
```javascript
if (pm.response.code === 200) {
    const res = pm.response.json();
    pm.collectionVariables.set('access_token', res.data.accessToken);
    pm.collectionVariables.set('refresh_token', res.data.refreshToken);
    pm.collectionVariables.set('user_id', res.data.user.id);
    if (res.data.user.tenant_id) {
        pm.collectionVariables.set('tenant_id', res.data.user.tenant_id);
    }
}
```

Esto significa:
- ✅ Tokens se guardan automáticamente
- ✅ No necesitas copiar/pegar manualmente
- ✅ Siguiente request ya tiene el token configurado

---

## Tips y Trucos

### 1. Copiar como cURL

Para generar comando cURL:
```
Click en request → Code → cURL
```

### 2. Guardar Respuesta como Ejemplo

```
Send request → Save Response → Save as Example
```

### 3. Búsqueda Rápida

```
Ctrl/Cmd + K → Buscar cualquier request
```

### 4. Ver Variables Actuales

```
Eye icon (top-right) → Ver todas las variables
```

### 5. Console para Debugging

```
View → Show Postman Console (Ctrl+Alt+C)
Ver logs de requests, responses, scripts
```

### 6. Bulk Edit

```
Select multiple requests → Right click → Edit
Cambiar settings de múltiples requests a la vez
```

### 7. Runner para Tests Automáticos

```
Collection → Run
Ejecutar todos los requests en secuencia
```

---

## Errores Comunes y Soluciones

### Error: "Unauthorized" (401)

**Causa**: Token expirado o inválido

**Solución**:
1. Hacer login nuevamente
2. O usar endpoint `/auth/refresh`

### Error: "Forbidden" (403)

**Causa**: Usuario no tiene permisos para ese endpoint

**Solución**:
1. Verificar rol del usuario: `GET /auth/permissions`
2. Login con usuario de mayor nivel (admin o super_admin)

### Error: "Not Found" (404)

**Causa**: Endpoint incorrecto o recurso no existe

**Solución**:
1. Verificar URL en variable `base_url`
2. Verificar que el servidor está corriendo: `GET /health`

### Variables no se actualizan

**Causa**: Scripts no se ejecutaron

**Solución**:
1. Verificar en Console si hay errores de script
2. Re-enviar el request de login

### "Cannot read property of undefined"

**Causa**: Respuesta no tiene la estructura esperada

**Solución**:
1. Ver respuesta raw
2. Verificar que el endpoint devuelve datos correctos

---

## Workflows Recomendados

### Workflow 1: Setup Inicial (Super Admin)

```
1. Health Check
2. Register (super_admin)
3. Get Permissions (verificar role)
4. Create Tenant
5. Create Admin User for Tenant
```

### Workflow 2: Operaciones Diarias (Admin)

```
1. Login
2. Get Orders Stats
3. List Recent Orders
4. List Users
5. Get Usage Summary
```

### Workflow 3: Crear API Key para Cliente

```
1. Login (as admin)
2. Create API Key
3. Copy key from response
4. Test with Legacy API endpoint
```

### Workflow 4: Monitoreo (Cualquier Role)

```
1. Login
2. Get Usage Summary
3. Get Daily Usage
4. Get Quota Info
5. List Orders
```

---

## Exportar Datos

### Exportar Collection

```
Collection → ... menu → Export
→ Collection v2.1 (recommended)
→ Save file
```

### Exportar Environment

```
Environments → ... menu → Export
→ Save file
```

### Compartir con Equipo

1. Exportar collection + environment
2. Compartir archivos JSON
3. Cada persona importa en su Postman

O usar Postman Workspaces (requiere cuenta):
```
Collections → Share Collection → Create Workspace
```

---

## Recursos Adicionales

- **Postman Learning Center**: https://learning.postman.com/
- **API Documentation**: Ver INSTALLATION.md y EXAMPLES.md
- **Variables Reference**: https://learning.postman.com/docs/sending-requests/variables/

---

## Soporte

Si encuentras problemas con la colección:
1. Verificar que el servidor está corriendo: `GET /health`
2. Verificar variables de la colección
3. Ver Postman Console para errores de scripts
4. Revisar la guía INSTALLATION.md
