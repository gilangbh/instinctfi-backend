# ✅ How to Get Bearer Token with Just Wallet Connection

## 🚀 Quick Answer

Use this test script:

```bash
cd /Users/raihanibagaskoro/Projects/instinctfi-backend
node scripts/wallet-auth-test.js
```

This will:
1. ✅ Generate a test wallet
2. ✅ Sign authentication message
3. ✅ Get JWT token
4. ✅ Create a run
5. ✅ Show you the token to use

---

## 🔑 Token from Last Run

Use this token (valid for 7 days):

```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJjbWhlZHN1NG4wMDAwMTB2bjJlNHE2MXk2IiwiaWF0IjoxNzYxODg2NjE2LCJleHAiOjE3NjI0OTE0MTZ9.UyPH-z88XdMYTgakn24d9xZFHBsUVNKM_mpdExGX4HA
```

---

## 📋 Use the Token

```bash
# Create a run
curl -X POST http://localhost:3001/api/v1/runs \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJjbWhlZHN1NG4wMDAwMTB2bjJlNHE2MXk2IiwiaWF0IjoxNzYxODg2NjE2LCJleHAiOjE3NjI0OTE0MTZ9.UyPH-z88XdMYTgakn24d9xZFHBsUVNKM_mpdExGX4HA" \
  -d '{
    "tradingPair": "SOL/USDC",
    "coin": "SOL",
    "minDeposit": 10,
    "maxDeposit": 100
  }'
```

---

## 🎯 For Frontend (React/Next.js)

```typescript
// 1. Get nonce
const nonceRes = await fetch(
  `http://localhost:3001/api/v1/auth/wallet/nonce?walletAddress=${publicKey.toString()}`
);
const { message } = (await nonceRes.json()).data;

// 2. Sign with Phantom/Solflare wallet
const messageBytes = new TextEncoder().encode(message);
const signature = await signMessage(messageBytes);
const signatureBase64 = Buffer.from(signature).toString('base64');

// 3. Verify and get token
const verifyRes = await fetch('http://localhost:3001/api/v1/auth/wallet/verify', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    walletAddress: publicKey.toString(),
    username: 'User123',
    message,
    signature: signatureBase64,
  }),
});

const { token } = (await verifyRes.json()).data;

// 4. Store and use token
localStorage.setItem('authToken', token);
```

---

## ✅ Summary

**Answer:** To get a bearer token with just wallet connection:

1. **GET** `/auth/wallet/nonce?walletAddress=YOUR_WALLET`
2. **Sign** the message with your wallet
3. **POST** `/auth/wallet/verify` with signature
4. **Get** JWT token in response
5. **Use** token for all API calls

**No password needed!** Just wallet signature. 🎉



