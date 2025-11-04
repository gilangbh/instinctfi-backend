# Admin User Setup & Manual Run Creation Guide

## Overview

This guide shows you how to create an admin user and manually create runs via API on Railway.

---

## 🔐 **How Admin Works**

The backend considers a user an **admin** if:
- Their `username` is `"admin"`, OR
- Their `walletAddress` is `"admin"`

Located in `src/middleware/auth.ts`:

```typescript
const isAdmin = req.user.username === 'admin' || req.user.walletAddress === 'admin';
```

---

## 🚀 **Option 1: Create Admin via Frontend (DEPRECATED)**

⚠️ **Note:** As of the latest update, usernames are auto-generated from wallet addresses to prevent users from accidentally (or intentionally) setting admin usernames. You can no longer create admin users via the frontend login flow.

**Use Option 3 (Database) instead to create admin users.**

### **Step 2: Get Your Admin Token**

After logging in, open browser console (F12) and run:

```javascript
// Get the token from localStorage
const token = localStorage.getItem('instinct_fi_token');
console.log('Admin Token:', token);
```

**Copy this token** - you'll use it to create runs via API.

### **Step 3: Create Run via API**

Use curl, Postman, or any HTTP client:

```bash
# Replace YOUR_ADMIN_TOKEN with the token from Step 2
# Replace YOUR_RAILWAY_URL with your Railway backend URL

curl -X POST https://instinctfi-backend-develop.up.railway.app/api/v1/runs \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
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

**Example with actual URL:**

```bash
curl -X POST https://instinctfi-backend-develop.up.railway.app/api/v1/runs \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
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

---

## 💻 **Option 2: Create Admin via Direct API Call**

If you don't want to use the frontend, you can create an admin user directly via API.

### **Step 1: Generate Mock Signature**

Since the backend requires wallet signature verification, we need to bypass this temporarily OR use a real wallet signature.

**For Testing (Simplified):**

Create a script `scripts/createAdminToken.ts`:

```typescript
#!/usr/bin/env tsx
import jwt from 'jsonwebtoken';

// This must match your backend's JWT_SECRET environment variable
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-here';

// Mock admin user ID (you'll get the real ID after first login)
const ADMIN_USER_ID = 'admin_temp_id';

// Generate token
const token = jwt.sign(
  { 
    userId: ADMIN_USER_ID,
    username: 'admin',
    walletAddress: 'mock_admin_wallet',
  },
  JWT_SECRET,
  { expiresIn: '30d' }
);

console.log('🔑 Admin Token (30 days):');
console.log(token);
console.log('\nUse this token in Authorization header:');
console.log(`Authorization: Bearer ${token}`);
```

**Run:**

```bash
cd /Users/raihanibagaskoro/Projects/instinctfi-backend
JWT_SECRET="your-railway-jwt-secret" tsx scripts/createAdminToken.ts
```

⚠️ **Note:** This requires knowing your Railway `JWT_SECRET` environment variable.

**Better Approach:** Use Option 1 (frontend login) or Option 3 below.

---

## 🛠️ **Option 3: Create Admin via Database (RECOMMENDED)**

Directly create an admin user in the Railway PostgreSQL database.

### **Step 1: Access Railway Database**

```bash
# Install Railway CLI if you haven't
npm install -g @railway/cli

# Login
railway login

# Link to your project
railway link

# Open Prisma Studio
railway run -- npx prisma studio
```

Or use Railway's built-in PostgreSQL client in the web dashboard.

### **Step 2: Create Admin User Manually**

**Via Prisma Studio:**

1. Open "User" model
2. Click "Add Record"
3. Fill in:
   - `id`: (auto-generated)
   - `walletAddress`: `"admin"` (or any unique wallet)
   - `username`: `"admin"`  ← **IMPORTANT**
   - `xp`: `0`
   - `totalRuns`: `0`
   - `winRate`: `0`
   - `reputation`: `0`
   - `isBanned`: `false`
   - Other fields: default values
4. Click "Save"

**Via SQL:**

