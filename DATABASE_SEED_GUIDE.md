# Guía de Seed de Base de Datos

## Descripción

Esta guía explica cómo agregar datos iniciales (seed data) a la base de datos de Medical OCR SaaS Platform.

Los datos incluyen:
- ✅ Usuario Super Admin (acceso completo a la plataforma)
- ✅ Tenant de ejemplo "Hospital Demo"
- ✅ 3 usuarios con diferentes roles (admin, operator, viewer)
- ✅ API key de ejemplo

---

## 📋 Prerequisitos

1. Base de datos PostgreSQL creada:
   ```bash
   sudo -u postgres psql -c "CREATE DATABASE medical_ocr;"
   ```

2. Migraciones aplicadas:
   ```bash
   psql -U medical_ocr_user -d medical_ocr -f database/schema_matching.sql
   psql -U medical_ocr_user -d medical_ocr -f database/migration_multitenant.sql
   ```

3. Variable `DATABASE_URL` configurada en `.env`:
   ```env
   DATABASE_URL=postgresql://medical_ocr_user:password@localhost:5432/medical_ocr
   ```

---

## 🚀 Método 1: Comando npm (Recomendado)

### Ejecutar Seed

```bash
npm run db:seed
```

**Ventajas:**
- ✅ Genera hashes BCrypt frescos
- ✅ Muestra información detallada en color
- ✅ Verifica la inserción
- ✅ Maneja errores automáticamente

**Salida esperada:**
```
================================================
Medical OCR SaaS Platform - Database Seeding
================================================

[1/5] Creating Super Admin user...
✓ Super Admin created: superadmin@platform.com

[2/5] Creating demo tenant...
✓ Tenant created: Hospital Demo (hospital-demo)

[3/5] Creating tenant users...
  ✓ admin: admin@demo.com
  ✓ operator: operator@demo.com
  ✓ viewer: viewer@demo.com

[4/5] Creating demo API key...
✓ API key created (prefix: mk_demo_)

[5/5] Verifying database...

✓ Seed completed successfully!

================================================
DATABASE STATISTICS
================================================
Tenants: 1
Users: 4
API Keys: 1

================================================
LOGIN CREDENTIALS
================================================

1. Super Admin (full platform access):
   Email: superadmin@platform.com
   Password: SuperAdmin123!

2. Admin (Hospital Demo tenant):
   Email: admin@demo.com
   Password: Admin123!

3. Operator (Hospital Demo tenant):
   Email: operator@demo.com
   Password: Operator123!

4. Viewer (Hospital Demo tenant):
   Email: viewer@demo.com
   Password: Viewer123!
```

---

## 🗄️ Método 2: Script SQL Directo

### Ejecutar Seed

```bash
psql $DATABASE_URL -f database/seed_data.sql
```

O con variables separadas:

```bash
psql -U medical_ocr_user -d medical_ocr -h localhost -f database/seed_data.sql
```

**Ventajas:**
- ✅ Más rápido
- ✅ No requiere dependencias de Node.js
- ✅ Idempotente (puede ejecutarse múltiples veces)

**Desventajas:**
- ⚠️ Usa hashes precalculados (menos seguro para producción)

---

## 🔧 Método 3: Script Interactivo

### Ejecutar Seed

```bash
./scripts/seed.sh
```

El script preguntará qué método usar:
```
Choose seeding method:
1. SQL script (faster, predefined hashes)
2. Node.js script (slower, generates fresh hashes)

Enter choice (1 or 2):
```

**Opción 1**: Ejecuta el SQL directamente
**Opción 2**: Ejecuta el script Node.js

---

## 📝 Credenciales Creadas

### Super Admin (Sin Tenant)

| Campo | Valor |
|-------|-------|
| **Email** | superadmin@platform.com |
| **Password** | SuperAdmin123! |
| **Role** | super_admin |
| **Acceso** | Toda la plataforma, todos los tenants |

### Tenant: "Hospital Demo"

| Campo | Valor |
|-------|-------|
| **Nombre** | Hospital Demo |
| **Slug** | hospital-demo |
| **RUC** | 80000001-0 |
| **Plan** | professional |
| **Max Orders/Month** | 10,000 |
| **Max API Keys** | 10 |
| **Max Users** | 50 |

### Usuarios del Tenant

#### 1. Admin

| Campo | Valor |
|-------|-------|
| **Email** | admin@demo.com |
| **Password** | Admin123! |
| **Role** | admin |
| **Acceso** | Gestión completa del tenant |

#### 2. Operator

| Campo | Valor |
|-------|-------|
| **Email** | operator@demo.com |
| **Password** | Operator123! |
| **Role** | operator |
| **Acceso** | Procesar órdenes, ver datos |

#### 3. Viewer

| Campo | Valor |
|-------|-------|
| **Email** | viewer@demo.com |
| **Password** | Viewer123! |
| **Role** | viewer |
| **Acceso** | Solo lectura de órdenes |

---

## ✅ Verificación Post-Seed

### 1. Verificar en la Base de Datos

