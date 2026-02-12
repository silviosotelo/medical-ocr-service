#!/bin/bash

# Medical OCR SaaS Platform - Start All Services
# Este script inicia tanto el backend como el frontend

set -e

BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}Medical OCR - Starting All Services${NC}"
echo -e "${BLUE}================================================${NC}\n"

# Check if .env exists
if [ ! -f .env ]; then
    echo -e "${YELLOW}Warning: .env file not found${NC}"
    echo "Creating .env from .env.example..."
    cp .env.example .env
    echo -e "${GREEN}✓ .env created. Please configure it before starting.${NC}"
    exit 1
fi

# Check if node_modules exists
if [ ! -d node_modules ]; then
    echo -e "${YELLOW}Installing backend dependencies...${NC}"
    npm install
fi

# Check if frontend is built
if [ ! -d frontend/dist ]; then
    echo -e "${YELLOW}Frontend not built. Building...${NC}"
    cd frontend
    if [ ! -d node_modules ]; then
        echo "Installing frontend dependencies..."
        npm install
    fi
    npm run build
    cd ..
    echo -e "${GREEN}✓ Frontend built successfully${NC}\n"
fi

# Check if database exists
echo -e "${YELLOW}Checking database connection...${NC}"
if psql $DATABASE_URL -c "SELECT 1;" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Database connection OK${NC}\n"
else
    echo -e "${RED}✗ Database connection failed${NC}"
    echo "Please check your DATABASE_URL in .env"
    echo "Run: psql \$DATABASE_URL -c \"SELECT 1;\""
    exit 1
fi

# Start backend
echo -e "${BLUE}================================================${NC}"
echo -e "${GREEN}Starting Backend Server...${NC}"
echo -e "${BLUE}================================================${NC}\n"

echo -e "${YELLOW}Backend running on: http://localhost:${PORT:-3000}${NC}"
echo -e "${YELLOW}API available at: http://localhost:${PORT:-3000}/api/v1${NC}"
echo -e "${YELLOW}Portal available at: http://localhost:${PORT:-3000}/portal${NC}\n"

echo -e "${BLUE}================================================${NC}"
echo -e "${GREEN}Press Ctrl+C to stop${NC}"
echo -e "${BLUE}================================================${NC}\n"

# Start server
npm start
