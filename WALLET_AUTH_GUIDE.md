# Wallet-Based Authentication Guide

## 🎯 How to Get Bearer Token with Just Wallet Connection

Your backend supports **wallet-based authentication** - no password needed!

---

## 🚀 Quick Method (2 API Calls)

### Step 1: Get Nonce/Message to Sign

```bash
curl "http://localhost:3001/api/v1/auth/wallet/nonce?walletAddress=YOUR_WALLET_ADDRESS"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "Sign this message to authenticate with Instinct.fi\n\nWallet: YOUR_WALLET\nTimestamp: 1730...",
    "timestamp": 1730250000000
  }
}
```

### Step 2: Sign Message & Verify

```bash
curl -X POST http://localhost:3001/api/v1/auth/wallet/verify \
  -H "Content-Type: application/json" \
  -d '{
    "walletAddress": "YOUR_WALLET_ADDRESS",
    "username": "YourUsername",
    "message": "Sign this message to authenticate...",
    "signature": "SIGNATURE_FROM_WALLET"
  }'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "1",
      "walletAddress": "YOUR_WALLET",
      "username": "YourUsername"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."  ← Your JWT token!
  },
  "message": "Wallet verified successfully"
}
```

**Copy the `token` and use it!**

---

## 🔑 Using the Token

Once you have the token:

```bash
# Create a run
curl -X POST http://localhost:3001/api/v1/runs \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -d '{
    "tradingPair": "SOL/USDC",
    "coin": "SOL",
    "minDeposit": 10,
    "maxDeposit": 100
  }'
```

---

## 🧪 Testing Without Frontend (Simple Method)

If you don't have a wallet to sign with yet, here's a test workaround:

### Create Test Script with Auto-Signing

```bash
cat > /Users/raihanibagaskoro/Projects/instinctfi-backend/scripts/wallet-auth-test.js << 'EOF'
const { Keypair } = require('@solana/web3.js');
const nacl = require('tweetnacl');
const bs58 = require('bs58');
const axios = require('axios');

async function walletAuth() {
  const API = 'http://localhost:3001/api/v1';
  
  // Generate a test keypair (or use existing)
  const keypair = Keypair.generate();
  const walletAddress = keypair.publicKey.toString();
  const username = 'testuser_' + Date.now();
  
  console.log('Wallet:', walletAddress);
  console.log('Username:', username);
  console.log('');
  
  // Step 1: Get nonce
  console.log('1. Getting nonce...');
  const nonceRes = await axios.get(`${API}/auth/wallet/nonce?walletAddress=${walletAddress}`);
  const { message } = nonceRes.data.data;
  
  console.log('Message to sign:', message.substring(0, 50) + '...');
  console.log('');
  
  // Step 2: Sign message
  console.log('2. Signing message with wallet...');
  const messageBytes = new TextEncoder().encode(message);
  const signature = nacl.sign.detached(messageBytes, keypair.secretKey);
  const signatureBase58 = bs58.encode(signature);
  
  console.log('Signature:', signatureBase58.substring(0, 20) + '...');
  console.log('');
  
  // Step 3: Verify and get token
  console.log('3. Verifying wallet and getting token...');
  const verifyRes = await axios.post(`${API}/auth/wallet/verify`, {
    walletAddress,
    username,
    message,
    signature: signatureBase58,
  });
  
  const { token, user } = verifyRes.data.data;
  
  console.log('✅ Authenticated!');
  console.log('User ID:', user.id);
  console.log('Username:', user.username);
  console.log('Token:', token.substring(0, 50) + '...');
  console.log('');
  
  // Step 4: Test creating a run
  console.log('4. Testing run creation with token...');
  const runRes = await axios.post(`${API}/runs`, {
    tradingPair: 'SOL/USDC',
    coin: 'SOL',
    minDeposit: 10,
    maxDeposit: 100,
    maxParticipants: 50,
  }, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    }
  });
  
  console.log('✅ Run created!');
  console.log('Run ID:', runRes.data.id);
  console.log('Status:', runRes.data.status);
  console.log('');
  
  console.log('🎉 Full flow complete!');
  console.log('');
  console.log('Your token:', token);
}

walletAuth().catch(console.error);
EOF

chmod +x scripts/wallet-auth-test.js
node scripts/wallet-auth-test.js
```

---

## 📱 For Frontend Integration

### React/Next.js Example

```typescript
import { useWallet } from '@solana/wallet-adapter-react';
import bs58 from 'bs58';

async function authenticateWallet() {
  const { publicKey, signMessage } = useWallet();
  
  // 1. Get nonce
  const nonceRes = await fetch(
    `http://localhost:3001/api/v1/auth/wallet/nonce?walletAddress=${publicKey.toString()}`
  );
  const { message } = (await nonceRes.json()).data;
  
  // 2. Sign message with wallet
  const messageBytes = new TextEncoder().encode(message);
  const signature = await signMessage(messageBytes);
  const signatureBase58 = bs58.encode(signature);
  
  // 3. Verify and get token
  const verifyRes = await fetch('http://localhost:3001/api/v1/auth/wallet/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      walletAddress: publicKey.toString(),
      username: 'User123', // Get from user input
      message,
      signature: signatureBase58,
    }),
  });
  
  const { token } = (await verifyRes.json()).data;
  
  // 4. Store token
  localStorage.setItem('authToken', token);
  
  return token;
}
```

---

## ✅ Complete Flow (2 Steps)

### Step 1: Get Challenge Message

```bash
curl "http://localhost:3001/api/v1/auth/wallet/nonce?walletAddress=7gmTYKqNX4xKsrd6NfNRscL3XSUoUTQyyTPhySWoABUc"
```

Copy the `message` from response.

### Step 2: Sign & Verify

You need to sign the message with your Solana wallet, then:

```bash
curl -X POST http://localhost:3001/api/v1/auth/wallet/verify \
  -H "Content-Type: application/json" \
  -d '{
    "walletAddress": "7gmTYKqNX4xKsrd6NfNRscL3XSUoUTQyyTPhySWoABUc",
    "username": "myusername",
    "message": "Sign this message to authenticate...",
    "signature": "YOUR_SIGNATURE_HERE"
  }'
```

You'll get back a token! ✅

---

## 🧪 Quick Test (No Wallet Needed)

Run this test script:

```bash
cd /Users/raihanibagaskoro/Projects/instinctfi-backend
node scripts/wallet-auth-test.js
```

This will:
1. ✅ Generate test wallet
2. ✅ Get nonce
3. ✅ Sign message
4. ✅ Get JWT token
5. ✅ Create a run with the token
6. ✅ Show you the full flow

---

## 📋 Summary

**Your backend supports wallet-only authentication!**

**Flow:**
```
1. GET /auth/wallet/nonce → Get message to sign
2. Sign message with wallet (frontend)
3. POST /auth/wallet/verify → Get JWT token
4. Use token for all API calls
```

**No password needed!** Just wallet signature. 🎉

**Try the test script:**
```bash
node scripts/wallet-auth-test.js
```

This will show you the complete flow and give you a working token!


