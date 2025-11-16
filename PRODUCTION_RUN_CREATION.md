# Production Run Creation Guide

## Overview

This guide explains how to create and manage trading runs in production for InstinctFi. There are multiple approaches depending on your use case.

---

## 🎯 **Approach 1: Automated Scheduled Runs (RECOMMENDED)**

### **Best for:** Production environment with regular run schedules

### **How it works:**
- A cron job/scheduler automatically creates runs at specific times
- RunSchedulerService handles the complete lifecycle:
  - 10-minute lobby phase for user deposits
  - Auto-start when lobby ends (if participants > 0)
  - Auto-cancel if no participants
  - Run duration: 2 hours with 12 voting rounds

### **Implementation:**

#### **Option A: Node-Cron (Simple)**

Create `src/jobs/runCreator.ts`:

```typescript
import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';
import { RunService } from '@/services/RunService';
import logger from '@/utils/logger';

const prisma = new PrismaClient();
const runService = new RunService(prisma);

/**
 * Schedule: Creates a new run every 2.5 hours
 * This ensures no overlap between runs (2h run + 30min break)
 * 
 * Schedule: 00:00, 02:30, 05:00, 07:30, 10:00, 12:30, 15:00, 17:30, 20:00, 22:30
 */
export function startRunCreationScheduler() {
  // Run every 2 hours and 30 minutes starting at midnight
  cron.schedule('0 0,3,6,9,12,15,18,21 * * *', async () => {
    try {
      logger.info('🕒 Scheduled run creation triggered');
      
      const run = await runService.createRun({
        tradingPair: 'SOL/USD',
        coin: 'SOL',
        duration: 120, // 2 hours
        votingInterval: 10, // 10 minutes per round = 12 rounds
        minDeposit: 10, // 10 USDC
        maxDeposit: 100, // 100 USDC
        maxParticipants: 100,
      });

      logger.info(`✅ Scheduled run created: ${run.id}`);
      logger.info(`   Lobby opens for 10 minutes`);
      logger.info(`   Expected start: ${new Date(Date.now() + 10 * 60 * 1000).toISOString()}`);
      
    } catch (error) {
      logger.error('❌ Failed to create scheduled run:', error);
      // TODO: Send alert to monitoring system
    }
  });

  logger.info('📅 Run creation scheduler started');
  logger.info('   New runs will be created every 2.5 hours');
}
```

Add to `src/index.ts`:

```typescript
import { startRunCreationScheduler } from './jobs/runCreator';

// In App.start() method, after RunSchedulerService starts:
app.start = async () => {
  // ... existing code ...
  
  // Start run scheduler (manages run lifecycle)
  this.runScheduler.start();
  
  // Start run creation scheduler (creates new runs automatically)
  if (process.env.AUTO_CREATE_RUNS === 'true') {
    startRunCreationScheduler();
  }
  
  // ... rest of code ...
};
```

Add to `.env`:

```bash
AUTO_CREATE_RUNS=true
```

#### **Option B: Railway Cron Job (Cloud-Native)**

Railway supports cron jobs natively. Create `.railway/cron.yaml`:

```yaml
jobs:
  - name: create-run
    schedule: "0 0,3,6,9,12,15,18,21 * * *"
    command: "npm run create-run"
```

Create script in `package.json`:

```json
{
  "scripts": {
    "create-run": "tsx src/scripts/createRun.ts"
  }
}
```

Create `src/scripts/createRun.ts`:

```typescript
import { PrismaClient } from '@prisma/client';
import { RunService } from '@/services/RunService';
import { SolanaService } from '@/services/SolanaService';
import logger from '@/utils/logger';

async function main() {
  const prisma = new PrismaClient();
  const solanaService = new SolanaService();
  const runService = new RunService(prisma, solanaService);

  try {
    const run = await runService.createRun({
      tradingPair: 'SOL/USD',
      coin: 'SOL',
      duration: 120,
      votingInterval: 10,
      minDeposit: 10,
      maxDeposit: 100,
      maxParticipants: 100,
    });

    logger.info(`✅ Run created: ${run.id}`);
    process.exit(0);
  } catch (error) {
    logger.error('❌ Failed to create run:', error);
    process.exit(1);
  }
}

main();
```

---

## 🔧 **Approach 2: Manual API Creation**

### **Best for:** Testing, special events, or admin-controlled runs

