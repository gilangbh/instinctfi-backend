# 🚂 Railway Environment Variables Setup Guide

## 🎯 How to Set Environment Variables in Railway

### **Method 1: Railway Dashboard (Recommended)**

#### **For Backend Service:**

1. **Go to Railway Dashboard:** https://railway.app/
2. **Select your project**
3. **Click on `instinctfi-backend` service**
4. **Click "Variables" tab**
5. **Click "+ New Variable"**
6. **Add each variable:**

**Required Backend Variables:**

```bash
# Database (Auto-set by Railway PostgreSQL plugin)
DATABASE_URL=postgresql://...  # Already set if you added PostgreSQL

# JWT
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRES_IN=7d

# Solana
SOLANA_NETWORK=devnet
SOLANA_RPC_URL=https://api.devnet.solana.com
SOLANA_PROGRAM_ID=7gmTYKqNX4xKsrd6NfNRscL3XSUoUTQyyTPhySWoABUc
SOLANA_PRIVATE_KEY=[paste your private key array]
SOLANA_USDC_MINT=4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU

# Drift Protocol
DRIFT_ENVIRONMENT=devnet
DRIFT_ENABLE_REAL_TRADING=true
DRIFT_TRADING_KEYPAIR=[paste your drift keypair]

# CORS (Important for frontend connection!)
CORS_ORIGIN=https://your-frontend.railway.app

# Server
PORT=3001
NODE_ENV=production
```

---

#### **For Frontend Service:**

1. **Click on `instinct-chaotic-learn` service**
2. **Click "Variables" tab**
3. **Click "+ New Variable"**
4. **Add each variable:**

**Required Frontend Variables:**

```bash
# Backend API Connection (CRITICAL!)
VITE_API_URL=https://your-backend.railway.app/api/v1
VITE_WS_URL=wss://your-backend.railway.app

# Solana Configuration
VITE_SOLANA_NETWORK=devnet
VITE_SOLANA_RPC_URL=https://api.devnet.solana.com
VITE_SOLANA_PROGRAM_ID=7gmTYKqNX4xKsrd6NfNRscL3XSUoUTQyyTPhySWoABUc
VITE_USDC_MINT=4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU
```

---

### **Method 2: Railway CLI**

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Link to your project
cd ~/Projects/instinctfi-backend
railway link

# Add variables
railway variables set JWT_SECRET="your-secret-key"
railway variables set SOLANA_NETWORK="devnet"
railway variables set CORS_ORIGIN="https://your-frontend.railway.app"

# For frontend
cd ~/Projects/instinct-chaotic-learn
railway link
railway variables set VITE_API_URL="https://your-backend.railway.app/api/v1"
```

---

## 🔗 **Connecting Frontend to Backend**

### **The Key Variables:**

#### **Backend:**
```bash
CORS_ORIGIN=https://instinct-chaotic-learn-production.up.railway.app
```
☝️ This allows your frontend to make API calls

#### **Frontend:**
```bash
VITE_API_URL=https://instinctfi-backend-production.up.railway.app/api/v1
VITE_WS_URL=wss://instinctfi-backend-production.up.railway.app
```
☝️ This tells frontend where the backend is

---

## 🎯 **How to Get Your Railway URLs**

### **Backend URL:**

1. Go to Railway dashboard
2. Click `instinctfi-backend` service
3. Click "Settings" tab
4. Under "Networking" you'll see:
   ```
   Public Domain: instinctfi-backend-production.up.railway.app
   ```
5. **Copy this URL** (without https://)

### **Frontend URL:**

1. Click `instinct-chaotic-learn` service
2. Click "Settings" tab
3. Under "Networking":
   ```
   Public Domain: instinct-chaotic-learn-production.up.railway.app
   ```
4. **Copy this URL**

---

## 📝 **Step-by-Step Connection Setup**

### **Step 1: Set Backend Variables**

In Railway → `instinctfi-backend` → Variables:

```
CORS_ORIGIN=https://instinct-chaotic-learn-production.up.railway.app
```

### **Step 2: Set Frontend Variables**

In Railway → `instinct-chaotic-learn` → Variables:

```
VITE_API_URL=https://instinctfi-backend-production.up.railway.app/api/v1
VITE_WS_URL=wss://instinctfi-backend-production.up.railway.app
```

### **Step 3: Redeploy Both Services**

After setting variables:
1. Click on each service
2. Click "Deploy" or "Redeploy"
3. Wait for build to complete

---

## 🧪 **Test Connection**

After deployment:

```bash
# Test backend is accessible
curl https://your-backend.railway.app/api/v1/runs/active

