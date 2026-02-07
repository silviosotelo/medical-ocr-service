# Scripts Directory

## 📁 Contenido

### 🌱 Database Seeding

| Script | Tipo | Uso |
|--------|------|-----|
| **seed-database.js** | Node.js | Script principal para insertar datos iniciales |
| **seed.sh** | Bash | Script interactivo que ofrece método SQL o Node.js |

### 📊 Data Import

| Script | Tipo | Uso |
|--------|------|-----|
| **cargar_datos_excel.py** | Python | Importar datos desde archivos Excel |

---

## 🚀 Uso Rápido

### Insertar Datos Iniciales

```bash
# Método 1: Comando npm (recomendado)
npm run db:seed

# Método 2: Script interactivo
./scripts/seed.sh

# Método 3: SQL directo
psql $DATABASE_URL -f database/seed_data.sql
```

### Importar Datos desde Excel

```bash
python scripts/cargar_datos_excel.py
```

---

## 📝 Descripción de Scripts

### seed-database.js

**Propósito**: Insertar datos iniciales en la base de datos usando Node.js

**Características**:
- ✅ Genera hashes BCrypt frescos
- ✅ Crea usuario Super Admin
- ✅ Crea tenant de ejemplo "Hospital Demo"
- ✅ Crea 3 usuarios con diferentes roles
- ✅ Crea API key de ejemplo
- ✅ Output con colores y formato
- ✅ Manejo de errores y rollback

**Uso**:
```bash
node scripts/seed-database.js
# o
npm run db:seed
```

**Requiere**:
- Variable `DATABASE_URL` en `.env`
- Migraciones aplicadas

**Credenciales creadas**:
- `superadmin@platform.com` / `SuperAdmin123!`
- `admin@demo.com` / `Admin123!`
- `operator@demo.com` / `Operator123!`
- `viewer@demo.com` / `Viewer123!`

---

### seed.sh

**Propósito**: Script bash interactivo para elegir método de seeding

**Características**:
- ✅ Ofrece opción SQL o Node.js
- ✅ Valida `.env` existe
- ✅ Extrae `DATABASE_URL` automáticamente
- ✅ Muestra credenciales al final

**Uso**:
```bash
./scripts/seed.sh
```

Luego elige:
- `1` para SQL (más rápido, hashes predefinidos)
- `2` para Node.js (más lento, hashes frescos)

---

### cargar_datos_excel.py

**Propósito**: Importar datos desde archivos Excel al sistema

**Uso**:
```bash
python scripts/cargar_datos_excel.py
```

**Requiere**:
- Python 3.x
- Archivos Excel en carpeta `data/`
- Configuración de base de datos

---

## 📚 Documentación Relacionada

- **[DATABASE_SEED_GUIDE.md](../DATABASE_SEED_GUIDE.md)** - Guía completa de seeding
- **[INSTALLATION.md](../INSTALLATION.md)** - Guía de instalación
- **[QUICK_START.md](../QUICK_START.md)** - Inicio rápido

---

## 🔐 Seguridad

**⚠️ IMPORTANTE**: Las credenciales creadas por estos scripts son para **desarrollo/testing únicamente**.

**Nunca uses estas credenciales en producción.**

Cambia todas las contraseñas inmediatamente después del seed en entornos de producción.

---

## 🛠️ Troubleshooting

### Error: "DATABASE_URL not set"

**Solución**:
```bash
# Verificar .env
cat .env | grep DATABASE_URL

# Agregar si falta
echo "DATABASE_URL=postgresql://user:pass@localhost:5432/medical_ocr" >> .env
```

### Error: "relation 'tenants' does not exist"

**Solución**: Aplicar migraciones primero
```bash
psql $DATABASE_URL -f database/schema_matching.sql
psql $DATABASE_URL -f database/migration_multitenant.sql
npm run db:seed
```

### Error: "permission denied"

**Solución**: Hacer ejecutable
```bash
chmod +x scripts/seed.sh
./scripts/seed.sh
```
