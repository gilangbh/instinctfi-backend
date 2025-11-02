
# Drift Protocol Integration Guide

Complete guide to integrating Drift Protocol for **real trading** in your Instinct.fi backend.

## 📋 What You Need

### Required

1. **Solana CLI** installed
2. **Node.js** 20+ with npm
3. **Drift SDK** (already installed: `@drift-labs/sdk`)
4. **Trading wallet** with SOL for transaction fees
5. **USDC** for trading (on devnet or mainnet)

### Optional (Recommended for Testing)

- Drift devnet account with test USDC
- Separate wallet for testing vs production

---

## 🚀 Quick Start (5 Steps)

### Step 1: Run Setup Script

```bash
cd ~/Projects/instinctfi-backend
chmod +x scripts/drift-setup.sh
./scripts/drift-setup.sh
```

This will:
- ✅ Create/update `.env` file
- ✅ Choose devnet or mainnet
- ✅ Generate trading keypair (or use existing)
- ✅ Fund wallet (if devnet)
- ✅ Configure trading mode (mock vs real)

### Step 2: Verify Configuration

Check your `.env` has these settings:

```bash
# Drift Protocol Configuration
DRIFT_ENVIRONMENT=devnet                    # or mainnet-beta
DRIFT_RPC_URL=https://api.devnet.solana.com
DRIFT_TRADING_KEYPAIR=[1,2,3,...]         # Your keypair array
DRIFT_ENABLE_REAL_TRADING=false             # Start with false for testing
DRIFT_DEFAULT_MARKET=SOL-PERP
```

### Step 3: Test Connection

```bash
node scripts/test-drift.js
```

This will:
- ✅ Verify RPC connection
- ✅ Check wallet balance
- ✅ Initialize Drift client
- ✅ Check/create Drift user account
- ✅ Display account balance and positions
- ✅ Test oracle prices

### Step 4: Start Backend

```bash
npm run dev
```

Look for log messages:
```
🟡 MOCK TRADING MODE - Simulated trades only
✅ Mock Drift service active
```

OR (if real trading enabled):
```
🔴 REAL TRADING MODE ENABLED - Drift Protocol
Initializing Drift client...
✅ Drift client subscribed
✅ Drift user subscribed
```

### Step 5: Test API

```bash
# Check Drift account status
curl http://localhost:3001/api/drift/account

# Test a mock trade (safe - doesn't execute real trade)
curl -X POST http://localhost:3001/api/drift/trade \
  -H "Content-Type: application/json" \
  -d '{
    "marketSymbol": "SOL-PERP",
    "direction": "long",
    "baseAmount": 0.1,
    "leverage": 2
  }'
```

---

## 📁 New Files Created

```
instinctfi-backend/
├── src/
│   └── services/
│       ├── RealDriftService.ts           ← NEW - Real Drift trading
│       └── DriftIntegrationService.ts    ← NEW - Mock/Real switcher
├── scripts/
│   ├── drift-setup.sh                    ← NEW - Setup wizard
│   └── test-drift.js                     ← NEW - Connection test
└── DRIFT_INTEGRATION_GUIDE.md            ← NEW - This file
```

---

## 🔧 Configuration Details

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DRIFT_ENVIRONMENT` | Yes | `mainnet-beta` | `devnet` or `mainnet-beta` |
| `DRIFT_RPC_URL` | Yes | - | Solana RPC endpoint |
| `DRIFT_TRADING_KEYPAIR` | Yes | - | Trading wallet keypair (JSON array) |
| `DRIFT_ENABLE_REAL_TRADING` | Yes | `false` | Enable actual trading |
| `DRIFT_DEFAULT_MARKET` | No | `SOL-PERP` | Default trading market |
| `DRIFT_MAX_LEVERAGE` | No | `10` | Max leverage per trade |
| `DRIFT_MAX_POSITION_SIZE_USD` | No | `10000` | Max position size |

### Trading Modes

#### Mock Mode (Safe - Default)
```bash
DRIFT_ENABLE_REAL_TRADING=false
```
- ✅ Simulates trades with random P/L
- ✅ Safe for development and testing
- ✅ No real money at risk
- ✅ Uses Binance prices

#### Real Mode (Actual Trading)
```bash
DRIFT_ENABLE_REAL_TRADING=true
```
- 🔴 Executes REAL trades on Drift
- 🔴 Uses REAL money
- 🔴 Requires funded Drift account
- 🔴 Test thoroughly on devnet first!

---

## 🏗️ Architecture

### How It Works

```
┌─────────────────────────────────────────────────────┐
│            Your Backend                              │
│                                                      │
│  ┌──────────────────────────────────────────────┐  │
│  │  DriftIntegrationService                     │  │
│  │  (Switches between mock and real)            │  │
│  └───────────────┬──────────────────────────────┘  │
│                  │                                   │
│       ┌──────────┴──────────┐                       │
│       ▼                     ▼                        │
│  ┌──────────┐        ┌──────────────────┐          │
│  │  Mock    │        │  RealDriftService│          │
│  │  Drift   │        │  - Actual trading│          │
│  │  Service │        │  - Drift SDK     │          │
│  └──────────┘        └──────────────────┘          │
│                              │                       │
└──────────────────────────────┼───────────────────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │  Drift Protocol     │
                    │  (On-Chain)         │
                    │                     │
                    │  - Real trading     │
                    │  - Position mgmt    │
                    │  - Oracle prices    │
                    └─────────────────────┘
