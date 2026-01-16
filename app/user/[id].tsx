import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Fonts, FontSizes, Spacing, BorderRadius } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { ProfileAvatar } from '@/components/profile-avatar';
import { useAuth } from '@/lib/auth-context';
import {
  getUserProfile,
  getUserStats,
  getUserRecentReviews,
  getFollowCounts,
  checkIfFollowing,
  followUser,
  unfollowUser,
} from '@/lib/follows';
import { User, Movie, Review } from '@/types';

interface ReviewWithMovie extends Review {
  movies: Movie;
}

interface UserStats {
  totalFilms: number;
  totalMinutes: number;
  rankingsCount: number;
}

export default function UserProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user: currentUser } = useAuth();
  const { id: userId } = useLocalSearchParams<{ id: string }>();

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [profileData, setProfileData] = useState<Pick<
    User,
    'id' | 'username' | 'display_name' | 'bio' | 'profile_image_url'
  > | null>(null);
  const [stats, setStats] = useState<UserStats>({
    totalFilms: 0,
    totalMinutes: 0,
    rankingsCount: 0,
  });
  const [followCounts, setFollowCounts] = useState({ followers: 0, following: 0 });
  const [recentReviews, setRecentReviews] = useState<ReviewWithMovie[]>([]);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isFollowLoading, setIsFollowLoading] = useState(false);

  const isOwnProfile = currentUser?.id === userId;

  const loadUserData = useCallback(async () => {
    if (!userId || !currentUser) return;

    try {
      const [profile, userStats, counts, reviews, followingStatus] =
        await Promise.all([
          getUserProfile(userId),
          getUserStats(userId),
          getFollowCounts(userId),
          getUserRecentReviews(userId, currentUser.id, 6),
          checkIfFollowing(currentUser.id, userId),
        ]);

      if (profile) {
        setProfileData(profile);
      }
      setStats(userStats);
      setFollowCounts(counts);
      setRecentReviews(reviews);
      setIsFollowing(followingStatus);
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
    if (!currentUser || !userId || isFollowLoading) return;

    // Optimistic update
    setIsFollowing(!isFollowing);
    setFollowCounts((prev) => ({
      ...prev,
      followers: isFollowing ? prev.followers - 1 : prev.followers + 1,
    }));
    setIsFollowLoading(true);

    try {
      const success = isFollowing
        ? await unfollowUser(currentUser.id, userId)
        : await followUser(currentUser.id, userId);

      if (!success) {
        // Revert on failure
        setIsFollowing(isFollowing);
        setFollowCounts((prev) => ({
          ...prev,
          followers: isFollowing ? prev.followers + 1 : prev.followers - 1,
        }));
      }
    } catch (error) {
      // Revert on error
      setIsFollowing(isFollowing);
      setFollowCounts((prev) => ({
        ...prev,
        followers: isFollowing ? prev.followers + 1 : prev.followers - 1,
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

  const navigateToMovie = (movieId: number) => {
    router.push(`/movie/${movieId}`);
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
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <ActivityIndicator size="large" color={Colors.stamp} />
      </View>
    );
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
        <Text style={styles.headerTitle}>
          @{profileData.username}
        </Text>
        {!isOwnProfile ? (
          <Pressable
            style={({ pressed }) => [
              styles.followHeaderButton,
              isFollowing
                ? styles.followingHeaderButton
                : styles.notFollowingHeaderButton,
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
                  styles.followHeaderButtonText,
                  isFollowing
                    ? styles.followingHeaderButtonText
                    : styles.notFollowingHeaderButtonText,
                ]}
              >
                {isFollowing ? 'Following' : 'Follow'}
              </Text>
            )}
          </Pressable>
        ) : (
          <View style={styles.headerSpacer} />
        )}
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
          {/* Left: Poster */}
          <View style={styles.avatarWrapper}>
            <ProfileAvatar
              imageUrl={profileData.profile_image_url}
              username={profileData.username}
              size="large"
              variant="poster"
            />
          </View>

          {/* Right: Name, Bio, Follow Stats */}
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>
              {profileData.display_name?.toUpperCase() ||
                profileData.username.toUpperCase()}
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
              {stats.rankingsCount > 0 ? stats.rankingsCount : '—'}
            </Text>
            <Text style={styles.statLabel}>RANKED</Text>
          </View>
        </View>

        {/* Recent Activity */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionLabel}>RECENT ACTIVITY</Text>
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
                        color={
                          star <= review.star_rating
                            ? Colors.starFilled
                            : Colors.starEmpty
                        }
                      />
                    ))}
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          ) : (
            <View style={styles.placeholder}>
              <Text style={styles.placeholderText}>
                No public reviews yet
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
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.lg,
    color: Colors.textMuted,
  },
  headerSpacer: {
    width: 36,
  },
  followHeaderButton: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    minWidth: 90,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 32,
  },
  notFollowingHeaderButton: {
    backgroundColor: Colors.stamp,
  },
  followingHeaderButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  buttonPressed: {
    opacity: 0.8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  followHeaderButtonText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.sm,
  },
  notFollowingHeaderButtonText: {
    color: Colors.paper,
  },
  followingHeaderButtonText: {
    color: Colors.text,
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
    position: 'relative',
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
