#!/bin/bash

# Solana Integration Setup Script for Instinct.fi Backend
# This script helps you set up the Solana integration

set -e

echo "=========================================="
echo "Instinct.fi Solana Integration Setup"
echo "=========================================="
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if .env exists
if [ ! -f .env ]; then
    echo -e "${YELLOW}⚠ .env file not found. Creating from env.example...${NC}"
    cp env.example .env
    echo -e "${GREEN}✓ Created .env file${NC}"
else
    echo -e "${GREEN}✓ .env file exists${NC}"
fi

# Check if solana CLI is installed
if ! command -v solana &> /dev/null; then
    echo -e "${RED}✗ Solana CLI not found${NC}"
    echo "Please install Solana CLI:"
    echo "  sh -c \"\$(curl -sSfL https://release.solana.com/stable/install)\""
    exit 1
fi

echo -e "${GREEN}✓ Solana CLI found: $(solana --version)${NC}"

# Ask if user wants to generate a new keypair
echo ""
echo "Do you want to generate a new keypair for the backend? (y/n)"
read -r GENERATE_KEYPAIR

if [ "$GENERATE_KEYPAIR" = "y" ]; then
    KEYPAIR_PATH="./backend-keypair.json"
    
    if [ -f "$KEYPAIR_PATH" ]; then
        echo -e "${YELLOW}⚠ Keypair already exists at $KEYPAIR_PATH${NC}"
        echo "Do you want to overwrite it? (y/n)"
        read -r OVERWRITE
        if [ "$OVERWRITE" != "y" ]; then
            echo "Using existing keypair..."
        else
            solana-keygen new --no-bip39-passphrase -o "$KEYPAIR_PATH" --force
            echo -e "${GREEN}✓ New keypair generated${NC}"
        fi
    else
        solana-keygen new --no-bip39-passphrase -o "$KEYPAIR_PATH"
        echo -e "${GREEN}✓ Keypair generated at $KEYPAIR_PATH${NC}"
    fi
    
    # Get the public key
    PUBKEY=$(solana-keygen pubkey "$KEYPAIR_PATH")
    echo -e "${GREEN}Public Key: $PUBKEY${NC}"
    
    # Fund with devnet SOL
    echo ""
    echo "Requesting devnet airdrop..."
    solana airdrop 5 "$PUBKEY" --url devnet || echo -e "${YELLOW}⚠ Airdrop may have failed. Try manually: solana airdrop 5 $PUBKEY --url devnet${NC}"
    
    # Get the keypair as array for .env
    echo ""
    echo -e "${YELLOW}Add this to your .env file as SOLANA_PRIVATE_KEY:${NC}"
    cat "$KEYPAIR_PATH"
    echo ""
    
    # Offer to update .env automatically
    echo "Do you want to automatically update .env with this keypair? (y/n)"
    read -r UPDATE_ENV
    
    if [ "$UPDATE_ENV" = "y" ]; then
        KEYPAIR_ARRAY=$(cat "$KEYPAIR_PATH")
        # Check if SOLANA_PRIVATE_KEY exists in .env
        if grep -q "^SOLANA_PRIVATE_KEY=" .env; then
            # Update existing line (macOS and Linux compatible)
            if [[ "$OSTYPE" == "darwin"* ]]; then
                sed -i '' "s|^SOLANA_PRIVATE_KEY=.*|SOLANA_PRIVATE_KEY=$KEYPAIR_ARRAY|" .env
            else
                sed -i "s|^SOLANA_PRIVATE_KEY=.*|SOLANA_PRIVATE_KEY=$KEYPAIR_ARRAY|" .env
            fi
        else
            # Add new line
            echo "SOLANA_PRIVATE_KEY=$KEYPAIR_ARRAY" >> .env
        fi
        echo -e "${GREEN}✓ .env updated with keypair${NC}"
    fi
fi

# Check Solana configuration in .env
echo ""
echo "Checking Solana configuration..."

if grep -q "^SOLANA_PROGRAM_ID=" .env; then
    PROGRAM_ID=$(grep "^SOLANA_PROGRAM_ID=" .env | cut -d '=' -f2)
    echo -e "${GREEN}✓ SOLANA_PROGRAM_ID: $PROGRAM_ID${NC}"
else
    echo -e "${RED}✗ SOLANA_PROGRAM_ID not set in .env${NC}"
fi

if grep -q "^SOLANA_RPC_URL=" .env; then
    RPC_URL=$(grep "^SOLANA_RPC_URL=" .env | cut -d '=' -f2)
    echo -e "${GREEN}✓ SOLANA_RPC_URL: $RPC_URL${NC}"
else
    echo -e "${RED}✗ SOLANA_RPC_URL not set in .env${NC}"
fi

# Test connection
echo ""
echo "Testing Solana RPC connection..."
if solana cluster-version --url devnet &> /dev/null; then
    echo -e "${GREEN}✓ Successfully connected to Solana devnet${NC}"
else
    echo -e "${RED}✗ Failed to connect to Solana devnet${NC}"
fi

# Install dependencies
echo ""
echo "Do you want to install/update npm dependencies? (y/n)"
read -r INSTALL_DEPS

if [ "$INSTALL_DEPS" = "y" ]; then
    npm install
    echo -e "${GREEN}✓ Dependencies installed${NC}"
fi

# Summary
echo ""
echo "=========================================="
echo "Setup Complete! 🎉"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Verify your .env file has SOLANA_PRIVATE_KEY set"
echo "2. Start your backend: npm run dev"
echo "3. Initialize the platform (one-time):"
echo "   curl -X POST http://localhost:3001/api/solana/platform/initialize \\"
echo "     -H \"Content-Type: application/json\" \\"
echo "     -H \"Authorization: Bearer YOUR_ADMIN_TOKEN\" \\"
echo "     -d '{\"platformFeeBps\": 150}'"
echo ""
echo "4. Verify setup:"
echo "   curl http://localhost:3001/api/solana/platform"
echo ""
echo "For more information, see SOLANA_INTEGRATION.md"
echo ""
















