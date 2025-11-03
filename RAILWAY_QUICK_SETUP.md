# 🚀 Railway Quick Setup - Copy & Paste Values

## 📋 **Step-by-Step Setup**

### **1️⃣ Get Your Railway URLs First**

Go to Railway Dashboard: https://railway.app/

#### **Backend URL:**
1. Click on `instinctfi-backend` service
2. Go to "Settings" tab
3. Look for "Public Domain" under "Networking"
4. **Copy it!** Example: `instinctfi-backend-production.up.railway.app`

#### **Frontend URL:**
1. Click on `instinct-chaotic-learn` service
2. Go to "Settings" tab
3. Look for "Public Domain"
4. **Copy it!** Example: `instinct-chaotic-learn-production.up.railway.app`

---

## 🎯 **2️⃣ Backend Variables**

**Click on `instinctfi-backend` → Variables → Raw Editor → Paste:**

```bash
# Database (Auto-set if you added PostgreSQL plugin)
DATABASE_URL=${{Postgres.DATABASE_URL}}

# Server
PORT=3001
NODE_ENV=production

# JWT
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production-min-32-chars
JWT_EXPIRES_IN=7d

# CORS - REPLACE WITH YOUR FRONTEND URL!
CORS_ORIGIN=https://instinct-chaotic-learn-production.up.railway.app

# Solana
SOLANA_NETWORK=devnet
SOLANA_RPC_URL=https://api.devnet.solana.com
SOLANA_PROGRAM_ID=7gmTYKqNX4xKsrd6NfNRscL3XSUoUTQyyTPhySWoABUc
SOLANA_USDC_MINT=4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU
SOLANA_PRIVATE_KEY=[paste your private key array from local .env]

# Drift Protocol
DRIFT_ENVIRONMENT=devnet
DRIFT_RPC_URL=https://api.devnet.solana.com
DRIFT_ENABLE_REAL_TRADING=true
DRIFT_DEFAULT_MARKET=SOL-PERP
DRIFT_PROGRAM_ID=dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH
DRIFT_TRADING_KEYPAIR=[paste your drift keypair from local .env]

# Trading Configuration
MIN_DEPOSIT_USDC=10
MAX_DEPOSIT_USDC=100
MAX_PARTICIPANTS_PER_RUN=100
PLATFORM_FEE_PERCENTAGE=15
DEFAULT_RUN_DURATION_MINUTES=120
DEFAULT_VOTING_INTERVAL_MINUTES=10
```

**⚠️ IMPORTANT: Replace these:**
- `CORS_ORIGIN` → Your actual frontend Railway URL
- `SOLANA_PRIVATE_KEY` → From your local `.env` file
- `DRIFT_TRADING_KEYPAIR` → From your local `.env` file

---

## 🎨 **3️⃣ Frontend Variables**

**Click on `instinct-chaotic-learn` → Variables → Raw Editor → Paste:**

```bash
# Backend API - REPLACE WITH YOUR BACKEND URL!
VITE_API_URL=https://instinctfi-backend-production.up.railway.app/api/v1
VITE_WS_URL=wss://instinctfi-backend-production.up.railway.app

# Solana
VITE_SOLANA_NETWORK=devnet
VITE_SOLANA_RPC_URL=https://api.devnet.solana.com
VITE_SOLANA_PROGRAM_ID=7gmTYKqNX4xKsrd6NfNRscL3XSUoUTQyyTPhySWoABUc
VITE_USDC_MINT=4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU

# App Info
VITE_APP_NAME=Instinct.fi
VITE_APP_VERSION=1.0.0
```

**⚠️ IMPORTANT: Replace:**
- `VITE_API_URL` → Your actual backend Railway URL + `/api/v1`
- `VITE_WS_URL` → Your actual backend Railway URL (with `wss://`)

---

## 🔗 **4️⃣ Connection Diagram**

```
Frontend (Railway)                    Backend (Railway)
───────────────────                   ────────────────
VITE_API_URL ──────────────────────→  PORT=3001
  = https://backend.railway.app/      
                                      CORS_ORIGIN ✅
                                        = https://frontend.railway.app
```

