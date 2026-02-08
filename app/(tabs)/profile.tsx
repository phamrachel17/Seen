import { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Fonts, FontSizes, Spacing, BorderRadius } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { StarDisplay } from '@/components/ui/star-display';
import { ProfileAvatar } from '@/components/profile-avatar';
import { ProfileListRow } from '@/components/profile-list-row';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { getUserActivities, isActivityInProgress } from '@/lib/activity';
import { useUserData } from '@/lib/hooks/useUserData';
import { User, Activity } from '@/types';

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();

  // Use cached user data hook for profile, stats, follow counts, and ranking position
  const {
    profile: cachedProfile,
    stats: cachedStats,
    followCounts,
    rankingPosition,
    refresh: refreshUserData,
  } = useUserData(user?.id);

  // Local state for data not covered by the hook
  const [localStats, setLocalStats] = useState<{ totalMovies: number; totalShows: number }>({
    totalMovies: 0,
    totalShows: 0,
  });
  const [recentActivities, setRecentActivities] = useState<Activity[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [profileData, setProfileData] = useState<Pick<User, 'username' | 'profile_image_url' | 'display_name' | 'bio'> | null>(null);
  const [watchlistCount, setWatchlistCount] = useState(0);
  const [currentlyWatchingCount, setCurrentlyWatchingCount] = useState(0);

  // Ref to track if component is mounted (prevents state updates after unmount)
  const isMountedRef = useRef(true);

  const loadUserData = useCallback(async () => {
    if (!user) return;

    try {
      // Load profile data (for local display - cached version is used as fallback)
      const { data: profile } = await supabase
        .from('users')
        .select('username, profile_image_url, display_name, bio')
        .eq('id', user.id)
        .single();

      if (isMountedRef.current && profile) {
        setProfileData(profile);
      }

      // Load rankings to count movies vs shows (ensures FILMS + SHOWS = Rankings count)
      const { data: rankings, error: rankingsError } = await supabase
        .from('rankings')
        .select('content_type')
        .eq('user_id', user.id);

      if (isMountedRef.current && !rankingsError && rankings) {
        const movieCount = rankings.filter(r => r.content_type === 'movie').length;
        const showCount = rankings.filter(r => r.content_type === 'tv').length;
        setLocalStats({ totalMovies: movieCount, totalShows: showCount });
      }

      // Load watchlist count
      const { count: wlCount } = await supabase
        .from('bookmarks')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id);

      if (isMountedRef.current) {
        setWatchlistCount(wlCount || 0);
      }

      // Load currently watching count
      const inProgressActivities = await getUserActivities(user.id, 'in_progress');

      if (isMountedRef.current) {
        // Deduplicate by content_id FIRST to match display logic in currently-watching screen
        const uniqueContent = new Map<number, any>();
        for (const activity of inProgressActivities) {
          if (!uniqueContent.has(activity.content_id)) {
            uniqueContent.set(activity.content_id, activity);
          }
        }

        // Filter to only count activities that are truly in progress (< 100%)
        const activeInProgress = Array.from(uniqueContent.values()).filter(isActivityInProgress);

        setCurrentlyWatchingCount(activeInProgress.length);
      }

      // Load recent activities (completed with reviews)
      const { data: activityData, error: activityError } = await supabase
        .from('activity_log')
        .select(`
          *,
          content (*)
        `)
        .eq('user_id', user.id)
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(6);

      if (isMountedRef.current && !activityError && activityData) {
        const activitiesWithContent = activityData.filter(
          (item: Activity) => item.content
        ) as Activity[];
        setRecentActivities(activitiesWithContent);
      }
    } catch (error) {
      console.error('Error loading user data:', error);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      isMountedRef.current = true;
      loadUserData();

      return () => {
        isMountedRef.current = false;
      };
    }, [loadUserData])
  );

  const onRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([loadUserData(), refreshUserData()]);
    setIsRefreshing(false);
  };

  const formatWatchTime = (minutes: number | null | undefined) => {
    if (minutes == null || minutes <= 0) {
      return '0h';
    }
    const days = Math.floor(minutes / (24 * 60));
    const hours = Math.floor((minutes % (24 * 60)) / 60);
    const mins = minutes % 60;
    if (days > 0) {
      return `${days}d ${hours}h`;
    }
    if (mins > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${hours}h`;
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
        <View style={styles.headerTextContainer}>
          <Text style={styles.headerTitle}>Seen</Text>
          <Text style={styles.headerSubtitle}>YOUR PROFILE</Text>
        </View>
        <Pressable style={styles.iconButton} onPress={() => router.push('/settings')}>
          <View style={styles.settingsIcon}>
            <IconSymbol name="gearshape" size={18} color={Colors.textMuted} />
          </View>
        </Pressable>
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
          <Pressable
            style={styles.avatarWrapper}
            onPress={() => router.push('/edit-profile')}
          >
            <View style={styles.avatarContainer}>
              <ProfileAvatar
                imageUrl={profileData?.profile_image_url || cachedProfile?.profile_image_url}
                username={profileData?.username || cachedProfile?.username || user?.user_metadata?.username || 'User'}
                size="large"
                variant="poster"
              />
              <View style={styles.editBadge}>
                <IconSymbol name="pencil" size={12} color={Colors.paper} />
              </View>
            </View>
            <Text style={styles.usernameUnderAvatar}>
              @{profileData?.username || cachedProfile?.username || user?.user_metadata?.username || 'user'}
            </Text>
          </Pressable>

          {/* Right: Display Name, Bio, Follow Stats */}
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>
              {profileData?.display_name || cachedProfile?.display_name || profileData?.username || cachedProfile?.username || user?.user_metadata?.username || 'Cinephile'}
            </Text>
            <Text style={styles.profileBio}>
              {profileData?.bio || cachedProfile?.bio || 'Film Enthusiast'}
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
                    params: { type: 'following', userId: user?.id },
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
                    params: { type: 'followers', userId: user?.id },
                  })
                }
              >
                <Text style={styles.followNumber}>{followCounts.followers}</Text>
                <Text style={styles.followLabel}>Followers</Text>
              </Pressable>
            </View>
          </View>
        </View>

        {/* Stats */}
        <View style={styles.statsContainer}>
          <View style={styles.statBox}>
            <Text style={styles.statNumber}>{localStats.totalMovies}</Text>
            <Text style={styles.statLabel}>FILMS</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Text style={styles.statNumber}>{localStats.totalShows}</Text>
            <Text style={styles.statLabel}>SHOWS</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Text style={styles.statNumber}>
              {cachedStats.totalMinutes > 0 ? formatWatchTime(cachedStats.totalMinutes) : '—'}
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
            count={cachedStats.rankingsCount}
            onPress={() => router.push('/rankings')}
            icon="list.number"
          />
          <ProfileListRow
            title="Want to Watch"
            count={watchlistCount}
            onPress={() => router.push('/watchlist')}
            icon="bookmark"
          />
          <ProfileListRow
            title="Currently Watching"
            count={currentlyWatchingCount}
            onPress={() => router.push('/currently-watching')}
            icon="play.circle"
          />
        </View>

        {/* Recent Activity */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionLabel}>RECENT ACTIVITY</Text>
            {recentActivities.length > 0 && (
              <Pressable onPress={() => router.push(`/user-activity/${user?.id}`)}>
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
                Your recent activity will appear here
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.md,
  },
  headerTextContainer: {
    flex: 1,
  },
  headerTitle: {
    fontFamily: Fonts.serifBold,
    fontSize: FontSizes['3xl'],
    color: Colors.stamp,
  },
  headerSubtitle: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
    letterSpacing: 1,
    marginTop: Spacing.xs,
  },
  iconButton: {
    padding: Spacing.xs,
  },
  settingsIcon: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dust,
    alignItems: 'center',
    justifyContent: 'center',
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
    marginTop: Spacing.lg,
    marginBottom: Spacing.xl,
    gap: Spacing.lg,
  },
  avatarWrapper: {
    flex: 1,
    alignItems: 'center',
  },
  avatarContainer: {
    position: 'relative',
  },
  usernameUnderAvatar: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
    marginTop: Spacing.sm,
  },
  editBadge: {
    position: 'absolute',
    bottom: Spacing.xs,
    right: Spacing.xs,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.stamp,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.background,
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
  statsContainer: {
    flexDirection: 'row',
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.lg,
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
    marginTop: Spacing['2xl'],
    paddingHorizontal: Spacing.xl,
  },
  section: {
    marginTop: Spacing['2xl'],
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: Spacing.md,
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
