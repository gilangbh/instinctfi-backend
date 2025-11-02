#!/bin/bash

# Fix Solana Blockchain Integration
# This script fixes the IDL compatibility issue

set -e

echo "🔧 Fixing Solana Blockchain Integration..."
echo ""

cd /Users/raihanibagaskoro/Projects/instinctfi-backend

# Step 1: Copy fresh IDL from Solana project
echo "1. Copying latest IDL from Solana project..."
if [ -f "../instinctfi-solana/target/idl/instinct_trading.json" ]; then
    cp ../instinctfi-solana/target/idl/instinct_trading.json src/idl/
    echo "   ✅ IDL copied"
else
    echo "   ⚠️  IDL not found in Solana project - building..."
    cd ../instinctfi-solana
    anchor build
    cd ../instinctfi-backend
    cp ../instinctfi-solana/target/idl/instinct_trading.json src/idl/
    echo "   ✅ IDL built and copied"
fi

# Step 2: Fix IDL address to match program ID
echo "2. Updating IDL address..."
node -e "
const fs = require('fs');
const idl = JSON.parse(fs.readFileSync('src/idl/instinct_trading.json', 'utf8'));
idl.address = '7gmTYKqNX4xKsrd6NfNRscL3XSUoUTQyyTPhySWoABUc';
fs.writeFileSync('src/idl/instinct_trading.json', JSON.stringify(idl, null, 2));
console.log('   ✅ IDL address updated');
"

# Step 3: Simplify IDL to avoid parsing issues
echo "3. Simplifying IDL for compatibility..."
node -e "
const fs = require('fs');
const idl = JSON.parse(fs.readFileSync('src/idl/instinct_trading.json', 'utf8'));

// Keep structure but simplify account types to avoid parsing errors
if (idl.accounts) {
  idl.accounts = idl.accounts.map(acc => ({
    name: acc.name,
    discriminator: acc.discriminator
  }));
}

fs.writeFileSync('src/idl/instinct_trading.json', JSON.stringify(idl, null, 2));
console.log('   ✅ IDL simplified');
"

echo ""
echo "✅ Blockchain integration fixed!"
echo ""
echo "Next steps:"
echo "  1. Restart backend: npm run dev"
echo "  2. Create a run via API"
echo "  3. Check logs for blockchain TXs"
echo ""

