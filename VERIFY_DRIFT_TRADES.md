# How to Verify Trades Are Executed on Drift Protocol

This guide explains multiple ways to verify that your trades are actually being executed on Drift Protocol, not just simulated.

## 🔍 Quick Verification Methods

### Method 1: Use the Verification Script (Recommended)

The easiest way is to use the existing verification script:

```bash
cd /Users/raihanibagaskoro/Projects/instinctfi-backend
node scripts/verify-drift-trades.js <runId>
```

**Example:**
```bash
node scripts/verify-drift-trades.js cmi5rjojs0006u1udbhi2tt3q
```

**What it checks:**
- ✅ Compares database trades with actual Drift Protocol positions
- ✅ Verifies direction (LONG/SHORT) matches
- ✅ Verifies entry prices match (within $1 tolerance)
- ✅ Shows all open positions on Drift
- ✅ Checks if `DRIFT_ENABLE_REAL_TRADING` is enabled
- ✅ Filters out SKIP trades (which don't create positions)

**Expected Output:**
```
📊 Verifying Drift trades for run...

📋 Run Information:
   ID: cmi5rjojs0006u1udbhi2tt3q
   Status: ACTIVE
   Trading Pair: SOL/USDC
   ...

📈 Database Trades (2 total):
   Round 1: LONG - ⏳ Open
      Entry: $150.25
      ...

🔍 Drift Protocol Positions:
   Found 1 open position(s) on Drift:
   Position 1:
      Market: SOL-PERP (Index: 0)
      Direction: LONG
      Size: 0.5000 SOL
      Entry Price: $150.23
      ...

🔗 Verification Summary:
   Database open trades (excluding SKIP): 1
   Drift open positions: 1
   ✅ Open trades match open positions
      ✅ Trade verified on Drift Protocol!
```

### Method 2: Check Backend Logs

When a trade is executed, look for these log messages:

**Real Trade (on Drift):**
```
🚀 Executing REAL trade on Drift Protocol
🔍 executeTrade called - isRealTradingEnabled: true, realDriftService exists: true
✅ Position opened on Drift Protocol
   Transaction: <transaction_signature>
```

**Mock Trade (simulated):**
```
⚠️  Executing MOCK trade (real trading not enabled or service unavailable)
🔍 executeTrade called - isRealTradingEnabled: false, realDriftService exists: false
```

### Method 3: Check Environment Variables

Verify your backend has real trading enabled:

```bash
# In your backend .env file or Railway environment variables
DRIFT_ENABLE_REAL_TRADING=true
DRIFT_TRADING_KEYPAIR=<your_keypair_json>
DRIFT_RPC_URL=https://api.devnet.solana.com
DRIFT_ENVIRONMENT=devnet
```

**Important:** If `DRIFT_ENABLE_REAL_TRADING` is not set to `"true"` (exact string), trades will be mocked.

### Method 4: Check Drift Protocol Directly

You can check your Drift account directly using the Drift web interface:

1. Go to [Drift Protocol Devnet](https://app.drift.trade/?env=devnet)
2. Connect your wallet (the one specified in `DRIFT_TRADING_KEYPAIR`)
3. Check the "Positions" tab
4. You should see open SOL-PERP positions if trades are executing

### Method 5: Check Transaction Signatures

When a real trade executes, you'll get a transaction signature. Check it on Solana Explorer:

**In Backend Logs:**
```
✅ Position opened on Drift Protocol
   Transaction: 5KJp...xyz
```

**Verify on Explorer:**
- Go to: https://explorer.solana.com/tx/<transaction_signature>?cluster=devnet
- You should see the transaction interacting with Drift Protocol program

## 🚨 Common Issues

### Issue 1: "No open positions found on Drift"

**Possible causes:**
- `DRIFT_ENABLE_REAL_TRADING` is not `"true"`
- `DRIFT_TRADING_KEYPAIR` is not set or invalid
- Trades are failing silently (check backend logs)
- All positions have been closed

**Solution:**
1. Check backend logs for trade execution errors
2. Verify environment variables are set correctly
3. Check if trades are being marked as SKIP (which don't create positions)

### Issue 2: "Database shows open trades but Drift has no positions"

**This means:**
- Trades are being recorded in the database
- But they're NOT being executed on Drift Protocol
- Likely using mock/fallback mode

**Solution:**
1. Check `DRIFT_ENABLE_REAL_TRADING=true` in environment
2. Check backend logs for initialization errors
3. Verify `DRIFT_TRADING_KEYPAIR` is valid
4. Check if `RealDriftService` is being initialized (look for "✅ RealDriftService instance created" in logs)

### Issue 3: "Trade details do not match exactly"

**This means:**
- A position exists on Drift
- But direction or entry price doesn't match database

**Possible causes:**
- Price slippage (entry price might differ slightly)
- Multiple positions open (need manual verification)
- Position was opened manually, not by the backend

**Solution:**
- Check if price difference is within $1 (acceptable)
- Verify only one position should be open per run
- Check backend logs for the exact entry price used

## 📊 What Gets Verified

The verification script checks:

1. **Position Existence**: Does a position exist on Drift for each open trade?
2. **Direction Match**: Does LONG/SHORT match between database and Drift?
3. **Price Match**: Is entry price within $1 tolerance?
4. **Configuration**: Is real trading enabled?
5. **SKIP Trades**: Correctly filters out SKIP trades (they don't create positions)

## 🔧 Advanced: Manual Position Check

If you want to manually check positions, you can use this Node.js snippet:

```javascript
const { Connection, Keypair } = require('@solana/web3.js');
const { DriftClient, User } = require('@drift-labs/sdk');
const { Wallet } = require('@coral-xyz/anchor');

// Your config
const keypair = Keypair.fromSecretKey(/* your keypair */);
const wallet = new Wallet(keypair);
const connection = new Connection('https://api.devnet.solana.com', 'confirmed');

const driftClient = new DriftClient({
  connection,
  wallet,
  env: 'devnet',
});

await driftClient.subscribe();

const user = new User({
  driftClient,
  userAccountPublicKey: await driftClient.getUserAccountPublicKey(),
});

await user.subscribe();

const positions = user.getActivePerpPositions();
console.log('Open positions:', positions);
```

## ✅ Summary Checklist

Before assuming trades are on Drift, verify:

- [ ] `DRIFT_ENABLE_REAL_TRADING=true` in environment
- [ ] `DRIFT_TRADING_KEYPAIR` is set and valid
- [ ] Backend logs show "🚀 Executing REAL trade on Drift Protocol"
- [ ] Verification script shows matching positions
- [ ] Transaction signatures appear in logs
- [ ] Transactions are visible on Solana Explorer
- [ ] Positions visible on Drift Protocol web interface

If all checkboxes are ✅, your trades are definitely on Drift Protocol!

