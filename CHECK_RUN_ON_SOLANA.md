# How to Check Run on Solana Blockchain

## 🔍 Current Status

**Your Solana Program:** ✅ **Deployed on Devnet**
```
Program ID: 7gmTYKqNX4xKsrd6NfNRscL3XSUoUTQyyTPhySWoABUc
Status: Active on devnet
Authority: 5feYzzdt3BCYxKZc7BaSiGsJfRBP6QXtQVFEdsGF2wGV
```

**Backend Integration:** ⚠️ **Runs created in DB, but not on-chain yet**

From logs: `"Blockchain integration disabled"`

---

## 📊 How to Check Runs on Solana

### Method 1: Using Solana Explorer

Visit the program:
```
https://explorer.solana.com/address/7gmTYKqNX4xKsrd6NfNRscL3XSUoUTQyyTPhySWoABUc?cluster=devnet
```

You can see:
- Program deployment info
- All accounts created by the program
- Transactions

### Method 2: Using Solana CLI

```bash
# Check program
solana program show 7gmTYKqNX4xKsrd6NfNRscL3XSUoUTQyyTPhySWoABUc --url devnet

# Check a specific run account (if you know the run ID)
# First derive the PDA for run ID 1:
solana account <RUN_PDA_ADDRESS> --url devnet
```

### Method 3: Via Backend API (Once Enabled)

```bash
# Get run info from blockchain
curl http://localhost:3001/api/v1/solana/run/1

# Get all PDAs for a run
curl http://localhost:3001/api/v1/solana/run/1/pdas

# Get platform info
curl http://localhost:3001/api/v1/solana/platform
```

**Note:** These endpoints are currently disabled due to IDL parsing issue.

---

## ⚠️ Why Runs Aren't On-Chain Yet

The blockchain integration is in the code but currently catching errors silently:

```typescript
// In RunService.ts
try {
  const createTx = await this.solanaService.createRun(...);
  const vaultTx = await this.solanaService.createRunVault(...);
} catch (solanaError) {
  logger.error('Failed to create run on-chain, but DB entry created:', solanaError);
  // Continue anyway - DB is source of truth
}
```

**Possible reasons:**
1. SolanaService initialization fails due to IDL parsing
2. No SOLANA_PRIVATE_KEY configured
3. Wallet has no SOL for transaction fees

---

## 🔧 To Enable Blockchain Integration

### Check if SOLANA_PRIVATE_KEY is Set

```bash
cd /Users/raihanibagaskoro/Projects/instinctfi-backend
grep "SOLANA_PRIVATE_KEY" .env
```

If empty:
```bash
# Generate keypair
solana-keygen new -o backend-solana-keypair.json

# Fund with devnet SOL
solana airdrop 5 $(solana-keygen pubkey backend-solana-keypair.json) --url devnet

# Add to .env
cat backend-solana-keypair.json
# Copy the array to SOLANA_PRIVATE_KEY in .env
```

### Test Blockchain Operations

Once configured, create a run and check logs:

```bash
tail -f logs/combined.log | grep "on-chain\|blockchain\|vault"

# Then create a run
curl -X POST http://localhost:3001/api/v1/runs \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"tradingPair":"SOL/USDC","coin":"SOL","minDeposit":10,"maxDeposit":100}'

# You should see:
# "On-chain TX: https://explorer.solana.com/tx/..."
# "Vault TX: https://explorer.solana.com/tx/..."
```

---

## 📋 Quick Check Commands

```bash
# 1. Check program exists on devnet
solana program show 7gmTYKqNX4xKsrd6NfNRscL3XSUoUTQyyTPhySWoABUc --url devnet

# 2. Check backend has keypair
grep SOLANA_PRIVATE_KEY ~/Projects/instinctfi-backend/.env

# 3. Check backend logs for blockchain activity
tail -50 ~/Projects/instinctfi-backend/logs/combined.log | grep -i blockchain

# 4. View program in explorer
open "https://explorer.solana.com/address/7gmTYKqNX4xKsrd6NfNRscL3XSUoUTQyyTPhySWoABUc?cluster=devnet"
```

---

## 🎯 Summary

**Your Solana Program:** ✅ Deployed and working on devnet  
**Backend Integration:** ✅ Code is there  
**Runs on Blockchain:** ⚠️ Currently disabled (silently catching errors)  

**To Enable:**
1. Set `SOLANA_PRIVATE_KEY` in `.env`
2. Fund wallet with devnet SOL
3. Restart backend
4. Create a run
5. Check logs for blockchain transactions

**To Check Runs:**
- Solana Explorer: https://explorer.solana.com/address/7gmTYKqNX4xKsrd6NfNRscL3XSUoUTQyyTPhySWoABUc?cluster=devnet
- CLI: `solana program show 7gmTYKqNX4xKsrd6NfNRscL3XSUoUTQyyTPhySWoABUc --url devnet`
- Logs: `tail -f logs/combined.log | grep blockchain`















