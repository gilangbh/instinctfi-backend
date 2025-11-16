# How to Test Solana Program Integration

## 🎯 Quick Test (Run This)

```bash
cd /Users/raihanibagaskoro/Projects/instinctfi-backend
node scripts/test-solana-integration.js
```

This will check:
- ✅ Configuration (env vars)
- ✅ Program exists on devnet
- ✅ Wallet has SOL
- ✅ IDL file is correct
- ✅ SolanaService can initialize

---

## 📊 What I Found

### ✅ Your Setup

```
Program ID:  7gmTYKqNX4xKsrd6NfNRscL3XSUoUTQyyTPhySWoABUc ✅
Deployed:    Yes, on Solana devnet ✅
Wallet:      2f2GzFzxrvqQ2E8pAt7EVwq6YWcuZqegA5HBge7qiCfn ✅
Balance:     3.96 SOL ✅
Integration: Code exists ✅
```

### ⚠️ Current Issue

**Blockchain integration is disabled** because `SolanaService` fails to initialize due to IDL parsing errors.

**What this means:**
- ✅ Runs created in database
- ❌ Runs NOT created on Solana blockchain
- ❌ No on-chain transactions

---

## 🚀 Simple Test (3 Commands)

### Test 1: Check Backend is Running

```bash
curl http://localhost:3001/api/v1/health
```

**Expected:** `{"success":true,...}`

### Test 2: Create a Run

```bash
# First get a token
node scripts/wallet-auth-test.js

# Then create run (use token from above)
curl -X POST http://localhost:3001/api/v1/runs \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"tradingPair":"SOL/USDC","coin":"SOL","minDeposit":10,"maxDeposit":100}'
```

### Test 3: Check Logs for Blockchain Activity

```bash
tail -20 ~/Projects/instinctfi-backend/logs/combined.log | grep -i "on-chain\|blockchain\|vault"
```

**If working, you'll see:**
```
On-chain TX: https://explorer.solana.com/tx/...
Vault TX: https://explorer.solana.com/tx/...
```

**If not working:**
```
Blockchain integration disabled
```

---

## 🔍 Check Your Solana Program

### View in Solana Explorer

```
https://explorer.solana.com/address/7gmTYKqNX4xKsrd6NfNRscL3XSUoUTQyyTPhySWoABUc?cluster=devnet
```

This shows:
- Program deployment info
- All accounts created by your program
- All transactions
- Current state

### Using CLI

```bash
# Program info
solana program show 7gmTYKqNX4xKsrd6NfNRscL3XSUoUTQyyTPhySWoABUc --url devnet

# Check specific account (platform PDA)
# You'd need to derive the PDA first
```

---

## ✅ What's Working Right Now

**Drift Integration:** 🟢 **FULLY WORKING**
- ✅ Real trading on Drift devnet
- ✅ Drift oracle prices
- ✅ Open/close positions
- ✅ Get account info

**Solana Integration:** 🟡 **PARTIALLY WORKING**
- ✅ Code exists and is integrated
- ✅ Wallet configured with SOL
- ✅ Program deployed on devnet
- ⚠️ SolanaService initialization fails (IDL issue)
- ❌ Runs not created on blockchain yet

---

## 🎯 Bottom Line

**To answer your question:** "How do I test if Solana program is integrated?"

**Current Answer:** 
The integration **code is there** but **not active** due to IDL parsing error.

**Quick Check:**
```bash
# Start backend
cd ~/Projects/instinctfi-backend
npm run dev

# Watch logs in another terminal
tail -f logs/combined.log | grep -i blockchain

# Create a run
node scripts/wallet-auth-test.js  # Get token
# Use token to create run

# If you see "Blockchain integration disabled" → Not working yet
# If you see "On-chain TX: ..." → Working! ✅
```

---

## 🚀 For Now

Your backend works perfectly for development:
- ✅ Create runs in database
- ✅ Drift trading works
- ✅ Drift oracle prices work
- ⏳ Blockchain integration (fix IDL issue later)

The blockchain integration is a **bonus feature** for transparency. Your app works without it!

---

**Want me to fix the IDL issue so runs are created on Solana blockchain?**