# Should return:
{"success":true,"data":[...]}
```

**Open frontend:**
```
https://your-frontend.railway.app/dashboard
```

**Check browser console (F12):**
- Should see API calls to backend URL
- Should load runs from backend
- No CORS errors!

---

## ⚠️ **Common Issues & Fixes**

### **Issue: CORS Error**

```
Access to fetch at 'https://backend...' from origin 'https://frontend...' 
has been blocked by CORS policy
```

**Fix:**
```bash
# In backend Railway variables
CORS_ORIGIN=https://your-exact-frontend-url.railway.app
```

**Must match EXACTLY** (including https, no trailing slash)

---

### **Issue: Frontend Can't Reach Backend**

```
Failed to fetch runs from backend
```

**Fix:**
```bash
# In frontend Railway variables
VITE_API_URL=https://your-backend-url.railway.app/api/v1
```

Note the `/api/v1` at the end!

---

### **Issue: Environment Variables Not Updating**

**Fix:**
1. After changing variables, **redeploy**
2. Variables only take effect on new deployments
3. Click "Redeploy" button

---

## 🔐 **Sensitive Variables**

For sensitive data like private keys:

### **Option 1: Use Raw Editor**

1. Click "Raw Editor" button in Railway
2. Paste all variables at once:

```bash
JWT_SECRET=your-super-secret-key-here
SOLANA_PRIVATE_KEY=[232,49,176,117,...]
DRIFT_TRADING_KEYPAIR=[232,49,176,117,...]
DATABASE_URL=${{Postgres.DATABASE_URL}}
```

**Note:** `${{Postgres.DATABASE_URL}}` references the PostgreSQL plugin variable

---

### **Option 2: Reference Plugin Variables**

Railway PostgreSQL plugin auto-creates:
```
${{Postgres.DATABASE_URL}}
${{Postgres.DATABASE_PRIVATE_URL}}
```

You can reference these in your variables!

---

## 📊 **Complete Variable List**

### **Backend (instinctfi-backend):**

```bash
# Database (from PostgreSQL plugin)
DATABASE_URL=${{Postgres.DATABASE_URL}}

# Server
PORT=3001
NODE_ENV=production

# JWT
JWT_SECRET=your-random-secret-key-min-32-chars
JWT_EXPIRES_IN=7d

# CORS (Frontend URL)
CORS_ORIGIN=https://instinct-chaotic-learn-production.up.railway.app

# Solana
SOLANA_NETWORK=devnet
SOLANA_RPC_URL=https://api.devnet.solana.com
SOLANA_PROGRAM_ID=7gmTYKqNX4xKsrd6NfNRscL3XSUoUTQyyTPhySWoABUc
SOLANA_PRIVATE_KEY=[your private key array]
SOLANA_USDC_MINT=4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU

# Drift
DRIFT_ENVIRONMENT=devnet
DRIFT_ENABLE_REAL_TRADING=true
DRIFT_TRADING_KEYPAIR=[your drift keypair]
DRIFT_DEFAULT_MARKET=SOL-PERP
```

### **Frontend (instinct-chaotic-learn):**

```bash
# Backend Connection (CRITICAL!)
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

---

## 🎯 **Connection Flow**

```
User → Frontend (Railway)
        ↓ API calls
        Backend (Railway)
        ↓ CORS check (CORS_ORIGIN)
        ✅ Allowed!
        ↓ Returns data
        Frontend displays
```

**For this to work:**
- ✅ Backend `CORS_ORIGIN` = Frontend URL
- ✅ Frontend `VITE_API_URL` = Backend URL
- ✅ Both URLs must be correct
- ✅ Must redeploy after setting variables

---

## 📝 **Quick Setup Checklist**

### **Backend:**
- [ ] DATABASE_URL (from PostgreSQL plugin)
- [ ] CORS_ORIGIN (frontend URL)
- [ ] JWT_SECRET (random string)
- [ ] SOLANA_* variables
- [ ] DRIFT_* variables

### **Frontend:**
- [ ] VITE_API_URL (backend URL + /api/v1)
- [ ] VITE_WS_URL (backend URL with wss://)
- [ ] VITE_SOLANA_* variables

### **After Setting:**
- [ ] Redeploy backend
- [ ] Redeploy frontend
- [ ] Test connection

---

## 🧪 **Verify Connection**

### **1. Backend Health:**
```bash
curl https://your-backend.railway.app/api/v1/runs/active
```

Should return JSON (not error)

### **2. Frontend Loads:**
```
https://your-frontend.railway.app/dashboard
```

Should load run data from backend

### **3. No CORS Errors:**
Open browser console (F12) - should see successful API calls

---

## 💡 **Pro Tips**

1. **Use Railway's Variable References:**
   ```bash
   BACKEND_URL=${{instinctfi-backend.RAILWAY_PUBLIC_DOMAIN}}
   ```

2. **Separate Environments:**
   - Development: Use `.railway.dev` domains
   - Production: Use custom domains

3. **Secret Variables:**
   - Railway encrypts all variables
   - Never commit secrets to git
   - Use Railway UI for sensitive data

4. **Variable Precedence:**
   - Railway variables override .env files
   - Perfect for production vs development

---

**After Railway deploys with migrations, check your PostgreSQL tab - you'll see all tables!** 🎉











