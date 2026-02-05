import { useState, useEffect, useCallback } from 'react';
import { cache, TTL, CACHE_KEYS } from '../cache';
import {
  getUserProfile,
  getUserStats,
  getFollowCounts,
  getUserRankingPosition,
} from '../follows';

export interface UserProfile {
  id: string;
  username: string;
  display_name: string;
  bio: string;
  profile_image_url: string;
}

export interface UserStats {
  totalFilms: number;
  totalShows: number;
  totalMinutes: number;
  rankingsCount: number;
}

export interface FollowCounts {
  followers: number;
  following: number;
}

interface UseUserDataResult {
  profile: UserProfile | null;
  stats: UserStats;
  followCounts: FollowCounts;
  rankingPosition: number | null;
  isLoading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

/**
 * Hook that fetches and caches user profile data, stats, follow counts, and ranking position.
 * Uses TTL-based caching to minimize redundant API calls.
 *
 * @param userId - The user ID to fetch data for
 * @returns User data with loading/error states and refresh function
 */
export function useUserData(userId: string | undefined): UseUserDataResult {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [stats, setStats] = useState<UserStats>({
    totalFilms: 0,
    totalShows: 0,
    totalMinutes: 0,
    rankingsCount: 0,
  });
  const [followCounts, setFollowCounts] = useState<FollowCounts>({
    followers: 0,
    following: 0,
  });
  const [rankingPosition, setRankingPosition] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(
    async (forceRefresh = false) => {
      if (!userId) {
        setIsLoading(false);
        return;
      }

      // Check cache first (unless forcing refresh)
      if (!forceRefresh) {
        const cachedProfile = cache.get<UserProfile>(CACHE_KEYS.userProfile(userId));
        const cachedStats = cache.get<UserStats>(CACHE_KEYS.userStats(userId));
        const cachedCounts = cache.get<FollowCounts>(CACHE_KEYS.followCounts(userId));
        const cachedPosition = cache.get<number | null>(CACHE_KEYS.rankingPosition(userId));

        // If all data is cached, use it
        if (
          cachedProfile !== null &&
          cachedStats !== null &&
          cachedCounts !== null &&
          cachedPosition !== undefined
        ) {
          setProfile(cachedProfile);
          setStats(cachedStats);
          setFollowCounts(cachedCounts);
          setRankingPosition(cachedPosition);
          setIsLoading(false);
          return;
        }
      }

      setIsLoading(true);
      setError(null);

      try {
        // Fetch all data in parallel, using cache where available
        const [profileData, statsData, countsData, positionData] = await Promise.all([
          cache.get<UserProfile>(CACHE_KEYS.userProfile(userId)) ??
            getUserProfile(userId),
          cache.get<UserStats>(CACHE_KEYS.userStats(userId)) ?? getUserStats(userId),
          cache.get<FollowCounts>(CACHE_KEYS.followCounts(userId)) ??
            getFollowCounts(userId),
          cache.get<number | null>(CACHE_KEYS.rankingPosition(userId)) ??
            getUserRankingPosition(userId),
        ]);

        // Update cache with fresh data
        if (profileData) {
          cache.set(CACHE_KEYS.userProfile(userId), profileData, TTL.LONG);
          setProfile(profileData as UserProfile);
        }

        cache.set(CACHE_KEYS.userStats(userId), statsData, TTL.LONG);
        setStats(statsData);

        cache.set(CACHE_KEYS.followCounts(userId), countsData, TTL.MEDIUM);
        setFollowCounts(countsData);

        cache.set(CACHE_KEYS.rankingPosition(userId), positionData, TTL.VERY_LONG);
        setRankingPosition(positionData);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch user data'));
      } finally {
        setIsLoading(false);
      }
    },
    [userId]
  );

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const refresh = useCallback(() => fetchData(true), [fetchData]);

  return {
    profile,
    stats,
    followCounts,
    rankingPosition,
    isLoading,
    error,
    refresh,
  };
}

/**
 * Hook that fetches and caches only follow counts for a user.
 * Lighter weight than useUserData when you only need follow counts.
 */
export function useFollowCounts(userId: string | undefined): {
  counts: FollowCounts;
  isLoading: boolean;
  refresh: () => Promise<void>;
} {
  const [counts, setCounts] = useState<FollowCounts>({ followers: 0, following: 0 });
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = useCallback(
    async (forceRefresh = false) => {
      if (!userId) {
        setIsLoading(false);
        return;
      }

      if (!forceRefresh) {
        const cached = cache.get<FollowCounts>(CACHE_KEYS.followCounts(userId));
        if (cached) {
          setCounts(cached);
          setIsLoading(false);
          return;
        }
      }

      setIsLoading(true);
      const data = await getFollowCounts(userId);
      cache.set(CACHE_KEYS.followCounts(userId), data, TTL.MEDIUM);
      setCounts(data);
      setIsLoading(false);
    },
    [userId]
  );

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { counts, isLoading, refresh: () => fetchData(true) };
}
