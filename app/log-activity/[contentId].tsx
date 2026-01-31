import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Switch,
  KeyboardAvoidingView,
  Platform,
  Animated as RNAnimated,
  NativeSyntheticEvent,
  NativeScrollEvent,
  Alert,
} from 'react-native';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Image } from 'expo-image';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  runOnJS,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Fonts, FontSizes, Spacing, BorderRadius } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { StarRating } from '@/components/star-rating';
import { SuggestedFriendPills } from '@/components/suggested-friend-pills';
import { useAuth } from '@/lib/auth-context';
import { useCache } from '@/lib/cache-context';
import { getPendingFriendSelection } from '@/lib/friend-picker-state';
import { getContentById, ensureContentExists } from '@/lib/content';
import {
  createActivity,
  updateActivity,
  deleteActivity,
  getUserCompletedActivity,
  getUserInProgressActivity,
  getActiveWatch,
  abandonWatch,
  startNewWatch,
  getProgressPercent,
  getLatestActivityForWatch,
  getWatchCount,
  formatProgress,
} from '@/lib/activity';
import { Activity, Watch } from '@/types';
import { getMovieDetails, getTVShowDetails, getSeasonDetails } from '@/lib/tmdb';
import { Content, ContentType, MovieDetails, TVShowDetails, Episode, ActivityStatus } from '@/types';
import { deleteRankingWithActivity } from '@/lib/ranking';

type Step = 'existing_choice' | 'watch_conflict' | 'status' | 'completed' | 'in_progress';

// Movie Progress Slider Component
const MovieProgressSlider = ({
  value,
  maxValue,
  onChange,
}: {
  value: number;
  maxValue: number;
  onChange: (val: number) => void;
}) => {
  const sliderWidth = useSharedValue(0);
  const translateX = useSharedValue(0);
  const isDragging = useSharedValue(false);

  // Sync position when value changes externally (from TextInput)
  useEffect(() => {
    if (!isDragging.value && sliderWidth.value > 0 && maxValue > 0) {
      translateX.value = (value / maxValue) * sliderWidth.value;
    }
  }, [value, maxValue]);

  const panGesture = Gesture.Pan()
    .onStart(() => {
      isDragging.value = true;
    })
    .onUpdate((e) => {
      const newX = Math.max(0, Math.min(e.x, sliderWidth.value));
      translateX.value = newX;
      const newValue = Math.round((newX / sliderWidth.value) * maxValue);
      runOnJS(onChange)(newValue);
    })
    .onEnd(() => {
      isDragging.value = false;
      runOnJS(Haptics.selectionAsync)();
    });

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: Math.max(0, translateX.value - 16) }],
  }));

  const fillStyle = useAnimatedStyle(() => ({
    width: translateX.value,
  }));

  const progressPercent = maxValue > 0 ? Math.min(100, (value / maxValue) * 100) : 0;

  return (
    <View
      style={sliderStyles.container}
      onLayout={(e) => {
        sliderWidth.value = e.nativeEvent.layout.width;
        if (maxValue > 0) {
          translateX.value = (value / maxValue) * e.nativeEvent.layout.width;
        }
      }}
    >
      <GestureDetector gesture={panGesture}>
        <View style={sliderStyles.track}>
          <Animated.View style={[sliderStyles.fill, fillStyle]} />
          <Animated.View style={[sliderStyles.thumb, thumbStyle]}>
            <Text style={sliderStyles.thumbText}>{value}</Text>
          </Animated.View>
        </View>
      </GestureDetector>
      <Text style={sliderStyles.percentText}>{Math.round(progressPercent)}%</Text>
    </View>
  );
};

const sliderStyles = StyleSheet.create({
  container: {
    marginTop: Spacing.lg,
    height: 50,
  },
  track: {
    height: 8,
    backgroundColor: Colors.dust,
    borderRadius: 4,
    marginTop: 18,
  },
  fill: {
    height: '100%',
    backgroundColor: Colors.stamp,
    borderRadius: 4,
    position: 'absolute',
    left: 0,
    top: 0,
  },
  thumb: {
    position: 'absolute',
    top: -18,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.stamp,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  thumbText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.xs,
    color: Colors.white,
  },
  percentText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
    textAlign: 'right',
    marginTop: Spacing.sm,
  },
});

// iOS-style Wheel Picker for TV Shows
const WHEEL_ITEM_HEIGHT = 32;
const WHEEL_VISIBLE_ITEMS = 5; // 2 above + selected + 2 below
const WHEEL_PICKER_HEIGHT = WHEEL_ITEM_HEIGHT * WHEEL_VISIBLE_ITEMS;

