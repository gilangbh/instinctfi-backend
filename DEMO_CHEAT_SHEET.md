# 🎬 Admin Run Creation Demo - Quick Reference Card

## 📋 **Pre-Demo Checklist**

- [ ] Admin token generated and copied
- [ ] Postman collection imported
- [ ] Railway dashboard open (Database tab)
- [ ] Frontend open: https://testnet.instinctfi.xyz
- [ ] Solana Explorer tabs ready
- [ ] Terminal ready

---

## 🔑 **Key URLs**

```
Backend:   https://instinctfi-backend-develop.up.railway.app
Frontend:  https://testnet.instinctfi.xyz
Explorer:  https://explorer.solana.com/?cluster=devnet

Community Wallet:      2f2GzFzxrvqQ2E8pAt7EVwq6YWcuZqegA5HBge7qiCfn
USDC Token Account:    6S2bFPayJZ9J4Ao5dkaUGpwv6m8mrV2cAUmeQdtckKfY
Program ID:            7gmTYKqNX4xKsrd6NfNRscL3XSUoUTQyyTPhySWoABUc
```

---

## ⚡ **Quick Commands**

### Generate Admin Token
```bash
railway ssh --service instinctfi-backend "npm run admin:token"
```

### Create Run (curl)
```bash
curl -X POST https://instinctfi-backend-develop.up.railway.app/api/v1/runs \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"tradingPair":"SOL/USD","coin":"SOL","duration":120,"votingInterval":10,"minDeposit":10,"maxDeposit":100,"maxParticipants":100}'
```

### Check Active Runs
```bash
curl https://instinctfi-backend-develop.up.railway.app/api/v1/runs/active
```

### View Logs
```bash
railway logs --follow | grep "run"
```

---

## 🎯 **Demo Flow (15 min)**

### **Part 1: Manual API (5 min)**
1. Show admin user in database
2. Generate admin token
3. Create run in Postman
4. Show API response

### **Part 2: Automation (3 min)**
1. Show scheduler code
2. Show environment config
3. Show scheduler logs

### **Part 3: Verification (7 min)**
1. Verify in database
2. Show on frontend
3. Explain run lifecycle
4. Show Solana transactions

---

## 📊 **Key Metrics to Mention**

- ✅ **100** participants max per run
- ✅ **10-100 USDC** deposit range
- ✅ **2 hours** run duration
- ✅ **12 voting rounds** (10 min each)
- ✅ **10 minutes** lobby phase
- ✅ **15%** platform fee on profits
- ✅ **Every 2.5 hours** automated run creation

---

## 🎨 **Visual Aids**

### Run Lifecycle
```
[CREATED] → 10 min lobby → [ACTIVE] → 2 hours trading → [ENDED]
                             ↓                              ↓
                    12 voting rounds              Profit distribution
```

### API Request/Response
```
POST /api/v1/runs
Authorization: Bearer eyJhbGc...
{
  "tradingPair": "SOL/USD",
  "duration": 120,
  ...
}

→ 200 OK
{
  "success": true,
  "data": {
    "id": "cm4x...",
    "status": "WAITING",
    "countdown": 600
  }
}
```

---

## 🎤 **Key Talking Points**

### Security
> "Only admin users can create runs. JWT tokens expire after 7 days. Auto-generated usernames prevent admin spoofing."

### Automation
> "In production, runs are created every 2.5 hours automatically. Zero manual intervention needed."

### Transparency
> "All deposits are real Solana transactions. Anyone can verify on Solana Explorer."

### Scalability
> "Handles 100 participants per run. Can run multiple simultaneous runs."

---

## 📱 **Demo Props**

### Postman Request
```
Method: POST
URL: https://instinctfi-backend-develop.up.railway.app/api/v1/runs
Headers:
  - Authorization: Bearer {{admin_token}}
  - Content-Type: application/json
Body:
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

### Expected Response
```json
{
  "success": true,
  "data": {
    "id": "cm4x1a2b3c4d5e6f7g8h9i0j",
    "status": "WAITING",
    "countdown": 600,
    "totalRounds": 12,
    "participants": []
  }
}
```

---

## ❓ **Q&A Prep**

**Q: How do you prevent unauthorized access?**
> JWT authentication. Only `username='admin'` can create runs.

**Q: What if no one joins the lobby?**
> Auto-cancelled after 10 minutes. No wasted resources.

**Q: Can you create runs for different pairs?**
> Yes! `tradingPair` is configurable. Currently SOL/USD, easily add BTC/USD, ETH/USD.

**Q: Is this testnet or mainnet?**
> Devnet for testing. Same code works on mainnet with RPC URL change.

**Q: How do you handle failures?**
> Comprehensive error handling + logging. Can set up monitoring alerts.

---

## 🚀 **Advanced Demo Points**

### Show Response Times
```bash
time curl -X POST ... # < 500ms expected
```

### Show Concurrent Runs
```
Database showing:
  Run 1: WAITING  (lobby open)
  Run 2: ACTIVE   (trading)
  Run 3: ENDED    (results)
```

### Show Scheduler Config
```typescript
cron.schedule('0 0,3,6,9,12,15,18,21 * * *', ...)
// Every 2.5 hours, 24/7
```

---

## 🎯 **Closing Statement**

> "InstinctFi has a robust admin system with:
> - Manual control for special events
> - Automated scheduling for 24/7 operation
> - Full blockchain transparency
> - Production-ready architecture
> 
> Live on devnet, ready to scale to mainnet."

---

## 📞 **Emergency Backup**

If API fails during demo:

1. **Show database directly**
   - Railway → PostgreSQL → Run table
   - Point to existing runs

2. **Show frontend**
   - Dashboard with active runs
   - Lobby page with countdown

3. **Show logs**
   - Railway logs showing scheduler
   - Successful run creations

4. **Fallback message:**
   > "As you can see in the database and logs, the system has been creating runs successfully. Let me show you the results instead."

---

## ✅ **Post-Demo Follow-up**

Share these files:
- [ ] `ADMIN_SETUP_GUIDE.md`
- [ ] `PRODUCTION_RUN_CREATION.md`
- [ ] `ADMIN_RUN_CREATION_DEMO.md`
- [ ] `InstinctFi-Admin-API.postman_collection.json`

---

## 🎉 **Good Luck!**

**Remember:**
- Speak slowly and clearly
- Pause after each step
- Explain "why" not just "how"
- Show confidence in the product
- Smile! 😊

---

**🔥 You got this!**









