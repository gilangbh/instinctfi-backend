#!/usr/bin/env node
const { Keypair } = require('@solana/web3.js');
const bs58 = require('bs58');
require('dotenv').config();

const privateKey = process.env.SOLANA_PRIVATE_KEY;
if (!privateKey) {
  console.error('❌ SOLANA_PRIVATE_KEY not found');
  process.exit(1);
}

let keypairData;
try {
  keypairData = Uint8Array.from(JSON.parse(privateKey));
} catch {
  keypairData = bs58.decode(privateKey);
}

const keypair = Keypair.fromSecretKey(keypairData);
const secretKeyBase58 = bs58.encode(keypair.secretKey);

console.log('🔐 Wallet Export for Phantom\n');
console.log('Public Key:', keypair.publicKey.toString());
console.log('\n📱 Import Steps:');
console.log('1. Open Phantom → Menu (☰) → Add/Connect Wallet → Import Private Key');
console.log('2. Paste this private key:\n');
console.log(secretKeyBase58);
console.log('\n⚠️  Keep this key secure!');
