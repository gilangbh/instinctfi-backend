-- CreateEnum
CREATE TYPE "ItemType" AS ENUM ('PASSIVE', 'ACTIVE', 'ECONOMY', 'OFFENSIVE', 'DEFENSIVE');

-- CreateEnum
CREATE TYPE "BuffType" AS ENUM ('XP_BOOST', 'FEE_REDUCTION', 'PROFIT_BOOST', 'VOTE_ACCURACY', 'LEVERAGE_BOOST', 'POSITION_SIZE', 'WIN_RATE_BOOST', 'DEPOSIT_BONUS', 'WITHDRAWAL_SPEED', 'COOLDOWN_REDUCTION');

-- CreateTable
CREATE TABLE "items" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "type" "ItemType" NOT NULL,
    "icon" TEXT NOT NULL,
    "rarity" TEXT NOT NULL DEFAULT 'COMMON',
    "buffType" "BuffType" NOT NULL,
    "buffValue" DOUBLE PRECISION NOT NULL,
    "unlockLevel" INTEGER NOT NULL DEFAULT 1,
    "unlockXp" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_loadout" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "slot" INTEGER,
    "equippedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_loadout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "items_name_key" ON "items"("name");

-- CreateIndex
CREATE UNIQUE INDEX "user_loadout_userId_itemId_key" ON "user_loadout"("userId", "itemId");

-- CreateIndex
CREATE INDEX "user_loadout_userId_isActive_idx" ON "user_loadout"("userId", "isActive");

-- AddForeignKey
ALTER TABLE "user_loadout" ADD CONSTRAINT "user_loadout_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_loadout" ADD CONSTRAINT "user_loadout_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

