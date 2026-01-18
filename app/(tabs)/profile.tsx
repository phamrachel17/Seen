import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  RefreshControl,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Fonts, FontSizes, Spacing, BorderRadius } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { ProfileAvatar } from '@/components/profile-avatar';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { getFollowCounts, getUserRankingPosition } from '@/lib/follows';
import { Movie, Review, User } from '@/types';

interface ReviewWithMovie extends Review {
  movies: Movie;
}

interface UserStats {
  totalFilms: number;
  totalMinutes: number;
  rankingsCount: number;
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { signOut, user } = useAuth();

  const [stats, setStats] = useState<UserStats>({
    totalFilms: 0,
    totalMinutes: 0,
    rankingsCount: 0,
  });
  const [recentReviews, setRecentReviews] = useState<ReviewWithMovie[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [profileData, setProfileData] = useState<Pick<User, 'username' | 'profile_image_url' | 'display_name' | 'bio'> | null>(null);
  const [followCounts, setFollowCounts] = useState({ followers: 0, following: 0 });
  const [rankingPosition, setRankingPosition] = useState<number | null>(null);

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

      // Load reviews count and total watch time
      const { data: reviews, error: reviewsError } = await supabase
        .from('reviews')
        .select(`
          id,
          movies (runtime_minutes)
        `)
        .eq('user_id', user.id);

      if (!reviewsError && reviews) {
        const totalMinutes = reviews.reduce((acc, r) => {
          const movie = r.movies as { runtime_minutes: number } | null;
          return acc + (movie?.runtime_minutes || 0);
        }, 0);

        setStats((prev) => ({
          ...prev,
          totalFilms: reviews.length,
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

      // Load recent reviews
      const { data: recentData, error: recentError } = await supabase
        .from('reviews')
        .select(`
          *,
          movies (*)
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(6);

      if (!recentError && recentData) {
        const reviewsWithMovies = recentData.filter(
          (item: ReviewWithMovie) => item.movies
        ) as ReviewWithMovie[];
        setRecentReviews(reviewsWithMovies);
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

  const handleSignOut = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign Out', style: 'destructive', onPress: signOut },
      ]
    );
  };

  const formatWatchTime = (minutes: number) => {
    const days = Math.floor(minutes / (24 * 60));
    const hours = Math.floor((minutes % (24 * 60)) / 60);
    if (days > 0) {
      return `${days}d ${hours}h`;
    }
    return `${hours}h`;
  };

  const navigateToMovie = (movieId: number) => {
    router.push(`/movie/${movieId}`);
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
        <Pressable style={styles.iconButton}>
          <IconSymbol name="ellipsis" size={22} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Seen</Text>
        <Pressable style={styles.iconButton} onPress={handleSignOut}>
          <View style={styles.settingsIcon}>
            <IconSymbol name="rectangle.portrait.and.arrow.right" size={18} color={Colors.textMuted} />
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
            <Text style={styles.statNumber}>{stats.totalFilms}</Text>
            <Text style={styles.statLabel}>FILMS</Text>
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

        {/* Recent Archives */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionLabel}>RECENT ACTIVITY</Text>
            {recentReviews.length > 0 && (
              <Pressable onPress={() => router.push('/(tabs)')}>
                <Text style={styles.viewAll}>VIEW ALL</Text>
              </Pressable>
            )}
          </View>

          {recentReviews.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.recentScroll}
            >
              {recentReviews.map((review) => (
                <Pressable
                  key={review.id}
                  style={({ pressed }) => [
                    styles.recentCard,
                    pressed && styles.cardPressed,
                  ]}
                  onPress={() => navigateToMovie(review.movie_id)}
                >
                  {review.movies.poster_url ? (
                    <Image
                      source={{ uri: review.movies.poster_url }}
                      style={styles.recentPoster}
                      contentFit="cover"
                    />
                  ) : (
                    <View style={[styles.recentPoster, styles.posterPlaceholder]}>
                      <Text style={styles.placeholderLetter}>
                        {review.movies.title[0]}
                      </Text>
                    </View>
                  )}
                  <View style={styles.recentStars}>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <IconSymbol
                        key={star}
                        name={star <= review.star_rating ? 'star.fill' : 'star'}
                        size={10}
                        color={star <= review.star_rating ? Colors.starFilled : Colors.starEmpty}
                      />
                    ))}
                  </View>
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

        {/* Sign Out Button */}
        <View style={styles.signOutSection}>
          <Pressable
            style={({ pressed }) => [
              styles.signOutButton,
              pressed && styles.signOutButtonPressed,
            ]}
            onPress={handleSignOut}
          >
            <Text style={styles.signOutText}>Sign Out</Text>
          </Pressable>
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
    fontFamily: Fonts.serifBoldItalic,
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
  signOutSection: {
    marginTop: Spacing['2xl'],
    paddingHorizontal: Spacing.xl,
  },
  signOutButton: {
    paddingVertical: Spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.sm,
  },
  signOutButtonPressed: {
    opacity: 0.7,
  },
  signOutText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.md,
    color: Colors.textMuted,
  },
});
