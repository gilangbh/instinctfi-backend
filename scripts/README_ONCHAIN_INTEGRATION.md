# On-Chain Run Integration Guide

This guide explains how to ensure runs are properly integrated on the Solana blockchain.

## Overview

When a run is created, it should be:
1. ✅ Created in the database
2. ✅ Created on-chain (Run PDA)
3. ✅ Vault created on-chain (Run Vault PDA)
4. ✅ Started on-chain when the run begins (status: Waiting → Active)

## Quick Start

### 1. Initialize Platform (One-Time Setup)

Before creating any runs, initialize the platform:

```bash
node scripts/init-platform.js
```

This creates the Platform PDA and Platform Fee Vault on-chain.

### 2. Create a Run

When you create a run via API, it should automatically:
- Create the run in the database
- Create the run on-chain
- Create the vault on-chain

Check your backend logs for:
```
✅ Run fully integrated on-chain: <run-id>
   Run PDA: <pda-address>
   Vault PDA: <vault-address>
```

### 3. Sync Existing Runs

If you have runs that weren't created on-chain, sync them:

```bash
# Sync all runs
node scripts/sync-runs-onchain.js

# Sync a specific run
node scripts/sync-runs-onchain.js cmi5u9ugy0000112ugh040st9
```

## Verification

### Check if Run Exists On-Chain

```bash
# Check trade records (also shows run info)
node scripts/check-trade-records.js <runId>
```

### Check Run Status

The script will show:
- ✅ Run on-chain: Exists
- ❌ Run on-chain: Missing

## Run Lifecycle On-Chain

### 1. Creation (WAITING status)

When a run is created:
- `create_run` instruction creates the Run PDA
- `create_run_vault` instruction creates the Run Vault PDA
- Status: `Waiting`
- Users can deposit USDC

### 2. Start (ACTIVE status)

When the lobby phase ends:
- `start_run` instruction updates status to `Active`
- Trading can begin
- Trades can be recorded on-chain

### 3. Settlement (SETTLED status)

When the run ends:
- `settle_run` instruction updates status to `Settled`
- Final balance is recorded
- Users can withdraw their shares

## Troubleshooting

### Run Not Created On-Chain

**Symptoms:**
- Run exists in database
- No transaction on Solana Explorer
- Error in logs: "Failed to create run on-chain"

**Solutions:**

1. **Check Platform Initialization:**
   ```bash
   node scripts/init-platform.js
   ```

2. **Check Wallet Balance:**
   - Ensure your wallet has SOL for transaction fees
   - Minimum: ~0.001 SOL per transaction

3. **Check Environment Variables:**
   ```bash
   # Required
   SOLANA_PRIVATE_KEY=<your_keypair>
   SOLANA_PROGRAM_ID=83TVAu61Hv4v7zvPszszYFJLTwARG5LPhoTbGnkEmaQD
   SOLANA_RPC_URL=<rpc_url>
   SOLANA_NETWORK=devnet
   SOLANA_USDC_MINT=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
   ```

4. **Sync Manually:**
   ```bash
   node scripts/sync-runs-onchain.js <runId>
   ```

### Run Created But Vault Missing

**Symptoms:**
- Run exists on-chain
- Vault doesn't exist
- Deposits fail

**Solution:**
```bash
# The sync script will create the vault
node scripts/sync-runs-onchain.js <runId>
```

### Run Not Started On-Chain

**Symptoms:**
- Run is ACTIVE in database
- Run is still WAITING on-chain
- Trades can't be recorded (requires Active status)

**Solution:**
The run should auto-start when the lobby phase ends. If it doesn't:
1. Check `RunSchedulerService` logs
2. Verify `startRun` is being called
3. Check if `start_run` transaction was sent

## Scripts Reference

### `sync-runs-onchain.js`

Syncs runs from database to on-chain.

**Usage:**
```bash
# Sync all runs
node scripts/sync-runs-onchain.js

# Sync specific run
node scripts/sync-runs-onchain.js <runId>
```

**What it does:**
1. Checks which runs exist in database
2. Checks which runs exist on-chain
3. Creates missing runs on-chain
4. Creates missing vaults on-chain
5. Shows verification summary

### `check-trade-records.js`

Checks if trades are recorded on-chain (also shows run info).

**Usage:**
```bash
node scripts/check-trade-records.js <runId> [round]
```

### `init-platform.js`

Initializes the platform account (one-time setup).

**Usage:**
```bash
node scripts/init-platform.js
```

## Integration Flow

```
┌─────────────────────────────────────────────────────────┐
│ 1. Create Run (API)                                     │
│    POST /api/v1/runs                                     │
└─────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────┐
│ 2. Database Entry Created                               │
│    - Run record in PostgreSQL                            │
│    - Status: WAITING                                     │
└─────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────┐
│ 3. On-Chain Creation (RunService.createRun)            │
│    - create_run() → Run PDA                             │
│    - create_run_vault() → Run Vault PDA                 │
└─────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────┐
│ 4. Users Deposit                                         │
│    - deposit() → USDC to Run Vault                      │
│    - UserParticipation PDA created                       │
└─────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────┐
│ 5. Lobby Phase Ends (RunSchedulerService)              │
│    - start_run() → Status: ACTIVE                       │
└─────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────┐
│ 6. Trading Begins                                       │
│    - record_trade() → TradeRecord PDA                   │
│    - Trades executed on Drift Protocol                  │
└─────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────┐
│ 7. Run Ends                                             │
│    - settle_run() → Status: SETTLED                     │
│    - Final balance recorded                              │
└─────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────┐
│ 8. Users Withdraw                                        │
│    - withdraw() → USDC from Run Vault                    │
│    - Proportional share + bonus                          │
└─────────────────────────────────────────────────────────┘
```

## Best Practices

1. **Always initialize platform first** before creating runs
2. **Check logs** when creating runs to ensure on-chain creation succeeded
3. **Use sync script** if on-chain creation fails
4. **Verify runs** using the check scripts before starting trading
5. **Monitor wallet balance** - ensure you have SOL for transaction fees

## Common Issues

### Issue: "Platform account does not exist"

**Solution:** Run `node scripts/init-platform.js`

### Issue: "Insufficient funds"

**Solution:** Add SOL to your wallet (minimum 0.001 SOL per transaction)

### Issue: "Run account already exists"

**Solution:** The run is already on-chain. This is normal if you're re-running the sync script.

### Issue: "Transaction failed"

**Solution:** 
1. Check Solana Explorer for the transaction
2. Check RPC endpoint is accessible
3. Verify program ID matches deployed program
4. Check network (devnet/mainnet) matches

## Next Steps

After integrating runs on-chain:
1. ✅ Verify runs exist using sync script
2. ✅ Test deposits work
3. ✅ Verify run starts on-chain when lobby ends
4. ✅ Verify trades are recorded on-chain
5. ✅ Test withdrawals after settlement


