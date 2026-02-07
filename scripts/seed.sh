#!/bin/bash

# Medical OCR SaaS Platform - Database Seeding Script
# Este script inserta datos iniciales en la base de datos

set -e

BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}Medical OCR - Database Seeding${NC}"
echo -e "${BLUE}================================================${NC}\n"

# Check if .env exists
if [ ! -f .env ]; then
    echo -e "${RED}Error: .env file not found${NC}"
    echo "Please create .env file with DATABASE_URL"
    exit 1
fi

# Load DATABASE_URL from .env
export $(grep -v '^#' .env | grep DATABASE_URL | xargs)

if [ -z "$DATABASE_URL" ]; then
    echo -e "${RED}Error: DATABASE_URL not set in .env${NC}"
    exit 1
fi

echo -e "${YELLOW}Choose seeding method:${NC}"
echo "1. SQL script (faster, predefined hashes)"
echo "2. Node.js script (slower, generates fresh hashes)"
echo ""
read -p "Enter choice (1 or 2): " choice

case $choice in
    1)
        echo -e "\n${YELLOW}Running SQL seed script...${NC}\n"

        # Extract connection details from DATABASE_URL
        # Format: postgresql://user:pass@host:port/dbname
        DB_USER=$(echo $DATABASE_URL | sed -n 's/.*\/\/\([^:]*\):.*/\1/p')
        DB_NAME=$(echo $DATABASE_URL | sed -n 's/.*\/\([^?]*\).*/\1/p')

        if [ -z "$DB_USER" ] || [ -z "$DB_NAME" ]; then
            echo -e "${RED}Error: Could not parse DATABASE_URL${NC}"
            echo "Expected format: postgresql://user:pass@host:port/dbname"
            exit 1
        fi

        psql $DATABASE_URL -f database/seed_data.sql

        if [ $? -eq 0 ]; then
            echo -e "\n${GREEN}✓ SQL seed completed successfully!${NC}\n"
        else
            echo -e "\n${RED}✗ SQL seed failed${NC}\n"
            exit 1
        fi
        ;;
    2)
        echo -e "\n${YELLOW}Running Node.js seed script...${NC}\n"

        node scripts/seed-database.js

        if [ $? -eq 0 ]; then
            echo -e "${GREEN}✓ Node.js seed completed successfully!${NC}\n"
        else
            echo -e "${RED}✗ Node.js seed failed${NC}\n"
            exit 1
        fi
        ;;
    *)
        echo -e "${RED}Invalid choice${NC}"
        exit 1
        ;;
esac

echo -e "${BLUE}================================================${NC}"
echo -e "${GREEN}Seeding Complete!${NC}"
echo -e "${BLUE}================================================${NC}\n"

echo -e "${YELLOW}Credentials:${NC}"
echo "Super Admin: superadmin@platform.com / SuperAdmin123!"
echo "Admin: admin@demo.com / Admin123!"
echo "Operator: operator@demo.com / Operator123!"
echo "Viewer: viewer@demo.com / Viewer123!"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. npm start"
echo "2. Open http://localhost:3000/portal"
echo ""
