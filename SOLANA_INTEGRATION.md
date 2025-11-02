# Solana Program Integration

This document explains how the backend integrates with the Instinct.fi Solana program.

## Overview

The backend integrates with the on-chain Solana program to manage trading runs, deposits, and settlements in a decentralized manner.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Backend (Express API)                    │
│                                                              │
│  ┌────────────────┐          ┌─────────────────┐           │
│  │   RunService   │◄─────────┤ SolanaService   │           │
│  └────────────────┘          └─────────────────┘           │
│         │                             │                      │
│         ▼                             ▼                      │
│  ┌────────────────┐          ┌─────────────────┐           │
│  │  PostgreSQL    │          │  Solana RPC     │           │
│  │  (Database)    │          │  (Devnet)       │           │
│  └────────────────┘          └─────────────────┘           │
└─────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
                        ┌─────────────────────────┐
                        │  Solana Program         │
                        │  (On-Chain)             │
                        │                         │
                        │  - Platform State       │
                        │  - Run Management       │
                        │  - USDC Vault           │
                        └─────────────────────────┘
```

## Components

### 1. SolanaService (`src/services/SolanaService.ts`)

The main service that interacts with the on-chain program.

**Key Methods:**
- `initializePlatform()` - One-time platform setup
- `createRun()` - Create a new run on-chain
- `createRunVault()` - Create USDC vault for a run
- `startRun()` - Start a run
- `settleRun()` - Settle run with final P/L distribution
- `updateVoteStats()` - Update user voting statistics
- `fetchRun()` - Fetch run data from blockchain
- `pausePlatform()` / `unpausePlatform()` - Emergency controls

**PDA Helpers:**
- `getPlatformPDA()` - Get platform account address
- `getRunPDA(runId)` - Get run account address
- `getRunVaultPDA(runId)` - Get run vault address
- `getUserParticipationPDA(runId, userPubkey)` - Get user participation address
- `getPlatformFeeVaultPDA()` - Get platform fee vault address

### 2. Updated RunService (`src/services/RunService.ts`)

The RunService now integrates with SolanaService for blockchain operations.

**Integration Points:**
- **createRun()** - Creates run in DB, then creates on-chain + vault
- **startRun()** - Starts run on-chain before updating DB
- **endRun()** - Settles run on-chain with final shares
- **Graceful Degradation** - If blockchain calls fail, DB operations continue

### 3. SolanaController (`src/controllers/SolanaController.ts`)

REST API endpoints for Solana operations.

**Endpoints:**
- `GET /api/solana/authority` - Get authority wallet address
- `GET /api/solana/platform` - Get platform info
- `POST /api/solana/platform/initialize` - Initialize platform (admin)
- `POST /api/solana/platform/pause` - Pause platform (admin)
- `POST /api/solana/platform/unpause` - Unpause platform (admin)
- `GET /api/solana/run/:runId` - Get run info from blockchain
- `GET /api/solana/run/:runId/pdas` - Get all PDAs for a run

### 4. Utility Functions (`src/utils/solana.ts`)

Helper functions for Solana operations:
- `usdcToLamports()` - Convert USDC to smallest unit
- `lamportsToUsdc()` - Convert back to USDC
- `isValidPublicKey()` - Validate Solana addresses
- `parseKeypair()` - Parse keypair from various formats
- `shortenPublicKey()` - Display shortened addresses
- `getExplorerUrl()` - Get Solana Explorer URLs

## Configuration

### Environment Variables

Add these to your `.env` file:

```bash
# Solana Configuration
SOLANA_RPC_URL=https://api.devnet.solana.com
SOLANA_WS_URL=wss://api.devnet.solana.com
SOLANA_NETWORK=devnet
SOLANA_PRIVATE_KEY=[1,2,3,...] # Your keypair as JSON array
SOLANA_PROGRAM_ID=7gmTYKqNX4xKsrd6NfNRscL3XSUoUTQyyTPhySWoABUc
SOLANA_USDC_MINT=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
```

### Generate Authority Keypair

```bash
# Generate a new keypair for the backend
solana-keygen new -o backend-keypair.json

# Fund it with devnet SOL
solana airdrop 5 $(solana-keygen pubkey backend-keypair.json) --url devnet

# Get the keypair array
cat backend-keypair.json
# Copy the array and paste into SOLANA_PRIVATE_KEY
```

## Setup Instructions

### 1. Install Dependencies

The required packages are already in `package.json`:
- `@project-serum/anchor` - Anchor framework
- `@solana/web3.js` - Solana web3
- `@solana/spl-token` - SPL Token program
- `bs58` - Base58 encoding

```bash
npm install
```

### 2. Copy IDL File

The IDL file has been copied to `src/idl/instinct_trading.json` automatically.

### 3. Configure Environment

```bash
cp env.example .env
# Edit .env and add your SOLANA_PRIVATE_KEY
```

### 4. Initialize Platform (One-Time)

```bash
# Using curl or your API client
curl -X POST http://localhost:3001/api/solana/platform/initialize \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -d '{"platformFeeBps": 150}'
```

This creates:
- Platform account (global state)
- Platform fee vault (USDC token account)

### 5. Verify Setup

```bash
# Check platform info
curl http://localhost:3001/api/solana/platform

