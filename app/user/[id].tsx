import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Image } from 'expo-image';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Fonts, FontSizes, Spacing, BorderRadius } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { StarDisplay } from '@/components/ui/star-display';
import { ProfileAvatar } from '@/components/profile-avatar';
import { ProfileListRow } from '@/components/profile-list-row';
import { useAuth } from '@/lib/auth-context';
import { useCache } from '@/lib/cache-context';
import { supabase } from '@/lib/supabase';
import {
  getUserProfile,
  getUserStats,
  getFollowCounts,
  checkIfFollowing,
  followUser,
  unfollowUser,
  getUserRankingPosition,
} from '@/lib/follows';
import { getUserActivities, isActivityInProgress } from '@/lib/activity';
import { User, Activity } from '@/types';

interface UserStats {
  totalFilms: number;
  totalShows: number;
  totalMinutes: number;
  rankingsCount: number;
}

export default function UserProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user: currentUser } = useAuth();
  const params = useLocalSearchParams<{ id: string }>();
  const { invalidate } = useCache();

  // Validate userId param - could be undefined or array
  const userId = typeof params.id === 'string' ? params.id : undefined;

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [profileData, setProfileData] = useState<Pick<
    User,
    'id' | 'username' | 'display_name' | 'bio' | 'profile_image_url'
  > | null>(null);
  const [stats, setStats] = useState<UserStats>({
    totalFilms: 0,
    totalShows: 0,
    totalMinutes: 0,
    rankingsCount: 0,
  });
  const [followCounts, setFollowCounts] = useState({ followers: 0, following: 0 });
  const [recentActivities, setRecentActivities] = useState<Activity[]>([]);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isFollowLoading, setIsFollowLoading] = useState(false);
  const [rankingPosition, setRankingPosition] = useState<number | null>(null);
  const [watchlistCount, setWatchlistCount] = useState(0);
  const [currentlyWatchingCount, setCurrentlyWatchingCount] = useState(0);

  const isOwnProfile = currentUser?.id === userId;

  const loadUserData = useCallback(async () => {
    if (!userId || !currentUser) return;

    try {
      const [profile, userStats, counts, followingStatus, position] =
        await Promise.all([
          getUserProfile(userId),
          getUserStats(userId),
          getFollowCounts(userId),
          checkIfFollowing(currentUser.id, userId),
          getUserRankingPosition(userId),
        ]);

      if (profile) {
        setProfileData(profile);
      }
      setStats(userStats);
      setFollowCounts(counts);
      setIsFollowing(followingStatus);
      setRankingPosition(position);

      // Load watchlist count
      const { count: wlCount } = await supabase
        .from('bookmarks')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId);
      setWatchlistCount(wlCount || 0);

      // Load recent activities (completed)
      const { data: activityData } = await supabase
        .from('activity_log')
        .select(`*, content (*)`)
        .eq('user_id', userId)
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(6);

      if (activityData) {
        const activitiesWithContent = activityData.filter(
          (item: Activity) => item.content
        ) as Activity[];
        setRecentActivities(activitiesWithContent);
      }

      // Load currently watching count
      const inProgressActivities = await getUserActivities(userId, 'in_progress');
      const uniqueContent = new Map<number, Activity>();
      for (const activity of inProgressActivities) {
        if (!uniqueContent.has(activity.content_id)) {
          uniqueContent.set(activity.content_id, activity);
        }
      }
      const activeInProgress = Array.from(uniqueContent.values()).filter(isActivityInProgress);
      setCurrentlyWatchingCount(activeInProgress.length);
    } catch (error) {
      console.error('Error loading user data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [userId, currentUser]);

  useEffect(() => {
    loadUserData();
  }, [loadUserData]);

  const onRefresh = async () => {
    setIsRefreshing(true);
    await loadUserData();
    setIsRefreshing(false);
  };

  const handleFollowPress = async () => {
    // Check loading state FIRST, before any state updates
    if (!currentUser || !userId || isFollowLoading) return;

    // Capture current state before any updates
    const wasFollowing = isFollowing;

    // Set loading state immediately to prevent rapid clicks
    setIsFollowLoading(true);

    // Optimistic update
    setIsFollowing(!wasFollowing);
    setFollowCounts((prev) => ({
      ...prev,
      followers: wasFollowing ? prev.followers - 1 : prev.followers + 1,
    }));

    try {
      const success = wasFollowing
        ? await unfollowUser(currentUser.id, userId)
        : await followUser(currentUser.id, userId);

      if (success) {
        // Invalidate caches on successful follow/unfollow
        invalidate(wasFollowing ? 'unfollow' : 'follow', currentUser.id);
      } else {
        // Revert on failure
        setIsFollowing(wasFollowing);
        setFollowCounts((prev) => ({
          ...prev,
          followers: wasFollowing ? prev.followers + 1 : prev.followers - 1,
        }));
      }
    } catch (error) {
      // Revert on error
      setIsFollowing(wasFollowing);
      setFollowCounts((prev) => ({
        ...prev,
        followers: wasFollowing ? prev.followers + 1 : prev.followers - 1,
      }));
    } finally {
      setIsFollowLoading(false);
    }
  };

  const formatWatchTime = (minutes: number) => {
    const days = Math.floor(minutes / (24 * 60));
    const hours = Math.floor((minutes % (24 * 60)) / 60);
    if (days > 0) {
      return `${days}d ${hours}h`;
    }
    return `${hours}h`;
  };

  const handleBack = () => {
    router.back();
  };

  // Redirect to own profile tab if viewing own profile
  useEffect(() => {
    if (isOwnProfile) {
      router.replace('/(tabs)/profile');
    }
  }, [isOwnProfile, router]);

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (!profileData) {
    return (
      <View style={[styles.container, styles.errorContainer]}>
        <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
          <Pressable style={styles.backButton} onPress={handleBack}>
            <IconSymbol name="chevron.left" size={20} color={Colors.text} />
          </Pressable>
          <View style={styles.headerSpacer} />
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.errorContent}>
          <Text style={styles.errorText}>User not found</Text>
          <Pressable style={styles.goBackButton} onPress={handleBack}>
            <Text style={styles.goBackButtonText}>Go back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
        <Pressable style={styles.backButton} onPress={handleBack}>
          <IconSymbol name="chevron.left" size={20} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Profile</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor={Colors.stamp}
            colors={[Colors.stamp]}
          />
        }
      >
        {/* Profile Section - Horizontal Layout */}
        <View style={styles.profileSection}>
          {/* Left: Poster + @username */}
          <View style={styles.avatarWrapper}>
            <ProfileAvatar
              imageUrl={profileData.profile_image_url}
              username={profileData.username}
              size="large"
              variant="poster"
            />
            <Text style={styles.usernameUnderAvatar}>@{profileData.username}</Text>
          </View>

          {/* Right: Display Name, Bio, Follow Stats, Follow Button */}
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>
              {profileData.display_name || profileData.username}
            </Text>
            <Text style={styles.profileBio}>
              {profileData.bio || 'Film Enthusiast'}
            </Text>
            <View style={styles.followStats}>
              <Pressable
                style={({ pressed }) => [
                  styles.followStat,
                  pressed && styles.followStatPressed,
                ]}
                onPress={() =>
                  router.push({
                    pathname: '/follow-list',
                    params: { type: 'following', userId },
                  })
                }
              >
                <Text style={styles.followNumber}>{followCounts.following}</Text>
                <Text style={styles.followLabel}>Following</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.followStat,
                  pressed && styles.followStatPressed,
                ]}
                onPress={() =>
                  router.push({
                    pathname: '/follow-list',
                    params: { type: 'followers', userId },
                  })
                }
              >
                <Text style={styles.followNumber}>{followCounts.followers}</Text>
                <Text style={styles.followLabel}>Followers</Text>
              </Pressable>
            </View>

            {/* Follow Button */}
            {!isOwnProfile && (
              <Pressable
                style={({ pressed }) => [
                  styles.followButton,
                  isFollowing ? styles.followingButton : styles.notFollowingButton,
                  pressed && styles.buttonPressed,
                  isFollowLoading && styles.buttonDisabled,
                ]}
                onPress={handleFollowPress}
                disabled={isFollowLoading}
              >
                {isFollowLoading ? (
                  <ActivityIndicator
                    size="small"
                    color={isFollowing ? Colors.stamp : Colors.paper}
                  />
                ) : (
                  <Text
                    style={[
                      styles.followButtonText,
                      isFollowing
                        ? styles.followingButtonText
                        : styles.notFollowingButtonText,
                    ]}
                  >
                    {isFollowing ? 'Following' : 'Follow'}
                  </Text>
                )}
              </Pressable>
            )}
          </View>
        </View>

        {/* Stats */}
        <View style={styles.statsContainer}>
          <View style={styles.statBox}>
            <Text style={styles.statNumber}>{stats.totalFilms}</Text>
            <Text style={styles.statLabel}>FILMS</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Text style={styles.statNumber}>{stats.totalShows}</Text>
            <Text style={styles.statLabel}>SHOWS</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Text style={styles.statNumber}>
              {stats.totalMinutes > 0 ? formatWatchTime(stats.totalMinutes) : '—'}
            </Text>
            <Text style={styles.statLabel}>WATCHED</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Text style={styles.statNumber}>
              {rankingPosition ? `#${rankingPosition}` : '—'}
            </Text>
            <Text style={styles.statLabel}>RANKED</Text>
          </View>
        </View>

        {/* Lists */}
        <View style={styles.listsSection}>
          <Text style={styles.sectionLabel}>LISTS</Text>
          <ProfileListRow
            title="Rankings"
            count={stats.rankingsCount}
            onPress={() => router.push(`/rankings?userId=${userId}`)}
            icon="list.number"
          />
          <ProfileListRow
            title="Want to Watch"
            count={watchlistCount}
            onPress={() => router.push(`/watchlist?userId=${userId}`)}
            icon="bookmark"
          />
          <ProfileListRow
            title="Currently Watching"
            count={currentlyWatchingCount}
            onPress={() => router.push(`/currently-watching?userId=${userId}`)}
            icon="play.circle"
          />
        </View>

        {/* Recent Activity */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionLabel}>RECENT ACTIVITY</Text>
            {recentActivities.length > 0 && (
              <Pressable onPress={() => router.push(`/user-activity/${userId}`)}>
                <Text style={styles.viewAll}>VIEW ALL</Text>
              </Pressable>
            )}
          </View>

          {recentActivities.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.recentScroll}
            >
              {recentActivities.map((activity) => (
                <Pressable
                  key={activity.id}
                  style={({ pressed }) => [
                    styles.recentCard,
                    pressed && styles.cardPressed,
                  ]}
                  onPress={() => router.push(`/title/${activity.content?.tmdb_id}?type=${activity.content?.content_type}` as any)}
                >
                  {activity.content?.poster_url ? (
                    <Image
                      source={{ uri: activity.content.poster_url }}
                      style={styles.recentPoster}
                      contentFit="cover"
                    />
                  ) : (
                    <View style={[styles.recentPoster, styles.posterPlaceholder]}>
                      <Text style={styles.placeholderLetter}>
                        {activity.content?.title?.[0] || '?'}
                      </Text>
                    </View>
                  )}
                  {activity.star_rating && (
                    <View style={styles.recentStars}>
                      <StarDisplay rating={activity.star_rating} size={10} />
                    </View>
                  )}
                </Pressable>
              ))}
            </ScrollView>
          ) : (
            <View style={styles.placeholder}>
              <Text style={styles.placeholderText}>
                No recent activity
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
  },
  errorContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
  },
  errorText: {
    fontFamily: Fonts.serifBold,
    fontSize: FontSizes.xl,
    color: Colors.text,
    marginBottom: Spacing.lg,
  },
  goBackButton: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
  },
  goBackButtonText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.md,
    color: Colors.stamp,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.md,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dust,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: Fonts.serifBold,
    fontSize: FontSizes['2xl'],
    color: Colors.stamp,
  },
  headerSpacer: {
    width: 36,
  },
  buttonPressed: {
    opacity: 0.8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: Spacing['3xl'],
  },
  profileSection: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.xl,
    marginBottom: Spacing.xl,
    gap: Spacing.lg,
  },
  avatarWrapper: {
    flex: 1,
    alignItems: 'center',
  },
  usernameUnderAvatar: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
    marginTop: Spacing.sm,
  },
  profileInfo: {
    flex: 1,
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  profileName: {
    fontFamily: Fonts.serifBold,
    fontSize: FontSizes.xl,
    color: Colors.text,
    letterSpacing: 1,
  },
  profileBio: {
    fontFamily: Fonts.serifItalic,
    fontSize: FontSizes.md,
    color: Colors.stamp,
    lineHeight: 20,
  },
  followStats: {
    flexDirection: 'row',
    gap: Spacing.lg,
    marginTop: Spacing.xs,
  },
  followStat: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.xs,
  },
  followStatPressed: {
    opacity: 0.7,
  },
  followNumber: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.md,
    color: Colors.text,
  },
  followLabel: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
  },
  followButton: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 36,
    marginTop: Spacing.sm,
    alignSelf: 'flex-start',
  },
  notFollowingButton: {
    backgroundColor: Colors.stamp,
  },
  followingButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  followButtonText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.sm,
  },
  notFollowingButtonText: {
    color: Colors.paper,
  },
  followingButtonText: {
    color: Colors.text,
  },
  statsContainer: {
    flexDirection: 'row',
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.xl,
    paddingVertical: Spacing.lg,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.border,
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
  },
  statNumber: {
    fontFamily: Fonts.serifBold,
    fontSize: FontSizes['2xl'],
    color: Colors.text,
  },
  statLabel: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
    letterSpacing: 1,
    marginTop: Spacing.xs,
  },
  statDivider: {
    width: 1,
    backgroundColor: Colors.border,
  },
  listsSection: {
    marginTop: Spacing.xl,
    paddingHorizontal: Spacing.xl,
  },
  section: {
    marginTop: Spacing.xl,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: Spacing.lg,
    paddingHorizontal: Spacing.xl,
  },
  sectionLabel: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
    letterSpacing: 1,
  },
  viewAll: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.xs,
    color: Colors.navy,
  },
  recentScroll: {
    paddingHorizontal: Spacing.xl,
    gap: Spacing.md,
  },
  recentCard: {
    width: 80,
  },
  cardPressed: {
    opacity: 0.8,
  },
  recentPoster: {
    width: 80,
    height: 120,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.dust,
  },
  posterPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderLetter: {
    fontFamily: Fonts.serifBold,
    fontSize: FontSizes.xl,
    color: Colors.textMuted,
  },
  recentStars: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 1,
    marginTop: Spacing.xs,
  },
  placeholder: {
    paddingVertical: Spacing['2xl'],
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
  },
  placeholderText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.md,
    color: Colors.textMuted,
    textAlign: 'center',
  },
});