**For connection to work:**
- ✅ Frontend's `VITE_API_URL` = Backend's URL
- ✅ Backend's `CORS_ORIGIN` = Frontend's URL

---

## 🧪 **5️⃣ Test After Deployment**

### **Backend Health Check:**
```bash
# Replace with YOUR backend URL
curl https://instinctfi-backend-production.up.railway.app/api/v1/runs/active
```

**Should return:**
```json
{"success":true,"data":[]}
```

### **Frontend Test:**
```
https://instinct-chaotic-learn-production.up.railway.app/dashboard
```

**Open Browser Console (F12):**
- ✅ Should see API calls to backend
- ✅ Should load user profile
- ❌ No CORS errors!

---

## 📝 **Quick Checklist**

**Before Deploying:**
- [ ] Get your backend Railway URL
- [ ] Get your frontend Railway URL
- [ ] Copy your local `SOLANA_PRIVATE_KEY`
- [ ] Copy your local `DRIFT_TRADING_KEYPAIR`

**Backend Variables:**
- [ ] `CORS_ORIGIN` = frontend Railway URL
- [ ] `SOLANA_PRIVATE_KEY` = from local .env
- [ ] `DRIFT_TRADING_KEYPAIR` = from local .env
- [ ] All other variables set

**Frontend Variables:**
- [ ] `VITE_API_URL` = backend Railway URL + /api/v1
- [ ] `VITE_WS_URL` = backend Railway URL (wss://)
- [ ] `VITE_USDC_MINT` = 4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU
- [ ] All other variables set

**After Setting Variables:**
- [ ] Click "Deploy" on backend service
- [ ] Wait for backend to finish
- [ ] Check backend health (curl)
- [ ] Click "Deploy" on frontend service
- [ ] Wait for frontend to finish
- [ ] Open frontend URL
- [ ] Test connection works!

---

## 🎯 **Example with Real URLs**

**If your URLs are:**
- Backend: `instinctfi-backend.up.railway.app`
- Frontend: `instinct-learn.up.railway.app`

**Backend variables:**
```bash
CORS_ORIGIN=https://instinct-learn.up.railway.app
```

**Frontend variables:**
```bash
VITE_API_URL=https://instinctfi-backend.up.railway.app/api/v1
VITE_WS_URL=wss://instinctfi-backend.up.railway.app
```

---

## ⚠️ **Common Mistakes**

### ❌ Wrong:
```bash
# Missing https://
CORS_ORIGIN=instinct-learn.up.railway.app

# Missing /api/v1
VITE_API_URL=https://backend.railway.app

# Using http instead of https
VITE_API_URL=http://backend.railway.app/api/v1

# Trailing slash
CORS_ORIGIN=https://frontend.railway.app/
```

### ✅ Correct:
```bash
CORS_ORIGIN=https://instinct-learn.up.railway.app
VITE_API_URL=https://backend.railway.app/api/v1
VITE_WS_URL=wss://backend.railway.app
```

---

## 🔐 **Get Your Private Keys**

```bash
# On your local machine
cat ~/Projects/instinctfi-backend/.env | grep SOLANA_PRIVATE_KEY
cat ~/Projects/instinctfi-backend/.env | grep DRIFT_TRADING_KEYPAIR
```

Copy the entire array: `[232,49,176,...]`

---

## 🚀 **What Happens After Deployment**

1. **Railway builds backend:**
   ```
   npm ci → prisma generate → build → done!
   ```

2. **Railway starts backend:**
   ```
   prisma migrate deploy → creates all tables! 🎉
   node dist/index.js → backend running!
   ```

3. **Railway builds frontend:**
   ```
   npm ci → vite build → done!
   ```

4. **Railway serves frontend:**
   ```
   Frontend connects to backend using VITE_API_URL
   ```

5. **✅ Everything works!**

---

**Need help? Check the full guide:**
`RAILWAY_ENV_SETUP_GUIDE.md`

