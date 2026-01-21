import { useState, useCallback } from 'react';
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
import { ProfileAvatar } from '@/components/profile-avatar';
import { ProfileListRow } from '@/components/profile-list-row';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { getFollowCounts, getUserRankingPosition } from '@/lib/follows';
import { getUserActivities, isActivityInProgress } from '@/lib/activity';
import { Movie, User, Activity } from '@/types';

interface UserStats {
  totalTitles: number;
  totalMinutes: number;
  rankingsCount: number;
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();

  const [stats, setStats] = useState<UserStats>({
    totalTitles: 0,
    totalMinutes: 0,
    rankingsCount: 0,
  });
  const [recentActivities, setRecentActivities] = useState<Activity[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [profileData, setProfileData] = useState<Pick<User, 'username' | 'profile_image_url' | 'display_name' | 'bio'> | null>(null);
  const [followCounts, setFollowCounts] = useState({ followers: 0, following: 0 });
  const [rankingPosition, setRankingPosition] = useState<number | null>(null);
  const [watchlistCount, setWatchlistCount] = useState(0);
  const [currentlyWatchingCount, setCurrentlyWatchingCount] = useState(0);

  const loadUserData = useCallback(async () => {
    if (!user) return;

    try {
      // Load profile data
      const { data: profile } = await supabase
        .from('users')
        .select('username, profile_image_url, display_name, bio')
        .eq('id', user.id)
        .single();

      if (profile) {
        setProfileData(profile);
      }

      // Load completed activities count and total watch time
      const { data: activities, error: activitiesError } = await supabase
        .from('activity_log')
        .select(`
          id,
          content_id,
          content:content_id (
            id,
            content_type,
            runtime_minutes,
            total_episodes,
            episode_runtime
          )
        `)
        .eq('user_id', user.id)
        .eq('status', 'completed');

      if (!activitiesError && activities) {
        // Deduplicate by content_id
        const uniqueContentMap = new Map<number, any>();
        for (const activity of activities) {
          if (!uniqueContentMap.has(activity.content_id)) {
            uniqueContentMap.set(activity.content_id, activity);
          }
        }

        // Calculate total watch time from unique titles
        const totalMinutes = Array.from(uniqueContentMap.values()).reduce((acc, activity) => {
          const content = activity.content as {
            content_type: string;
            runtime_minutes?: number;
            total_episodes?: number;
            episode_runtime?: number;
          } | null;

          if (!content) return acc;

          // For movies: use runtime_minutes
          if (content.content_type === 'movie') {
            return acc + (content.runtime_minutes || 0);
          }

          // For TV shows: use runtime_minutes if available, otherwise calculate
          if (content.content_type === 'tv') {
            if (content.runtime_minutes) {
              return acc + content.runtime_minutes;
            }
            // Calculate from episodes if runtime not available
            if (content.total_episodes && content.episode_runtime) {
              return acc + content.total_episodes * content.episode_runtime;
            }
          }

          return acc;
        }, 0);

        setStats((prev) => ({
          ...prev,
          totalTitles: uniqueContentMap.size,
          totalMinutes,
        }));
      }

      // Load rankings count
      const { count: rankingsCount } = await supabase
        .from('rankings')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id);

      setStats((prev) => ({
        ...prev,
        rankingsCount: rankingsCount || 0,
      }));

      // Load watchlist count
      const { count: wlCount } = await supabase
        .from('bookmarks')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id);

      setWatchlistCount(wlCount || 0);

      // Load currently watching count
      const inProgressActivities = await getUserActivities(user.id, 'in_progress');

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

      if (!activityError && activityData) {
        const activitiesWithContent = activityData.filter(
          (item: Activity) => item.content
        ) as Activity[];
        setRecentActivities(activitiesWithContent);
      }

      // Load follow counts and ranking position
      const [counts, position] = await Promise.all([
        getFollowCounts(user.id),
        getUserRankingPosition(user.id),
      ]);
      setFollowCounts(counts);
      setRankingPosition(position);
    } catch (error) {
      console.error('Error loading user data:', error);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      loadUserData();
    }, [loadUserData])
  );

  const onRefresh = async () => {
    setIsRefreshing(true);
    await loadUserData();
    setIsRefreshing(false);
  };

  const formatWatchTime = (minutes: number) => {
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
        <Pressable style={styles.iconButton}>
          <IconSymbol name="ellipsis" size={22} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Seen</Text>
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
                imageUrl={profileData?.profile_image_url}
                username={profileData?.username || user?.user_metadata?.username || 'User'}
                size="large"
                variant="poster"
              />
              <View style={styles.editBadge}>
                <IconSymbol name="pencil" size={12} color={Colors.paper} />
              </View>
            </View>
            <Text style={styles.usernameUnderAvatar}>
              @{profileData?.username || user?.user_metadata?.username || 'user'}
            </Text>
          </Pressable>

          {/* Right: Display Name, Bio, Follow Stats */}
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>
              {profileData?.display_name || profileData?.username || user?.user_metadata?.username || 'Cinephile'}
            </Text>
            <Text style={styles.profileBio}>
              {profileData?.bio || 'Film Enthusiast'}
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
            <Text style={styles.statNumber}>{stats.totalTitles}</Text>
            <Text style={styles.statLabel}>TITLES</Text>
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
            onPress={() => router.push('/rankings')}
            icon="list.number"
          />
          <ProfileListRow
            title="Watchlist"
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
              <Pressable onPress={() => router.push('/(tabs)')}>
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
                      {[1, 2, 3, 4, 5].map((star) => (
                        <IconSymbol
                          key={star}
                          name={star <= activity.star_rating! ? 'star.fill' : 'star'}
                          size={10}
                          color={star <= activity.star_rating! ? Colors.starFilled : Colors.starEmpty}
                        />
                      ))}
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
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.md,
  },
  headerTitle: {
    fontFamily: Fonts.serifBold,
    fontSize: FontSizes['3xl'],
    color: Colors.stamp,
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
