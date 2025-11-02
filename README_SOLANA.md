# Solana Integration Quick Start

This guide will help you quickly integrate the Solana program with your backend.

## Quick Setup (5 minutes)

### 1. Run Setup Script

```bash
cd /Users/raihanibagaskoro/Projects/instinctfi-backend
./scripts/setup-solana.sh
```

This script will:
- Create `.env` from template if needed
- Generate a Solana keypair for the backend
- Request devnet SOL airdrop
- Update your `.env` file
- Verify the setup

### 2. Manual Setup (Alternative)

If you prefer to set up manually:

#### Generate Keypair

```bash
solana-keygen new -o backend-keypair.json
```

#### Fund with Devnet SOL

```bash
solana airdrop 5 $(solana-keygen pubkey backend-keypair.json) --url devnet
```

#### Update .env

```bash
# Add to .env
SOLANA_PRIVATE_KEY=[paste keypair array from backend-keypair.json]
SOLANA_RPC_URL=https://api.devnet.solana.com
SOLANA_NETWORK=devnet
SOLANA_PROGRAM_ID=7gmTYKqNX4xKsrd6NfNRscL3XSUoUTQyyTPhySWoABUc
SOLANA_USDC_MINT=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Start Backend

```bash
npm run dev
```

### 5. Initialize Platform (One-Time)

```bash
curl -X POST http://localhost:3001/api/solana/platform/initialize \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -d '{"platformFeeBps": 150}'
```

**Note:** You need to be authenticated as an admin. The `platformFeeBps` is in basis points (150 = 1.5%).

### 6. Verify Setup

```bash
# Check platform info
curl http://localhost:3001/api/solana/platform

# Check authority wallet
curl http://localhost:3001/api/solana/authority
```

## What Was Integrated

### Files Created

1. **src/services/SolanaService.ts** - Main service for blockchain operations
2. **src/controllers/SolanaController.ts** - REST API endpoints
3. **src/routes/solanaRoutes.ts** - Route definitions
4. **src/utils/solana.ts** - Utility functions
5. **src/idl/instinct_trading.json** - Program interface (IDL)
6. **env.example** - Updated with Solana config
7. **SOLANA_INTEGRATION.md** - Detailed documentation
8. **scripts/setup-solana.sh** - Setup script

### Files Modified

1. **src/services/RunService.ts** - Added blockchain integration
2. **src/routes/index.ts** - Added Solana routes
3. **src/utils/config.ts** - Added Solana configuration

## API Endpoints

All endpoints are prefixed with `/api/solana`

### Public Endpoints

- `GET /authority` - Get backend authority wallet address
- `GET /platform` - Get platform information
- `GET /run/:runId` - Get run info from blockchain
- `GET /run/:runId/pdas` - Get all PDAs for a run

### Admin Endpoints (Require Auth)

- `POST /platform/initialize` - Initialize platform (one-time)
- `POST /platform/pause` - Emergency pause
- `POST /platform/unpause` - Unpause platform

## How It Works

### Creating a Run

When you create a run via `POST /api/runs`:

```
1. Backend creates run in PostgreSQL ✅
2. Backend creates run on Solana blockchain ✅
3. Backend creates USDC vault for the run ✅
4. Returns run info with transaction hash ✅
```

### Starting a Run

When you start a run via `POST /api/runs/:id/start`:

```
1. Backend validates run can be started ✅
2. Backend calls Solana program to start run ✅
3. Backend updates database status ✅
4. Returns updated run with TX hash ✅
```

### Ending a Run

When a run ends:

```
1. Backend calculates final P/L for participants ✅
2. Backend calls Solana program to settle ✅
   - Transfers platform fee to fee vault
   - Records participant shares
   - Marks run as settled
3. Backend updates database ✅
4. Users can now withdraw their shares ✅
```

## Database Schema Updates (Optional)

To track blockchain transactions, you may want to add these fields:

```prisma
// prisma/schema.prisma

model Run {
  // ... existing fields
  blockchainTxHash String?  // TX hash of on-chain creation
  onChainRunId    Int?      // Numeric ID used on-chain
}

model User {
  // ... existing fields
  walletAddress   String?   // Solana wallet address (for withdrawals)
}
```

Then run:
```bash
npx prisma migrate dev --name add_blockchain_fields
npx prisma generate
```

## Testing

### Test Platform Status

```bash
curl http://localhost:3001/api/solana/platform
```

Expected response:
```json
{
  "success": true,
  "data": {
    "address": "...",
    "authority": "...",
    "platformFeeBps": 150,
    "totalRuns": "0",
    "isPaused": false,
    "totalFeesCollected": "0",
    "explorerUrl": "https://explorer.solana.com/address/...?cluster=devnet"
  }
}
```

### Test Create Run

```bash
curl -X POST http://localhost:3001/api/runs \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "tradingPair": "SOL/USDC",
    "coin": "SOL",
    "minDeposit": 10,
    "maxDeposit": 100,
    "maxParticipants": 50
  }'