```sql
INSERT INTO users (
  id,
  "walletAddress",
  username,
  xp,
  "totalRuns",
  "winRate",
  reputation,
  "isBanned",
  "createdAt",
  "updatedAt"
) VALUES (
  'admin_user_001',
  'admin_wallet_12345',
  'admin',
  0,
  0,
  0,
  0,
  false,
  NOW(),
  NOW()
);
```

### **Step 3: Generate Token for This User**

Now use the UserService to generate a proper JWT token:

Create `scripts/generateAdminToken.ts`:

```typescript
#!/usr/bin/env tsx
import { PrismaClient } from '@prisma/client';
import { UserService } from '@/services/UserService';

async function main() {
  const prisma = new PrismaClient();
  const userService = new UserService(prisma);

  // Find admin user
  const adminUser = await prisma.user.findFirst({
    where: {
      OR: [
        { username: 'admin' },
        { walletAddress: 'admin' },
      ],
    },
  });

  if (!adminUser) {
    console.error('❌ No admin user found!');
    console.log('Create one in Prisma Studio with username="admin"');
    process.exit(1);
  }

  // Generate token
  const token = await userService.generateAuthToken(adminUser.id);

  console.log('✅ Admin user found:');
  console.log(`   ID: ${adminUser.id}`);
  console.log(`   Username: ${adminUser.username}`);
  console.log(`   Wallet: ${adminUser.walletAddress}`);
  console.log('\n🔑 Admin Token (7 days):');
  console.log(token);
  console.log('\n📋 Use this in API calls:');
  console.log(`Authorization: Bearer ${token}`);

  await prisma.$disconnect();
}

main();
```

**Run on Railway:**

```bash
railway run -- tsx scripts/generateAdminToken.ts
```

**Copy the token** and use it for API calls!

---

## 📡 **Making API Calls to Railway**

Once you have your admin token, you can create runs.

### **Get Your Railway Backend URL**

```bash
# Check your Railway deployment URL
railway status
```

Or find it in Railway dashboard → instinctfi-backend → Settings → Domain

Example: `https://instinctfi-backend-develop.up.railway.app`

### **Create Run API Call**

```bash
# Full example
curl -X POST https://instinctfi-backend-develop.up.railway.app/api/v1/runs \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN_HERE" \
  -H "Content-Type: application/json" \
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

### **Expected Response:**

```json
{
  "success": true,
  "data": {
    "id": "clx1234567890",
    "status": "WAITING",
    "tradingPair": "SOL/USD",
    "coin": "SOL",
    "duration": 120,
    "votingInterval": 10,
    "minDeposit": 1000,
    "maxDeposit": 10000,
    "maxParticipants": 100,
    "totalPool": 0,
    "startingPool": 0,
    "currentRound": 0,
    "totalRounds": 12,
    "countdown": 600,
    "createdAt": "2025-01-15T10:00:00.000Z",
    "updatedAt": "2025-01-15T10:00:00.000Z"
  },
  "message": "Run created successfully"
}
```

---

## 🔧 **Using Postman**

### **Setup:**

1. **Create new request**
2. **Method:** `POST`
3. **URL:** `https://instinctfi-backend-develop.up.railway.app/api/v1/runs`
4. **Headers:**
   - `Authorization`: `Bearer YOUR_ADMIN_TOKEN`
   - `Content-Type`: `application/json`
5. **Body (raw JSON):**

```json
{
  "tradingPair": "SOL/USD",
  "coin": "SOL",
  "duration": 120,
  "votingInterval": 10,
  "minDeposit": 10,
  "maxDeposit": 100,
  "maxParticipants": 100
}
```

6. **Click Send**

---

## 🔍 **Verify Run Created**

### **Option 1: Check Prisma Studio**

```bash
railway run -- npx prisma studio
```

Go to "Run" model → you should see your new run with status `WAITING`

### **Option 2: Check via API**

```bash
curl https://instinctfi-backend-develop.up.railway.app/api/v1/runs/active
```

### **Option 3: Check Frontend**

Go to https://testnet.instinctfi.xyz/dashboard - the run should appear!

---

## ⏱️ **Run Lifecycle After Creation**

