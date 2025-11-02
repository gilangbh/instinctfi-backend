# Production Deployment Guide

## 🎯 Current Setup Status

### ✅ Devnet (Current - Safe for Testing)

**Solana Program:**
- Deployed to: **Solana Devnet**
- Program ID: `7gmTYKqNX4xKsrd6NfNRscL3XSUoUTQyyTPhySWoABUc`
- Network: `https://api.devnet.solana.com`
- USDC: Devnet test USDC

**Drift Integration:**
- Environment: **Devnet** (recommended by setup script)
- Test USDC only
- No real money at risk

**Backend Configuration:**
```bash
# Current .env defaults
SOLANA_NETWORK=devnet
SOLANA_RPC_URL=https://api.devnet.solana.com
DRIFT_ENVIRONMENT=devnet
DRIFT_ENABLE_REAL_TRADING=false  # Mock mode
```

---

## 🚀 Production Deployment Checklist

### Phase 1: Pre-Production (Do This First!)

- [ ] Complete security audit of Solana program
- [ ] Extensive testing on devnet (minimum 2 weeks)
- [ ] Penetration testing
- [ ] Code review by 2+ developers
- [ ] Documentation complete
- [ ] Backup and recovery procedures documented
- [ ] Monitoring and alerting setup
- [ ] Emergency shutdown procedure tested

### Phase 2: Mainnet Preparation

- [ ] Create production wallets (use hardware wallet!)
- [ ] Set up multisig for platform authority
- [ ] Deploy Solana program to mainnet
- [ ] Fund Drift mainnet account
- [ ] Configure production RPC provider
- [ ] Set up production database
- [ ] Configure production secrets management
- [ ] Set up production monitoring

### Phase 3: Soft Launch

- [ ] Deploy to mainnet with limits enabled
- [ ] Start with small user group (beta testers)
- [ ] Monitor for 48 hours
- [ ] Gradually increase limits
- [ ] Scale based on metrics

---

## 📋 Production Configuration Files

### Configuration Templates Created

1. **`env.production.template`** - Production configuration template
2. **`env.devnet.template`** - Devnet configuration template  
3. **`scripts/production-deploy.sh`** - Production deployment script

---

## 🔧 Environment Setup

### Current: Devnet (Safe Testing)

Your current setup is configured for **devnet**:

```bash
# Solana
SOLANA_NETWORK=devnet
SOLANA_RPC_URL=https://api.devnet.solana.com
SOLANA_PROGRAM_ID=7gmTYKqNX4xKsrd6NfNRscL3XSUoUTQyyTPhySWoABUc

# Drift
DRIFT_ENVIRONMENT=devnet
DRIFT_ENABLE_REAL_TRADING=false  # Mock mode
```

**This is correct for development and testing!**

### Production: Mainnet

For production deployment, you'll need:

```bash
# Solana
SOLANA_NETWORK=mainnet-beta
SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY  # Premium RPC!
SOLANA_PROGRAM_ID=YOUR_MAINNET_PROGRAM_ID  # After mainnet deployment

# Drift
DRIFT_ENVIRONMENT=mainnet-beta
DRIFT_ENABLE_REAL_TRADING=false  # Start with mock, enable later
```

---

## 🚀 Deployment Steps

### Step 1: Deploy Solana Program to Mainnet

**In your Solana project** (`instinctfi-solana`):

```bash
cd ~/Projects/instinctfi-solana

# 1. Ensure you're on mainnet
solana config set --url mainnet-beta

# 2. Create/use a mainnet wallet with SOL
solana-keygen new -o mainnet-deployer.json

# 3. Fund it with SOL (you need ~5 SOL for deployment)
# Transfer SOL from your exchange/wallet

# 4. Build program
anchor build

# 5. Deploy to mainnet
anchor deploy --provider.cluster mainnet-beta

# 6. Note the program ID - you'll need it!
```

**Important:** The program ID will be different from devnet!

### Step 2: Update Backend for Production

```bash
cd ~/Projects/instinctfi-backend

# 1. Create production environment file
cp env.production.template .env.production

# 2. Edit .env.production with:
#    - Your mainnet program ID
#    - Production RPC URLs (Helius, QuickNode, etc.)
#    - Production database URL
#    - Strong JWT secret
#    - Production keypairs

# 3. CRITICAL: Use separate keypair for production!
solana-keygen new -o production-authority.json

# 4. Fund production wallet with SOL
```

