# Drift Quick Start - Fixing "No User" Error

## ❌ The Error You Saw

```
Error: DriftClient has no user for user id 0_[your_wallet]
```

**This means:** Your Drift account hasn't been initialized yet (totally normal for first time!)

---

## ✅ Solution (Choose One)

### Option 1: Run Updated Test Script (Automatic)

I just fixed the test script - it will now automatically initialize your account:

```bash
cd ~/Projects/instinctfi-backend
node scripts/test-drift.js
```

The script will now:
1. Detect that your Drift account doesn't exist
2. **Automatically initialize it** for you
3. Show your account details

---

### Option 2: Manual Initialization

If you want to do it manually:

```bash
cd ~/Projects/instinctfi-backend

# Create a simple init script
cat > init-drift.js << 'EOF'
const { Connection, Keypair } = require('@solana/web3.js');
const { DriftClient } = require('@drift-labs/sdk');
const { Wallet } = require('@coral-xyz/anchor');
require('dotenv').config();

async function initDrift() {
  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
  
  const keypairData = JSON.parse(process.env.DRIFT_TRADING_KEYPAIR || process.env.SOLANA_PRIVATE_KEY);
  const keypair = Keypair.fromSecretKey(Uint8Array.from(keypairData));
  const wallet = new Wallet(keypair);
  
  console.log('Wallet:', wallet.publicKey.toString());
  
  const driftClient = new DriftClient({
    connection,
    wallet,
    env: 'devnet',
  });
  
  await driftClient.subscribe();
  console.log('✓ Drift client connected');
  
  try {
    const tx = await driftClient.initializeUser(0);
    console.log('✓ Drift account initialized!');
    console.log('Transaction:', tx);
  } catch (error) {
    console.error('Error:', error.message);
  }
  
  await driftClient.unsubscribe();
}

initDrift();
EOF

# Run it
node init-drift.js
```

---

## 🔍 What Happened?

When you use Drift for the first time, you need to:

1. **Create a Drift user account** (one-time setup)
   - This stores your trading data on-chain
   - Costs a small amount of SOL (~0.02 SOL)

2. **Subscribe to the account** (every session)
   - Connects to your existing account
   - No cost

You were on step 1 - the script will now handle it automatically!

---

## ✅ After Initialization

Run the test again:
```bash
node scripts/test-drift.js
```

You should now see:
```
✓ Drift user account exists
✓ User subscribed
Account Details:
  Total Collateral: $0.00
  Free Collateral: $0.00
  Unrealized PnL: $0.00
```

---

## 💰 Next Steps

Your Drift account is now initialized but has **$0 balance**.

### To Deposit (Optional - For Real Trading Later):

**On Devnet:**
```bash
# 1. Get devnet USDC
# Visit: https://spl-token-faucet.com/?token-name=USDC-Dev
# Or use Drift app: https://app.drift.trade/?cluster=devnet

# 2. Deposit to Drift (via UI or backend API)
```

**For Now (Mock Trading):**
You don't need to deposit anything! With `DRIFT_ENABLE_REAL_TRADING=false`, the backend will simulate trades without needing real USDC.

---

## 🎯 Summary

✅ Test script updated - will auto-initialize  
✅ Run: `node scripts/test-drift.js`  
✅ Your Drift account will be created automatically  
✅ No deposit needed for mock trading  

Try it now! 🚀



