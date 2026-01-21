import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Dimensions,
  Animated,
  StatusBar,
  RefreshControl,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Fonts, FontSizes, Spacing, BorderRadius } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { CastCrewSection } from '@/components/cast-crew-section';
import { FriendChipsDisplay } from '@/components/friend-chips';
import { ProfileAvatar } from '@/components/profile-avatar';
import { getMovieDetails, getTVShowDetails } from '@/lib/tmdb';
import { getExternalRatings } from '@/lib/omdb';
import { getContentByTmdbId, ensureContentExists } from '@/lib/content';
import {
  getUserCompletedActivity,
  getUserInProgressActivity,
  getFriendsActivitiesForContent,
  formatProgress,
  createActivity,
  deleteActivity,
  getActiveWatch,
} from '@/lib/activity';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { getFollowingIds } from '@/lib/follows';
import {
  MovieDetails,
  TVShowDetails,
  Content,
  Activity,
  ContentType,
  Ranking,
  Watch,
  ExternalRatings,
} from '@/types';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const HEADER_MIN_HEIGHT = Math.round(SCREEN_HEIGHT * 0.35);
const HEADER_MAX_HEIGHT = Math.round(SCREEN_HEIGHT * 0.45);

export default function TitleDetailScreen() {
  const { id, type } = useLocalSearchParams<{ id: string; type?: ContentType }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const scrollY = useRef(new Animated.Value(0)).current;

  // Content state
  const [content, setContent] = useState<Content | null>(null);
  const [movieDetails, setMovieDetails] = useState<MovieDetails | null>(null);
  const [tvDetails, setTVDetails] = useState<TVShowDetails | null>(null);

  // UI state
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [isTogglingBookmark, setIsTogglingBookmark] = useState(false);
  const [isInProgress, setIsInProgress] = useState(false);
  const [isTogglingInProgress, setIsTogglingInProgress] = useState(false);

  // Activity state
  const [completedActivity, setCompletedActivity] = useState<Activity | null>(null);
  const [inProgressActivity, setInProgressActivity] = useState<Activity | null>(null);
  const [activeWatch, setActiveWatch] = useState<Watch | null>(null);
  const [userRanking, setUserRanking] = useState<Ranking | null>(null);
  const [friendsActivities, setFriendsActivities] = useState<Activity[]>([]);

  // Community rating
  const [communityRating, setCommunityRating] = useState<{
    average: number;
    count: number;
  } | null>(null);

  // External ratings (IMDb, RT)
  const [externalRatings, setExternalRatings] = useState<ExternalRatings | null>(null);

  useEffect(() => {
    if (id) {
      loadContent(parseInt(id, 10), type || 'movie');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, type]);

  // Reload user data when screen regains focus (after returning from log-activity)
  useFocusEffect(
    useCallback(() => {
      if (user && content) {
        loadUserData(content.id, content.tmdb_id);
      }
    }, [user, content])
  );

  const loadContent = async (tmdbId: number, contentType: ContentType) => {
    try {
      setIsLoading(true);

      // Load content details from TMDB
      let imdbId: string | undefined;
      if (contentType === 'movie') {
        const details = await getMovieDetails(tmdbId);
        setMovieDetails(details);
        imdbId = details.imdb_id;
      } else {
        const details = await getTVShowDetails(tmdbId);
        setTVDetails(details);
        imdbId = details.imdb_id;
      }

      // Fetch external ratings (IMDb, RT) if we have an IMDB ID
      if (imdbId) {
        const ratings = await getExternalRatings(imdbId);
        setExternalRatings(ratings);
      }

      // Ensure content exists in DB
      const contentRecord = await ensureContentExists(tmdbId, contentType);
      setContent(contentRecord);

      if (!contentRecord) return;

      // Load user data
      if (user) {
        await loadUserData(contentRecord.id, tmdbId);
      }

      // Load community rating
      await loadCommunityRating(contentRecord.id);
    } catch (error) {
      console.error('Error loading content:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadUserData = async (contentId: number, tmdbId: number) => {
    if (!user) return;

    try {
      // Load user's activities, bookmark, ranking, watch, and friends' activities in parallel
      const followingIds = await getFollowingIds(user.id);

      const contentType = type || 'movie';
      const [completed, inProgress, watch, bookmark, ranking, friendsActs] = await Promise.all([
        getUserCompletedActivity(user.id, contentId),
        getUserInProgressActivity(user.id, contentId),
        getActiveWatch(user.id, contentId),
        checkBookmarkStatus(contentId),
        loadUserRanking(tmdbId, contentType),
        getFriendsActivitiesForContent(user.id, contentId, followingIds),
      ]);

      setCompletedActivity(completed);
      setInProgressActivity(inProgress);
      setActiveWatch(watch);
      setIsInProgress(!!inProgress);
      setIsBookmarked(!!bookmark);
      setUserRanking(ranking);
      setFriendsActivities(friendsActs.slice(0, 5)); // Limit to 5 friends
    } catch (error) {
      console.error('Error loading user data:', error);
    }
  };

  const checkBookmarkStatus = async (contentId: number): Promise<boolean> => {
    const { data } = await supabase
      .from('bookmarks')
      .select('id')
      .eq('user_id', user?.id)
      .eq('content_id', contentId)
      .single();

    return !!data;
  };

  const loadUserRanking = async (tmdbId: number, contentType: ContentType): Promise<Ranking | null> => {
    const { data } = await supabase
      .from('rankings')
      .select('*')
      .eq('user_id', user?.id)
      .eq('movie_id', tmdbId)
      .eq('content_type', contentType)
      .single();

    return data;
  };

  const loadCommunityRating = async (contentId: number) => {
    const { data } = await supabase
      .from('activity_log')
      .select('star_rating')
      .eq('content_id', contentId)
      .eq('status', 'completed')
      .not('star_rating', 'is', null);

    if (data && data.length > 0) {
      const ratings = data.map((d) => d.star_rating as number);
      const average = ratings.reduce((a, b) => a + b, 0) / ratings.length;
      setCommunityRating({ average, count: ratings.length });
    }
  };

  const onRefresh = async () => {
    if (!id) return;
    setIsRefreshing(true);
    try {
      const tmdbId = parseInt(id, 10);
      const contentType = type || 'movie';
      await loadContent(tmdbId, contentType);
    } finally {
      setIsRefreshing(false);
    }
  };

  const toggleBookmark = async () => {
    if (!content || !user || isTogglingBookmark) return;

    setIsTogglingBookmark(true);

    try {
      if (isBookmarked) {
        await supabase
          .from('bookmarks')
          .delete()
          .eq('user_id', user.id)
          .eq('content_id', content.id);
        setIsBookmarked(false);
      } else {
        await supabase.from('bookmarks').insert({
          user_id: user.id,
          content_id: content.id,
        });
        setIsBookmarked(true);
      }
    } catch (error) {
      console.error('Error toggling bookmark:', error);
    } finally {
      setIsTogglingBookmark(false);
    }
  };

  const toggleInProgress = async () => {
    if (!content || !user || isTogglingInProgress) return;

    setIsTogglingInProgress(true);

    try {
      if (isInProgress) {
        // Remove: Find and delete the in-progress activity
        const activity = await getUserInProgressActivity(user.id, content.id);
        if (activity) {
          await deleteActivity(activity.id);
        }
        setIsInProgress(false);
        setInProgressActivity(null);
      } else {
        // Add: Create a simple in-progress activity
        const activity = await createActivity({
          userId: user.id,
          tmdbId: content.tmdb_id,
          contentType: content.content_type,
          status: 'in_progress',
          watchDate: new Date(),
        });
        setIsInProgress(!!activity);
        setInProgressActivity(activity);
      }
    } catch (error) {
      console.error('Error toggling in-progress:', error);
    } finally {
      setIsTogglingInProgress(false);
    }
  };

  const openLogActivity = (editDirectly?: boolean, editInProgress?: boolean) => {
    if (content) {
      const params = new URLSearchParams();
      if (editDirectly) params.append('editMode', 'true');
      if (editInProgress) params.append('editInProgress', 'true');
      const query = params.toString() ? `?${params.toString()}` : '';
      router.push(`/log-activity/${content.id}${query}`);
    }
  };

  // Computed values
  const details = movieDetails || tvDetails;
  const title = details?.title || content?.title || '';
  const backdropUrl = details?.backdrop_url || content?.backdrop_url;
  const posterUrl = details?.poster_url || content?.poster_url;
  const releaseYear = details?.release_year || content?.release_year;
  const genres = details?.genres || content?.genres || [];
  const synopsis = details?.synopsis || content?.synopsis;
  const contentType = type || content?.content_type || 'movie';

  // Movie-specific
  const director = movieDetails?.director || content?.director;
  const runtime = movieDetails?.runtime_minutes || content?.runtime_minutes;

  // TV-specific
  const creator = tvDetails?.creator;
  const totalSeasons = tvDetails?.total_seasons || content?.total_seasons;
  const totalEpisodes = tvDetails?.total_episodes || content?.total_episodes;

  const cast = details?.cast || [];
  const crew = details?.crew || [];

  // Animated header
  const headerHeight = scrollY.interpolate({
    inputRange: [-100, 0],
    outputRange: [HEADER_MAX_HEIGHT, HEADER_MIN_HEIGHT],
    extrapolate: 'clamp',
  });

  const imageScale = scrollY.interpolate({
    inputRange: [-100, 0],
    outputRange: [1.3, 1],
    extrapolate: 'clamp',
  });

  const imageTranslateY = scrollY.interpolate({
    inputRange: [-100, 0],
    outputRange: [-50, 0],
    extrapolate: 'clamp',
  });

  if (isLoading) {
    return (
      <View style={[styles.loadingContainer, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={Colors.stamp} />
      </View>
    );
  }

  if (!details && !content) {
    return (
      <View style={[styles.errorContainer, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>Content not found</Text>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.backLink}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  const headerImageUrl = backdropUrl || posterUrl;
  const hasActivity = completedActivity || inProgressActivity;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Animated Header with Stretchable Image */}
      <Animated.View style={[styles.headerImageContainer, { height: headerHeight }]}>
        {headerImageUrl ? (
          <Animated.View
            style={[
              styles.imageWrapper,
              {
                transform: [{ scale: imageScale }, { translateY: imageTranslateY }],
              },
            ]}
          >
            <Image
              source={{ uri: headerImageUrl }}
              style={styles.headerImage}
              contentFit="cover"
              transition={200}
            />
          </Animated.View>
        ) : (
          <View style={styles.headerPlaceholder}>
            <Text style={styles.headerPlaceholderText}>{title[0]}</Text>
          </View>
        )}
        <LinearGradient
          colors={['transparent', 'transparent', Colors.background]}
          locations={[0, 0.6, 1]}
          style={styles.headerGradient}
        />
      </Animated.View>

      {/* Back Button */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol name="arrow.left" size={24} color={Colors.white} />
        </Pressable>
      </View>

      {/* Scrollable Content */}
      <Animated.ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingTop: HEADER_MIN_HEIGHT }]}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: false }
        )}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor={Colors.stamp}
            colors={[Colors.stamp]}
            progressViewOffset={HEADER_MIN_HEIGHT}
          />
        }
      >
        {/* Title Info */}
        <View style={styles.infoContainer}>
          <Text style={styles.title}>{title}</Text>

          {/* Rating Row */}
          <View style={styles.ratingRow}>
            <View style={styles.ratingLeft}>
              {communityRating ? (
                <>
                  <View style={styles.starsRow}>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <IconSymbol
                        key={star}
                        name={star <= Math.round(communityRating.average) ? 'star.fill' : 'star'}
                        size={14}
                        color={star <= Math.round(communityRating.average) ? Colors.starFilled : Colors.starEmpty}
                      />
                    ))}
                  </View>
                  <Text style={styles.ratingNumeric}>{communityRating.average.toFixed(1)}</Text>
                  <Text style={styles.ratingCount}>({communityRating.count})</Text>
                </>
              ) : (
                <Text style={styles.noRatings}>No ratings yet</Text>
              )}
            </View>
            <View style={styles.actionButtons}>
              <Pressable
                onPress={toggleInProgress}
                style={styles.inProgressButtonInline}
                disabled={isTogglingInProgress}
              >
                <IconSymbol
                  name={isInProgress ? 'play.circle.fill' : 'play.circle'}
                  size={22}
                  color={Colors.stamp}
                />
              </Pressable>
              <Pressable
                onPress={toggleBookmark}
                style={styles.bookmarkButtonInline}
                disabled={isTogglingBookmark}
              >
                <IconSymbol
                  name={isBookmarked ? 'bookmark.fill' : 'bookmark'}
                  size={22}
                  color={Colors.stamp}
                />
              </Pressable>
            </View>
          </View>

          {/* Meta Row */}
          <View style={styles.metaRow}>
            <View style={styles.metaLeft}>
              {releaseYear ? <Text style={styles.year}>{releaseYear}</Text> : null}
              {contentType === 'movie' && director ? (
                <>
                  <Text style={styles.metaDivider}>•</Text>
                  <Text style={styles.director}>{director}</Text>
                </>
              ) : null}
              {contentType === 'tv' && creator ? (
                <>
                  <Text style={styles.metaDivider}>•</Text>
                  <Text style={styles.director}>{creator}</Text>
                </>
              ) : null}
              {contentType === 'movie' && runtime ? (
                <>
                  <Text style={styles.metaDivider}>•</Text>
                  <Text style={styles.runtime}>{runtime}m</Text>
                </>
              ) : null}
              {contentType === 'tv' && totalSeasons ? (
                <>
                  <Text style={styles.metaDivider}>•</Text>
                  <Text style={styles.runtime}>{totalSeasons} Seasons</Text>
                </>
              ) : null}
            </View>
          </View>

          {/* Genres */}
          {genres.length > 0 && (
            <View style={styles.genresRow}>
              {genres.slice(0, 3).map((genre, index) => (
                <View key={index} style={styles.genreTag}>
                  <Text style={styles.genreText}>{genre}</Text>
                </View>
              ))}
            </View>
          )}

          {/* External Ratings (IMDb, RT) */}
          {externalRatings && (externalRatings.imdb || externalRatings.rottenTomatoes) && (
            <View style={styles.externalRatingsRow}>
              {externalRatings.imdb && (
                <View style={styles.externalRating}>
                  <Image
                    source={{ uri: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/69/IMDB_Logo_2016.svg/120px-IMDB_Logo_2016.svg.png' }}
                    style={styles.imdbLogo}
                    contentFit="contain"
                  />
                  <Text style={styles.ratingValue}>{externalRatings.imdb.rating}</Text>
                  <Text style={styles.ratingMax}>/10</Text>
                </View>
              )}
              {externalRatings.rottenTomatoes && (
                <View style={styles.externalRating}>
                  <Image
                    source={{ uri: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5b/Rotten_Tomatoes.svg/48px-Rotten_Tomatoes.svg.png' }}
                    style={styles.rtLogo}
                    contentFit="contain"
                  />
                  <Text style={styles.ratingValue}>{externalRatings.rottenTomatoes.score}</Text>
                </View>
              )}
            </View>
          )}

          {/* Synopsis */}
          {synopsis && <Text style={styles.synopsis}>{synopsis}</Text>}

          {/* Log Activity Button */}
          <Pressable
            style={({ pressed }) => [
              styles.logActivityButton,
              pressed && styles.buttonPressed,
            ]}
            onPress={() => openLogActivity()}
          >
            <Text style={styles.logActivityButtonText}>Log Activity</Text>
          </Pressable>

          {/* Your Take Section (Completed) */}
          {completedActivity && (
            <View style={styles.yourTakeSection}>
              <View style={styles.yourTakeHeader}>
                <Text style={styles.sectionLabel}>Your Take:</Text>
                {userRanking && (
                  <View style={styles.rankingBadge}>
                    <Text style={styles.rankingBadgeText}>#{userRanking.rank_position}</Text>
                  </View>
                )}
              </View>
              <Pressable
                style={({ pressed }) => [
                  styles.activityCard,
                  pressed && styles.cardPressed,
                ]}
                onPress={() => openLogActivity(true)}
              >
                <View style={styles.activityHeader}>
                  <View style={styles.starsRow}>
                    {completedActivity.watch && (
                      <View style={styles.watchNumberBadge}>
                        <Text style={styles.watchNumberText}>Watch #{completedActivity.watch.watch_number}</Text>
                      </View>
                    )}
                    {[1, 2, 3, 4, 5].map((star) => (
                      <IconSymbol
                        key={star}
                        name={star <= (completedActivity.star_rating || 0) ? 'star.fill' : 'star'}
                        size={16}
                        color={star <= (completedActivity.star_rating || 0) ? Colors.starFilled : Colors.starEmpty}
                      />
                    ))}
                  </View>
                </View>
                {completedActivity.review_text && (
                  <Text style={styles.reviewText}>{completedActivity.review_text}</Text>
                )}
                {completedActivity.tagged_friends && completedActivity.tagged_friends.length > 0 && (
                  <FriendChipsDisplay userIds={completedActivity.tagged_friends} />
                )}
                {completedActivity.watch_date && (
                  <View style={styles.watchDateRow}>
                    <IconSymbol name="calendar" size={14} color={Colors.textMuted} />
                    <Text style={styles.watchDateText}>
                      Watched {new Date(completedActivity.watch_date).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </Text>
                  </View>
                )}
                <View style={styles.editHint}>
                  <IconSymbol name="pencil" size={12} color={Colors.textMuted} />
                  <Text style={styles.editHintText}>Tap to edit</Text>
                </View>
              </Pressable>
            </View>
          )}

          {/* Your Progress Section (In Progress) */}
          {inProgressActivity && (
            <View style={styles.yourProgressSection}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionLabelRow}>
                  <Text style={styles.sectionLabel}>Your Progress:</Text>
                  {inProgressActivity.watch && (
                    <View style={styles.watchNumberBadge}>
                      <Text style={styles.watchNumberText}>Watch #{inProgressActivity.watch.watch_number}</Text>
                    </View>
                  )}
                </View>
                <Pressable onPress={() => router.push(`/activity-history/${content?.id}`)}>
                  <Text style={styles.viewAllLink}>View All Watches</Text>
                </Pressable>
              </View>
              <Pressable
                style={({ pressed }) => [
                  styles.activityCard,
                  pressed && styles.cardPressed,
                ]}
                onPress={() => openLogActivity(false, true)}
              >
                <View style={styles.progressHeader}>
                  <IconSymbol name="play.circle.fill" size={20} color={Colors.textMuted} />
                  <Text style={styles.progressStatus}>In Progress</Text>
                </View>
                <Text style={styles.progressText}>
                  {formatProgress(inProgressActivity) || 'Started watching'}
                </Text>
                {inProgressActivity.note && (
                  <Text style={styles.progressNote}>"{inProgressActivity.note}"</Text>
                )}
                {inProgressActivity.watch_date && (
                  <View style={styles.watchDateRow}>
                    <IconSymbol name="calendar" size={14} color={Colors.textMuted} />
                    <Text style={styles.watchDateText}>
                      {new Date(inProgressActivity.watch_date).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </Text>
                  </View>
                )}
                <View style={styles.editHint}>
                  <IconSymbol name="pencil" size={12} color={Colors.textMuted} />
                  <Text style={styles.editHintText}>Tap to edit</Text>
                </View>
              </Pressable>
            </View>
          )}
        </View>

        {/* Friends' Activity Section */}
        {friendsActivities.length > 0 && (
          <View style={styles.friendsSection}>
            <Text style={styles.sectionLabel}>Friends&apos; Activity:</Text>
            {friendsActivities.map((activity) => (
              <View key={activity.id} style={styles.friendActivityCard}>
                <View style={styles.friendActivityHeader}>
                  <Pressable
                    style={styles.friendInfo}
                    onPress={() => router.push(`/user/${activity.user_id}`)}
                  >
                    <ProfileAvatar
                      imageUrl={activity.user?.profile_image_url}
                      username={activity.user?.username || ''}
                      size="small"
                      variant="circle"
                    />
                    <Text style={styles.friendName}>
                      {activity.user?.display_name || activity.user?.username}
                    </Text>
                  </Pressable>
                  {activity.status === 'completed' ? (
                    <View style={styles.starsRow}>
                      {activity.watch && (
                        <View style={styles.watchNumberBadge}>
                          <Text style={styles.watchNumberText}>Watch #{activity.watch.watch_number}</Text>
                        </View>
                      )}
                      {[1, 2, 3, 4, 5].map((star) => (
                        <IconSymbol
                          key={star}
                          name={star <= (activity.star_rating || 0) ? 'star.fill' : 'star'}
                          size={12}
                          color={star <= (activity.star_rating || 0) ? Colors.starFilled : Colors.starEmpty}
                        />
                      ))}
                    </View>
                  ) : (
                    <View style={styles.inProgressBadge}>
                      <IconSymbol name="play.circle.fill" size={12} color={Colors.textMuted} />
                      {activity.watch && (
                        <View style={styles.watchNumberBadge}>
                          <Text style={styles.watchNumberText}>Watch #{activity.watch.watch_number}</Text>
                        </View>
                      )}
                      <Text style={styles.inProgressBadgeText}>
                        {formatProgress(activity) || 'In Progress'}
                      </Text>
                    </View>
                  )}
                </View>
                {activity.review_text && (
                  <Text style={styles.friendReviewText}>{activity.review_text}</Text>
                )}
                {activity.note && (
                  <Text style={styles.friendNoteText}>"{activity.note}"</Text>
                )}
                {activity.watch_date && (
                  <View style={styles.watchDateRow}>
                    <IconSymbol name="calendar" size={12} color={Colors.textMuted} />
                    <Text style={styles.watchDateText}>
                      {new Date(activity.watch_date).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </Text>
                  </View>
                )}
              </View>
            ))}
          </View>
        )}

        {/* Cast & Crew Section */}
        {(cast.length > 0 || crew.length > 0) && (
          <CastCrewSection cast={cast} crew={crew} />
        )}
      </Animated.ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  errorText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.lg,
    color: Colors.textMuted,
    marginBottom: Spacing.lg,
  },
  backLink: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.md,
    color: Colors.stamp,
  },
  headerImageContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    overflow: 'hidden',
    backgroundColor: Colors.dust,
    zIndex: 1,
  },
  imageWrapper: {
    width: '100%',
    height: '100%',
  },
  headerImage: {
    width: '100%',
    height: '100%',
  },
  headerPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.dust,
  },
  headerPlaceholderText: {
    fontFamily: Fonts.serifBold,
    fontSize: FontSizes['5xl'],
    color: Colors.textMuted,
  },
  headerGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '100%',
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollView: {
    flex: 1,
    zIndex: 2,
  },
  scrollContent: {
    paddingBottom: Spacing['3xl'],
  },
  infoContainer: {
    backgroundColor: Colors.background,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xl,
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
    marginTop: -Spacing.lg,
  },
  title: {
    fontFamily: Fonts.serifBold,
    fontSize: FontSizes['3xl'],
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  ratingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  ratingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  starsRow: {
    flexDirection: 'row',
    gap: 2,
  },
  ratingNumeric: {
    fontFamily: Fonts.serifBold,
    fontSize: FontSizes.lg,
    color: Colors.text,
  },
  ratingCount: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
  },
  noRatings: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
    fontStyle: 'italic',
  },
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  inProgressButtonInline: {
    padding: Spacing.xs,
  },
  bookmarkButtonInline: {
    padding: Spacing.xs,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  metaLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    flex: 1,
  },
  year: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.md,
    color: Colors.textSecondary,
  },
  metaDivider: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.md,
    color: Colors.textMuted,
    marginHorizontal: Spacing.sm,
  },
  director: {
    fontFamily: Fonts.serifItalic,
    fontSize: FontSizes.md,
    color: Colors.stamp,
  },
  runtime: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.md,
    color: Colors.textMuted,
  },
  genresRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  genreTag: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    backgroundColor: Colors.dust,
    borderRadius: BorderRadius.full,
  },
  genreText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
  },
  externalRatingsRow: {
    flexDirection: 'row',
    gap: Spacing.xl,
    marginBottom: Spacing.lg,
  },
  externalRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  imdbLogo: {
    width: 40,
    height: 20,
    marginRight: Spacing.xs,
  },
  rtLogo: {
    width: 18,
    height: 18,
    marginRight: Spacing.xs,
  },
  ratingValue: {
    fontFamily: Fonts.serifBold,
    fontSize: FontSizes.lg,
    color: Colors.text,
  },
  ratingMax: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
  },
  synopsis: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.md,
    color: Colors.text,
    lineHeight: FontSizes.md * 1.6,
    marginBottom: Spacing.xl,
  },
  logActivityButton: {
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
    backgroundColor: Colors.stamp,
    marginBottom: Spacing.xl,
  },
  logActivityButtonText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.sm,
    color: Colors.white,
    letterSpacing: 1,
  },
  buttonPressed: {
    opacity: 0.8,
  },
  yourTakeSection: {
    marginBottom: Spacing.xl,
  },
  yourProgressSection: {
    marginBottom: Spacing.xl,
  },
  yourTakeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  sectionLabel: {
    fontFamily: Fonts.serifSemiBold,
    fontSize: FontSizes.lg,
    color: Colors.text,
  },
  sectionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  watchNumberBadge: {
    backgroundColor: Colors.dust,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  watchNumberText: {
    fontFamily: Fonts.sansMedium,
    fontSize: FontSizes.xs,
    color: Colors.text,
  },
  viewAllLink: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    color: Colors.stamp,
  },
  rankingBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.stamp,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankingBadgeText: {
    fontFamily: Fonts.serifBold,
    fontSize: FontSizes.sm,
    color: Colors.white,
  },
  activityCard: {
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    backgroundColor: Colors.cardBackground,
    borderRadius: BorderRadius.md,
  },
  cardPressed: {
    opacity: 0.8,
  },
  activityHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  progressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  progressStatus: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.md,
    color: Colors.textMuted,
  },
  progressText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.lg,
    color: Colors.text,
  },
  progressNote: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.md,
    color: Colors.textSecondary,
    fontStyle: 'italic',
    marginTop: Spacing.sm,
  },
  reviewText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.md,
    color: Colors.text,
    lineHeight: FontSizes.md * 1.5,
  },
  watchDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.sm,
  },
  watchDateText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
  },
  editHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.md,
  },
  editHintText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
  },
  friendsSection: {
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.xl,
  },
  friendActivityCard: {
    backgroundColor: Colors.cardBackground,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginTop: Spacing.md,
  },
  friendActivityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  friendInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  friendName: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.md,
    color: Colors.text,
  },
  inProgressBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  inProgressBadgeText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
  },
  friendReviewText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    lineHeight: FontSizes.sm * 1.5,
  },
  friendNoteText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
    fontStyle: 'italic',
  },
});
