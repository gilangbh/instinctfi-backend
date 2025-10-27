/**
 * XP (Experience Points) system utilities for Instinct.fi
 * Handles XP calculation, badge awarding, and progression tracking
 */

import { XpHistory } from '@/types';

export interface XpReward {
  amount: number;
  reason: string;
  runId?: string;
}

export interface BadgeCriteria {
  name: string;
  emoji: string;
  description: string;
  xpReward: number;
  condition: (userStats: UserStats) => boolean;
}

export interface UserStats {
  totalRuns: number;
  winRate: number;
  totalVotes: number;
  correctVotes: number;
  consecutiveWins: number;
  consecutiveParticipation: number;
  totalXp: number;
}

// XP reward amounts
export const XP_REWARDS = {
  VOTE_PARTICIPATION: 10,
  CORRECT_VOTE: 25,
  CONSECUTIVE_PARTICIPATION: 50,
  RUN_WIN: 100,
  PERFECT_RUN: 200,
  FIRST_RUN: 50,
  HIGH_WIN_RATE: 75,
  COMMUNITY_HELPER: 30,
  CHAT_ACTIVE: 5,
} as const;

// Badge definitions
export const BADGE_CRITERIA: BadgeCriteria[] = [
  {
    name: 'First Steps',
    emoji: '👶',
    description: 'Completed your first run',
    xpReward: 50,
    condition: (stats) => stats.totalRuns >= 1,
  },
  {
    name: 'Most Correct Votes',
    emoji: '🎯',
    description: 'Won most prediction votes in a run',
    xpReward: 100,
    condition: (stats) => stats.correctVotes / Math.max(stats.totalVotes, 1) >= 0.8,
  },
  {
    name: 'Perfect Attendance',
    emoji: '🗳️',
    description: 'Voted in all rounds of a run',
    xpReward: 75,
    condition: (stats) => stats.consecutiveParticipation >= 12,
  },
  {
    name: 'Lucky Winner',
    emoji: '🍀',
    description: 'Won 5 runs in a row',
    xpReward: 200,
    condition: (stats) => stats.consecutiveWins >= 5,
  },
  {
    name: 'Diamond Hands',
    emoji: '💎',
    description: 'Maintained 80%+ win rate over 10 runs',
    xpReward: 150,
    condition: (stats) => stats.totalRuns >= 10 && stats.winRate >= 80,
  },
  {
    name: 'Community Helper',
    emoji: '🤝',
    description: 'Helped 10+ users in chat',
    xpReward: 100,
    condition: (stats) => stats.totalXp >= 1000, // Placeholder for chat activity
  },
  {
    name: 'Veteran Trader',
    emoji: '🏆',
    description: 'Completed 50+ runs',
    xpReward: 300,
    condition: (stats) => stats.totalRuns >= 50,
  },
  {
    name: 'Just Vibing',
    emoji: '😎',
    description: 'Participated but neutral performance',
    xpReward: 25,
    condition: (stats) => stats.totalRuns >= 5 && stats.winRate >= 40 && stats.winRate <= 60,
  },
];

/**
 * Calculate XP reward for voting participation
 * @param isCorrect - Whether the vote was correct
 * @param isConsecutive - Whether this is consecutive participation
 * @returns XP reward amount
 */
export const calculateVoteXp = (isCorrect: boolean, isConsecutive: boolean = false): number => {
  let xp = XP_REWARDS.VOTE_PARTICIPATION;
  
  if (isCorrect) {
    xp += XP_REWARDS.CORRECT_VOTE;
  }
  
  if (isConsecutive) {
    xp += XP_REWARDS.CONSECUTIVE_PARTICIPATION;
  }
  
  return xp;
};

/**
 * Calculate XP reward for run completion
 * @param isWinner - Whether the user won the run
 * @param isPerfect - Whether the user had perfect participation
 * @param isFirstRun - Whether this is the user's first run
 * @returns XP reward amount
 */
export const calculateRunXp = (
  isWinner: boolean,
  isPerfect: boolean = false,
  isFirstRun: boolean = false
): number => {
  let xp = 0;
  
  if (isFirstRun) {
    xp += XP_REWARDS.FIRST_RUN;
  }
  
  if (isWinner) {
    xp += XP_REWARDS.RUN_WIN;
  }
  
  if (isPerfect) {
    xp += XP_REWARDS.PERFECT_RUN;
  }
  
  return xp;
};

