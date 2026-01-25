/**
 * TTL-based in-memory cache for reducing redundant API calls
 */

type CacheEntry<T> = {
  data: T;
  timestamp: number;
  ttl: number;
};

class Cache {
  private store = new Map<string, CacheEntry<unknown>>();

  /**
   * Get cached data if it exists and hasn't expired
   */
  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;

    // Check if expired
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.store.delete(key);
      return null;
    }

    return entry.data as T;
  }

  /**
   * Store data with a TTL (time-to-live) in milliseconds
   */
  set<T>(key: string, data: T, ttlMs: number): void {
    this.store.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttlMs,
    });
  }

  /**
   * Check if a key exists and is not expired
   */
  has(key: string): boolean {
    return this.get(key) !== null;
  }

  /**
   * Invalidate cache entries matching a pattern
   * Supports exact keys or wildcard patterns ending with '*'
   * Example: 'user:*' matches 'user:123', 'user:456', etc.
   */
  invalidate(keyPattern: string): void {
    if (keyPattern.endsWith('*')) {
      const prefix = keyPattern.slice(0, -1);
      for (const key of this.store.keys()) {
        if (key.startsWith(prefix)) {
          this.store.delete(key);
        }
      }
    } else {
      this.store.delete(keyPattern);
    }
  }

  /**
   * Clear all cached data
   */
  clear(): void {
    this.store.clear();
  }

  /**
   * Get cache statistics for debugging
   */
  getStats(): { size: number; keys: string[] } {
    return {
      size: this.store.size,
      keys: Array.from(this.store.keys()),
    };
  }
}

// Singleton cache instance
export const cache = new Cache();

// TTL constants (in milliseconds)
export const TTL = {
  INSTANT: 30 * 1000,        // 30 sec - notifications count
  SHORT: 3 * 60 * 1000,      // 3 min - feed activities
  MEDIUM: 10 * 60 * 1000,    // 10 min - following IDs, follow counts
  LONG: 30 * 60 * 1000,      // 30 min - user stats, profile data
  VERY_LONG: 60 * 60 * 1000, // 1 hour - ranking position (expensive to compute)
} as const;

// Cache key generators - ensures consistent key format
export const CACHE_KEYS = {
  // User-specific keys
  followingIds: (userId: string) => `following:${userId}`,
  followCounts: (userId: string) => `followCounts:${userId}`,
  userStats: (userId: string) => `userStats:${userId}`,
  userProfile: (userId: string) => `userProfile:${userId}`,
  rankingPosition: (userId: string) => `rankingPos:${userId}`,

  // Content-specific keys
  feed: (userId: string) => `feed:${userId}`,
  rankings: (userId: string, contentType: string) => `rankings:${userId}:${contentType}`,
  bookmarksCount: (userId: string) => `bookmarksCount:${userId}`,
  currentlyWatchingCount: (userId: string) => `watchingCount:${userId}`,

  // Global patterns for invalidation
  patterns: {
    allFollowing: 'following:*',
    allFollowCounts: 'followCounts:*',
    allUserStats: 'userStats:*',
    allRankings: 'rankings:*',
    allRankingPositions: 'rankingPos:*',
    allFeeds: 'feed:*',
  },
} as const;
