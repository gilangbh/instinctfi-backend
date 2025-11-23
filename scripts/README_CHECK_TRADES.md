# How to Check if Trades are On-Chain

This guide shows you how to verify that your trades are being recorded on the Solana blockchain.

## Method 1: Using the Check Script (Recommended)

Use the provided script to check trade records:

### Check all trades for a run:
```bash
node scripts/check-trade-records.js <runId>
```

Example:
```bash
node scripts/check-trade-records.js 1234567890
```

### Check a specific round:
```bash
node scripts/check-trade-records.js <runId> <round>
```

Example:
```bash
node scripts/check-trade-records.js 1234567890 1
```

### Output Example:
```
🔍 Checking TradeRecord for Run 1234567890, Round 1:
   PDA: 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU
   ✅ TradeRecord exists!
   Account size: 0.00089 SOL (rent)

   📊 Trade Details:
   Run ID: 1234567890
   Round: 1
   Direction: LONG
   Entry Price: $150.25
   Exit Price: N/A (still open)
   PnL: 0.00 USDC
   Leverage: 2.6x
   Position Size: 96%
   Executed At: 2025-11-19T15:30:00.000Z
   Bump: 255

   🔗 View on Solana Explorer:
   https://explorer.solana.com/address/7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU?cluster=devnet
```

## Method 2: Using Solana Explorer (Web UI)

1. **Get the TradeRecord PDA**:
   - PDA seeds: `["trade", run_id (8 bytes), round (1 byte)]`
   - You can calculate it using the script or derive it programmatically

2. **View on Solana Explorer**:
   - Devnet: `https://explorer.solana.com/address/<PDA>?cluster=devnet`
   - Mainnet: `https://explorer.solana.com/address/<PDA>?cluster=mainnet`

3. **What to look for**:
   - ✅ Account exists = Trade is recorded on-chain
   - ❌ Account doesn't exist = Trade not yet recorded (or failed to record)

## Method 3: Programmatically (In Your Code)

Use the `SolanaService.checkTradeRecord()` method:

```typescript
import { SolanaService } from '@/services/SolanaService';

const solanaService = new SolanaService();
const result = await solanaService.checkTradeRecord(runId, round);

if (result.exists) {
  console.log('✅ Trade is on-chain!');
  console.log('Direction:', result.data.direction);
  console.log('Entry Price:', result.data.entryPrice);
  console.log('PnL:', result.data.pnl);
  console.log('PDA:', result.pda.toString());
} else {
  console.log('❌ Trade not found on-chain');
  console.log('Expected PDA:', result.pda.toString());
}
```

## Method 4: Using Solana CLI

```bash
# Get account info
solana account <TRADE_RECORD_PDA> --url devnet

# If account exists, you'll see the account data
# If it doesn't exist, you'll get an error
```

## Understanding TradeRecord PDAs

Each trade record has a unique PDA (Program Derived Address) derived from:
- Seed: `"trade"`
- Run ID: `run_id` (8 bytes, little-endian)
- Round: `round` (1 byte)

Example PDA derivation:
```typescript
const seeds = [
  Buffer.from('trade'),
  new BN(runId).toArrayLike(Buffer, 'le', 8),
  Buffer.from([round]),
];
const [pda, bump] = PublicKey.findProgramAddressSync(seeds, programId);
```

## Troubleshooting

### Trade not found on-chain?

1. **Check backend logs**:
   - Look for `recordTrade` calls in your backend logs
   - Check for any errors during trade recording

2. **Verify the run exists**:
   - The run must be created on-chain first
   - The run status must be `Active` for trades to be recorded

3. **Check transaction signatures**:
   - Look for `record_trade` transaction signatures in your backend logs
   - Verify the transaction was successful on Solana Explorer

4. **Verify program ID**:
   - Make sure `SOLANA_PROGRAM_ID` matches your deployed program
   - Default: `83TVAu61Hv4v7zvPszszYFJLTwARG5LPhoTbGnkEmaQD` (devnet)

5. **Check network**:
   - Ensure you're checking the correct network (devnet/mainnet)
   - The script uses `SOLANA_NETWORK` env variable

## TradeRecord Account Structure

Each TradeRecord account contains:
- `run_id`: u64 - Associated run ID
- `round`: u8 - Round number (1-12)
- `direction`: TradeDirection - LONG (0), SHORT (1), or SKIP (2)
- `entry_price`: u64 - Entry price in micro-USDC (6 decimals)
- `exit_price`: u64 - Exit price in micro-USDC (0 if still open)
- `pnl`: i64 - PnL in micro-USDC (can be negative, 0 if still open)
- `leverage`: u8 - Leverage as integer (10 = 1.0x, 20 = 2.0x, etc.)
- `position_size_percent`: u8 - Position size (10-100)
- `executed_at`: i64 - Unix timestamp
- `bump`: u8 - PDA bump seed

## Example: Check All Trades for a Run

```bash
# Check all 12 rounds for run 1234567890
for round in {1..12}; do
  echo "Checking round $round..."
  node scripts/check-trade-records.js 1234567890 $round
done
```

## Notes

- Trades are recorded when positions **open** (not when they close)
- Exit price and PnL are only updated if you implement an `update_trade` instruction
- Currently, trades are recorded non-blocking (failures don't stop trading)
- Check backend logs for `recordTrade` success/failure messages