/**
 * Calculate XP reward for chat activity
 * @param messageCount - Number of messages sent
 * @returns XP reward amount
 */
export const calculateChatXp = (messageCount: number): number => {
  return Math.min(messageCount * XP_REWARDS.CHAT_ACTIVE, 50); // Cap at 50 XP
};

/**
 * Check if user qualifies for any new badges
 * @param userStats - User's current statistics
 * @param currentBadges - Array of badge IDs the user already has
 * @returns Array of new badges the user qualifies for
 */
export const checkNewBadges = (
  userStats: UserStats,
  currentBadges: string[]
): BadgeCriteria[] => {
  return BADGE_CRITERIA.filter(badge => {
    // Check if user already has this badge
    const hasBadge = currentBadges.some(badgeId => 
      BADGE_CRITERIA.find(b => b.name === badgeId)?.name === badge.name
    );
    
    // Check if user meets criteria
    const meetsCriteria = badge.condition(userStats);
    
    return !hasBadge && meetsCriteria;
  });
};

/**
 * Calculate total XP from multiple rewards
 * @param rewards - Array of XP rewards
 * @returns Total XP amount
 */
export const calculateTotalXp = (rewards: XpReward[]): number => {
  return rewards.reduce((total, reward) => total + reward.amount, 0);
};

/**
 * Get XP level based on total XP
 * @param totalXp - User's total XP
 * @returns XP level
 */
export const getXpLevel = (totalXp: number): number => {
  // Level formula: level = floor(sqrt(xp / 100))
  return Math.floor(Math.sqrt(totalXp / 100));
};

/**
 * Get XP required for next level
 * @param currentLevel - Current XP level
 * @returns XP required for next level
 */
export const getXpForNextLevel = (currentLevel: number): number => {
  const nextLevel = currentLevel + 1;
  return Math.pow(nextLevel, 2) * 100;
};

/**
 * Get XP progress to next level
 * @param currentXp - Current total XP
 * @param currentLevel - Current XP level
 * @returns Progress percentage (0-100)
 */
export const getXpProgress = (currentXp: number, currentLevel: number): number => {
  const currentLevelXp = Math.pow(currentLevel, 2) * 100;
  const nextLevelXp = getXpForNextLevel(currentLevel);
  const progress = ((currentXp - currentLevelXp) / (nextLevelXp - currentLevelXp)) * 100;
  return Math.min(Math.max(progress, 0), 100);
};

/**
 * Get level title based on XP level
 * @param level - XP level
 * @returns Level title
 */
export const getLevelTitle = (level: number): string => {
  const titles = [
    'Newcomer',      // 0-4
    'Learner',       // 5-9
    'Trader',        // 10-19
    'Expert',        // 20-29
    'Master',        // 30-49
    'Legend',        // 50-99
    'Mythic',        // 100+
  ];
  
  if (level < 5) return titles[0];
  if (level < 10) return titles[1];
  if (level < 20) return titles[2];
  if (level < 30) return titles[3];
  if (level < 50) return titles[4];
  if (level < 100) return titles[5];
  return titles[6];
};

/**
 * Get level emoji based on XP level
 * @param level - XP level
 * @returns Level emoji
 */
export const getLevelEmoji = (level: number): string => {
  const emojis = ['🌱', '📚', '💼', '🎓', '👑', '🏆', '⭐'];
  
  if (level < 5) return emojis[0];
  if (level < 10) return emojis[1];
  if (level < 20) return emojis[2];
  if (level < 30) return emojis[3];
  if (level < 50) return emojis[4];
  if (level < 100) return emojis[5];
  return emojis[6];
};

/**
 * Format XP amount for display
 * @param xp - XP amount
 * @returns Formatted XP string
 */
export const formatXp = (xp: number): string => {
  if (xp >= 1000000) {
    return `${(xp / 1000000).toFixed(1)}M XP`;
  }
  if (xp >= 1000) {
    return `${(xp / 1000).toFixed(1)}K XP`;
  }
  return `${xp} XP`;
};

/**
 * Create XP history entry
 * @param userId - User ID
 * @param amount - XP amount
 * @param reason - Reason for XP reward
 * @param runId - Optional run ID
 * @returns XP history entry
 */
export const createXpHistoryEntry = (
  userId: string,
  amount: number,
  reason: string,
  runId?: string
): Omit<XpHistory, 'id' | 'createdAt'> => {
  return {
    userId,
    amount,
    reason,
    runId,
  };
};

