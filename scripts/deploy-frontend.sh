#!/bin/bash
set -e

# ==================================================
# Deploy Frontend - Medical OCR Portal
# ==================================================
# Uso: sudo bash scripts/deploy-frontend.sh
# ==================================================

PROJECT_DIR="/var/www/medical-ocr-service"
NGINX_CONF="$PROJECT_DIR/nginx/medical-ocr.conf"
NGINX_AVAILABLE="/etc/nginx/sites-available/medical-ocr"
NGINX_ENABLED="/etc/nginx/sites-enabled/medical-ocr"

echo "=== Medical OCR - Frontend Deploy ==="
echo ""

# 1. Build del frontend
echo "[1/5] Buildeando frontend..."
cd "$PROJECT_DIR/frontend"
npm install --production=false
npm run build
echo "      Build completado -> frontend/dist/"
echo ""

# 2. Permisos para que nginx pueda leer los archivos
echo "[2/5] Configurando permisos..."
chown -R www-data:www-data "$PROJECT_DIR/frontend/dist"
echo "      Permisos OK (www-data:www-data)"
echo ""

# 3. Copiar config de nginx
echo "[3/5] Instalando configuracion nginx..."
cp "$NGINX_CONF" "$NGINX_AVAILABLE"
echo "      Copiado a $NGINX_AVAILABLE"
echo ""

# 4. Habilitar site (si no existe el symlink)
echo "[4/5] Habilitando site..."
if [ ! -L "$NGINX_ENABLED" ]; then
    ln -sf "$NGINX_AVAILABLE" "$NGINX_ENABLED"
    echo "      Symlink creado"
else
    echo "      Symlink ya existe"
fi

# Deshabilitar default si existe (para evitar conflictos en puerto 80)
if [ -L "/etc/nginx/sites-enabled/default" ]; then
    echo "      NOTA: El site 'default' de nginx esta habilitado."
    echo "      Si hay conflicto en puerto 80, deshabilitalo con:"
    echo "        sudo rm /etc/nginx/sites-enabled/default"
fi
echo ""

# 5. Verificar y reload nginx
echo "[5/5] Verificando configuracion nginx..."
nginx -t
echo ""

echo "Recargando nginx..."
systemctl reload nginx
echo ""

echo "=== Deploy completado ==="
echo ""
echo "Accede al portal en: http://<IP-DEL-SERVIDOR>/portal/"
echo "API backend en:      http://<IP-DEL-SERVIDOR>/api/v1/"
echo "Health check en:     http://<IP-DEL-SERVIDOR>/health"