### Step 3: Initialize Platform on Mainnet

```bash
# Using your production wallet
npm run build
NODE_ENV=production npm start

# In another terminal, initialize platform
curl -X POST https://your-api.com/api/solana/platform/initialize \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -d '{"platformFeeBps": 150}'
```

### Step 4: Set Up Drift on Mainnet

```bash
# 1. Create Drift trading wallet
solana-keygen new -o drift-trading-mainnet.json

# 2. Fund with SOL for fees

# 3. Transfer USDC to trading wallet

# 4. Test Drift connection (with DRIFT_ENABLE_REAL_TRADING=false)
DRIFT_ENVIRONMENT=mainnet-beta node scripts/test-drift.js
```

---

## 🔐 Production Security

### 1. Use Premium RPC Providers

**Don't use public RPCs in production!**

Recommended providers:
- **Helius** (https://helius.dev) - Recommended
- **QuickNode** (https://quicknode.com)
- **Triton** (https://triton.one)

Cost: ~$50-200/month

### 2. Hardware Wallet for Critical Operations

For platform authority and large operations:
- **Ledger** or **Trezor** hardware wallet
- Never store production private keys in plain text
- Use AWS Secrets Manager or HashiCorp Vault

### 3. Multisig Setup

For mainnet, use multisig for platform authority:

```bash
# Create multisig (requires 2 of 3 signatures)
solana-keygen grind --starts-with multi:1
# Configure in your program
```

### 4. Separate Wallets

- Platform Authority (multisig)
- Trading Wallet (Drift operations)
- Fee Collection Wallet
- Emergency Wallet

### 5. Environment Security

```bash
# Production .env should have:
- Strong random JWT secret (64+ chars)
- Encrypted database connections
- Secure Redis with password
- Rate limiting enabled
- CORS properly configured
```

---

## 📊 Monitoring & Alerts

### Essential Monitoring

```bash
# 1. Application Health
- Uptime monitoring (UptimeRobot, Pingdom)
- API response times
- Error rates

# 2. Blockchain Monitoring
- Transaction success rates
- Program account changes
- Wallet balances (alert if low)

# 3. Trading Monitoring
- Open positions
- P/L tracking
- Collateral levels
- Liquidation risks

# 4. Infrastructure
- Server CPU/Memory
- Database performance
- Redis performance
- Network latency
```

### Recommended Tools

- **Sentry** - Error tracking
- **Datadog** - Infrastructure monitoring  
- **PagerDuty** - Alerts and on-call
- **CloudWatch** - AWS monitoring
- **Custom Grafana** - Trading metrics

---

## 🚨 Emergency Procedures

### Emergency Shutdown

```bash
# Option 1: Environment variable
EMERGENCY_SHUTDOWN=true

# Option 2: Pause Solana program
curl -X POST https://your-api.com/api/solana/platform/pause \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"

# Option 3: Stop backend
pm2 stop instinct-api
```

### Recovery Procedures

1. **Isolate the issue**
2. **Pause all trading**
3. **Close open positions** (if safe)
4. **Notify users**
5. **Investigate root cause**
6. **Fix and test**
7. **Gradual restart**

---

## 📈 Gradual Rollout Strategy

### Week 1: Soft Launch (Mainnet, Low Limits)

```bash
# .env.production settings
DRIFT_ENABLE_REAL_TRADING=false  # Still mock mode
MAX_DEPOSIT_USDC=100
MAX_PARTICIPANTS_PER_RUN=20
DRIFT_MAX_LEVERAGE=2
DRIFT_MAX_POSITION_SIZE_USD=1000
```

- Invite beta testers only
- Monitor 24/7
- Test all flows with real users

### Week 2: Enable Real Trading (Small Scale)

```bash
DRIFT_ENABLE_REAL_TRADING=true  # ⚠️ Real trading starts
MAX_DEPOSIT_USDC=500
MAX_PARTICIPANTS_PER_RUN=50
DRIFT_MAX_LEVERAGE=5
DRIFT_MAX_POSITION_SIZE_USD=5000
```

- Start with ONE trading run
- Monitor every trade
- Verify P/L calculations
- Test settlements

### Week 3-4: Scale Up

```bash
MAX_DEPOSIT_USDC=1000
MAX_PARTICIPANTS_PER_RUN=100
DRIFT_MAX_LEVERAGE=10
DRIFT_MAX_POSITION_SIZE_USD=10000
```

- Multiple concurrent runs
- Increased limits
- More participants

### Month 2+: Full Scale

Based on performance and monitoring, gradually increase to target levels.

---

## ✅ Pre-Launch Checklist

### Technical

- [ ] Solana program deployed to mainnet
- [ ] Program initialized with correct parameters
- [ ] Backend deployed to production server
- [ ] Premium RPC provider configured
- [ ] Database backed up
- [ ] Redis configured and secured
- [ ] Drift account funded and initialized
- [ ] All API endpoints tested on mainnet
- [ ] Monitoring and alerts configured
- [ ] Logging configured
- [ ] Error tracking (Sentry) set up

### Security

- [ ] Security audit completed
- [ ] Penetration testing done
- [ ] Private keys secured (hardware wallet/HSM)
- [ ] Multisig configured for platform authority
- [ ] Rate limiting enabled
- [ ] CORS properly configured
- [ ] SQL injection tests passed
- [ ] XSS protection enabled
- [ ] Secrets in environment variables only

### Operations

- [ ] Emergency shutdown procedure documented
- [ ] Team trained on emergency procedures
- [ ] On-call rotation scheduled
- [ ] Backup procedures documented and tested
- [ ] Recovery procedures documented
- [ ] Runbook created
- [ ] Status page set up
- [ ] Support system ready

### Legal & Compliance

- [ ] Terms of service reviewed
- [ ] Privacy policy updated
- [ ] Compliance requirements met
- [ ] User agreements in place
- [ ] Risk disclosures clear

---

## 🎯 Production vs Devnet Comparison

| Aspect | Devnet (Current) | Mainnet (Production) |
|--------|-----------------|---------------------|
| **Solana Network** | devnet | mainnet-beta |
| **Program ID** | 7gmTYKqNX4xKsrd6NfNRscL3XSUoUTQyyTPhySWoABUc | Different (after deployment) |
| **USDC** | Test tokens (free) | Real USDC ($$$) |
| **RPC** | Public (free) | Premium ($50-200/mo) |
| **Drift** | Test environment | Real trading |
| **Risk** | Zero (test money) | HIGH (real money) |
| **Authority Wallet** | Simple keypair | Hardware wallet/multisig |
| **Monitoring** | Optional | **REQUIRED** |
| **Backups** | Optional | **REQUIRED** |
| **Security Audit** | Optional | **REQUIRED** |

---

## 💰 Production Costs

### Monthly Operating Costs

```
RPC Provider (Helius/QuickNode): $100-500
Database (RDS/managed): $50-200  
Redis (managed): $30-100
Monitoring (Datadog): $50-150
Server (EC2/VPS): $50-200
Domain & SSL: $10-20
CDN (CloudFlare): $0-50

Total: ~$300-1,200/month
```

### One-Time Costs

```
Security Audit: $10,000-50,000
Penetration Testing: $5,000-15,000
Legal (Terms/Privacy): $2,000-10,000
Hardware Wallet: $100-200

Total: ~$17,000-75,000
```

---

## 📞 Support & Resources

### When You're Ready to Deploy

1. Complete devnet testing (minimum 2 weeks)
2. Get security audit
3. Configure production infrastructure
4. Deploy Solana program to mainnet
5. Configure backend for mainnet
6. Start with mock trading mode
7. Gradually enable real trading
8. Scale based on metrics

### Need Help?

- Check: `DRIFT_INTEGRATION_GUIDE.md`
- Test: `node scripts/test-drift.js`
- Monitor: `tail -f logs/production.log`

---

## Summary

✅ **Current Setup:** Devnet (Safe for testing)  
⏳ **Production Prep:** Follow checklist above  
🚀 **Go Live:** Gradual rollout strategy  
🔐 **Security:** Premium RPC, hardware wallets, multisig  
📊 **Monitoring:** Essential before launch  

**Don't rush to production!** Spend 2-4 weeks on devnet first.


