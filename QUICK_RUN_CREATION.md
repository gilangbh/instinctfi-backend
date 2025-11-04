# Quick Guide: Create Run on Railway

## Step 1: Create Admin User

```bash
cd /Users/raihanibagaskoro/Projects/instinctfi-backend
railway run -- npx prisma studio
```

In Prisma Studio:
1. Click "User" model
2. Click "Add Record"
3. Set `username` = `admin` (IMPORTANT!)
4. Set `walletAddress` = any unique value (e.g., `admin_wallet_123`)
5. Save

## Step 2: Generate Admin Token

```bash
railway run -- npm run admin:token
```

**Copy the token** from the output!

## Step 3: Get Railway URL

```bash
railway status
```

Or check Railway dashboard → instinctfi-backend → Settings → Domains

## Step 4: Create Run

```bash
# Replace YOUR_TOKEN and YOUR_URL
curl -X POST https://instinctfi-backend-develop.up.railway.app/api/v1/runs \
  -H "Authorization: Bearer YOUR_TOKEN" \
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

## Step 5: Verify

Check frontend: https://testnet.instinctfi.xyz/dashboard

Or via API:
```bash
curl https://instinctfi-backend-develop.up.railway.app/api/v1/runs/active
```

---

## Complete Example

```bash
# 1. Create admin (Prisma Studio)
railway run -- npx prisma studio

# 2. Get token
railway run -- npm run admin:token

# 3. Create run (replace YOUR_TOKEN)
curl -X POST https://instinctfi-backend-develop.up.railway.app/api/v1/runs \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"tradingPair":"SOL/USD","coin":"SOL","duration":120,"votingInterval":10,"minDeposit":10,"maxDeposit":100,"maxParticipants":100}'
```

---

## Troubleshooting

**"No admin user found"**
→ Create admin user in Prisma Studio with `username = "admin"`

**"Admin access required"**
→ Verify user has `username = "admin"` in database

**"Invalid token"**
→ Generate new token: `railway run -- npm run admin:token`

---

**Done!** 🚀
