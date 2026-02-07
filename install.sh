#!/bin/bash

# Medical OCR SaaS Platform - Installation Script
# Este script automatiza la instalación básica del sistema

set -e  # Exit on error

BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}Medical OCR SaaS Platform - Installation Script${NC}"
echo -e "${BLUE}================================================${NC}\n"

# Check Node.js version
echo -e "${YELLOW}[1/8] Checking Node.js version...${NC}"
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
    echo -e "${RED}Error: Node.js 20 or higher is required${NC}"
    echo "Current version: $(node -v)"
    exit 1
fi
echo -e "${GREEN}✓ Node.js version OK: $(node -v)${NC}\n"

# Check npm version
echo -e "${YELLOW}[2/8] Checking npm version...${NC}"
NPM_VERSION=$(npm -v | cut -d'.' -f1)
if [ "$NPM_VERSION" -lt 10 ]; then
    echo -e "${RED}Error: npm 10 or higher is required${NC}"
    echo "Current version: $(npm -v)"
    exit 1
fi
echo -e "${GREEN}✓ npm version OK: $(npm -v)${NC}\n"

# Check if PostgreSQL is installed
echo -e "${YELLOW}[3/8] Checking PostgreSQL...${NC}"
if command -v psql &> /dev/null; then
    echo -e "${GREEN}✓ PostgreSQL found: $(psql --version)${NC}"
else
    echo -e "${YELLOW}⚠ PostgreSQL not found. Please install it manually:${NC}"
    echo "  Ubuntu/Debian: sudo apt-get install postgresql"
    echo "  macOS: brew install postgresql"
    echo ""
    read -p "Continue without PostgreSQL? (y/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi
echo ""

# Check poppler-utils
echo -e "${YELLOW}[4/8] Checking poppler-utils (PDF support)...${NC}"
if command -v pdftoppm &> /dev/null; then
    echo -e "${GREEN}✓ poppler-utils found${NC}"
else
    echo -e "${YELLOW}⚠ poppler-utils not found (PDF processing will be disabled)${NC}"
    echo "  Ubuntu/Debian: sudo apt-get install poppler-utils"
    echo "  macOS: brew install poppler"
fi
echo ""

# Install backend dependencies
echo -e "${YELLOW}[5/8] Installing backend dependencies...${NC}"
npm install
echo -e "${GREEN}✓ Backend dependencies installed${NC}\n"

# Install frontend dependencies
echo -e "${YELLOW}[6/8] Installing frontend dependencies...${NC}"
cd frontend
npm install
echo -e "${GREEN}✓ Frontend dependencies installed${NC}\n"

# Build frontend
echo -e "${YELLOW}[7/8] Building frontend...${NC}"
npm run build
cd ..
echo -e "${GREEN}✓ Frontend built successfully${NC}\n"

# Setup .env file
echo -e "${YELLOW}[8/8] Setting up environment variables...${NC}"
if [ ! -f .env ]; then
    if [ -f .env.example ]; then
        cp .env.example .env
        echo -e "${GREEN}✓ Created .env from .env.example${NC}"

        # Generate JWT secrets
        JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
        JWT_REFRESH_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

        # Update .env with generated secrets
        if [[ "$OSTYPE" == "darwin"* ]]; then
            # macOS
            sed -i '' "s/JWT_SECRET=.*/JWT_SECRET=$JWT_SECRET/" .env
            sed -i '' "s/JWT_REFRESH_SECRET=.*/JWT_REFRESH_SECRET=$JWT_REFRESH_SECRET/" .env
        else
            # Linux
            sed -i "s/JWT_SECRET=.*/JWT_SECRET=$JWT_SECRET/" .env
            sed -i "s/JWT_REFRESH_SECRET=.*/JWT_REFRESH_SECRET=$JWT_REFRESH_SECRET/" .env
        fi

        echo -e "${GREEN}✓ JWT secrets generated automatically${NC}"
    else
        echo -e "${RED}Error: .env.example not found${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}✓ .env file already exists${NC}"
fi
echo ""

# Create necessary directories
echo -e "${YELLOW}Creating directories...${NC}"
mkdir -p temp uploads logs
echo -e "${GREEN}✓ Directories created${NC}\n"

# Success message
echo -e "${GREEN}================================================${NC}"
echo -e "${GREEN}Installation completed successfully!${NC}"
echo -e "${GREEN}================================================${NC}\n"

echo -e "${BLUE}Next steps:${NC}"
echo ""
echo "1. Configure database connection in .env:"
echo "   DATABASE_URL=postgresql://user:password@localhost:5432/medical_ocr"
echo ""
echo "2. Add your OpenAI API key in .env (optional):"
echo "   OPENAI_API_KEY=sk-your-key-here"
echo ""
echo "3. Create database:"
echo "   sudo -u postgres psql -c \"CREATE DATABASE medical_ocr;\""
echo "   sudo -u postgres psql -c \"CREATE USER medical_ocr_user WITH PASSWORD 'password';\""
echo "   sudo -u postgres psql -c \"GRANT ALL ON DATABASE medical_ocr TO medical_ocr_user;\""
echo ""
echo "4. Apply database migrations:"
echo "   psql -U medical_ocr_user -d medical_ocr -f database/schema_matching.sql"
echo "   psql -U medical_ocr_user -d medical_ocr -f database/migration_multitenant.sql"
echo ""
echo "5. Start the server:"
echo "   npm start          # Production"
echo "   npm run dev        # Development"
echo ""
echo -e "${BLUE}For detailed guides, see:${NC}"
echo "  - QUICK_START.md      (5 minute quick start)"
echo "  - INSTALLATION.md     (Complete installation guide)"
echo "  - SERVICE_SETUP.md    (Setup as system service)"
echo "  - PM2_GUIDE.md        (Process management with PM2)"
echo ""
echo -e "${GREEN}Happy coding!${NC}"
