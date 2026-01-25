import { useState, useEffect, useCallback } from 'react';
import { cache, TTL, CACHE_KEYS } from '../cache';
import { getFollowingIds } from '../follows';
import { getFeedActivities } from '../activity';
import { Activity } from '@/types';

interface UseFeedResult {
  activities: Activity[];
  isLoading: boolean;
  isRefreshing: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
  hasMore: boolean;
}

const PAGE_SIZE = 50;

/**
 * Hook that fetches and caches feed activities with pagination support.
 * Caches following IDs separately (longer TTL) from feed activities (shorter TTL).
 *
 * @param userId - The current user's ID
 * @returns Feed data with loading states and pagination functions
 */
export function useFeed(userId: string | undefined): UseFeedResult {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);

  /**
   * Get following IDs with caching
   */
  const getCachedFollowingIds = useCallback(async (): Promise<string[]> => {
    if (!userId) return [];

    // Check cache first
    const cached = cache.get<string[]>(CACHE_KEYS.followingIds(userId));
    if (cached) {
      return cached;
    }

    // Fetch and cache
    const ids = await getFollowingIds(userId);
    cache.set(CACHE_KEYS.followingIds(userId), ids, TTL.MEDIUM);
    return ids;
  }, [userId]);

  /**
   * Fetch feed activities with mounted state tracking
   */
  const fetchFeed = useCallback(
    async (forceRefresh = false, loadingMore = false, isMounted = { current: true }) => {
      if (!userId) {
        setIsLoading(false);
        return;
      }

      // For initial load, check cache
      if (!forceRefresh && !loadingMore) {
        const cached = cache.get<Activity[]>(CACHE_KEYS.feed(userId));
        if (cached) {
          if (isMounted.current) {
            setActivities(cached);
            setIsLoading(false);
            setHasMore(cached.length >= PAGE_SIZE);
          }
          return;
        }
      }

      if (loadingMore) {
        // Don't show loading state for pagination
      } else if (forceRefresh) {
        if (isMounted.current) setIsRefreshing(true);
      } else {
        if (isMounted.current) setIsLoading(true);
      }

      if (isMounted.current) setError(null);

      try {
        // Get following IDs (cached)
        const followingIds = await getCachedFollowingIds();
        // Include self in feed
        const feedUserIds = [...followingIds, userId];

        const currentOffset = loadingMore ? offset : 0;
        const newActivities = await getFeedActivities(
          userId,
          feedUserIds,
          PAGE_SIZE,
          currentOffset
        );

        // Only update state if still mounted
        if (isMounted.current) {
          if (loadingMore) {
            setActivities((prev) => [...prev, ...newActivities]);
            setOffset(currentOffset + PAGE_SIZE);
          } else {
            setActivities(newActivities);
            setOffset(PAGE_SIZE);
            // Cache the initial feed
            cache.set(CACHE_KEYS.feed(userId), newActivities, TTL.SHORT);
          }

          setHasMore(newActivities.length >= PAGE_SIZE);
        }
      } catch (err) {
        if (isMounted.current) {
          setError(err instanceof Error ? err : new Error('Failed to load feed'));
        }
      } finally {
        if (isMounted.current) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    },
    [userId, offset, getCachedFollowingIds]
  );

  // Initial fetch with cleanup
  useEffect(() => {
    const isMounted = { current: true };
    fetchFeed(false, false, isMounted);
    return () => {
      isMounted.current = false;
    };
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = useCallback(() => {
    setOffset(0);
    return fetchFeed(true, false);
  }, [fetchFeed]);

  const loadMore = useCallback(() => {
    if (!hasMore || isLoading || isRefreshing) return Promise.resolve();
    return fetchFeed(false, true);
  }, [fetchFeed, hasMore, isLoading, isRefreshing]);

  return {
    activities,
    isLoading,
    isRefreshing,
    error,
    refresh,
    loadMore,
    hasMore,
  };
}

/**
 * Hook that returns cached following IDs.
 * Useful when you need following IDs without the full feed.
 */
export function useFollowingIds(userId: string | undefined): {
  followingIds: string[];
  isLoading: boolean;
  refresh: () => Promise<void>;
} {
  const [followingIds, setFollowingIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = useCallback(
    async (forceRefresh = false) => {
      if (!userId) {
        setIsLoading(false);
        return;
      }

      if (!forceRefresh) {
        const cached = cache.get<string[]>(CACHE_KEYS.followingIds(userId));
        if (cached) {
          setFollowingIds(cached);
          setIsLoading(false);
          return;
        }
      }

      setIsLoading(true);
      const ids = await getFollowingIds(userId);
      cache.set(CACHE_KEYS.followingIds(userId), ids, TTL.MEDIUM);
      setFollowingIds(ids);
      setIsLoading(false);
    },
    [userId]
  );

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    followingIds,
    isLoading,
    refresh: () => fetchData(true),
  };
}
