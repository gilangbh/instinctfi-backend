#!/bin/bash

# Test Drift Trading Integration
# Tests: Long, Short, and Close positions

echo "🧪 Testing Drift Protocol Trading Integration"
echo "=============================================="
echo ""

# Configuration
BACKEND_URL="http://localhost:3001"
API_BASE="$BACKEND_URL/api/v1"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test 1: Check trading mode
echo "📋 Step 1: Checking trading mode..."
echo "─────────────────────────────────────"
TRADING_MODE=$(curl -s "$API_BASE/drift/mode")
echo "$TRADING_MODE" | jq '.'

IS_REAL=$(echo "$TRADING_MODE" | jq -r '.data.isRealTrading')
if [ "$IS_REAL" = "true" ]; then
    echo -e "${GREEN}✅ Real trading mode enabled${NC}"
else
    echo -e "${YELLOW}⚠️  Mock trading mode - Set DRIFT_ENABLE_REAL_TRADING=true for real trades${NC}"
fi
echo ""

# Test 2: Get account info
echo "📋 Step 2: Getting Drift account info..."
echo "─────────────────────────────────────"
ACCOUNT=$(curl -s "$API_BASE/drift/account")
echo "$ACCOUNT" | jq '.'
echo ""

# Test 3: Get current SOL price
echo "📋 Step 3: Getting current SOL price from Drift oracle..."
echo "─────────────────────────────────────"
PRICE=$(curl -s "$API_BASE/prices/current/SOL")
echo "$PRICE" | jq '.'
CURRENT_PRICE=$(echo "$PRICE" | jq -r '.data.price')
echo -e "${GREEN}Current SOL Price: \$$CURRENT_PRICE${NC}"
echo ""

# Test 4: Open LONG position
echo "📋 Step 4: Opening LONG position (0.1 SOL)..."
echo "─────────────────────────────────────"
read -p "Press Enter to place LONG order (or Ctrl+C to cancel)..."

LONG_ORDER=$(curl -s -X POST "$API_BASE/drift/order" \
  -H "Content-Type: application/json" \
  -d '{
    "marketSymbol": "SOL-PERP",
    "direction": "long",
    "baseAmount": 0.1,
    "leverage": 1
  }')

echo "$LONG_ORDER" | jq '.'

if echo "$LONG_ORDER" | jq -e '.success' > /dev/null; then
    echo -e "${GREEN}✅ LONG position opened successfully!${NC}"
    TX_ID=$(echo "$LONG_ORDER" | jq -r '.data.transactionId // .transactionId // empty')
    if [ ! -z "$TX_ID" ]; then
        echo -e "${GREEN}   TX: https://solscan.io/tx/${TX_ID}?cluster=devnet${NC}"
    fi
else
    echo -e "${RED}❌ Failed to open LONG position${NC}"
fi
echo ""
sleep 3

# Test 5: Check positions
echo "📋 Step 5: Checking open positions..."
echo "─────────────────────────────────────"
POSITIONS=$(curl -s "$API_BASE/drift/positions")
echo "$POSITIONS" | jq '.'
POSITION_COUNT=$(echo "$POSITIONS" | jq -r '.data.count // 0')
echo -e "${GREEN}Open positions: $POSITION_COUNT${NC}"
echo ""
sleep 2

# Test 6: Open SHORT position
echo "📋 Step 6: Opening SHORT position (0.1 SOL)..."
echo "─────────────────────────────────────"
read -p "Press Enter to place SHORT order (or Ctrl+C to cancel)..."

SHORT_ORDER=$(curl -s -X POST "$API_BASE/drift/order" \
  -H "Content-Type: application/json" \
  -d '{
    "marketSymbol": "SOL-PERP",
    "direction": "short",
    "baseAmount": 0.1,
    "leverage": 1
  }')

echo "$SHORT_ORDER" | jq '.'

if echo "$SHORT_ORDER" | jq -e '.success' > /dev/null; then
    echo -e "${GREEN}✅ SHORT position opened successfully!${NC}"
    TX_ID=$(echo "$SHORT_ORDER" | jq -r '.data.transactionId // .transactionId // empty')
    if [ ! -z "$TX_ID" ]; then
        echo -e "${GREEN}   TX: https://solscan.io/tx/${TX_ID}?cluster=devnet${NC}"
    fi
else
    echo -e "${RED}❌ Failed to open SHORT position${NC}"
fi
echo ""
sleep 3

# Test 7: Check positions again
echo "📋 Step 7: Checking all positions after trades..."
echo "─────────────────────────────────────"
POSITIONS=$(curl -s "$API_BASE/drift/positions")
echo "$POSITIONS" | jq '.'
echo ""
sleep 2

# Test 8: Close position
echo "📋 Step 8: Closing SOL-PERP position..."
echo "─────────────────────────────────────"
read -p "Press Enter to CLOSE position (or Ctrl+C to cancel)..."

CLOSE=$(curl -s -X POST "$API_BASE/drift/close" \
  -H "Content-Type: application/json" \
  -d '{
    "marketSymbol": "SOL-PERP"
  }')

echo "$CLOSE" | jq '.'

if echo "$CLOSE" | jq -e '.success' > /dev/null; then
    echo -e "${GREEN}✅ Position closed successfully!${NC}"
    TX_ID=$(echo "$CLOSE" | jq -r '.data.transactionId // .transactionId // empty')
    if [ ! -z "$TX_ID" ]; then
        echo -e "${GREEN}   TX: https://solscan.io/tx/${TX_ID}?cluster=devnet${NC}"
    fi
    
    PNL=$(echo "$CLOSE" | jq -r '.data.pnl // empty')
    if [ ! -z "$PNL" ]; then
        echo -e "${GREEN}   P&L: \$$PNL${NC}"
    fi
else
    echo -e "${RED}❌ Failed to close position${NC}"
fi
echo ""
sleep 2

# Test 9: Final position check
echo "📋 Step 9: Final position check..."
echo "─────────────────────────────────────"
FINAL_POSITIONS=$(curl -s "$API_BASE/drift/positions")
echo "$FINAL_POSITIONS" | jq '.'
FINAL_COUNT=$(echo "$FINAL_POSITIONS" | jq -r '.data.count // 0')
echo ""

# Summary
echo "=============================================="
echo "🎯 Test Summary"
echo "=============================================="
echo -e "Trading Mode: ${IS_REAL}"
echo -e "SOL Price: \$$CURRENT_PRICE"
echo -e "Final Open Positions: $FINAL_COUNT"
echo ""
echo "✅ Testing complete!"
echo ""
echo "🔗 View your trades on Drift:"
echo "   https://app.drift.trade/overview?cluster=devnet"
echo ""