### **Requirements:**
- Authenticated admin user
- JWT token with admin privileges

### **API Request:**

```bash
# 1. Get admin token (login as admin)
curl -X POST https://your-api.com/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "walletAddress": "YOUR_ADMIN_WALLET"
  }'

# 2. Create a run
curl -X POST https://your-api.com/api/v1/runs \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -d '{
    "tradingPair": "SOL/USD",
    "coin": "SOL",
    "duration": 120,
    "votingInterval": 10,
    "minDeposit": 10,
    "maxDeposit": 100,
    "maxParticipants": 100
  }'
```

### **Admin CLI Tool:**

Create `src/scripts/createRunCLI.ts`:

```typescript
#!/usr/bin/env tsx
import { PrismaClient } from '@prisma/client';
import { RunService } from '@/services/RunService';
import { SolanaService } from '@/services/SolanaService';
import logger from '@/utils/logger';
import * as readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

async function prompt(question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

async function main() {
  console.log('🎮 InstinctFi Run Creator CLI\n');

  const tradingPair = await prompt('Trading Pair (default: SOL/USD): ') || 'SOL/USD';
  const coin = tradingPair.split('/')[0];
  const durationStr = await prompt('Duration in minutes (default: 120): ') || '120';
  const votingIntervalStr = await prompt('Voting interval in minutes (default: 10): ') || '10';
  const minDepositStr = await prompt('Min deposit USDC (default: 10): ') || '10';
  const maxDepositStr = await prompt('Max deposit USDC (default: 100): ') || '100';
  const maxParticipantsStr = await prompt('Max participants (default: 100): ') || '100';

  console.log('\n📋 Run Configuration:');
  console.log(`   Trading Pair: ${tradingPair}`);
  console.log(`   Duration: ${durationStr} minutes`);
  console.log(`   Voting Interval: ${votingIntervalStr} minutes`);
  console.log(`   Deposits: ${minDepositStr}-${maxDepositStr} USDC`);
  console.log(`   Max Participants: ${maxParticipantsStr}`);

  const confirm = await prompt('\nCreate this run? (y/n): ');
  
  if (confirm.toLowerCase() !== 'y') {
    console.log('❌ Cancelled');
    process.exit(0);
  }

  const prisma = new PrismaClient();
  const solanaService = new SolanaService();
  const runService = new RunService(prisma, solanaService);

  try {
    const run = await runService.createRun({
      tradingPair,
      coin,
      duration: parseInt(durationStr),
      votingInterval: parseInt(votingIntervalStr),
      minDeposit: parseFloat(minDepositStr),
      maxDeposit: parseFloat(maxDepositStr),
      maxParticipants: parseInt(maxParticipantsStr),
    });

    console.log('\n✅ Run created successfully!');
    console.log(`   Run ID: ${run.id}`);
    console.log(`   Status: ${run.status}`);
    console.log(`   Lobby duration: 10 minutes`);
    console.log(`   Expected start: ${new Date(Date.now() + 10 * 60 * 1000).toLocaleString()}`);
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Failed to create run:', error);
    process.exit(1);
  }
}

main();
```

Make it executable:

```bash
chmod +x src/scripts/createRunCLI.ts
```

Add to `package.json`:

```json
{
  "scripts": {
    "create-run:cli": "tsx src/scripts/createRunCLI.ts"
  }
}
```

Usage:

```bash
npm run create-run:cli
```

---

## 📊 **Approach 3: Dynamic On-Demand Creation**

### **Best for:** User-initiated runs or marketplace model

### **Implementation:**

Allow users to create their own private runs or voting-based public run creation:

```typescript
// In your frontend
const CreateRunDialog = () => {
  const [config, setConfig] = useState({
    coin: 'SOL',
    minDeposit: 10,
    maxDeposit: 100,
    // ... other fields
  });

  const handleCreate = async () => {
    // Call admin API or special endpoint
    await api.runs.create(config);
  };

  return (
    <Dialog>
      {/* Form for run configuration */}
      <Button onClick={handleCreate}>Create Run</Button>
    </Dialog>
  );
};
```

---

## 🎛️ **Run Configuration Best Practices**

### **Standard Production Settings:**