```sql
-- Conectar a PostgreSQL
psql -U medical_ocr_user -d medical_ocr

-- Ver tenants
SELECT id, name, slug, plan, status FROM tenants;

-- Ver usuarios
SELECT id, email, name, role, tenant_id FROM users;

-- Ver API keys
SELECT id, name, key_prefix, status FROM api_keys;
```

### 2. Verificar con API

```bash
# Health check
curl http://localhost:3000/health

# Login como super admin
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "superadmin@platform.com",
    "password": "SuperAdmin123!"
  }'

# Login como admin
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@demo.com",
    "password": "Admin123!"
  }'
```

### 3. Verificar en el Portal Web

1. Iniciar servidor:
   ```bash
   npm start
   ```

2. Abrir navegador:
   ```
   http://localhost:3000/portal
   ```

3. Login con cualquiera de las credenciales

4. Verificar el dashboard según el rol

---

## 🔄 Re-ejecutar Seed

Los scripts son **idempotentes**, lo que significa que puedes ejecutarlos múltiples veces de forma segura:

```bash
npm run db:seed
```

**Comportamiento:**
- ✅ Si el email ya existe, actualiza la contraseña
- ✅ Si el tenant ya existe, actualiza los datos
- ✅ No duplica registros

---

## 🧹 Limpiar Datos de Seed

Si quieres eliminar todos los datos de prueba:

```sql
-- Conectar a PostgreSQL
psql -U medical_ocr_user -d medical_ocr

-- Eliminar tenant (cascada elimina usuarios y API keys)
DELETE FROM tenants WHERE slug = 'hospital-demo';

-- Eliminar super admin
DELETE FROM users WHERE email = 'superadmin@platform.com';

-- Verificar
SELECT COUNT(*) FROM tenants;
SELECT COUNT(*) FROM users;
```

---

## 🔐 Seguridad

### ⚠️ IMPORTANTE: Cambiar Contraseñas en Producción

**Nunca uses estas credenciales en producción.**

Después del seed, cambia todas las contraseñas:

```bash
# 1. Login
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@demo.com", "password": "Admin123!"}' \
  | jq -r '.data.accessToken'

# 2. Guardar token
TOKEN="tu_token_aqui"

# 3. Cambiar password
curl -X PUT http://localhost:3000/api/v1/auth/password \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "currentPassword": "Admin123!",
    "newPassword": "TuPasswordSegura123!@#"
  }'
```

### Hashes BCrypt

Los passwords están hasheados con **BCrypt rounds=12**:

```javascript
// Ejemplo de cómo se genera
const bcrypt = require('bcryptjs');
const hash = await bcrypt.hash('Admin123!', 12);
```

En el archivo SQL, los hashes son:
- `SuperAdmin123!` → `$2a$12$LQZaR1YZv...`
- `Admin123!` → `$2a$12$KIXx0yZvG...`
- Etc.

---

## 🛠️ Troubleshooting

### Error: "relation 'tenants' does not exist"

**Causa**: Las migraciones no se aplicaron

**Solución**:
```bash
psql -U medical_ocr_user -d medical_ocr -f database/schema_matching.sql
psql -U medical_ocr_user -d medical_ocr -f database/migration_multitenant.sql
npm run db:seed
```

### Error: "duplicate key value violates unique constraint"

**Causa**: Los datos ya existen

**Solución**: Los scripts son idempotentes, simplemente actualizan los datos existentes. Si ves este error, verifica que el script usa `ON CONFLICT`.

### Error: "password authentication failed"

**Causa**: Credenciales de DB incorrectas en `.env`

**Solución**:
```bash
# Verificar DATABASE_URL en .env
cat .env | grep DATABASE_URL

# Probar conexión
psql $DATABASE_URL -c "SELECT 1;"
```

### Error: "bcryptjs not found"

**Causa**: Dependencias no instaladas

**Solución**:
```bash
npm install
npm run db:seed
```

---

## 📊 Datos Adicionales Opcionales

Si quieres agregar prestadores de ejemplo, descomenta esta sección en `database/seed_data.sql`:

```sql
INSERT INTO prestadores (
    tenant_id,
    nombre,
    codigo,
    tipo,
    activo
) VALUES (
    (SELECT id FROM tenants WHERE slug = 'hospital-demo'),
    'Sanatorio Demo',
    'DEMO001',
    'sanatorio',
    true
);
```

---

## 🔗 Referencias

- [INSTALLATION.md](./INSTALLATION.md) - Guía de instalación completa
- [QUICK_START.md](./QUICK_START.md) - Inicio rápido
- [POSTMAN_GUIDE.md](./POSTMAN_GUIDE.md) - Probar con Postman
- [README.md](./README.md) - Documentación principal

---

## 📞 Soporte

Si tienes problemas con el seed:

1. Verificar que PostgreSQL está corriendo
2. Verificar que las migraciones están aplicadas
3. Verificar `DATABASE_URL` en `.env`
4. Ver logs del script para detalles del error
5. Consultar la sección Troubleshooting arriba
