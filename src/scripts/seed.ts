import { PrismaClient } from '@prisma/client';
import { config } from '@/utils/config';
import logger from '@/utils/logger';

const prisma = new PrismaClient();

async function main() {
  logger.info('🌱 Starting database seeding...');

  try {
    // Create badges
    const badges = await Promise.all([
      prisma.badge.upsert({
        where: { name: 'First Steps' },
        update: {},
        create: {
          name: 'First Steps',
          emoji: '👶',
          description: 'Completed your first run',
          xpReward: 50,
        },
      }),
      prisma.badge.upsert({
        where: { name: 'Most Correct Votes' },
        update: {},
        create: {
          name: 'Most Correct Votes',
          emoji: '🎯',
          description: 'Won most prediction votes in a run',
          xpReward: 100,
        },
      }),
      prisma.badge.upsert({
        where: { name: 'Perfect Attendance' },
        update: {},
        create: {
          name: 'Perfect Attendance',
          emoji: '🗳️',
          description: 'Voted in all rounds of a run',
          xpReward: 75,
        },
      }),
      prisma.badge.upsert({
        where: { name: 'Lucky Winner' },
        update: {},
        create: {
          name: 'Lucky Winner',
          emoji: '🍀',
          description: 'Won 5 runs in a row',
          xpReward: 200,
        },
      }),
      prisma.badge.upsert({
        where: { name: 'Diamond Hands' },
        update: {},
        create: {
          name: 'Diamond Hands',
          emoji: '💎',
          description: 'Maintained 80%+ win rate over 10 runs',
          xpReward: 150,
        },
      }),
      prisma.badge.upsert({
        where: { name: 'Community Helper' },
        update: {},
        create: {
          name: 'Community Helper',
          emoji: '🤝',
          description: 'Helped 10+ users in chat',
          xpReward: 100,
        },
      }),
      prisma.badge.upsert({
        where: { name: 'Veteran Trader' },
        update: {},
        create: {
          name: 'Veteran Trader',
          emoji: '🏆',
          description: 'Completed 50+ runs',
          xpReward: 300,
        },
      }),
      prisma.badge.upsert({
        where: { name: 'Just Vibing' },
        update: {},
        create: {
          name: 'Just Vibing',
          emoji: '😎',
          description: 'Participated but neutral performance',
          xpReward: 25,
        },
      }),
    ]);

    logger.info(`✅ Created ${badges.length} badges`);

    // Create sample users
    const users = await Promise.all([
      prisma.user.upsert({
        where: { walletAddress: '7xKz...9kL2' },
        update: {},
        create: {
          walletAddress: '7xKz...9kL2',
          username: 'CryptoNinja',
          email: 'cryptoninja@example.com',
          xp: 2450,
          totalRuns: 12,
          winRate: 58.3,
        },
      }),
      prisma.user.upsert({
        where: { walletAddress: '3yHd...5mP8' },
        update: {},
        create: {
          walletAddress: '3yHd...5mP8',
          username: 'MoonTrader',
          email: 'moontrader@example.com',
          xp: 1850,
          totalRuns: 8,
          winRate: 62.5,
        },
      }),
      prisma.user.upsert({
        where: { walletAddress: '9pQw...2nK5' },
        update: {},
        create: {
          walletAddress: '9pQw...2nK5',
          username: 'DiamondHands',
          email: 'diamondhands@example.com',
          xp: 3200,
          totalRuns: 15,
          winRate: 53.3,
        },
      }),
      prisma.user.upsert({
        where: { walletAddress: '4rTy...8lM3' },
        update: {},
        create: {
          walletAddress: '4rTy...8lM3',
          username: 'SolanaKing',
          email: 'solanaking@example.com',
          xp: 1200,
          totalRuns: 5,
          winRate: 40.0,
        },
      }),
      prisma.user.upsert({
        where: { walletAddress: '6wEr...4pN9' },
        update: {},
        create: {
          walletAddress: '6wEr...4pN9',
          username: 'HODLer',
          email: 'hodler@example.com',
          xp: 980,
          totalRuns: 4,
          winRate: 75.0,
        },
      }),
    ]);

    logger.info(`✅ Created ${users.length} sample users`);

    // Award some badges to users
    await Promise.all([
      prisma.userBadge.upsert({
        where: {
          userId_badgeId: {
            userId: users[0].id,
            badgeId: badges[0].id,
          },
        },
        update: {},
        create: {
          userId: users[0].id,
          badgeId: badges[0].id,
        },
      }),
      prisma.userBadge.upsert({
        where: {
          userId_badgeId: {
            userId: users[0].id,
            badgeId: badges[1].id,
          },
        },
        update: {},
        create: {
          userId: users[0].id,
          badgeId: badges[1].id,
        },
      }),
      prisma.userBadge.upsert({
        where: {
          userId_badgeId: {
            userId: users[1].id,
            badgeId: badges[0].id,
          },
        },
        update: {},
        create: {
          userId: users[1].id,
          badgeId: badges[0].id,
        },
      }),
    ]);

    logger.info('✅ Awarded sample badges to users');

    // Create sample XP history
    await Promise.all([
      prisma.xpHistory.create({
        data: {
          userId: users[0].id,
          amount: 50,
          reason: 'First run completed',
        },
      }),
      prisma.xpHistory.create({
        data: {
          userId: users[0].id,
          amount: 25,
          reason: 'Correct vote bonus',
        },
      }),
      prisma.xpHistory.create({
        data: {
          userId: users[1].id,
          amount: 50,
          reason: 'First run completed',
        },
      }),
    ]);

    logger.info('✅ Created sample XP history');

    // Create sample runs
    const runs = await Promise.all([
      prisma.run.create({
        data: {
          status: 'WAITING',
          tradingPair: 'SOL/USDC',
          coin: 'SOL',
          duration: 120,
          votingInterval: 10,
          minDeposit: 1000, // 10 USDC in cents
          maxDeposit: 10000, // 100 USDC in cents
          maxParticipants: 100,
          totalRounds: 3,
        },
      }),
      prisma.run.create({
        data: {
          status: 'ACTIVE',
          tradingPair: 'BTC/USDC',
          coin: 'BTC',
          duration: 120,
          votingInterval: 10,
          minDeposit: 1000,
          maxDeposit: 10000,
          maxParticipants: 100,
          totalRounds: 3,
          currentRound: 2,
          startedAt: new Date(Date.now() - 30 * 60 * 1000), // 30 minutes ago
        },
      }),
      prisma.run.create({
        data: {
          status: 'ENDED',
          tradingPair: 'ETH/USDC',
          coin: 'ETH',
          duration: 120,
          votingInterval: 10,
          minDeposit: 1000,
          maxDeposit: 10000,
          maxParticipants: 100,
          totalRounds: 3,
          currentRound: 3,
          startedAt: new Date(Date.now() - 3 * 60 * 60 * 1000), // 3 hours ago
          endedAt: new Date(Date.now() - 1 * 60 * 60 * 1000), // 1 hour ago
        },
      }),
    ]);

    logger.info(`✅ Created ${runs.length} sample runs`);

    // Add participants to runs
    await Promise.all([
      prisma.runParticipant.create({
        data: {
          runId: runs[0].id,
          userId: users[0].id,
          depositAmount: 5000, // 50 USDC
        },
      }),
      prisma.runParticipant.create({
        data: {
          runId: runs[0].id,
          userId: users[1].id,
          depositAmount: 3000, // 30 USDC
        },
      }),
      prisma.runParticipant.create({
        data: {
          runId: runs[1].id,
          userId: users[0].id,
          depositAmount: 4000, // 40 USDC
        },
      }),
    ]);

    logger.info('✅ Added sample participants to runs');

    // Create sample price data
    const symbols = ['SOL', 'BTC', 'ETH', 'RAY', 'SRM', 'ORCA', 'MNGO', 'COPE', 'STEP', 'MEDIA'];
    const priceData = [];

    for (const symbol of symbols) {
      const basePrice = symbol === 'SOL' ? 150 : symbol === 'BTC' ? 45000 : symbol === 'ETH' ? 3000 : 100;
      for (let i = 0; i < 10; i++) {
        priceData.push({
          symbol,
          price: basePrice * (1 + (Math.random() - 0.5) * 0.1),
          high: basePrice * (1 + Math.random() * 0.05),
          low: basePrice * (1 - Math.random() * 0.05),
          volume: Math.random() * 1000000,
          timestamp: new Date(Date.now() - i * 60 * 1000), // Every minute
        });
      }
    }

    await prisma.priceData.createMany({
      data: priceData,
    });

    logger.info(`✅ Created ${priceData.length} price data records`);

    logger.info('🎉 Database seeding completed successfully!');
    logger.info('📊 Summary:');
    logger.info(`   - ${badges.length} badges created`);
    logger.info(`   - ${users.length} users created`);
    logger.info(`   - ${runs.length} runs created`);
    logger.info(`   - ${priceData.length} price records created`);

  } catch (error) {
    logger.error('❌ Error seeding database:', error);
    throw error;
  }
}

main()
  .catch((e) => {
    logger.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

