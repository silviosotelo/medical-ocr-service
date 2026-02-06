#!/bin/bash

# ================================
# Scripts de Ejemplo para Testing
# ================================

echo "Medical OCR Service - Test Scripts"
echo "====================================="
echo ""

# Colores para output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

BASE_URL="http://localhost:3000"

# ================================
# 1. Health Check
# ================================
echo -e "${BLUE}1. Testing Health Check...${NC}"
curl -X GET "$BASE_URL/health" | jq '.'
echo ""
echo ""

# ================================
# 2. Get Metrics
# ================================
echo -e "${BLUE}2. Getting Metrics...${NC}"
curl -X GET "$BASE_URL/health/metrics" | jq '.'
echo ""
echo ""

# ================================
# 3. Get Version
# ================================
echo -e "${BLUE}3. Getting Version...${NC}"
curl -X GET "$BASE_URL/api/version" | jq '.'
echo ""
echo ""

# ================================
# 4. Process Order (Example)
# ================================
echo -e "${BLUE}4. Testing Order Processing...${NC}"
echo "NOTE: Replace 'test-order.pdf' with an actual medical order file"
echo ""

# Ejemplo con imagen JPG
# curl -X POST "$BASE_URL/api/visar" \
#   -F "archivo=@path/to/your/medical-order.jpg" \
#   -F 'opciones={"extraer_diagnostico":true,"detectar_urgencias":true}' \
#   | jq '.'

# Ejemplo con PDF
# curl -X POST "$BASE_URL/api/visar" \
#   -F "archivo=@path/to/your/medical-order.pdf" \
#   -F 'opciones={"extraer_diagnostico":true,"detectar_urgencias":true,"validar_matricula":false}' \
#   | jq '.'

echo "To test with your own file, uncomment and modify the curl commands above"
echo ""

# ================================
# 5. Storage Info
# ================================
echo -e "${BLUE}5. Getting Storage Info...${NC}"
curl -X GET "$BASE_URL/health/storage" | jq '.'
echo ""
echo ""

# ================================
# 6. Test Error Handling (No File)
# ================================
echo -e "${BLUE}6. Testing Error Handling (No File)...${NC}"
curl -X POST "$BASE_URL/api/visar" | jq '.'
echo ""
echo ""

echo -e "${GREEN}Testing Complete!${NC}"
