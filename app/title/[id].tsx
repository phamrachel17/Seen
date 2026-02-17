import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Dimensions,
  Animated,
  StatusBar,
  RefreshControl,
  Modal,
  ScrollView,
  Linking,
} from 'react-native';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Fonts, FontSizes, Spacing, BorderRadius } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { StarDisplay } from '@/components/ui/star-display';
import { CastCrewSection } from '@/components/cast-crew-section';
import { FriendChipsDisplay } from '@/components/friend-chips';
import { AddToListModal } from '@/components/add-to-list-modal';
import { ProfileAvatar } from '@/components/profile-avatar';
import { getMovieDetails, getTVShowDetails, getSimilarMovies, getSimilarTVShows, getMovieVideos, getTVShowVideos } from '@/lib/tmdb';
import { HorizontalMovieRow } from '@/components/horizontal-movie-row';
import { getExternalRatings } from '@/lib/omdb';
import { getContentByTmdbId, ensureContentExists } from '@/lib/content';
import {
  getUserCompletedActivity,
  getUserInProgressActivity,
  getFriendsActivitiesForContent,
  getFriendsWhoBookmarked,
  formatProgress,
  getActiveWatch,
  createBookmarkActivity,
  deleteBookmarkActivity,
} from '@/lib/activity';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { getFollowingIds } from '@/lib/follows';
import {
  Movie,
  TVShow,
  MovieDetails,
  TVShowDetails,
  Content,
  Activity,
  ContentType,
  Ranking,
  Watch,
  ExternalRatings,
  SeasonRating,
  User,
} from '@/types';
import { ActivityFeedCard } from '@/components/activity-feed-card';
import { getSeasonRatings } from '@/lib/season-ratings';
import { SeasonRatingSheet } from '@/components/season-rating-sheet';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const HEADER_MIN_HEIGHT = Math.round(SCREEN_HEIGHT * 0.35);
const HEADER_MAX_HEIGHT = Math.round(SCREEN_HEIGHT * 0.45);

