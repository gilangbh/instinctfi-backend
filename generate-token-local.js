#!/usr/bin/env node
/**
 * Manual Admin Token Generator
 * Run this locally after creating admin user in Prisma Studio
 */

const jwt = require('jsonwebtoken');

// Get JWT_SECRET from Railway
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-from-railway';

// Your admin user ID (get this from Prisma Studio after creating the user)
const ADMIN_USER_ID = process.argv[2] || 'admin_001';

// Generate token (7 days)
const token = jwt.sign(
  { userId: ADMIN_USER_ID },
  JWT_SECRET,
  { expiresIn: '7d' }
);

console.log('\n✅ Admin Token Generated:\n');
console.log(token);
console.log('\n📋 Use this in your API call:\n');
console.log(`Authorization: Bearer ${token}\n`);

