import { createContext, useContext, useCallback, ReactNode } from 'react';
import { cache, CACHE_KEYS } from './cache';

/**
 * Events that trigger cache invalidation
 */
export type InvalidationEvent =
  | 'follow'
  | 'unfollow'
  | 'ranking_create'
  | 'ranking_delete'
  | 'ranking_reorder'
  | 'activity_create'
  | 'activity_delete'
  | 'profile_update'
  | 'bookmark_change';

interface CacheContextType {
  /**
   * Invalidate caches based on a mutation event
   * @param event The type of mutation that occurred
   * @param userId Optional user ID for targeted invalidation
   */
  invalidate: (event: InvalidationEvent, userId?: string) => void;

  /**
   * Clear all cached data (use on logout)
   */
  clearAll: () => void;

  /**
   * Invalidate a specific cache key
   */
  invalidateKey: (key: string) => void;
}

const CacheContext = createContext<CacheContextType | null>(null);

export function CacheProvider({ children }: { children: ReactNode }) {
  const invalidate = useCallback((event: InvalidationEvent, userId?: string) => {
    switch (event) {
      case 'follow':
      case 'unfollow':
        // Invalidate follow-related caches
        if (userId) {
          cache.invalidate(CACHE_KEYS.followingIds(userId));
          cache.invalidate(CACHE_KEYS.followCounts(userId));
        }
        // Also invalidate all following/counts since other users' counts may change
        cache.invalidate(CACHE_KEYS.patterns.allFollowing);
        cache.invalidate(CACHE_KEYS.patterns.allFollowCounts);
        // Feed depends on who you follow
        cache.invalidate(CACHE_KEYS.patterns.allFeeds);
        break;

      case 'ranking_create':
      case 'ranking_delete':
        // Rankings changed - invalidate rankings, stats, positions, and feed
        cache.invalidate(CACHE_KEYS.patterns.allRankings);
        cache.invalidate(CACHE_KEYS.patterns.allUserStats);
        cache.invalidate(CACHE_KEYS.patterns.allRankingPositions);
        cache.invalidate(CACHE_KEYS.patterns.allFeeds);
        break;

      case 'ranking_reorder':
        // Only ranking order changed, not stats
        cache.invalidate(CACHE_KEYS.patterns.allRankings);
        break;

      case 'activity_create':
        // New activity - invalidate feeds and stats
        cache.invalidate(CACHE_KEYS.patterns.allFeeds);
        cache.invalidate(CACHE_KEYS.patterns.allUserStats);
        break;

      case 'activity_delete':
        // Activity deleted - invalidate feeds and stats
        cache.invalidate(CACHE_KEYS.patterns.allFeeds);
        cache.invalidate(CACHE_KEYS.patterns.allUserStats);
        break;

      case 'profile_update':
        // Profile updated - only invalidate that user's profile
        if (userId) {
          cache.invalidate(CACHE_KEYS.userProfile(userId));
        }
        break;

      case 'bookmark_change':
        // Bookmark added/removed - invalidate bookmark counts
        if (userId) {
          cache.invalidate(CACHE_KEYS.bookmarksCount(userId));
        }
        break;
    }
  }, []);

  const clearAll = useCallback(() => {
    cache.clear();
  }, []);

  const invalidateKey = useCallback((key: string) => {
    cache.invalidate(key);
  }, []);

  return (
    <CacheContext.Provider value={{ invalidate, clearAll, invalidateKey }}>
      {children}
    </CacheContext.Provider>
  );
}

/**
 * Hook to access cache invalidation functions
 * Must be used within CacheProvider
 */
export function useCache() {
  const context = useContext(CacheContext);
  if (!context) {
    throw new Error('useCache must be used within CacheProvider');
  }
  return context;
}

/**
 * Optional hook that won't throw if used outside provider
 * Returns null if not in provider context
 */
export function useCacheOptional(): CacheContextType | null {
  return useContext(CacheContext);
}
