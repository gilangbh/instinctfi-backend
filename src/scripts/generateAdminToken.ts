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
  // Check DATABASE_URL - Railway provides both DATABASE_URL (internal) and DATABASE_PRIVATE_URL (public)
  // Prefer DATABASE_PRIVATE_URL for external connections, fallback to DATABASE_URL
  let dbUrl = process.env.DATABASE_PRIVATE_URL || process.env.DATABASE_URL;
  
  if (!dbUrl) {
    console.error('❌ Error: DATABASE_URL or DATABASE_PRIVATE_URL environment variable is not set!\n');
    console.log('📝 To fix this:\n');
    console.log('1. Make sure you\'re running this via Railway:');
    console.log('   railway run -- npm run admin:token\n');
    console.log('2. Verify Railway project is linked:');
    console.log('   railway link\n');
    console.log('3. Check Railway variables are set:');
    console.log('   railway variables\n');
    console.log('4. Or set DATABASE_URL manually:');
    console.log('   DATABASE_URL="postgresql://..." npm run admin:token\n');
    process.exit(1);
  }

  // Check if DATABASE_URL uses internal Railway hostname (not accessible from local machine)
  const usesInternalHostname = dbUrl.includes('postgres.railway.internal') || dbUrl.includes('railway.internal');
  
  if (usesInternalHostname && !process.env.DATABASE_PRIVATE_URL) {
    console.error('⚠️  Warning: DATABASE_URL uses Railway internal hostname which is not accessible from your local machine.\n');
    console.log('📝 To fix this, set DATABASE_PRIVATE_URL in Railway Dashboard:\n');
    console.log('1. Go to: https://railway.app/\n');
    console.log('2. Select your project → PostgreSQL service\n');
    console.log('3. Go to "Variables" tab\n');
    console.log('4. Find "DATABASE_PRIVATE_URL" or add it with value: ${{Postgres.DATABASE_PRIVATE_URL}}\n');
    console.log('5. Or copy the "Connection URL" (public URL) from PostgreSQL service\n');
    console.log('6. Add it as DATABASE_PRIVATE_URL in your backend service variables\n');
    console.log('7. Then run this script again\n');
    process.exit(1);
  }

  // Mask sensitive parts of DATABASE_URL for logging
  const maskedUrl = dbUrl.replace(/:([^:@]+)@/, ':****@').replace(/@([^:]+):/, '@****:');
  const urlType = process.env.DATABASE_PRIVATE_URL ? 'DATABASE_PRIVATE_URL (public)' : 'DATABASE_URL';
  console.log(`🔗 Connecting to database using ${urlType}: ${maskedUrl}\n`);

  // Create PrismaClient with explicit DATABASE_URL if using DATABASE_PRIVATE_URL
  // Otherwise, PrismaClient will use process.env.DATABASE_URL by default
  const prisma = process.env.DATABASE_PRIVATE_URL 
    ? new PrismaClient({ datasources: { db: { url: dbUrl } } })
    : new PrismaClient();
  
  const userService = new UserService(prisma);

  try {

    // Test database connection first
    console.log('🔍 Testing database connection...');
    try {
      await prisma.$connect();
      console.log('✅ Database connection successful!\n');
    } catch (connectError: any) {
      console.error('❌ Failed to connect to database!\n');
      console.error('Error details:', connectError.message);
      
      if (connectError.message?.includes('Can\'t reach database server')) {
        console.log('\n📝 Troubleshooting steps:\n');
        console.log('1. If DATABASE_URL uses internal hostname (postgres.railway.internal),');
        console.log('   you need to use DATABASE_PRIVATE_URL instead (public URL).\n');
        console.log('2. Set DATABASE_PRIVATE_URL in Railway:');
        console.log('   - Go to Railway Dashboard → Your Project → PostgreSQL Service');
        console.log('   - Copy the "Connection URL" (public/external URL)');
        console.log('   - Go to Backend Service → Variables');
        console.log('   - Add: DATABASE_PRIVATE_URL=${{Postgres.DATABASE_PRIVATE_URL}}\n');
        console.log('3. Or verify DATABASE_URL is set correctly:');
        console.log('   railway variables\n');
        console.log('4. Check if PostgreSQL service is running in Railway dashboard\n');
        console.log('5. Try connecting via Prisma Studio first:');
        console.log('   railway run -- npx prisma studio\n');
      }
      
      await prisma.$disconnect();
      process.exit(1);
    }

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