```typescript
const PRODUCTION_RUN_CONFIG = {
  // Trading
  tradingPair: 'SOL/USD',  // Most liquid pair
  coin: 'SOL',
  
  // Timing
  duration: 120,           // 2 hours per PRD
  votingInterval: 10,      // 10 min = 12 rounds per PRD
  
  // Deposits
  minDeposit: 10,          // 10 USDC min per PRD
  maxDeposit: 100,         // 100 USDC max per PRD
  
  // Participants
  maxParticipants: 100,    // 100 max per PRD
};
```

### **Coin Rotation Schedule:**

```typescript
const COIN_ROTATION = [
  { day: 0, coin: 'SOL', pair: 'SOL/USD' },  // Sunday
  { day: 1, coin: 'ETH', pair: 'ETH/USD' },  // Monday
  { day: 2, coin: 'BTC', pair: 'BTC/USD' },  // Tuesday
  { day: 3, coin: 'BONK', pair: 'BONK/USD' }, // Wednesday
  { day: 4, coin: 'SOL', pair: 'SOL/USD' },  // Thursday
  { day: 5, coin: 'WIF', pair: 'WIF/USD' },  // Friday
  { day: 6, coin: 'JUP', pair: 'JUP/USD' },  // Saturday
];

function getTodaysCoin() {
  const today = new Date().getDay();
  return COIN_ROTATION.find(r => r.day === today);
}
```

---

## 🔍 **Monitoring & Alerts**

### **Health Checks:**

```typescript
// Check if runs are being created
async function checkRunCreation() {
  const lastRun = await prisma.run.findFirst({
    orderBy: { createdAt: 'desc' },
  });

  if (!lastRun) {
    // ALERT: No runs in database
    return false;
  }

  const hoursSinceLastRun = (Date.now() - lastRun.createdAt.getTime()) / (1000 * 60 * 60);
  
  if (hoursSinceLastRun > 3) {
    // ALERT: No run created in last 3 hours
    return false;
  }

  return true;
}
```

### **Railway Metrics:**

```bash
# View logs
railway logs --service instinctfi-backend

# Check recent runs
railway run -- npx prisma studio
```

---

## 🚨 **Troubleshooting**

### **Problem: Runs not auto-starting**

**Solution:**
1. Check RunSchedulerService is running:
   ```bash
   railway logs | grep "Starting run scheduler"
   ```

2. Verify countdown is updating:
   ```sql
   SELECT id, status, countdown, "createdAt" 
   FROM "Run" 
   WHERE status = 'WAITING';
   ```

3. Check for participants:
   ```sql
   SELECT r.id, COUNT(p.id) as participant_count
   FROM "Run" r
   LEFT JOIN "Participation" p ON r.id = p."runId"
   WHERE r.status = 'WAITING'
   GROUP BY r.id;
   ```

### **Problem: Cron not creating runs**

**Solution:**
1. Check environment variable:
   ```bash
   echo $AUTO_CREATE_RUNS
   ```

2. Verify cron syntax:
   ```bash
   # Test cron expression at https://crontab.guru
   0 0,3,6,9,12,15,18,21 * * *
   ```

3. Check logs:
   ```bash
   railway logs | grep "Scheduled run creation"
   ```

### **Problem: Blockchain integration failing**

**Solution:**
1. Check SOLANA_PRIVATE_KEY is set
2. Verify Solana RPC is accessible
3. Check wallet has SOL for transaction fees

---

## 📝 **Summary**

### **Recommended Production Setup:**

1. **Use Automated Scheduled Runs** (Approach 1)
2. **Schedule:** Every 2.5 hours to allow time between runs
3. **Coin Rotation:** Different coin each day of the week
4. **Monitoring:** Set up alerts for missed run creation
5. **Manual Override:** Keep CLI tool for special events

### **Quick Start:**

```bash
# 1. Enable auto-creation
echo "AUTO_CREATE_RUNS=true" >> .env

# 2. Deploy to Railway
git add -A
git commit -m "feat: Enable auto run creation"
git push origin main

# 3. Monitor logs
railway logs --follow

# 4. Verify runs are being created
railway run -- npx prisma studio
```

---

## 🎯 **Next Steps:**

- [ ] Set up monitoring/alerting (e.g., Sentry, DataDog)
- [ ] Create admin dashboard for run management
- [ ] Implement dynamic coin selection based on liquidity
- [ ] Add webhook notifications when runs start/end
- [ ] Build analytics for run performance