Once you create a run manually:

1. **Status:** `WAITING`
2. **Countdown:** 600 seconds (10 minutes)
3. **Lobby opens** for user deposits
4. **After 10 minutes:**
   - If participants > 0 → Auto-starts ✅
   - If participants = 0 → Auto-cancels ❌
5. **Run duration:** 2 hours with 12 voting rounds

The `RunSchedulerService` handles all of this automatically!

---

## 📝 **Complete Example Workflow**

### **Using Frontend (Easiest):**

```bash
# 1. Login to frontend with username "admin"
# 2. Open browser console (F12)
localStorage.getItem('instinct_fi_token')

# 3. Copy the token and run:
curl -X POST https://instinctfi-backend-develop.up.railway.app/api/v1/runs \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{"tradingPair":"SOL/USD","coin":"SOL","duration":120,"votingInterval":10,"minDeposit":10,"maxDeposit":100,"maxParticipants":100}'

# 4. Verify on frontend
# Go to /dashboard - run should appear!
```

### **Using Railway CLI:**

```bash
# 1. Create admin user in database (Prisma Studio)
railway run -- npx prisma studio
# Add user with username="admin"

# 2. Generate token
railway run -- tsx scripts/generateAdminToken.ts

# 3. Use token to create run
curl -X POST https://instinctfi-backend-develop.up.railway.app/api/v1/runs \
  -H "Authorization: Bearer TOKEN_FROM_STEP_2" \
  -H "Content-Type: application/json" \
  -d '{"tradingPair":"SOL/USD","coin":"SOL","duration":120,"votingInterval":10,"minDeposit":10,"maxDeposit":100,"maxParticipants":100}'
```

---

## 🚨 **Troubleshooting**

### **Error: "Admin access required"**

**Cause:** Your token doesn't belong to an admin user

**Solution:** Verify your user has `username = "admin"` or `walletAddress = "admin"`

```bash
railway run -- npx prisma studio
# Check User table → find your user → verify username
```

### **Error: "Invalid token" or "Authentication required"**

**Cause:** Token is expired, malformed, or JWT_SECRET mismatch

**Solution:** Generate a new token using `generateAdminToken.ts` script

### **Error: "Signature verification failed"**

**Cause:** You're trying to login via wallet and the signature is invalid

**Solution:** 
- Use real wallet signature from frontend
- OR create admin user directly in database (Option 3)

### **Run not auto-starting after 10 minutes**

**Cause:** RunSchedulerService might not be running

**Check logs:**

```bash
railway logs --follow | grep "Run scheduler"
```

Should see:
```
🕒 Starting run scheduler service
```

---

## 🎯 **Recommended Approach**

**For Production:** Use **Option 1** (Frontend Login)
- Easiest and most secure
- No need to access database
- Proper wallet signature verification

**For Development:** Use **Option 3** (Database + Script)
- Direct database access
- Generate tokens programmatically
- Useful for testing automation

---

## 🔒 **Security Update: Auto-Generated Usernames**

As of the latest version, **usernames are automatically generated** from wallet addresses using a crypto-style format (e.g., `trader_abc123`, `whale_xyz789`). This prevents users from:

- Setting reserved usernames like "admin", "moderator", "system"
- Accidentally gaining admin privileges
- Username spoofing

**Backend Validation:**
- Reserved usernames: `admin`, `moderator`, `mod`, `system`, `instinct`, `support`, `staff`, `official`, `bot`, `api`
- If a reserved username is provided, it's automatically replaced with an auto-generated one
- Username format: `[prefix]_[6_chars_from_wallet]`

**Frontend:**
- Username input removed from wallet connection flow
- Username displayed automatically after wallet connection
- No user input required

---

## 📚 **Summary**

1. **Create admin user:** Create directly in database (Option 3 - RECOMMENDED)
2. **Get admin token:** `railway run -- npm run admin:token` script
3. **Create run:** POST to `https://your-backend.railway.app/api/v1/runs` with admin token
4. **Verify:** Check frontend dashboard or Prisma Studio

**That's it!** 🎉

