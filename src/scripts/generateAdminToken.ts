#!/usr/bin/env tsx
/**
 * Generate Admin Token Script
 * 
 * This script finds an admin user (username="admin" OR walletAddress="admin")
 * and generates a JWT token for API authentication.
 * 
 * Usage:
 *   npm run admin:token
 *   OR
 *   railway run -- tsx src/scripts/generateAdminToken.ts
 */

import { PrismaClient } from '@prisma/client';
import { UserService } from '@/services/UserService';
import logger from '@/utils/logger';

async function main() {
  const prisma = new PrismaClient();
  const userService = new UserService(prisma);

  try {
    console.log('🔍 Looking for admin user...\n');

    // Find admin user
    const adminUser = await prisma.user.findFirst({
      where: {
        OR: [
          { username: 'admin' },
          { walletAddress: 'admin' },
        ],
      },
    });

    if (!adminUser) {
      console.error('❌ No admin user found!\n');
      console.log('📝 To create an admin user:\n');
      console.log('Option 1: Login via frontend with username "admin"');
      console.log('Option 2: Create manually in database:');
      console.log('\n  railway run -- npx prisma studio');
      console.log('  Then add a user with username="admin"\n');
      process.exit(1);
    }

    // Generate token
    const token = await userService.generateAuthToken(adminUser.id);

    console.log('✅ Admin user found:\n');
    console.log(`   ID:       ${adminUser.id}`);
    console.log(`   Username: ${adminUser.username}`);
    console.log(`   Wallet:   ${adminUser.walletAddress}`);
    console.log(`   XP:       ${adminUser.xp}`);
    console.log(`   Created:  ${adminUser.createdAt.toISOString()}`);
    
    console.log('\n🔑 Admin Token (7 days validity):\n');
    console.log(token);
    
    console.log('\n📋 Copy this command to create a run:\n');
    console.log('curl -X POST https://YOUR_RAILWAY_URL/api/v1/runs \\');
    console.log(`  -H "Authorization: Bearer ${token}" \\`);
    console.log('  -H "Content-Type: application/json" \\');
    console.log('  -d \'{"tradingPair":"SOL/USD","coin":"SOL","duration":120,"votingInterval":10,"minDeposit":10,"maxDeposit":100,"maxParticipants":100}\'');
    console.log('\n✅ Token generated successfully!\n');

    await prisma.$disconnect();
    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

main();