```

### Key Services

#### 1. RealDriftService
**File:** `src/services/RealDriftService.ts`

Handles actual Drift Protocol integration:
- Initializes Drift client
- Manages user account
- Opens/closes positions
- Tracks P/L
- Manages collateral

**Key Methods:**
```typescript
await driftService.initialize();
await driftService.openPosition({ marketSymbol: 'SOL-PERP', direction: 'long', baseAmount: 1 });
await driftService.closePosition('SOL-PERP');
const positions = await driftService.getPositions();
const accountInfo = await driftService.getAccountInfo();
```

#### 2. DriftIntegrationService
**File:** `src/services/DriftIntegrationService.ts`

Switches between mock and real trading based on config:
```typescript
// Automatically uses mock or real based on DRIFT_ENABLE_REAL_TRADING
const driftService = new DriftIntegrationService();
await driftService.initialize();

// This will execute mock or real trade
await driftService.executeTrade(params);
```

---

## 💰 Funding Your Drift Account

### On Devnet (Test USDC)

1. **Get SOL from faucet:**
```bash
solana airdrop 5 YOUR_WALLET --url devnet
```

2. **Get devnet USDC:**
Visit: https://spl-token-faucet.com/?token-name=USDC-Dev
Or use Drift's devnet faucet in their UI

3. **Deposit to Drift:**
```bash
# Via the backend API
curl -X POST http://localhost:3001/api/drift/deposit \
  -H "Content-Type: application/json" \
  -d '{"amount": 100}'
```

Or initialize with USDC in your Drift account directly via UI:
https://app.drift.trade/?cluster=devnet

### On Mainnet (Real USDC)

⚠️ **REAL MONEY WARNING** ⚠️

1. **Transfer SOL** to your trading wallet for fees
2. **Transfer USDC** to your trading wallet
3. **Deposit to Drift:**
   - Via Drift UI: https://app.drift.trade/
   - Or via backend API (after testing thoroughly!)

---

## 🧪 Testing Checklist

### Before Enabling Real Trading

- [ ] Test on **devnet first**
- [ ] Verify wallet has SOL for fees
- [ ] Initialize Drift user account
- [ ] Deposit test USDC to Drift
- [ ] Test opening small positions
- [ ] Test closing positions
- [ ] Verify P/L calculations
- [ ] Test with different leverage levels
- [ ] Monitor oracle prices
- [ ] Test emergency close scenarios

### Testing Commands

```bash
# 1. Test connection
node scripts/test-drift.js

# 2. Check account
curl http://localhost:3001/api/drift/account

# 3. Test mock trade (safe)
DRIFT_ENABLE_REAL_TRADING=false npm run dev
# Then create a run and execute trades

# 4. Small real trade on devnet
DRIFT_ENABLE_REAL_TRADING=true DRIFT_ENVIRONMENT=devnet npm run dev
# Create a run with small amounts

# 5. Monitor positions
curl http://localhost:3001/api/drift/positions

# 6. Close all positions
curl -X POST http://localhost:3001/api/drift/close-all
```

---

## 📊 Usage Examples

### Check Account Balance

```typescript
// In your code
import { DriftIntegrationService } from '@/services/DriftIntegrationService';

const driftService = new DriftIntegrationService();
await driftService.initialize();

const accountInfo = await driftService.getAccountInfo();
console.log(`Equity: $${accountInfo.equity}`);
console.log(`Free Collateral: $${accountInfo.freeCollateral}`);
console.log(`Open Positions: ${accountInfo.positions.length}`);
```

### Execute a Trade

```typescript
const result = await driftService.executeTrade({
  marketSymbol: 'SOL-PERP',
  direction: 'long',
  baseAmount: 1.0,  // 1 SOL
  leverage: 2,
});

if (result.success) {
  console.log(`Trade executed: ${result.transactionId}`);
  console.log(`Entry price: $${result.entryPrice}`);
} else {
  console.error(`Trade failed: ${result.error}`);
}
```

### Close a Position

```typescript
const result = await driftService.closePosition('SOL-PERP');

if (result.success) {
  console.log(`Position closed: ${result.transactionId}`);
  console.log(`P/L: $${result.pnl}`);
}
```

### Get Open Positions

```typescript
const positions = await driftService.getOpenPositions();