export default function TitleDetailScreen() {
  const { id, type } = useLocalSearchParams<{ id: string; type?: ContentType }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const scrollY = useRef(new Animated.Value(0)).current;
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => { isMountedRef.current = false; };
  }, []);

  // Content state
  const [content, setContent] = useState<Content | null>(null);
  const [movieDetails, setMovieDetails] = useState<MovieDetails | null>(null);
  const [tvDetails, setTVDetails] = useState<TVShowDetails | null>(null);

  // UI state
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [isTogglingBookmark, setIsTogglingBookmark] = useState(false);


  // Activity state
  const [completedActivity, setCompletedActivity] = useState<Activity | null>(null);
  const [inProgressActivity, setInProgressActivity] = useState<Activity | null>(null);
  const [activeWatch, setActiveWatch] = useState<Watch | null>(null);
  const [userRanking, setUserRanking] = useState<Ranking | null>(null);
  const [totalRankingsCount, setTotalRankingsCount] = useState<number>(0);
  const [friendsActivities, setFriendsActivities] = useState<Activity[]>([]);

  // Community rating
  const [communityRating, setCommunityRating] = useState<{
    average: number;
    count: number;
  } | null>(null);

  // External ratings (IMDb, RT)
  const [externalRatings, setExternalRatings] = useState<ExternalRatings | null>(null);

  // Add to list modal
  const [showAddToListModal, setShowAddToListModal] = useState(false);

  // Season ratings (TV shows only)
  const [seasonRatings, setSeasonRatings] = useState<SeasonRating[]>([]);
  const [selectedSeasonForRating, setSelectedSeasonForRating] = useState<number | null>(null);
  const [showAllSeasons, setShowAllSeasons] = useState(false);

  // Friends who want to watch
  const [friendsWantToWatch, setFriendsWantToWatch] = useState<
    Pick<User, 'id' | 'username' | 'display_name' | 'profile_image_url'>[]
  >([]);
  const [showFriendsWatchlistModal, setShowFriendsWatchlistModal] = useState(false);

  // Friends' Activity grouped view
  const [expandedFriendSeasons, setExpandedFriendSeasons] = useState<Set<number>>(new Set());

  // Similar content
  const [similarContent, setSimilarContent] = useState<(Movie | TVShow)[]>([]);

  // Trailer
  const [trailerKey, setTrailerKey] = useState<string | null>(null);

  useEffect(() => {
    if (id) {
      loadContent(parseInt(id, 10), type || 'movie');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, type]);

  // Fetch external ratings separately (non-blocking) once we have the IMDb ID
  useEffect(() => {
    const fetchRatings = async () => {
      const imdbId = movieDetails?.imdb_id || tvDetails?.imdb_id;
      if (imdbId) {
        const ratings = await getExternalRatings(imdbId);
        setExternalRatings(ratings);
      }
    };
    fetchRatings();
  }, [movieDetails?.imdb_id, tvDetails?.imdb_id]);

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
      if (contentType === 'movie') {
        const [details, similar, videos] = await Promise.all([
          getMovieDetails(tmdbId),
          getSimilarMovies(tmdbId),
          getMovieVideos(tmdbId),
        ]);
        if (!isMountedRef.current) return;
        setMovieDetails(details);
        setSimilarContent(similar);
        setTrailerKey(videos.trailerKey || videos.teaserKey);
      } else {
        const [details, similar, videos] = await Promise.all([
          getTVShowDetails(tmdbId),
          getSimilarTVShows(tmdbId),
          getTVShowVideos(tmdbId),
        ]);
        if (!isMountedRef.current) return;
        setTVDetails(details);
        setSimilarContent(similar);
        setTrailerKey(videos.trailerKey || videos.teaserKey);
      }

      // Ensure content exists in DB
      const contentRecord = await ensureContentExists(tmdbId, contentType);
      if (!isMountedRef.current) return;
      setContent(contentRecord);

      if (!contentRecord) return;

      // Load user data
      if (user) {
        await loadUserData(contentRecord.id, tmdbId);
      }

      // Load community rating
      if (isMountedRef.current) {
        await loadCommunityRating(contentRecord.id);
      }
    } catch (error) {
      console.error('Error loading content:', error);
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  };

  const loadUserData = async (contentId: number, tmdbId: number) => {
    if (!user) return;

    try {
      // Load user's activities, bookmark, ranking, watch, and friends' activities in parallel
      const followingIds = await getFollowingIds(user.id);
      const idsForActivity = [...followingIds, user.id]; // Include self to show own activity in feed

      const contentType = type || 'movie';
      const [completed, inProgress, watch, bookmark, ranking, friendsActs, friendsBookmarked] = await Promise.all([
        getUserCompletedActivity(user.id, contentId),
        getUserInProgressActivity(user.id, contentId),
        getActiveWatch(user.id, contentId),
        checkBookmarkStatus(contentId),
        loadUserRanking(tmdbId, contentType),
        getFriendsActivitiesForContent(user.id, contentId, idsForActivity),
        getFriendsWhoBookmarked(contentId, followingIds),
      ]);

      setCompletedActivity(completed);
      setInProgressActivity(inProgress);
      setActiveWatch(watch);
      setIsBookmarked(!!bookmark);
      setUserRanking(ranking);
      setFriendsWantToWatch(friendsBookmarked);

      // Collect unique activities per friend (one in-progress + one completed per user)
      // This ensures we show both types of activity but not duplicates
      const seenUserStatus = new Set<string>();
      const uniqueActivities: Activity[] = [];

      for (const activity of friendsActs) {
        if (activity.status === 'bookmarked') continue;
        const key = `${activity.user_id}-${activity.status}-${activity.rated_season ?? 'overall'}`;
        if (!seenUserStatus.has(key)) {
          seenUserStatus.add(key);
          uniqueActivities.push(activity);
        }
      }

      // Sort by created_at descending and limit to 20 (structured display handles density)
      uniqueActivities.sort((a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      setFriendsActivities(uniqueActivities.slice(0, 20));

      // Load season ratings for TV shows
      if (contentType === 'tv') {
        const ratings = await getSeasonRatings(user.id, contentId);
        setSeasonRatings(ratings);
      }
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
    // Fetch user's ranking for this content
    const { data } = await supabase
      .from('rankings')
      .select('*')
      .eq('user_id', user?.id)
      .eq('movie_id', tmdbId)
      .eq('content_type', contentType)
      .single();

    // Also fetch total count of rankings for this content type
    if (data) {
      const { count } = await supabase
        .from('rankings')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user?.id)
        .eq('content_type', contentType);
      setTotalRankingsCount(count || 0);
    }

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
        // Remove bookmark from bookmarks table
        await supabase
          .from('bookmarks')
          .delete()
          .eq('user_id', user.id)
          .eq('content_id', content.id);
        // Also remove from activity_log (removes from feed)
        await deleteBookmarkActivity(user.id, content.id);
        setIsBookmarked(false);
      } else {
        // Add to bookmarks table
        await supabase.from('bookmarks').insert({
          user_id: user.id,
          content_id: content.id,
        });
        // Also add to activity_log (appears in feed)
        await createBookmarkActivity(user.id, content.id);
        setIsBookmarked(true);
      }
    } catch (error) {
      console.error('Error toggling bookmark:', error);
    } finally {
      setIsTogglingBookmark(false);
    }
  };

  const openLogActivity = (editDirectly?: boolean, editInProgress?: boolean, editDetailsOnly?: boolean) => {
    if (content) {
      const params = new URLSearchParams();
      if (editDirectly) params.append('editMode', 'true');
      if (editInProgress) params.append('editInProgress', 'true');
      if (editDetailsOnly) params.append('editDetailsOnly', 'true');
      const query = params.toString() ? `?${params.toString()}` : '';
      router.push(`/log-activity/${content.id}${query}`);
    }
  };

  // Helper for score badge color
  const getScoreColor = (score: number) => {
    if (score >= 8.0) return Colors.stamp;
    if (score >= 6.0) return Colors.settledTea;
    return Colors.textMuted;
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
    return <LoadingScreen />;
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

  // Group friends' activities for structured display
  const overallRatings = friendsActivities.filter(
    a => a.status === 'completed' && !a.rated_season
  );
  const seasonRatingsByNumber = new Map<number, Activity[]>();
  for (const a of friendsActivities) {
    if (a.status === 'completed' && a.rated_season) {
      const existing = seasonRatingsByNumber.get(a.rated_season) || [];
      existing.push(a);
      seasonRatingsByNumber.set(a.rated_season, existing);
    }
  }
  const sortedFriendSeasons = [...seasonRatingsByNumber.entries()].sort(
    ([a], [b]) => a - b
  );
  const inProgressActivities = friendsActivities.filter(
    a => a.status === 'in_progress'
  );

  const toggleFriendSeason = (seasonNum: number) => {
    setExpandedFriendSeasons(prev => {
      const next = new Set(prev);
      if (next.has(seasonNum)) next.delete(seasonNum);
      else next.add(seasonNum);
      return next;
    });
  };

  const FriendRatingRow = ({ activity }: { activity: Activity }) => {
    const friend = activity.user;
    if (!friend) return null;
    return (
      <Pressable
        style={({ pressed }) => [
          styles.friendRatingRow,
          pressed && { opacity: 0.7 },
        ]}
        onPress={() => router.push(`/user/${friend.id}` as any)}
      >
        <ProfileAvatar
          imageUrl={friend.profile_image_url}
          username={friend.username}
          size="tiny"
          variant="circle"
        />
        <Text style={styles.friendRatingName} numberOfLines={1}>
          {friend.display_name || friend.username}
        </Text>
        <View style={styles.friendRatingStars}>
          <StarDisplay rating={activity.star_rating || 0} size={12} />
        </View>
        {activity.review_text && (
          <Text style={styles.friendRatingReview} numberOfLines={1}>
            {activity.review_text}
          </Text>
        )}
      </Pressable>
    );
  };

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
        {/* Content wrapper ensures opaque background below poster */}
        <View style={styles.contentWrapper}>
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
                onPress={() => {
                  if (trailerKey) {
                    Linking.openURL(`https://www.youtube.com/watch?v=${trailerKey}`);
                  }
                }}
                style={styles.inProgressButtonInline}
                disabled={!trailerKey}
              >
                <IconSymbol
                  name="play.circle.fill"
                  size={22}
                  color={trailerKey ? Colors.stamp : Colors.textMuted}
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
              <Pressable
                onPress={() => setShowAddToListModal(true)}
                style={styles.addToListButtonInline}
              >
                <IconSymbol
                  name="plus.rectangle.on.folder"
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
                    source={require('@/assets/images/imdb-logo.png')}
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
                    source={require('@/assets/images/rotten-tomatoes-logo.png')}
                    style={styles.rtLogo}
                    contentFit="contain"
                  />
                  <Text style={styles.ratingValue}>{externalRatings.rottenTomatoes.score}</Text>
                </View>
              )}
            </View>
          )}

          {/* Friends Want to Watch */}
          {friendsWantToWatch.length > 0 && (
            <Pressable
              style={styles.friendsWantToWatchRow}
              onPress={() => setShowFriendsWatchlistModal(true)}
            >
              <View style={styles.avatarStack}>
                {friendsWantToWatch.slice(0, 5).map((friend, index) => (
                  <View
                    key={friend.id}
                    style={[
                      styles.stackedAvatar,
                      { marginLeft: index === 0 ? 0 : -8, zIndex: 5 - index },
                    ]}
                  >
                    <ProfileAvatar
                      imageUrl={friend.profile_image_url}
                      username={friend.username}
                      size="tiny"
                      variant="circle"
                    />
                  </View>
                ))}
                {friendsWantToWatch.length > 5 && (
                  <View style={[styles.overflowBadge, { marginLeft: -8 }]}>
                    <Text style={styles.overflowBadgeText}>
                      +{friendsWantToWatch.length - 5}
                    </Text>
                  </View>
                )}
              </View>
              <Text style={styles.friendsWantToWatchText}>
                {friendsWantToWatch.length} {friendsWantToWatch.length === 1 ? 'friend wants' : 'friends want'} to watch
              </Text>
            </Pressable>
          )}

          {/* Synopsis */}
          {synopsis && <Text style={styles.synopsis}>{synopsis}</Text>}

          {/* Action Buttons Row */}
          <View style={styles.actionButtonsRow}>
            {/* Rank/Re-rank Button */}
            <Pressable
              style={({ pressed }) => [
                styles.actionButton,
                styles.rankButton,
                pressed && styles.buttonPressed,
              ]}
              onPress={() => openLogActivity()}
            >
              <Text style={styles.actionButtonText}>
                {completedActivity ? 'Re-rank' : 'Rank'}
              </Text>
            </Pressable>

            {/* Log Progress Button */}
            <Pressable
              style={({ pressed }) => [
                styles.actionButton,
                styles.logProgressButton,
                pressed && styles.buttonPressed,
              ]}
              onPress={() => openLogActivity(false, true)}
            >
              <Text style={styles.logProgressButtonText}>Log Progress</Text>
            </Pressable>
          </View>

          {/* Your Take Section (Completed + Season Ratings for TV) */}
          {(completedActivity || (contentType === 'tv' && tvDetails?.seasons && tvDetails.seasons.length > 0)) && (
            <View style={styles.yourTakeSection}>
              <View style={styles.yourTakeHeader}>
                <Text style={styles.sectionLabel}>Your Take:</Text>
              </View>

              {/* Overall rating + ranking info - only if completedActivity */}
              {completedActivity && (
                <>
                  {/* Ranking Info - show when item is ranked (ABOVE the review card) */}
                  {userRanking && (
                    <View style={styles.rankingInfoContainer}>
                      <View style={styles.rankingInfoRow}>
                        {/* Score Badge */}
                        <View style={[
                          styles.scoreBadge,
                          { borderColor: getScoreColor(userRanking.display_score) }
                        ]}>
                          <Text style={[
                            styles.scoreBadgeText,
                            { color: getScoreColor(userRanking.display_score) }
                          ]}>
                            {userRanking.display_score.toFixed(1)}
                          </Text>
                        </View>

                        {/* Position and Context */}
                        <View style={styles.rankingTextContainer}>
                          <Text style={styles.rankingPositionText}>
                            #{userRanking.rank_position}
                            {totalRankingsCount > 0 && ` of ${totalRankingsCount}`}
                          </Text>
                          <Text style={styles.rankingContextText}>
                            in your {userRanking.content_type === 'movie' ? 'Movies' : 'TV Shows'} rankings
                          </Text>
                        </View>
                      </View>
                    </View>
                  )}

                  <Pressable
                    style={({ pressed }) => [
                      styles.activityCard,
                      pressed && styles.cardPressed,
                    ]}
                    onPress={() => openLogActivity(false, false, true)}
                  >
                    <View style={styles.activityHeader}>
                      <View style={styles.starsRow}>
                        {completedActivity.watch && (
                          <View style={styles.watchNumberBadge}>
                            <Text style={styles.watchNumberText}>Watch #{completedActivity.watch.watch_number}</Text>
                          </View>
                        )}
                        <StarDisplay rating={completedActivity.star_rating || 0} size={16} />
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
                </>
              )}

              {/* Season Ratings - nested under Your Take for TV shows */}
              {contentType === 'tv' && tvDetails?.seasons && tvDetails.seasons.length > 0 && (() => {
                const allSeasons = tvDetails.seasons.filter(s => s.season_number > 0);
                const displayedSeasons = showAllSeasons ? allSeasons : allSeasons.slice(0, 3);
                const hasMoreSeasons = allSeasons.length > 3;

                return (
                  <>
                    <View style={[styles.subheaderPill, { marginTop: 0 }]}>
                      <Text style={styles.subheaderPillText}>Your Season Ratings</Text>
                    </View>
                    <View style={styles.seasonRatingsList}>
                      {displayedSeasons.map((season, index) => {
                        const rating = seasonRatings.find(r => r.season_number === season.season_number);
                        const isLast = index === displayedSeasons.length - 1 && !hasMoreSeasons;
                        return (
                          <Pressable
                            key={season.season_number}
                            style={({ pressed }) => [
                              styles.seasonRatingRow,
                              !isLast && styles.seasonRatingRowBorder,
                              pressed && styles.seasonRatingRowPressed,
                            ]}
                            onPress={() => setSelectedSeasonForRating(season.season_number)}
                          >
                            <View style={styles.seasonRatingLeft}>
                              <Text style={styles.seasonLabel}>Season {season.season_number}</Text>
                              {rating?.review_text && (
                                <Text style={styles.seasonReviewPreview} numberOfLines={1}>
                                  <Text style={styles.seasonReviewLabel}>Critique: </Text>
                                  {rating.review_text}
                                </Text>
                              )}
                            </View>
                            {rating ? (
                              <StarDisplay rating={rating.star_rating} size={14} />
                            ) : (
                              <Text style={styles.rateSeasonHint}>Tap to rate</Text>
                            )}
                          </Pressable>
                        );
                      })}
                      {hasMoreSeasons && (
                        <Pressable
                          style={styles.showAllSeasonsButton}
                          onPress={() => setShowAllSeasons(!showAllSeasons)}
                        >
                          <Text style={styles.showAllSeasonsText}>
                            {showAllSeasons ? 'Show less' : `Show all ${allSeasons.length} seasons`}
                          </Text>
                          <IconSymbol
                            name={showAllSeasons ? 'chevron.up' : 'chevron.down'}
                            size={14}
                            color={Colors.stamp}
                          />
                        </Pressable>
                      )}
                    </View>
                  </>
                );
              })()}
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
                  <Text style={styles.progressNote}>&quot;{inProgressActivity.note}&quot;</Text>
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

            {/* Overall Ratings */}
            {overallRatings.length > 0 && (
              <>
                {sortedFriendSeasons.length > 0 && (
                  <View style={[styles.subheaderPill, { marginTop: Spacing.sm }]}>
                    <Text style={styles.subheaderPillText}>Friends&apos; Overall Show Rating</Text>
                  </View>
                )}
                <View style={styles.friendsActivityList}>
                  {overallRatings.map((activity) => (
                    <ActivityFeedCard key={activity.id} activity={activity} hidePoster />
                  ))}
                </View>
              </>
            )}

            {/* Per-Season Ratings (collapsible) */}
            {sortedFriendSeasons.length > 0 && (
              <View style={styles.subheaderPill}>
                <Text style={styles.subheaderPillText}>Friends&apos; Season Ratings</Text>
              </View>
            )}
            {sortedFriendSeasons.map(([seasonNum, activities]) => {
              const isExpanded = expandedFriendSeasons.has(seasonNum);
              return (
                <View key={seasonNum}>
                  <Pressable
                    style={styles.seasonToggleRow}
                    onPress={() => toggleFriendSeason(seasonNum)}
                  >
                    <IconSymbol
                      name={isExpanded ? 'chevron.down' : 'chevron.right'}
                      size={14}
                      color={Colors.textMuted}
                    />
                    <Text style={styles.seasonToggleText}>
                      Season {seasonNum}
                    </Text>
                    <Text style={styles.seasonToggleCount}>
                      {activities.length} {activities.length === 1 ? 'rating' : 'ratings'}
                    </Text>
                  </Pressable>
                  {isExpanded && (
                    <View style={styles.friendsGroupCard}>
                      {activities.map((activity) => (
                        <FriendRatingRow key={activity.id} activity={activity} />
                      ))}
                    </View>
                  )}
                </View>
              );
            })}

            {/* In Progress */}
            {inProgressActivities.length > 0 && (
              <>
                <View style={styles.subheaderPill}>
                  <Text style={styles.subheaderPillText}>In Progress</Text>
                </View>
                <View style={styles.friendsActivityList}>
                  {inProgressActivities.map((activity) => (
                    <ActivityFeedCard key={activity.id} activity={activity} hidePoster />
                  ))}
                </View>
              </>
            )}
          </View>
        )}

        {/* Cast & Crew Section */}
        {(cast.length > 0 || crew.length > 0) && (
          <CastCrewSection cast={cast} crew={crew} />
        )}

        {/* Similar Content Section */}
        {similarContent.length > 0 && (
          <View style={styles.similarSection}>
            <HorizontalMovieRow
              title="More Like This"
              movies={similarContent}
              type={contentType}
            />
          </View>
        )}
        </View>
      </Animated.ScrollView>

      {/* Add to List Modal */}
      {content && (
        <AddToListModal
          visible={showAddToListModal}
          onClose={() => setShowAddToListModal(false)}
          contentId={content.id}
          contentTitle={title}
        />
      )}

      {/* Friends Want to Watch Modal */}
      <Modal
        visible={showFriendsWatchlistModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowFriendsWatchlistModal(false)}
      >
        <Pressable
          style={styles.fwModalOverlay}
          onPress={() => setShowFriendsWatchlistModal(false)}
        >
          <Pressable
            style={[styles.fwModalSheet, { paddingBottom: insets.bottom + Spacing.lg }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.fwModalHeader}>
              <Text style={styles.fwModalTitle}>Want to Watch</Text>
              <Pressable
                style={styles.fwModalClose}
                onPress={() => setShowFriendsWatchlistModal(false)}
              >
                <IconSymbol name="xmark" size={18} color={Colors.text} />
              </Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {friendsWantToWatch.map((friend) => (
                <Pressable
                  key={friend.id}
                  style={({ pressed }) => [
                    styles.fwModalRow,
                    pressed && { opacity: 0.7 },
                  ]}
                  onPress={() => {
                    setShowFriendsWatchlistModal(false);
                    router.push(`/user/${friend.id}` as any);
                  }}
                >
                  <ProfileAvatar
                    imageUrl={friend.profile_image_url}
                    username={friend.username}
                    size="small"
                    variant="circle"
                  />
                  <Text style={styles.fwModalName}>
                    {friend.display_name || friend.username}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Season Rating Sheet - TV Shows Only */}
      {content && selectedSeasonForRating !== null && (
        <SeasonRatingSheet
          visible={selectedSeasonForRating !== null}
          onClose={() => setSelectedSeasonForRating(null)}
          onSave={async () => {
            // Reload season ratings after save
            if (user) {
              const ratings = await getSeasonRatings(user.id, content.id);
              setSeasonRatings(ratings);
            }
          }}
          contentId={content.id}
          seasonNumber={selectedSeasonForRating}
          showTitle={title}
        />
      )}
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
    minHeight: SCREEN_HEIGHT + HEADER_MIN_HEIGHT,
  },
  contentWrapper: {
    backgroundColor: Colors.background,
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
  addToListButtonInline: {
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
    alignItems: 'center',
    gap: Spacing.lg,
    marginTop: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  externalRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  imdbLogo: {
    width: 45,
    height: 22,
    marginRight: Spacing.xs,
  },
  rtLogo: {
    width: 20,
    height: 20,
    marginRight: Spacing.xs,
  },
  ratingValue: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.md,
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
  actionButtonsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  actionButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
  },
  rankButton: {
    backgroundColor: Colors.stamp,
  },
  logProgressButton: {
    backgroundColor: Colors.stamp,
  },
  actionButtonText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.sm,
    color: Colors.white,
    letterSpacing: 1,
  },
  logProgressButtonText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.sm,
    color: Colors.white,
    letterSpacing: 1,
  },
  buttonPressed: {
    opacity: 0.8,
  },
  yourTakeSection: {
    marginTop: Spacing.lg,
    marginBottom: Spacing.xl,
  },
  yourProgressSection: {
    marginBottom: Spacing.xl,
  },
  seasonRatingsList: {
    backgroundColor: Colors.cardBackground,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
  },
  seasonRatingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  seasonRatingRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  seasonRatingRowPressed: {
    backgroundColor: Colors.dust,
  },
  seasonRatingLeft: {
    flex: 1,
    marginRight: Spacing.md,
  },
  seasonLabel: {
    fontFamily: Fonts.sansMedium,
    fontSize: FontSizes.md,
    color: Colors.text,
  },
  seasonReviewPreview: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
    marginTop: Spacing.xs,
  },
  seasonReviewLabel: {
    fontFamily: Fonts.sansBold,
  },
  rateSeasonHint: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
  },
  showAllSeasonsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.md,
  },
  showAllSeasonsText: {
    fontFamily: Fonts.sansMedium,
    fontSize: FontSizes.sm,
    color: Colors.stamp,
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
    fontFamily: Fonts.serifExtraBold,
    fontSize: FontSizes['2xl'],
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
  rankingInfoContainer: {
    marginBottom: Spacing.md,
  },
  rankingInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  scoreBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
  },
  scoreBadgeText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.md,
  },
  rankingTextContainer: {
    flex: 1,
  },
  rankingPositionText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.md,
    color: Colors.text,
  },
  rankingContextText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
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
    marginTop: Spacing.sm,
    marginBottom: Spacing.lg,
    paddingHorizontal: Spacing.xl,
  },
  friendsActivityList: {
    gap: Spacing.md,
    marginTop: Spacing.xs,
  },
  friendsGroupCard: {
    backgroundColor: Colors.cardBackground,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  subheaderPill: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(128, 47, 29, 0.15)',
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  subheaderPillText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.sm,
    color: Colors.stamp,
  },
  seasonToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
  },
  seasonToggleText: {
    fontFamily: Fonts.sansMedium,
    fontSize: FontSizes.md,
    color: Colors.text,
    flex: 1,
  },
  seasonToggleCount: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
  },
  friendRatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  friendRatingName: {
    fontFamily: Fonts.sansMedium,
    fontSize: FontSizes.sm,
    color: Colors.text,
    width: 80,
  },
  friendRatingStars: {
    flexDirection: 'row',
  },
  friendRatingReview: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
    flex: 1,
    marginLeft: Spacing.sm,
  },
  similarSection: {
    marginTop: Spacing.lg,
  },
  // Friends Want to Watch row
  friendsWantToWatchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  avatarStack: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stackedAvatar: {
    borderWidth: 2,
    borderColor: Colors.background,
    borderRadius: BorderRadius.full,
  },
  overflowBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.dust,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.background,
  },
  overflowBadgeText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 10,
    color: Colors.textMuted,
  },
  friendsWantToWatchText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
  },
  // Friends watchlist modal
  fwModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  fwModalSheet: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    maxHeight: '60%',
  },
  fwModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.lg,
  },
  fwModalTitle: {
    fontFamily: Fonts.serifBold,
    fontSize: FontSizes.xl,
    color: Colors.text,
  },
  fwModalClose: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dust,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fwModalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  fwModalName: {
    fontFamily: Fonts.sansMedium,
    fontSize: FontSizes.md,
    color: Colors.text,
    flex: 1,
  },
});