# Check authority wallet
curl http://localhost:3001/api/solana/authority
```

## Usage Examples

### Create a Run

When you create a run through the API, it automatically:
1. Creates run in PostgreSQL database
2. Creates run account on-chain
3. Creates run vault (USDC token account)

```typescript
// POST /api/runs
{
  "tradingPair": "SOL/USDC",
  "coin": "SOL",
  "minDeposit": 10,
  "maxDeposit": 100,
  "maxParticipants": 50
}
```

Backend automatically:
```typescript
// In RunService.createRun()
const run = await this.prisma.run.create({ ... });
await this.solanaService.createRun(runId, minDeposit, maxDeposit, maxParticipants);
await this.solanaService.createRunVault(runId);
```

### Start a Run

```typescript
// POST /api/runs/:runId/start
```

Backend calls:
```typescript
await this.solanaService.startRun(runId);
// Changes run status from Waiting -> Active on-chain
```

### Settle a Run

```typescript
// When a run ends
await runService.endRun(runId);
```

Backend:
1. Calculates final shares for each participant
2. Calls `solanaService.settleRun()` with participant shares
3. On-chain program:
   - Transfers platform fee to fee vault
   - Records each participant's final share
   - Changes status to Settled

### User Withdrawals

Users can withdraw their share after settlement:

```bash
# Frontend would call this with user's wallet
# The Solana program verifies the user and transfers USDC
```

## Database Schema Additions

You may want to add these fields to your Prisma schema:

```prisma
model Run {
  // ... existing fields
  blockchainTxHash String?  // Transaction hash of on-chain creation
  onChainRunId    Int?      // Numeric ID used on-chain
}

model User {
  // ... existing fields
  walletAddress   String?   // Solana wallet address
}
```

Then run:
```bash
npx prisma migrate dev --name add_blockchain_fields
npx prisma generate
```

## Error Handling

The integration uses graceful degradation:

1. **Blockchain operation fails**: Logged as error, DB operation continues
2. **RPC connection issues**: Service catches and logs, doesn't crash
3. **Transaction failures**: Returns specific error messages

Example:
```typescript
try {
  const tx = await this.solanaService.createRun(...);
  logger.info(`On-chain TX: ${tx}`);
} catch (solanaError) {
  logger.error('Failed to create run on-chain:', solanaError);
  // Continue - DB is source of truth
}
```

## Monitoring

### Check Platform Status

```bash
curl http://localhost:3001/api/solana/platform
```

### Check Run Status

```bash
curl http://localhost:3001/api/solana/run/1
```

### Get Run PDAs

```bash
curl http://localhost:3001/api/solana/run/1/pdas
```

Returns all program-derived addresses for a run.

## Security Considerations

### Private Key Management

⚠️ **CRITICAL**: Never commit your private key to Git!

**Development:**
- Use a dedicated devnet keypair
- Store in `.env` file (gitignored)
- Fund with devnet SOL only

**Production:**
- Use environment variables from secure vault
- Consider using a multisig for authority
- Rotate keys regularly
- Use hardware wallet for critical operations

### Access Control

- Platform initialization: Admin only
- Pause/unpause: Admin only
- Create run: Authority wallet
- Start/settle run: Authority wallet
- User operations: User's own wallet (signed by user)

### Rate Limiting

The Solana program has built-in checks:
- Deposit limits (min/max)
- Participant limits
- Status transitions
- Authority verification

## Testing

### Unit Tests

Test SolanaService methods:
```typescript
describe('SolanaService', () => {
  it('should create run on-chain', async () => {
    const tx = await solanaService.createRun(1, 10, 100, 50);
    expect(tx).toBeDefined();
  });
});
```

### Integration Tests

Test full flow:
1. Initialize platform
2. Create run
3. Start run
4. Settle run

### Devnet Testing

Use devnet for realistic testing:
- Real transactions
- Real token transfers
- Real account creation
- No cost (devnet SOL is free)

## Troubleshooting

### "Program not found"
- Check `SOLANA_PROGRAM_ID` matches deployed program
- Verify network is correct (devnet/mainnet)

### "Insufficient funds"
- Fund authority wallet with SOL for transaction fees
- `solana airdrop 5 YOUR_WALLET --url devnet`

### "Invalid account"
- Ensure platform is initialized
- Check run vault is created before deposits

### "Transaction simulation failed"
- Check account permissions
- Verify authority wallet is correct
- Check program is not paused

## Migration Path

### From Off-Chain to On-Chain

If you have existing runs in DB:

1. **Option A**: Keep old runs off-chain, new runs on-chain
2. **Option B**: Migrate data (requires custom migration script)

Recommended: Option A for simplicity.

## Future Enhancements

1. **User Deposits**: Integrate user wallet connections for direct deposits
2. **Real-time Sync**: WebSocket updates from blockchain
3. **Transaction Retry**: Automatic retry on transient failures
4. **Multi-sig**: Use multi-signature for authority operations
5. **Analytics**: Track on-chain metrics and gas costs

## Resources

- [Solana Program Code](../instinctfi-solana/)
- [IDL File](./src/idl/instinct_trading.json)
- [Anchor Documentation](https://www.anchor-lang.com/)
- [Solana Web3.js](https://solana-labs.github.io/solana-web3.js/)
- [Solana Explorer (Devnet)](https://explorer.solana.com/?cluster=devnet)

## Support

For issues or questions:
1. Check logs: `tail -f logs/combined.log`
2. Verify RPC connection: `curl https://api.devnet.solana.com -X POST -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}'`
3. Check program status: `solana program show PROGRAM_ID --url devnet`

