#!/usr/bin/env node

const { Keypair } = require('@solana/web3.js');
const nacl = require('tweetnacl');
const bs58 = require('bs58');
const axios = require('axios');

// Fix bs58 import if needed
const bs58encode = bs58.encode || (bs58.default && bs58.default.encode) || bs58;

const API = 'http://localhost:3001/api/v1';

async function walletAuth() {
  console.log('========================================');
  console.log('Wallet Authentication Test');
  console.log('========================================');
  console.log('');
  
  try {
    // Generate a test keypair (or use existing)
    const keypair = Keypair.generate();
    const walletAddress = keypair.publicKey.toString();
    const username = 'testuser_' + Date.now();
    
    console.log('💼 Wallet:', walletAddress);
    console.log('👤 Username:', username);
    console.log('');
    
    // Step 1: Get nonce
    console.log('1️⃣  Getting nonce/message to sign...');
    const nonceRes = await axios.get(`${API}/auth/wallet/nonce?walletAddress=${walletAddress}`);
    const { message, timestamp } = nonceRes.data.data;
    
    console.log('✅ Message received:');
    console.log(message);
    console.log('');
    
  // Step 2: Sign message with wallet
  console.log('2️⃣  Signing message with wallet...');
  const messageBytes = new TextEncoder().encode(message);
  const signature = nacl.sign.detached(messageBytes, keypair.secretKey);
  const signatureBase58 = Buffer.from(signature).toString('base64'); // Use base64 instead
    
    console.log('✅ Signature created:', signatureBase58.substring(0, 30) + '...');
    console.log('');
    
    // Step 3: Verify and get token
    console.log('3️⃣  Verifying wallet signature...');
    const verifyRes = await axios.post(`${API}/auth/wallet/verify`, {
      walletAddress,
      username,
      message,
      signature: signatureBase58,
    });
    
    const { token, user } = verifyRes.data.data;
    
    console.log('✅ Wallet verified!');
    console.log('   User ID:', user.id);
    console.log('   Username:', user.username);
    console.log('   Token:', token.substring(0, 50) + '...');
    console.log('');
    
    // Step 4: Test creating a run with the token
    console.log('4️⃣  Creating a run with the token...');
    try {
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
      
      console.log('✅ Run created successfully!');
      console.log('   Run ID:', runRes.data.id);
      console.log('   Status:', runRes.data.status);
      console.log('   Trading Pair:', runRes.data.tradingPair);
      if (runRes.data.blockchainTxHash) {
        console.log('   Blockchain TX:', runRes.data.blockchainTxHash);
      }
    } catch (runError) {
      if (runError.response) {
        console.log('⚠️  Run creation failed:', runError.response.data);
      } else {
        console.log('⚠️  Run creation error:', runError.message);
      }
    }
    
    console.log('');
    console.log('========================================');
    console.log('✅ Authentication Flow Complete!');
    console.log('========================================');
    console.log('');
    console.log('📋 Summary:');
    console.log('   Wallet:', walletAddress);
    console.log('   User ID:', user.id);
    console.log('   Token:', token);
    console.log('');
    console.log('🔑 Use this token for API calls:');
    console.log(`   Authorization: Bearer ${token}`);
    console.log('');
    
  } catch (error) {
    console.error('');
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
    process.exit(1);
  }
}

walletAuth();

