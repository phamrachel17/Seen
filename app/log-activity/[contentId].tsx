import { useState, useEffect, useCallback } from 'react';
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
} from 'react-native';
import { Image } from 'expo-image';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Fonts, FontSizes, Spacing, BorderRadius } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { StarRating } from '@/components/star-rating';
import { SuggestedFriendPills } from '@/components/suggested-friend-pills';
import { useAuth } from '@/lib/auth-context';
import { getPendingFriendSelection } from '@/lib/friend-picker-state';
import { getContentById, ensureContentExists } from '@/lib/content';
import { createActivity, updateActivity, getUserCompletedActivity, getUserInProgressActivity } from '@/lib/activity';
import { Activity } from '@/types';
import { getMovieDetails, getTVShowDetails, getSeasonDetails } from '@/lib/tmdb';
import { Content, ContentType, MovieDetails, TVShowDetails, Episode, ActivityStatus } from '@/types';

type Step = 'existing_choice' | 'status' | 'completed' | 'in_progress';

export default function LogActivityModal() {
  const params = useLocalSearchParams<{
    contentId?: string;
    tmdbId?: string;
    contentType?: ContentType;
    editMode?: string;  // 'true' to skip choice screen and go directly to edit form
    editInProgress?: string;  // 'true' to skip directly to in-progress edit form
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

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

  // Common form state
  const [watchDate, setWatchDate] = useState<Date>(new Date());
  const [taggedFriends, setTaggedFriends] = useState<string[]>([]);
  const [isPrivate, setIsPrivate] = useState(false);

  // Completed form state
  const [starRating, setStarRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [ratedSeason, setRatedSeason] = useState<number | undefined>(undefined);

  // In Progress form state
  const [note, setNote] = useState('');
  const [progressMinutes, setProgressMinutes] = useState<string>('');
  const [progressSeason, setProgressSeason] = useState(1);
  const [progressEpisode, setProgressEpisode] = useState(1);

  useEffect(() => {
    loadContent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.contentId, params.tmdbId, params.contentType]);

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

      // Check for existing activities
      if (user) {
        const [completed, inProgress] = await Promise.all([
          getUserCompletedActivity(user.id, contentData.id),
          getUserInProgressActivity(user.id, contentData.id),
        ]);

        // Pre-fill if user has existing activity
        if (completed) {
          setExistingCompleted(completed);
          setStarRating(completed.star_rating || 0);
          setReviewText(completed.review_text || '');
          setRatedSeason(completed.rated_season);
          if (completed.tagged_friends) {
            setTaggedFriends(completed.tagged_friends);
          }
          if (completed.watch_date) {
            setWatchDate(new Date(completed.watch_date));
          }
          setIsPrivate(completed.is_private);
          // Check if editMode is set to skip directly to edit form
          if (params.editMode === 'true') {
            setSelectedStatus('completed');
            setStep('completed');  // Skip choice screen, go directly to edit form
          } else {
            setStep('existing_choice');  // Show choice screen
          }
        }
        if (inProgress) {
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
    setSelectedStatus(status);
    setStep(status);
  };

  const handleBack = () => {
    if (step === 'existing_choice' || step === 'status') {
      router.back();
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
          ratedSeason: content.content_type === 'tv' ? ratedSeason : undefined,
        });
      } else if (selectedStatus === 'in_progress' && existingInProgress) {
        // EDIT existing in-progress activity
        activity = await updateActivity({
          activityId: existingInProgress.id,
          note: note.trim() || undefined,
          progressMinutes: content.content_type === 'movie'
            ? parseInt(progressMinutes, 10) || undefined
            : undefined,
          progressSeason: content.content_type === 'tv' ? progressSeason : undefined,
          progressEpisode: content.content_type === 'tv' ? progressEpisode : undefined,
          watchDate,
          taggedFriends,
          isPrivate,
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
          ratedSeason: selectedStatus === 'completed' && content.content_type === 'tv'
            ? ratedSeason
            : undefined,
        });
      }

      if (activity) {
        const isNewActivity = !existingCompleted;
        const ratingChanged = existingCompleted &&
          (existingCompleted.star_rating || 0) !== starRating;

        if (selectedStatus === 'completed' && starRating > 0 && (isNewActivity || ratingChanged)) {
          // Navigate to ranking flow for new activities OR when rating changed
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

  const contentTitle = content?.title || movieDetails?.title || tvDetails?.title || '';
  const contentYear = content?.release_year || movieDetails?.release_year || tvDetails?.release_year;
  const contentPoster = content?.poster_url || movieDetails?.poster_url || tvDetails?.poster_url;
  const contentType = content?.content_type || params.contentType;
  const runtime = movieDetails?.runtime_minutes || content?.runtime_minutes;
  const totalSeasons = tvDetails?.total_seasons || content?.total_seasons || 1;

  if (isLoading) {
    return (
      <View style={[styles.loadingContainer, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={Colors.stamp} />
      </View>
    );
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
              </View>
            )}
          </View>
        </View>

        {/* Step 0: Existing Choice (for already-ranked titles) */}
        {step === 'existing_choice' && existingCompleted && (
          <View style={styles.existingChoiceSection}>
            <Text style={styles.stepTitle}>You've already rated this</Text>

            {/* Show existing rating preview */}
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
                  "{existingCompleted.review_text}"
                </Text>
              )}
            </View>

            {/* Option 1: Edit existing */}
            <Pressable
              style={({ pressed }) => [
                styles.choiceButton,
                pressed && styles.choiceButtonPressed,
              ]}
              onPress={() => {
                setSelectedStatus('completed');
                setStep('completed');
              }}
            >
              <View style={styles.choiceButtonIcon}>
                <IconSymbol name="pencil" size={20} color={Colors.stamp} />
              </View>
              <View style={styles.choiceButtonContent}>
                <Text style={styles.choiceButtonTitle}>Edit existing rating</Text>
                <Text style={styles.choiceButtonSubtitle}>Update your rating and review</Text>
              </View>
              <IconSymbol name="chevron.right" size={20} color={Colors.textMuted} />
            </Pressable>

            {/* Option 2: Log in-progress */}
            <Pressable
              style={({ pressed }) => [
                styles.choiceButton,
                pressed && styles.choiceButtonPressed,
              ]}
              onPress={() => {
                setSelectedStatus('in_progress');
                setStep('in_progress');
              }}
            >
              <View style={styles.choiceButtonIcon}>
                <IconSymbol name="play.circle" size={20} color={Colors.textMuted} />
              </View>
              <View style={styles.choiceButtonContent}>
                <Text style={styles.choiceButtonTitle}>Log in-progress activity</Text>
                <Text style={styles.choiceButtonSubtitle}>Track a rewatch in progress</Text>
              </View>
              <IconSymbol name="chevron.right" size={20} color={Colors.textMuted} />
            </Pressable>
          </View>
        )}

        {/* Step 1: Status Selection */}
        {step === 'status' && (
          <View style={styles.statusSelection}>
            <Text style={styles.stepTitle}>How did you watch this?</Text>

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
                <Text style={styles.statusOptionTitle}>In Progress</Text>
                <Text style={styles.statusOptionDescription}>Still watching</Text>
              </View>
              <IconSymbol name="chevron.right" size={20} color={Colors.textMuted} />
            </Pressable>
          </View>
        )}

        {/* Step 2A: Completed Form */}
        {step === 'completed' && (
          <View style={styles.formSection}>
            {/* Star Rating */}
            <View style={styles.ratingSection}>
              <Text style={styles.sectionLabel}>RATING</Text>
              <StarRating rating={starRating} onRatingChange={setStarRating} size={40} />
            </View>

            {/* TV Season Rating */}
            {contentType === 'tv' && totalSeasons > 1 && (
              <View style={styles.seasonRatingSection}>
                <Text style={styles.sectionLabel}>RATING FOR</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={styles.seasonPills}>
                    <Pressable
                      style={[
                        styles.seasonPill,
                        ratedSeason === undefined && styles.seasonPillSelected,
                      ]}
                      onPress={() => setRatedSeason(undefined)}
                    >
                      <Text style={[
                        styles.seasonPillText,
                        ratedSeason === undefined && styles.seasonPillTextSelected,
                      ]}>
                        Overall
                      </Text>
                    </Pressable>
                    {Array.from({ length: totalSeasons }, (_, i) => i + 1).map((season) => (
                      <Pressable
                        key={season}
                        style={[
                          styles.seasonPill,
                          ratedSeason === season && styles.seasonPillSelected,
                        ]}
                        onPress={() => setRatedSeason(season)}
                      >
                        <Text style={[
                          styles.seasonPillText,
                          ratedSeason === season && styles.seasonPillTextSelected,
                        ]}>
                          S{season}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </ScrollView>
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
                (isSaving || starRating === 0) && styles.buttonDisabled,
              ]}
              onPress={handleSave}
              disabled={isSaving || starRating === 0}
            >
              {isSaving ? (
                <ActivityIndicator color={Colors.white} />
              ) : (
                <Text style={styles.saveButtonText}>
                  {starRating > 0 ? 'Save & Rank' : 'Save'}
                </Text>
              )}
            </Pressable>
          </View>
        )}

        {/* Step 2B: In Progress Form */}
        {step === 'in_progress' && (
          <View style={styles.formSection}>
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
                {runtime && parseInt(progressMinutes, 10) > 0 && (
                  <View style={styles.progressBar}>
                    <View
                      style={[
                        styles.progressBarFill,
                        {
                          width: `${Math.min(100, (parseInt(progressMinutes, 10) / runtime) * 100)}%`,
                        },
                      ]}
                    />
                  </View>
                )}
              </View>
            )}

            {/* Progress - TV (season/episode) */}
            {contentType === 'tv' && (
              <View style={styles.progressSection}>
                <Text style={styles.sectionLabel}>PROGRESS</Text>
                <View style={styles.tvProgressRow}>
                  <View style={styles.tvProgressPicker}>
                    <Text style={styles.tvProgressLabel}>Season</Text>
                    <View style={styles.pickerWrapper}>
                      <Pressable
                        style={styles.pickerButton}
                        onPress={() => setProgressSeason(Math.max(1, progressSeason - 1))}
                      >
                        <IconSymbol name="minus" size={16} color={Colors.text} />
                      </Pressable>
                      <Text style={styles.pickerValue}>{progressSeason}</Text>
                      <Pressable
                        style={styles.pickerButton}
                        onPress={() => setProgressSeason(Math.min(totalSeasons, progressSeason + 1))}
                      >
                        <IconSymbol name="plus" size={16} color={Colors.text} />
                      </Pressable>
                    </View>
                  </View>
                  <View style={styles.tvProgressPicker}>
                    <Text style={styles.tvProgressLabel}>Episode</Text>
                    <View style={styles.pickerWrapper}>
                      <Pressable
                        style={styles.pickerButton}
                        onPress={() => setProgressEpisode(Math.max(1, progressEpisode - 1))}
                      >
                        <IconSymbol name="minus" size={16} color={Colors.text} />
                      </Pressable>
                      <Text style={styles.pickerValue}>{progressEpisode}</Text>
                      <Pressable
                        style={styles.pickerButton}
                        onPress={() => setProgressEpisode(Math.min(episodes.length || 99, progressEpisode + 1))}
                      >
                        <IconSymbol name="plus" size={16} color={Colors.text} />
                      </Pressable>
                    </View>
                  </View>
                </View>
                {episodes.length > 0 && episodes[progressEpisode - 1] && (
                  <Text style={styles.episodeTitle}>
                    "{episodes[progressEpisode - 1].name}"
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
                <Text style={styles.saveButtonText}>
                  {existingInProgress ? 'Update Progress' : 'Save Progress'}
                </Text>
              )}
            </Pressable>
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
});