positions.forEach(pos => {
  console.log(`${pos.marketSymbol}: ${pos.direction} ${pos.baseAssetAmount}`);
  console.log(`Entry: $${pos.entryPrice}, Current: $${pos.currentPrice}`);
  console.log(`Unrealized P/L: $${pos.unrealizedPnl}`);
});
```

---

## 🔒 Security Best Practices

### Wallet Management

1. **Separate Wallets**
   - Development wallet (devnet)
   - Production wallet (mainnet)
   - **Never** commit keypairs to git!

2. **Key Storage**
   - Use environment variables
   - Consider AWS Secrets Manager or HashiCorp Vault for production
   - Rotate keys periodically

3. **Access Control**
   - Limit who can access production keys
   - Use separate admin keys for platform operations
   - Consider multisig for large operations

### Trading Limits

Set conservative limits in `.env`:
```bash
DRIFT_MAX_LEVERAGE=5              # Lower leverage = lower risk
DRIFT_MAX_POSITION_SIZE_USD=1000  # Limit max position size
```

### Monitoring

1. **Set up alerts** for:
   - Large positions opened
   - High leverage usage
   - Significant P/L changes
   - Low collateral warnings

2. **Log all trades** for audit trail

3. **Regular balance checks** to detect anomalies

---

## 🐛 Troubleshooting

### "Drift client not initialized"

**Solution:** Call `initialize()` before using:
```typescript
await driftService.initialize();
```

### "DRIFT_TRADING_KEYPAIR is required"

**Solution:** Add keypair to `.env`:
```bash
# Generate new keypair
solana-keygen new -o drift-keypair.json

# Add to .env
DRIFT_TRADING_KEYPAIR=[paste array from drift-keypair.json]
```

### "Insufficient collateral"

**Solution:** Deposit more USDC to your Drift account:
```bash
# Via Drift UI or API
curl -X POST http://localhost:3001/api/drift/deposit -d '{"amount": 100}'
```

### "Transaction simulation failed"

**Possible causes:**
- Insufficient SOL for fees
- Drift account not initialized
- Invalid market index
- Position too large for available collateral

**Solution:** Check:
```bash
# SOL balance
solana balance YOUR_WALLET --url devnet

# Drift account
node scripts/test-drift.js
```

### "Oracle price not available"

**Solution:** 
- Drift oracles might be down temporarily
- Check Drift status: https://status.drift.trade/
- Fall back to Binance prices

---

## 📚 API Endpoints (Suggested)

Add these to your backend for Drift management:

```typescript
// GET /api/drift/account - Get account info
// GET /api/drift/positions - Get open positions
// POST /api/drift/trade - Execute trade
// POST /api/drift/close/:market - Close position
// POST /api/drift/deposit - Deposit collateral
// POST /api/drift/withdraw - Withdraw collateral
// GET /api/drift/markets - Get available markets
// GET /api/drift/oracle/:market - Get oracle price
```

---

## 🚦 Going to Production

### Checklist

- [ ] Test extensively on devnet
- [ ] Get Drift mainnet account
- [ ] Fund with small amount first
- [ ] Test with small real trades
- [ ] Monitor for 24-48 hours
- [ ] Gradually increase position sizes
- [ ] Set up monitoring and alerts
- [ ] Have emergency shutdown procedure
- [ ] Document all processes
- [ ] Train team on operations

### Gradual Rollout

1. **Week 1:** Devnet testing
2. **Week 2:** Mainnet with $100-$500
3. **Week 3:** Increase to $1,000-$5,000
4. **Week 4:** Scale based on performance

---

## 📖 Resources

- [Drift Protocol Docs](https://docs.drift.trade/)
- [Drift SDK on GitHub](https://github.com/drift-labs/protocol-v2)
- [Drift SDK Examples](https://github.com/drift-labs/protocol-v2/tree/master/sdk/examples)
- [Drift App (Devnet)](https://app.drift.trade/?cluster=devnet)
- [Drift App (Mainnet)](https://app.drift.trade/)
- [Drift Discord](https://discord.gg/driftprotocol)

---

## 🆘 Need Help?

1. **Check logs:** `tail -f logs/combined.log`
2. **Test connection:** `node scripts/test-drift.js`
3. **Review this guide**
4. **Check Drift Discord** for protocol-specific issues
5. **Review Drift SDK examples** on GitHub

---

## Summary

You now have:

✅ `RealDriftService` - Actual Drift trading integration  
✅ `DriftIntegrationService` - Mock/Real mode switcher  
✅ Configuration system - Easy environment setup  
✅ Setup script - Automated wallet & config  
✅ Test script - Verify connection & account  
✅ Documentation - This comprehensive guide  

**Next Step:** Run `./scripts/drift-setup.sh` and start testing! 🚀