const WheelPicker = ({
  value,
  minValue,
  maxValue,
  onChange,
  label,
}: {
  value: number;
  minValue: number;
  maxValue: number;
  onChange: (val: number) => void;
  label: string;
}) => {
  const scrollViewRef = useRef<any>(null);
  const data = Array.from({ length: maxValue - minValue + 1 }, (_, i) => minValue + i);

  // Padding items to allow first/last items to center
  const paddedData: (number | null)[] = [null, null, ...data, null, null];

  // Track scroll position for animated styling
  const scrollY = useRef(new RNAnimated.Value(0)).current;

  // Scroll to initial value on mount
  useEffect(() => {
    const index = value - minValue;
    const offset = index * WHEEL_ITEM_HEIGHT;
    setTimeout(() => {
      scrollViewRef.current?.scrollTo({ y: offset, animated: false });
    }, 50);
  }, []);

  // Handle when maxValue changes (episode count changes with season)
  useEffect(() => {
    if (value > maxValue) {
      onChange(maxValue);
    }
  }, [maxValue]);

  const handleScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetY = event.nativeEvent.contentOffset.y;
    const index = Math.round(offsetY / WHEEL_ITEM_HEIGHT);
    const newValue = Math.min(maxValue, Math.max(minValue, minValue + index));

    if (newValue !== value) {
      onChange(newValue);
      Haptics.selectionAsync();
    }
  };

  const renderItem = (item: number | null, index: number) => {
    if (item === null) {
      // Padding items (empty space)
      return <View key={`pad-${index}`} style={wheelStyles.item} />;
    }

    // Calculate distance from center for styling
    const inputRange = [
      (index - 4) * WHEEL_ITEM_HEIGHT,
      (index - 3) * WHEEL_ITEM_HEIGHT,
      (index - 2) * WHEEL_ITEM_HEIGHT, // Center (selected)
      (index - 1) * WHEEL_ITEM_HEIGHT,
      (index) * WHEEL_ITEM_HEIGHT,
    ];

    const scale = scrollY.interpolate({
      inputRange,
      outputRange: [0.75, 0.85, 1.0, 0.85, 0.75],
      extrapolate: 'clamp',
    });

    const opacity = scrollY.interpolate({
      inputRange,
      outputRange: [0.25, 0.5, 1.0, 0.5, 0.25],
      extrapolate: 'clamp',
    });

    return (
      <RNAnimated.View
        key={item}
        style={[
          wheelStyles.item,
          { transform: [{ scale }], opacity },
        ]}
      >
        <Text style={wheelStyles.itemText}>{item}</Text>
      </RNAnimated.View>
    );
  };

  return (
    <View style={wheelStyles.container}>
      <Text style={wheelStyles.label}>{label}</Text>
      <View style={wheelStyles.pickerWrapper}>
        {/* Center highlight lines */}
        <View style={wheelStyles.highlightTop} />
        <View style={wheelStyles.highlightBottom} />

        <RNAnimated.ScrollView
          ref={scrollViewRef}
          showsVerticalScrollIndicator={false}
          snapToInterval={WHEEL_ITEM_HEIGHT}
          decelerationRate="fast"
          bounces={false}
          onScroll={RNAnimated.event(
            [{ nativeEvent: { contentOffset: { y: scrollY } } }],
            { useNativeDriver: true }
          )}
          onMomentumScrollEnd={handleScrollEnd}
          onScrollEndDrag={(e) => {
            // Handle case where user drags slowly without momentum
            const velocity = e.nativeEvent.velocity?.y || 0;
            if (Math.abs(velocity) < 0.5) {
              handleScrollEnd(e);
            }
          }}
          nestedScrollEnabled={true}
          style={wheelStyles.scrollView}
        >
          {paddedData.map((item, index) => renderItem(item, index))}
        </RNAnimated.ScrollView>
      </View>
    </View>
  );
};

const wheelStyles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
  },
  label: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
    marginBottom: Spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  pickerWrapper: {
    height: WHEEL_PICKER_HEIGHT,
    width: 70,
    overflow: 'hidden',
    position: 'relative',
  },
  scrollView: {
    height: WHEEL_PICKER_HEIGHT,
  },
  item: {
    height: WHEEL_ITEM_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemText: {
    fontFamily: Fonts.serifSemiBold,
    fontSize: FontSizes.lg,
    color: Colors.text,
  },
  highlightTop: {
    position: 'absolute',
    top: WHEEL_ITEM_HEIGHT * 2,
    left: 4,
    right: 4,
    height: 1,
    backgroundColor: Colors.border,
    zIndex: 1,
  },
  highlightBottom: {
    position: 'absolute',
    top: WHEEL_ITEM_HEIGHT * 3,
    left: 4,
    right: 4,
    height: 1,
    backgroundColor: Colors.border,
    zIndex: 1,
  },
});

// Watch Context Header Component
const WatchContextHeader = ({
  watchNumber,
  progress,
  progressText,
  contentType,
}: {
  watchNumber: number;
  progress: number;
  progressText: string;
  contentType: 'movie' | 'tv';
}) => {
  return (
    <View style={watchHeaderStyles.container}>
      <View style={watchHeaderStyles.topRow}>
        <Text style={watchHeaderStyles.watchLabel}>WATCH #{watchNumber}</Text>
        <Text style={watchHeaderStyles.progressPercent}>{progress}% complete</Text>
      </View>
      <View style={watchHeaderStyles.progressBarContainer}>
        <View style={[watchHeaderStyles.progressBarFill, { width: `${Math.min(100, progress)}%` }]} />
      </View>
      {progressText && (
        <Text style={watchHeaderStyles.progressDetail}>{progressText}</Text>
      )}
    </View>
  );
};

const watchHeaderStyles = StyleSheet.create({
  container: {
    backgroundColor: Colors.cardBackground,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    marginBottom: Spacing.xl,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  watchLabel: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.sm,
    color: Colors.stamp,
    letterSpacing: 1,
  },
  progressPercent: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
  },
  progressBarContainer: {
    height: 6,
    backgroundColor: Colors.dust,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: Colors.stamp,
    borderRadius: 3,
  },
  progressDetail: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
    marginTop: Spacing.sm,
  },
});