```

Check logs to see blockchain transactions:
```bash
tail -f logs/combined.log
```

### Test Run Info

```bash
curl http://localhost:3001/api/solana/run/1
```

## Troubleshooting

### "SOLANA_PRIVATE_KEY is required"

Make sure your `.env` has:
```bash
SOLANA_PRIVATE_KEY=[1,2,3,...]  # Array from keypair.json
```

### "Insufficient funds"

Fund your authority wallet:
```bash
solana airdrop 5 YOUR_WALLET_ADDRESS --url devnet
```

### "Program not found"

Verify the program ID matches:
```bash
# Check what's in your .env
grep SOLANA_PROGRAM_ID .env

# Should be: 83TVAu61Hv4v7zvPszszYFJLTwARG5LPhoTbGnkEmaQD
```

### "Cannot connect to RPC"

Test RPC connection:
```bash
curl https://api.devnet.solana.com -X POST \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}'
```

## Architecture Diagram

```
┌─────────────────────────────────────────────────┐
│           Your Express Backend                  │
│                                                 │
│  ┌──────────────┐      ┌──────────────────┐   │
│  │ RunService   │◄─────┤ SolanaService    │   │
│  └──────────────┘      └──────────────────┘   │
│         │                       │              │
│         ▼                       ▼              │
│  ┌──────────────┐      ┌──────────────────┐   │
│  │ PostgreSQL   │      │ Solana RPC       │   │
│  │ (Source of   │      │ (Devnet)         │   │
│  │  Truth)      │      └──────────────────┘   │
│  └──────────────┘               │              │
└─────────────────────────────────┼──────────────┘
                                  │
                                  ▼
                    ┌──────────────────────────┐
                    │  Solana Program          │
                    │  (On-Chain)              │
                    │                          │
                    │  - Platform State        │
                    │  - Run Management        │
                    │  - USDC Vaults           │
                    │  - Fee Collection        │
                    │  - User Withdrawals      │
                    └──────────────────────────┘
```

## Key Concepts

### Program Derived Addresses (PDAs)

PDAs are deterministic addresses derived from seeds. They're used for:

- **Platform PDA**: Global platform state
- **Run PDA**: Individual run state
- **Run Vault PDA**: USDC token account for each run
- **User Participation PDA**: User's participation in a run
- **Platform Fee Vault PDA**: Accumulated platform fees

The SolanaService provides helper methods to derive these:

```typescript
const [platformPDA] = solanaService.getPlatformPDA();
const [runPDA] = solanaService.getRunPDA(runId);
const [vaultPDA] = solanaService.getRunVaultPDA(runId);
```

### Transaction Flow

1. **Client → Backend API** (HTTP)
2. **Backend → Solana RPC** (JSON-RPC)
3. **RPC → Solana Program** (Transaction)
4. **Program executes & updates accounts**
5. **Backend receives TX signature**
6. **Backend updates database**

### Error Handling

The integration uses **graceful degradation**:
- If blockchain calls fail, database operations continue
- Errors are logged but don't crash the server
- Database is the source of truth for application state
- Blockchain provides transparency and verifiability

## Next Steps

1. **Test the integration** with the API endpoints
2. **Review SOLANA_INTEGRATION.md** for detailed documentation
3. **Update your User model** to include wallet addresses
4. **Implement frontend** wallet connection for user deposits
5. **Add monitoring** for blockchain transactions
6. **Set up mainnet** when ready for production

## Production Checklist

Before going to mainnet:

- [ ] Security audit of Solana program
- [ ] Use hardware wallet for authority
- [ ] Set up multisig for platform authority
- [ ] Configure proper RPC provider (not public RPC)
- [ ] Set up transaction monitoring and alerts
- [ ] Test thoroughly on devnet
- [ ] Have rollback plan
- [ ] Document all PDAs and accounts
- [ ] Set up proper key management
- [ ] Configure rate limiting for RPC calls

## Support

For questions or issues:
1. Check `SOLANA_INTEGRATION.md` for detailed docs
2. Review logs: `tail -f logs/combined.log`
3. Test RPC: `solana cluster-version --url devnet`
4. Check program: `solana program show PROGRAM_ID --url devnet`

---

**Happy Building! 🚀**