export default function LogActivityModal() {
  const params = useLocalSearchParams<{
    contentId?: string;
    tmdbId?: string;
    contentType?: ContentType;
    editMode?: string;  // 'true' to skip choice screen and go directly to edit form
    editInProgress?: string;  // 'true' to skip directly to in-progress edit form
    editDetailsOnly?: string;  // 'true' to edit details without rating/ranking
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { invalidate } = useCache();

  // Content state
  const [content, setContent] = useState<Content | null>(null);
  const [movieDetails, setMovieDetails] = useState<MovieDetails | null>(null);
  const [tvDetails, setTVDetails] = useState<TVShowDetails | null>(null);
  const [episodes, setEpisodes] = useState<Episode[]>([]);

  // UI state
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [step, setStep] = useState<Step>('status');
  const [selectedStatus, setSelectedStatus] = useState<ActivityStatus | null>(null);
  const [existingCompleted, setExistingCompleted] = useState<Activity | null>(null);
  const [existingInProgress, setExistingInProgress] = useState<Activity | null>(null);

  // Watch state
  const [activeWatch, setActiveWatch] = useState<Watch | null>(null);
  const [activeWatchProgress, setActiveWatchProgress] = useState<number>(0);
  const [latestProgressText, setLatestProgressText] = useState<string>('');
  const [nextWatchNumber, setNextWatchNumber] = useState<number>(1);

  // Common form state
  const [watchDate, setWatchDate] = useState<Date>(new Date());
  const [taggedFriends, setTaggedFriends] = useState<string[]>([]);
  const [isPrivate, setIsPrivate] = useState(false);

  // Completed form state
  const [starRating, setStarRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [skipRanking, setSkipRanking] = useState(false);  // Skip ranking flow on save

  // In Progress form state
  const [note, setNote] = useState('');
  const [progressMinutes, setProgressMinutes] = useState<string>('');
  const [progressSeason, setProgressSeason] = useState(1);
  const [progressEpisode, setProgressEpisode] = useState(1);

  useEffect(() => {
    loadContent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.contentId, params.tmdbId, params.contentType]);

  // Reset form fields when switching to a new watch
  useEffect(() => {
    // Only reset if we're in the in-progress step and active watch exists
    if (selectedStatus === 'in_progress' && activeWatch) {
      // Check if existingInProgress belongs to current activeWatch
      if (existingInProgress && existingInProgress.watch_id !== activeWatch.id) {
        // Different watch - reset form
        setNote('');
        setProgressMinutes('');
        setProgressSeason(1);
        setProgressEpisode(1);
        setExistingInProgress(null);
      }
    }
  }, [activeWatch, selectedStatus, existingInProgress]);

  // Load episodes when season changes (for TV shows)
  useEffect(() => {
    if (tvDetails && progressSeason > 0) {
      loadEpisodes(tvDetails.id, progressSeason);
    }
  }, [tvDetails, progressSeason]);

  // Handle selected friends returning from friend picker
  useFocusEffect(
    useCallback(() => {
      const pending = getPendingFriendSelection();
      if (pending) {
        setTaggedFriends(pending);
      }
    }, [])
  );

  const loadContent = async () => {
    try {
      setIsLoading(true);

      let contentData: Content | null = null;

      // Load by content ID or by TMDB ID + type
      if (params.contentId) {
        contentData = await getContentById(parseInt(params.contentId, 10));
      } else if (params.tmdbId && params.contentType) {
        contentData = await ensureContentExists(
          parseInt(params.tmdbId, 10),
          params.contentType
        );
      }

      if (!contentData) {
        console.error('Failed to load content');
        return;
      }

      setContent(contentData);

      // Load detailed info from TMDB
      if (contentData.content_type === 'movie') {
        const details = await getMovieDetails(contentData.tmdb_id);
        setMovieDetails(details);
      } else if (contentData.content_type === 'tv') {
        const details = await getTVShowDetails(contentData.tmdb_id);
        setTVDetails(details);
      }

      // Check for existing activities and active watch
      if (user) {
        const [completed, inProgress, watch, watchCount] = await Promise.all([
          getUserCompletedActivity(user.id, contentData.id),
          getUserInProgressActivity(user.id, contentData.id),
          getActiveWatch(user.id, contentData.id),
          getWatchCount(user.id, contentData.id),
        ]);

        // Calculate next watch number (for display)
        setNextWatchNumber(watchCount + 1);

        // Set active watch and calculate progress
        if (watch) {
          setActiveWatch(watch);
          const latestActivity = await getLatestActivityForWatch(watch.id);
          if (latestActivity) {
            setActiveWatchProgress(getProgressPercent(latestActivity));
            setLatestProgressText(formatProgress(latestActivity));
          }
        }

        // Pre-fill if user has existing activity
        if (completed) {
          setExistingCompleted(completed);
          setStarRating(completed.star_rating || 0);
          setReviewText(completed.review_text || '');
          if (completed.tagged_friends) {
            setTaggedFriends(completed.tagged_friends);
          }
          if (completed.watch_date) {
            setWatchDate(new Date(completed.watch_date));
          }
          setIsPrivate(completed.is_private);
          // Check if editDetailsOnly is set (from tapping Your Take card)
          if (params.editDetailsOnly === 'true') {
            setSelectedStatus('completed');
            setStep('completed');
            setSkipRanking(true);  // Don't trigger ranking on save
          } else if (params.editMode === 'true') {
            // editMode skips to edit form with rating (for re-ranking)
            setSelectedStatus('completed');
            setStep('completed');  // Skip choice screen, go directly to edit form
          } else {
            setStep('existing_choice');  // Show choice screen
          }
        }
        // Pre-fill in-progress form ONLY if it belongs to the current active watch
        if (inProgress && watch && inProgress.watch_id === watch.id) {
          setExistingInProgress(inProgress);
          setNote(inProgress.note || '');
          setProgressMinutes(inProgress.progress_minutes?.toString() || '');
          setProgressSeason(inProgress.progress_season || 1);
          setProgressEpisode(inProgress.progress_episode || 1);
          if (inProgress.tagged_friends) {
            setTaggedFriends(inProgress.tagged_friends);
          }
          if (inProgress.watch_date) {
            setWatchDate(new Date(inProgress.watch_date));
          }
          setIsPrivate(inProgress.is_private);
          // Check if editInProgress param is set
          if (params.editInProgress === 'true') {
            setSelectedStatus('in_progress');
            setStep('in_progress');  // Skip choice screen, go directly to in-progress form
          }
        } else if (inProgress) {
          // Starting a new watch or no matching activity - reset to defaults
          setExistingInProgress(null);
          setNote('');
          setProgressMinutes('');
          setProgressSeason(1);
          setProgressEpisode(1);
        }
      }
    } catch (error) {
      console.error('Error loading content:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadEpisodes = async (showId: number, seasonNum: number) => {
    try {
      const { episodes: eps } = await getSeasonDetails(showId, seasonNum);
      setEpisodes(eps);
      // Reset episode if current selection is invalid
      if (progressEpisode > eps.length) {
        setProgressEpisode(1);
      }
    } catch (error) {
      console.error('Error loading episodes:', error);
    }
  };

  const handleStatusSelect = (status: ActivityStatus) => {
    // Skip conflict screen - go directly to in-progress form
    // Active watch will be used automatically
    setSelectedStatus(status);
    setStep(status);
  };

  const handleContinueCurrentWatch = () => {
    setSelectedStatus('in_progress');
    setStep('in_progress');
  };

  const handleStartRewatch = async () => {
    if (!activeWatch || !user || !content) return;

    // Abandon the current watch and start a new one
    await abandonWatch(activeWatch.id);
    const newWatch = await startNewWatch(user.id, content.id);
    if (newWatch) {
      setActiveWatch(newWatch);
      setActiveWatchProgress(0);
      setLatestProgressText('');
      setNextWatchNumber(newWatch.watch_number + 1);
      // Clear in-progress form fields for fresh start
      setNote('');
      setProgressMinutes('');
      setProgressSeason(1);
      setProgressEpisode(1);
      setExistingInProgress(null);
    }
    setSelectedStatus('in_progress');
    setStep('in_progress');
  };

  const handleBack = () => {
    if (step === 'existing_choice' || step === 'status') {
      router.back();
    } else if (step === 'watch_conflict') {
      // Return to status or existing_choice
      setStep(existingCompleted ? 'existing_choice' : 'status');
    } else if (params.editMode === 'true' || params.editInProgress === 'true') {
      // If user came directly to edit form, back should close the modal
      router.back();
    } else {
      // Return to appropriate initial screen
      setStep(existingCompleted ? 'existing_choice' : 'status');
    }
  };

  const handleSave = async () => {
    if (!content || !user || !selectedStatus) return;

    setIsSaving(true);

    try {
      let activity: Activity | null = null;

      if (selectedStatus === 'completed' && existingCompleted) {
        // EDIT existing completed activity
        activity = await updateActivity({
          activityId: existingCompleted.id,
          starRating,
          reviewText: reviewText.trim() || undefined,
          watchDate,
          taggedFriends,
          isPrivate,
          ratedSeason: undefined,  // Always rank overall show, not per-season
        });
      } else {
        // CREATE new activity (in_progress, or completed for first time)
        activity = await createActivity({
          userId: user.id,
          tmdbId: content.tmdb_id,
          contentType: content.content_type,
          status: selectedStatus,
          starRating: selectedStatus === 'completed' ? starRating : undefined,
          reviewText: selectedStatus === 'completed' ? reviewText.trim() || undefined : undefined,
          note: selectedStatus === 'in_progress' ? note.trim() || undefined : undefined,
          progressMinutes: selectedStatus === 'in_progress' && content.content_type === 'movie'
            ? parseInt(progressMinutes, 10) || undefined
            : undefined,
          progressSeason: selectedStatus === 'in_progress' && content.content_type === 'tv'
            ? progressSeason
            : undefined,
          progressEpisode: selectedStatus === 'in_progress' && content.content_type === 'tv'
            ? progressEpisode
            : undefined,
          watchDate,
          taggedFriends,
          isPrivate,
          ratedSeason: undefined,  // Always rank overall show, not per-season
          // Link to active watch for in_progress activities
          watchId: selectedStatus === 'in_progress' ? activeWatch?.id : undefined,
        });
      }

      if (activity) {
        // Navigate to ranking flow only if not in edit-details-only mode
        if (selectedStatus === 'completed' && starRating > 0 && !skipRanking) {
          router.replace(`/rank/${content.tmdb_id}?starRating=${starRating}&contentType=${content.content_type}`);
        } else {
          router.back();
        }
      }
    } catch (error) {
      console.error('Error saving activity:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteReview = () => {
    if (!user || !content) return;

    const type = content.content_type || params.contentType;
    if (!type) return;

    Alert.alert(
      'Delete Review',
      'This will delete your review, rating, and remove this title from your rankings.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setIsSaving(true);
            try {
              await deleteRankingWithActivity(user.id, content.tmdb_id, type);
              invalidate('ranking_delete', user.id);
              router.back();
            } catch (error) {
              console.error('Error deleting:', error);
              Alert.alert('Error', 'Failed to delete. Please try again.');
            } finally {
              setIsSaving(false);
            }
          },
        },
      ]
    );
  };

  const handleDeleteInProgress = () => {
    if (!user || !existingInProgress) return;

    Alert.alert(
      'Delete Progress',
      'This will delete your in-progress activity for this title.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setIsSaving(true);
            try {
              await deleteActivity(existingInProgress.id);
              invalidate('activity_delete', user.id);
              router.back();
            } catch (error) {
              console.error('Error deleting in-progress activity:', error);
              Alert.alert('Error', 'Failed to delete. Please try again.');
            } finally {
              setIsSaving(false);
            }
          },
        },
      ]
    );
  };

  const contentTitle = content?.title || movieDetails?.title || tvDetails?.title || '';
  const contentYear = content?.release_year || movieDetails?.release_year || tvDetails?.release_year;
  const contentPoster = content?.poster_url || movieDetails?.poster_url || tvDetails?.poster_url;
  const contentType = content?.content_type || params.contentType;
  const runtime = movieDetails?.runtime_minutes || content?.runtime_minutes;
  const totalSeasons = tvDetails?.total_seasons || content?.total_seasons || 1;

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (!content && !movieDetails && !tvDetails) {
    return (
      <View style={[styles.errorContainer, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>Content not found</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
        <Pressable onPress={handleBack} style={styles.backButton}>
          {step === 'status' ? (
            <IconSymbol name="xmark" size={24} color={Colors.text} />
          ) : (
            <IconSymbol name="chevron.left" size={24} color={Colors.text} />
          )}
        </Pressable>
        <Text style={styles.headerTitle}>Log Activity</Text>
        <Pressable onPress={() => router.back()} style={styles.closeButton}>
          <IconSymbol name="xmark" size={24} color={Colors.text} />
        </Pressable>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Content Info */}
        <View style={styles.contentInfo}>
          {contentPoster && (
            <Image
              source={{ uri: contentPoster }}
              style={styles.poster}
              contentFit="cover"
            />
          )}
          <View style={styles.contentDetails}>
            <Text style={styles.contentTitle}>{contentTitle}</Text>
            <Text style={styles.contentMeta}>
              {contentYear}
              {contentType === 'tv' && totalSeasons && ` • ${totalSeasons} Seasons`}
              {contentType === 'movie' && runtime && ` • ${runtime} min`}
            </Text>
            {selectedStatus && (
              <View style={styles.statusBadge}>
                <IconSymbol
                  name={selectedStatus === 'completed' ? 'checkmark.circle.fill' : 'play.circle.fill'}
                  size={14}
                  color={selectedStatus === 'completed' ? Colors.stamp : Colors.textMuted}
                />
                <Text style={[
                  styles.statusBadgeText,
                  selectedStatus === 'completed' && styles.statusBadgeTextCompleted,
                ]}>
                  {selectedStatus === 'completed' ? 'Completed' : 'In Progress'}
                </Text>
                {selectedStatus === 'in_progress' && activeWatch && (
                  <View style={styles.watchNumberBadge}>
                    <Text style={styles.watchNumberText}>Watch #{activeWatch.watch_number}</Text>
                  </View>
                )}
              </View>
            )}
          </View>
        </View>

        {/* Step 0: Existing Choice (for already-ranked titles) */}
        {step === 'existing_choice' && existingCompleted && (
          <View style={styles.existingChoiceSection}>
            {/* Rating Section */}
            <Text style={styles.stepTitle}>Your Rating</Text>
            <View style={styles.existingRatingPreview}>
              <View style={styles.existingStarsRow}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <IconSymbol
                    key={star}
                    name={star <= (existingCompleted.star_rating || 0) ? 'star.fill' : 'star'}
                    size={20}
                    color={star <= (existingCompleted.star_rating || 0) ? Colors.stamp : Colors.dust}
                  />
                ))}
              </View>
              {existingCompleted.review_text && (
                <Text style={styles.existingReviewPreview} numberOfLines={2}>
                  &quot;{existingCompleted.review_text}&quot;
                </Text>
              )}
            </View>

            {/* Watch Status Section */}
            <View style={styles.watchStatusSection}>
              {activeWatch ? (
                <WatchContextHeader
                  watchNumber={activeWatch.watch_number}
                  progress={activeWatchProgress}
                  progressText={latestProgressText}
                  contentType={contentType || 'movie'}
                />
              ) : (
                <View style={styles.watchCompleteInfo}>
                  <IconSymbol name="checkmark.circle.fill" size={16} color={Colors.stamp} />
                  <Text style={styles.watchCompleteText}>
                    Watch #{nextWatchNumber - 1 || 1} Complete
                  </Text>
                </View>
              )}
            </View>

            {/* Option 1: Re-rank and edit rating */}
            <Pressable
              style={({ pressed }) => [
                styles.choiceButton,
                pressed && styles.choiceButtonPressed,
              ]}
              onPress={() => {
                setSelectedStatus('completed');
                setStep('completed');
                setSkipRanking(false);  // Will trigger ranking flow
              }}
            >
              <View style={styles.choiceButtonIcon}>
                <IconSymbol name="arrow.up.arrow.down" size={20} color={Colors.stamp} />
              </View>
              <View style={styles.choiceButtonContent}>
                <Text style={styles.choiceButtonTitle}>Re-rank and edit rating</Text>
                <Text style={styles.choiceButtonSubtitle}>Change your star rating and re-rank</Text>
              </View>
              <IconSymbol name="chevron.right" size={20} color={Colors.textMuted} />
            </Pressable>

            {/* Option 2: Log in-progress */}
            <Pressable
              style={({ pressed }) => [
                styles.choiceButton,
                pressed && styles.choiceButtonPressed,
              ]}
              onPress={() => handleStatusSelect('in_progress')}
            >
              <View style={styles.choiceButtonIcon}>
                <IconSymbol name="play.circle" size={20} color={Colors.textMuted} />
              </View>
              <View style={styles.choiceButtonContent}>
                <Text style={styles.choiceButtonTitle}>Log in-progress activity</Text>
                <Text style={styles.choiceButtonSubtitle}>Track your current viewing</Text>
              </View>
              <IconSymbol name="chevron.right" size={20} color={Colors.textMuted} />
            </Pressable>
          </View>
        )}

        {/* Watch Conflict Step (replaces modal) */}
        {step === 'watch_conflict' && activeWatch && (
          <View style={styles.watchConflictSection}>
            <Text style={styles.stepTitle}>Watch #{activeWatch.watch_number} In Progress</Text>

            <WatchContextHeader
              watchNumber={activeWatch.watch_number}
              progress={activeWatchProgress}
              progressText={latestProgressText}
              contentType={contentType || 'movie'}
            />

            <Pressable
              style={({ pressed }) => [
                styles.conflictButton,
                styles.conflictButtonPrimary,
                pressed && styles.buttonPressed,
              ]}
              onPress={handleContinueCurrentWatch}
            >
              <View style={styles.conflictButtonIcon}>
                <IconSymbol name="play.circle.fill" size={24} color={Colors.white} />
              </View>
              <View style={styles.conflictButtonContent}>
                <Text style={styles.conflictButtonTitlePrimary}>
                  Continue Watch #{activeWatch.watch_number}
                </Text>
                <Text style={styles.conflictButtonSubtitlePrimary}>
                  Update your progress
                </Text>
              </View>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.conflictButton,
                styles.conflictButtonSecondary,
                pressed && styles.buttonPressed,
              ]}
              onPress={handleStartRewatch}
            >
              <View style={styles.conflictButtonIcon}>
                <IconSymbol name="arrow.counterclockwise" size={24} color={Colors.text} />
              </View>
              <View style={styles.conflictButtonContent}>
                <Text style={styles.conflictButtonTitleSecondary}>
                  Abandon & Start Watch #{activeWatch.watch_number + 1}
                </Text>
                <Text style={styles.conflictButtonSubtitleSecondary}>
                  Start fresh from beginning
                </Text>
              </View>
            </Pressable>
          </View>
        )}

        {/* Step 1: Status Selection */}
        {step === 'status' && (
          <View style={styles.statusSelection}>
            <Text style={styles.stepTitle}>
              {activeWatch
                ? `Continue Watch #${activeWatch.watch_number}`
                : `Start Watch #${nextWatchNumber}`}
            </Text>

            {/* Show watch context if there's an active watch */}
            {activeWatch && activeWatchProgress > 0 && (
              <WatchContextHeader
                watchNumber={activeWatch.watch_number}
                progress={activeWatchProgress}
                progressText={latestProgressText}
                contentType={contentType || 'movie'}
              />
            )}

            <Pressable
              style={({ pressed }) => [
                styles.statusOption,
                selectedStatus === 'completed' && styles.statusOptionSelected,
                pressed && styles.statusOptionPressed,
              ]}
              onPress={() => handleStatusSelect('completed')}
            >
              <View style={styles.statusOptionIcon}>
                <IconSymbol name="checkmark.circle.fill" size={24} color={Colors.stamp} />
              </View>
              <View style={styles.statusOptionContent}>
                <Text style={styles.statusOptionTitle}>Completed</Text>
                <Text style={styles.statusOptionDescription}>I finished watching</Text>
              </View>
              <IconSymbol name="chevron.right" size={20} color={Colors.textMuted} />
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.statusOption,
                selectedStatus === 'in_progress' && styles.statusOptionSelected,
                pressed && styles.statusOptionPressed,
              ]}
              onPress={() => handleStatusSelect('in_progress')}
            >
              <View style={styles.statusOptionIcon}>
                <IconSymbol name="play.circle.fill" size={24} color={Colors.textMuted} />
              </View>
              <View style={styles.statusOptionContent}>
                <Text style={styles.statusOptionTitle}>
                  {activeWatch
                    ? `Continue Watch #${activeWatch.watch_number}`
                    : `Start Watch #${nextWatchNumber}`
                  }
                </Text>
                <Text style={styles.statusOptionDescription}>Still watching</Text>
              </View>
              <IconSymbol name="chevron.right" size={20} color={Colors.textMuted} />
            </Pressable>
          </View>
        )}

        {/* Step 2A: Completed Form */}
        {step === 'completed' && (
          <View style={styles.formSection}>
            {/* Form Header */}
            <View style={styles.formHeader}>
              <Text style={styles.formHeaderText}>
                {skipRanking
                  ? 'Edit Review Details'
                  : existingCompleted
                    ? 'Edit Your Rating'
                    : `Completing Watch #${activeWatch?.watch_number || nextWatchNumber}`}
              </Text>
            </View>

            {/* Star Rating - hidden when editing details only */}
            {!skipRanking && (
              <View style={styles.ratingSection}>
                <Text style={styles.sectionLabel}>RATING</Text>
                <StarRating rating={starRating} onRatingChange={setStarRating} size={40} />
              </View>
            )}


            {/* Review Text */}
            <View style={styles.textSection}>
              <Text style={styles.sectionLabel}>REVIEW (OPTIONAL)</Text>
              <TextInput
                style={styles.textInput}
                value={reviewText}
                onChangeText={setReviewText}
                placeholder="Write your thoughts..."
                placeholderTextColor={Colors.textMuted}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
            </View>

            {/* Watch Date */}
            <View style={styles.watchDateSection}>
              <Text style={styles.sectionLabel}>WATCH DATE</Text>
              <View style={styles.datePickerRow}>
                <DateTimePicker
                  value={watchDate}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'compact' : 'default'}
                  maximumDate={new Date()}
                  onChange={(event, date) => {
                    if (date) setWatchDate(date);
                  }}
                  themeVariant="light"
                />
              </View>
            </View>

            {/* Watched With */}
            <View style={styles.watchedWithSection}>
              <Pressable
                style={styles.sectionHeader}
                onPress={() =>
                  router.push({
                    pathname: '/friend-picker',
                    params: {
                      contentId: content?.id?.toString(),
                      selectedIds: taggedFriends.join(','),
                    },
                  })
                }
              >
                <Text style={styles.sectionLabel}>WATCHED WITH</Text>
                <IconSymbol name="chevron.right" size={16} color={Colors.textMuted} />
              </Pressable>
              {user && (
                <SuggestedFriendPills
                  userId={user.id}
                  selectedIds={taggedFriends}
                  onToggle={(id) => {
                    setTaggedFriends((prev) =>
                      prev.includes(id)
                        ? prev.filter((f) => f !== id)
                        : [...prev, id]
                    );
                  }}
                />
              )}
            </View>

            {/* Privacy Toggle */}
            <View style={styles.privacySection}>
              <View style={styles.privacyInfo}>
                <Text style={styles.privacyLabel}>Private</Text>
                <Text style={styles.privacyDescription}>Only visible to you</Text>
              </View>
              <Switch
                value={isPrivate}
                onValueChange={setIsPrivate}
                trackColor={{ false: Colors.dust, true: Colors.stamp }}
                thumbColor={Colors.white}
              />
            </View>

            {/* Save Button */}
            <Pressable
              style={({ pressed }) => [
                styles.saveButton,
                pressed && styles.buttonPressed,
                (isSaving || (!skipRanking && starRating === 0)) && styles.buttonDisabled,
              ]}
              onPress={handleSave}
              disabled={isSaving || (!skipRanking && starRating === 0)}
            >
              {isSaving ? (
                <ActivityIndicator color={Colors.white} />
              ) : (
                <Text style={styles.saveButtonText}>
                  {skipRanking ? 'Save' : starRating > 0 ? 'Save & Rank' : 'Save'}
                </Text>
              )}
            </Pressable>

            {/* Delete Button - only shown when editing from Your Take */}
            {params.editDetailsOnly === 'true' && existingCompleted && (
              <Pressable
                style={({ pressed }) => [
                  styles.deleteButton,
                  pressed && styles.buttonPressed,
                ]}
                onPress={handleDeleteReview}
                disabled={isSaving}
              >
                <Text style={styles.deleteButtonText}>Delete</Text>
              </Pressable>
            )}
          </View>
        )}

        {/* Step 2B: In Progress Form */}
        {step === 'in_progress' && (
          <View style={styles.formSection}>
            {/* Form Header */}
            <View style={styles.formHeader}>
              <Text style={styles.formHeaderText}>
                Watch #{activeWatch?.watch_number || nextWatchNumber}
                {activeWatchProgress > 0 && `  •  Currently at ${activeWatchProgress}%`}
              </Text>
            </View>

            {/* Progress - Movie (minutes) */}
            {contentType === 'movie' && (
              <View style={styles.progressSection}>
                <Text style={styles.sectionLabel}>PROGRESS</Text>
                <View style={styles.progressInputRow}>
                  <TextInput
                    style={styles.progressInput}
                    value={progressMinutes}
                    onChangeText={setProgressMinutes}
                    placeholder="0"
                    placeholderTextColor={Colors.textMuted}
                    keyboardType="number-pad"
                    maxLength={3}
                  />
                  <Text style={styles.progressLabel}>/ {runtime || '?'} min</Text>
                </View>
                {runtime && (
                  <MovieProgressSlider
                    value={parseInt(progressMinutes, 10) || 0}
                    maxValue={runtime}
                    onChange={(val) => setProgressMinutes(val.toString())}
                  />
                )}
              </View>
            )}

            {/* Progress - TV (season/episode) */}
            {contentType === 'tv' && (
              <View style={styles.progressSection}>
                <Text style={styles.sectionLabel}>PROGRESS</Text>
                <View style={styles.tvProgressRow}>
                  <WheelPicker
                    value={progressSeason}
                    minValue={1}
                    maxValue={totalSeasons}
                    onChange={setProgressSeason}
                    label="Season"
                  />
                  <WheelPicker
                    value={progressEpisode}
                    minValue={1}
                    maxValue={episodes.length || 99}
                    onChange={setProgressEpisode}
                    label="Episode"
                  />
                </View>
                {episodes.length > 0 && episodes[progressEpisode - 1] && (
                  <Text style={styles.episodeTitle}>
                    &quot;{episodes[progressEpisode - 1].name}&quot;
                  </Text>
                )}
              </View>
            )}

            {/* Note */}
            <View style={styles.textSection}>
              <Text style={styles.sectionLabel}>NOTE (OPTIONAL)</Text>
              <TextInput
                style={[styles.textInput, styles.noteInput]}
                value={note}
                onChangeText={setNote}
                placeholder="Where did you leave off?"
                placeholderTextColor={Colors.textMuted}
                multiline
                numberOfLines={2}
                textAlignVertical="top"
              />
            </View>

            {/* Watch Date */}
            <View style={styles.watchDateSection}>
              <Text style={styles.sectionLabel}>WATCH DATE</Text>
              <View style={styles.datePickerRow}>
                <DateTimePicker
                  value={watchDate}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'compact' : 'default'}
                  maximumDate={new Date()}
                  onChange={(event, date) => {
                    if (date) setWatchDate(date);
                  }}
                  themeVariant="light"
                />
              </View>
            </View>

            {/* Watching With */}
            <View style={styles.watchedWithSection}>
              <Pressable
                style={styles.sectionHeader}
                onPress={() =>
                  router.push({
                    pathname: '/friend-picker',
                    params: {
                      contentId: content?.id?.toString(),
                      selectedIds: taggedFriends.join(','),
                    },
                  })
                }
              >
                <Text style={styles.sectionLabel}>WATCHING WITH</Text>
                <IconSymbol name="chevron.right" size={16} color={Colors.textMuted} />
              </Pressable>
              {user && (
                <SuggestedFriendPills
                  userId={user.id}
                  selectedIds={taggedFriends}
                  onToggle={(id) => {
                    setTaggedFriends((prev) =>
                      prev.includes(id)
                        ? prev.filter((f) => f !== id)
                        : [...prev, id]
                    );
                  }}
                />
              )}
            </View>

            {/* Privacy Toggle */}
            <View style={styles.privacySection}>
              <View style={styles.privacyInfo}>
                <Text style={styles.privacyLabel}>Private</Text>
                <Text style={styles.privacyDescription}>Only visible to you</Text>
              </View>
              <Switch
                value={isPrivate}
                onValueChange={setIsPrivate}
                trackColor={{ false: Colors.dust, true: Colors.stamp }}
                thumbColor={Colors.white}
              />
            </View>

            {/* Save Button */}
            <Pressable
              style={({ pressed }) => [
                styles.saveButton,
                pressed && styles.buttonPressed,
                isSaving && styles.buttonDisabled,
              ]}
              onPress={handleSave}
              disabled={isSaving}
            >
              {isSaving ? (
                <ActivityIndicator color={Colors.white} />
              ) : (
                <Text style={styles.saveButtonText}>Save Progress</Text>
              )}
            </Pressable>

            {/* Delete Button - only shown when editing in-progress activity */}
            {params.editInProgress === 'true' && existingInProgress && (
              <Pressable
                style={({ pressed }) => [
                  styles.deleteButton,
                  pressed && styles.buttonPressed,
                ]}
                onPress={handleDeleteInProgress}
                disabled={isSaving}
              >
                <Text style={styles.deleteButtonText}>Delete</Text>
              </Pressable>
            )}
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
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
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: Fonts.serifSemiBold,
    fontSize: FontSizes.xl,
    color: Colors.text,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.xl,
    paddingBottom: Spacing['3xl'],
  },
  contentInfo: {
    flexDirection: 'row',
    gap: Spacing.lg,
    marginBottom: Spacing['2xl'],
  },
  poster: {
    width: 80,
    height: 120,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.dust,
  },
  contentDetails: {
    flex: 1,
    justifyContent: 'center',
  },
  contentTitle: {
    fontFamily: Fonts.serifSemiBold,
    fontSize: FontSizes.xl,
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  contentMeta: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.md,
    color: Colors.textMuted,
    marginBottom: Spacing.sm,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  statusBadgeText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
  },
  statusBadgeTextCompleted: {
    color: Colors.stamp,
  },
  statusSelection: {
    gap: Spacing.md,
  },
  existingChoiceSection: {
    gap: Spacing.md,
  },
  existingRatingPreview: {
    backgroundColor: Colors.cardBackground,
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  existingStarsRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  existingReviewPreview: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
    fontStyle: 'italic',
    marginTop: Spacing.sm,
    textAlign: 'center',
  },
  watchStatusSection: {
    marginBottom: Spacing.md,
  },
  watchCompleteInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.cardBackground,
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
  },
  watchCompleteText: {
    fontFamily: Fonts.sansMedium,
    fontSize: FontSizes.md,
    color: Colors.stamp,
  },
  watchConflictSection: {
    gap: Spacing.lg,
  },
  conflictButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
  },
  conflictButtonPrimary: {
    backgroundColor: Colors.stamp,
  },
  conflictButtonSecondary: {
    backgroundColor: Colors.cardBackground,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  conflictButtonIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  conflictButtonContent: {
    flex: 1,
  },
  conflictButtonTitlePrimary: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.md,
    color: Colors.white,
    marginBottom: 2,
  },
  conflictButtonSubtitlePrimary: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    color: Colors.white,
    opacity: 0.8,
  },
  conflictButtonTitleSecondary: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.md,
    color: Colors.text,
    marginBottom: 2,
  },
  conflictButtonSubtitleSecondary: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
  },
  formHeader: {
    marginBottom: Spacing.md,
  },
  formHeaderText: {
    fontFamily: Fonts.sansMedium,
    fontSize: FontSizes.md,
    color: Colors.stamp,
    textAlign: 'center',
  },
  choiceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.cardBackground,
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
  },
  choiceButtonPressed: {
    opacity: 0.8,
  },
  choiceButtonIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceButtonContent: {
    flex: 1,
  },
  choiceButtonTitle: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.md,
    color: Colors.text,
    marginBottom: 2,
  },
  choiceButtonSubtitle: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
  },
  stepTitle: {
    fontFamily: Fonts.serifSemiBold,
    fontSize: FontSizes.lg,
    color: Colors.text,
    marginBottom: Spacing.md,
  },
  statusOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.lg,
    backgroundColor: Colors.cardBackground,
    borderRadius: BorderRadius.md,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  statusOptionSelected: {
    borderColor: Colors.stamp,
  },
  statusOptionPressed: {
    opacity: 0.8,
  },
  statusOptionIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusOptionContent: {
    flex: 1,
  },
  statusOptionTitle: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.md,
    color: Colors.text,
    marginBottom: 2,
  },
  statusOptionDescription: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
  },
  formSection: {
    gap: Spacing.xl,
  },
  ratingSection: {
    alignItems: 'center',
  },
  sectionLabel: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
    letterSpacing: 1.5,
    marginBottom: Spacing.md,
  },
  seasonRatingSection: {
    marginTop: -Spacing.md,
  },
  seasonPills: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  seasonPill: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    backgroundColor: Colors.dust,
    borderRadius: BorderRadius.full,
  },
  seasonPillSelected: {
    backgroundColor: Colors.stamp,
  },
  seasonPillText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    color: Colors.text,
  },
  seasonPillTextSelected: {
    color: Colors.white,
  },
  textSection: {},
  textInput: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.md,
    color: Colors.text,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    minHeight: 100,
  },
  noteInput: {
    minHeight: 60,
  },
  watchDateSection: {},
  datePickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  watchedWithSection: {},
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  privacySection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    backgroundColor: Colors.cardBackground,
    borderRadius: BorderRadius.md,
  },
  privacyInfo: {
    flex: 1,
  },
  privacyLabel: {
    fontFamily: Fonts.sansMedium,
    fontSize: FontSizes.md,
    color: Colors.text,
    marginBottom: 2,
  },
  privacyDescription: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
  },
  progressSection: {},
  progressInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  progressInput: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xl,
    color: Colors.text,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    width: 80,
    textAlign: 'center',
  },
  progressLabel: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.md,
    color: Colors.textMuted,
  },
  progressBar: {
    height: 8,
    backgroundColor: Colors.dust,
    borderRadius: 4,
    marginTop: Spacing.md,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: Colors.stamp,
    borderRadius: 4,
  },
  tvProgressRow: {
    flexDirection: 'row',
    gap: Spacing.xl,
  },
  tvProgressPicker: {
    flex: 1,
  },
  tvProgressLabel: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
    marginBottom: Spacing.sm,
  },
  pickerWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.cardBackground,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
  },
  pickerButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerValue: {
    flex: 1,
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.xl,
    color: Colors.text,
    textAlign: 'center',
  },
  episodeTitle: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
    fontStyle: 'italic',
    marginTop: Spacing.sm,
  },
  saveButton: {
    backgroundColor: Colors.handwriting,
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
  },
  saveButtonText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.sm,
    color: Colors.white,
    letterSpacing: 1.5,
  },
  buttonPressed: {
    opacity: 0.8,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  deleteButton: {
    paddingVertical: Spacing.md,
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  deleteButtonText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.md,
    color: Colors.error,
  },
  // Watch number badge
  watchNumberBadge: {
    marginLeft: Spacing.sm,
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
});
