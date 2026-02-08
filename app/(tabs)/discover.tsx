import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Keyboard,
} from 'react-native';
import { SeenLoader } from '@/components/ui/seen-loader';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Fonts, FontSizes, Spacing, BorderRadius } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { MovieGrid } from '@/components/movie-card';
import { UserListItem } from '@/components/user-list-item';
import { HorizontalMovieRow } from '@/components/horizontal-movie-row';
import { FriendsWatchingRow } from '@/components/friends-watching-row';
import { InlineDropdown } from '@/components/inline-dropdown';
import { PersonCombobox } from '@/components/person-combobox';
import { VideoSpotlight } from '@/components/video-spotlight';
import { PickForMeModal } from '@/components/pick-for-me-modal';
import {
  searchAll,
  getTrendingMovies,
  getTrendingTVShows,
  discoverMoviesByGenre,
  discoverTVShowsByGenre,
  getPersonMovieCredits,
  GENRE_IDS,
  GenreKey,
} from '@/lib/tmdb';
import { searchUsers, followUser, unfollowUser, getTopRankedUsers, getFollowingIds } from '@/lib/follows';
import { getUnreadNotificationCount } from '@/lib/social';
import { getFeedActivities } from '@/lib/activity';
import { getRecommendedContent } from '@/lib/recommendations';
import { getSpotlightList, getTVSpotlightList, SpotlightList, TVSpotlightList } from '@/lib/spotlight';
import { useAuth } from '@/lib/auth-context';
import { useCache } from '@/lib/cache-context';
import { Movie, TVShow, UserSearchResult, Activity, Person } from '@/types';

type SearchMode = 'movies' | 'tv' | 'people';

type SearchResultItem = (Movie | TVShow) & { content_type?: 'movie' | 'tv' };

// Genre options for dropdown
const GENRE_OPTIONS: { id: string; label: string }[] = [
  { id: 'action', label: 'Action' },
  { id: 'comedy', label: 'Comedy' },
  { id: 'drama', label: 'Drama' },
  { id: 'horror', label: 'Horror' },
  { id: 'romance', label: 'Romance' },
  { id: 'scifi', label: 'Sci-Fi' },
  { id: 'thriller', label: 'Thriller' },
  { id: 'documentary', label: 'Documentary' },
  { id: 'animation', label: 'Animation' },
  { id: 'crime', label: 'Crime' },
  { id: 'mystery', label: 'Mystery' },
  { id: 'fantasy', label: 'Fantasy' },
];

interface DropdownPosition {
  top: number;
  left: number;
  width: number;
}

export default function DiscoverScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { invalidate } = useCache();

  // Refs for dropdown positioning
  const genreButtonRef = useRef<View>(null);
  const personButtonRef = useRef<View>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMode, setSearchMode] = useState<SearchMode>('movies');
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [userResults, setUserResults] = useState<UserSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Movie content state
  const [trendingMovies, setTrendingMovies] = useState<Movie[]>([]);
  const [recommendedMovies, setRecommendedMovies] = useState<Movie[]>([]);
  const [friendsActivities, setFriendsActivities] = useState<Activity[]>([]);
  const [actionMovies, setActionMovies] = useState<Movie[]>([]);
  const [comedyMovies, setComedyMovies] = useState<Movie[]>([]);
  const [dramaMovies, setDramaMovies] = useState<Movie[]>([]);
  const [horrorMovies, setHorrorMovies] = useState<Movie[]>([]);
  const [romanceMovies, setRomanceMovies] = useState<Movie[]>([]);
  const [thrillerMovies, setThrillerMovies] = useState<Movie[]>([]);

  // TV Show content state
  const [trendingTVShows, setTrendingTVShows] = useState<TVShow[]>([]);
  const [actionTVShows, setActionTVShows] = useState<TVShow[]>([]);
  const [comedyTVShows, setComedyTVShows] = useState<TVShow[]>([]);
  const [dramaTVShows, setDramaTVShows] = useState<TVShow[]>([]);
  const [horrorTVShows, setHorrorTVShows] = useState<TVShow[]>([]);
  const [romanceTVShows, setRomanceTVShows] = useState<TVShow[]>([]);
  const [thrillerTVShows, setThrillerTVShows] = useState<TVShow[]>([]);

  // Loading states
  const [isLoadingTrending, setIsLoadingTrending] = useState(true);
  const [isLoadingRecommended, setIsLoadingRecommended] = useState(false);
  const [isLoadingFriends, setIsLoadingFriends] = useState(false);
  const [isLoadingGenres, setIsLoadingGenres] = useState(false);
  const [isLoadingTVTrending, setIsLoadingTVTrending] = useState(false);
  const [isLoadingTVGenres, setIsLoadingTVGenres] = useState(false);

  // Filter state
  const [activeGenre, setActiveGenre] = useState<GenreKey | null>(null);
  const [activePerson, setActivePerson] = useState<Person | null>(null);
  const [filteredMovies, setFilteredMovies] = useState<Movie[]>([]);
  const [isLoadingFiltered, setIsLoadingFiltered] = useState(false);

  // Dropdown state
  const [showGenreDropdown, setShowGenreDropdown] = useState(false);
  const [showPersonCombobox, setShowPersonCombobox] = useState(false);
  const [genreDropdownPos, setGenreDropdownPos] = useState<DropdownPosition | null>(null);
  const [personDropdownPos, setPersonDropdownPos] = useState<DropdownPosition | null>(null);

  // People mode state
  const [topUsers, setTopUsers] = useState<(UserSearchResult & { rankings_count: number })[]>([]);
  const [isLoadingTopUsers, setIsLoadingTopUsers] = useState(false);
  const [followingIds, setFollowingIds] = useState<string[]>([]);
  const [loadingFollowIds, setLoadingFollowIds] = useState<string[]>([]);

  // Notification state
  const [unreadCount, setUnreadCount] = useState(0);

  // Spotlight state
  const [spotlightList, setSpotlightList] = useState<SpotlightList | null>(null);
  const [spotlightIndex, setSpotlightIndex] = useState(0);
  const [isLoadingSpotlight, setIsLoadingSpotlight] = useState(true);
  const [tvSpotlightList, setTVSpotlightList] = useState<TVSpotlightList | null>(null);
  const [tvSpotlightIndex, setTVSpotlightIndex] = useState(0);
  const [isLoadingTVSpotlight, setIsLoadingTVSpotlight] = useState(false);

  // Pick for Me state
  const [showPickForMeModal, setShowPickForMeModal] = useState(false);

  // Error state for user feedback
  const [loadError, setLoadError] = useState<string | null>(null);

  // Load initial data on mount
  useEffect(() => {
    loadTrendingMovies();
    loadGenreRows();
    loadSpotlight();
  }, []);

  // Load personalized content when user is available
  useEffect(() => {
    if (user) {
      loadRecommendedMovies();
      loadFriendsActivities();
    }
  }, [user]);

  // Load unread notification count on focus
  useFocusEffect(
    useCallback(() => {
      if (user) {
        getUnreadNotificationCount(user.id).then(setUnreadCount);
      }
    }, [user])
  );

  // Refresh following IDs when returning to people mode (syncs with changes made on other pages)
  useFocusEffect(
    useCallback(() => {
      if (user && searchMode === 'people') {
        getFollowingIds(user.id).then((ids) => {
          setFollowingIds(ids);
        });
      }
    }, [user, searchMode])
  );

  const loadTrendingMovies = async () => {
    try {
      setIsLoadingTrending(true);
      setLoadError(null);
      const movies = await getTrendingMovies();
      setTrendingMovies(movies.slice(0, 10));
    } catch (error) {
      console.error('Error loading trending movies:', error);
      setLoadError('Unable to load content. Check your connection and try again.');
    } finally {
      setIsLoadingTrending(false);
    }
  };

  const loadRecommendedMovies = async () => {
    if (!user) return;
    try {
      setIsLoadingRecommended(true);
      const movies = await getRecommendedContent(user.id);
      setRecommendedMovies(movies.slice(0, 10));
    } catch (error) {
      console.error('Error loading recommended movies:', error);
    } finally {
      setIsLoadingRecommended(false);
    }
  };

  const loadFriendsActivities = async () => {
    if (!user) return;
    try {
      setIsLoadingFriends(true);
      const followingIdsList = await getFollowingIds(user.id);
      if (followingIdsList.length > 0) {
        const activities = await getFeedActivities(user.id, followingIdsList, 10);
        setFriendsActivities(activities);
      }
    } catch (error) {
      console.error('Error loading friends activities:', error);
    } finally {
      setIsLoadingFriends(false);
    }
  };

  const loadGenreRows = async () => {
    try {
      setIsLoadingGenres(true);
      const [action, comedy, drama, horror, romance, thriller] = await Promise.all([
        discoverMoviesByGenre(GENRE_IDS.action),
        discoverMoviesByGenre(GENRE_IDS.comedy),
        discoverMoviesByGenre(GENRE_IDS.drama),
        discoverMoviesByGenre(GENRE_IDS.horror),
        discoverMoviesByGenre(GENRE_IDS.romance),
        discoverMoviesByGenre(GENRE_IDS.thriller),
      ]);
      setActionMovies(action.slice(0, 10));
      setComedyMovies(comedy.slice(0, 10));
      setDramaMovies(drama.slice(0, 10));
      setHorrorMovies(horror.slice(0, 10));
      setRomanceMovies(romance.slice(0, 10));
      setThrillerMovies(thriller.slice(0, 10));
    } catch (error) {
      console.error('Error loading genre rows:', error);
    } finally {
      setIsLoadingGenres(false);
    }
  };

  const loadSpotlight = async () => {
    try {
      setIsLoadingSpotlight(true);
      // Spotlight is now purely trending-based (no personalization)
      const list = await getSpotlightList();
      setSpotlightList(list);
      setSpotlightIndex(0);
    } catch (error) {
      console.error('Error loading spotlight:', error);
    } finally {
      setIsLoadingSpotlight(false);
    }
  };

  const loadTrendingTVShows = async () => {
    try {
      setIsLoadingTVTrending(true);
      const shows = await getTrendingTVShows();
      setTrendingTVShows(shows.slice(0, 10));
    } catch (error) {
      console.error('Error loading trending TV shows:', error);
    } finally {
      setIsLoadingTVTrending(false);
    }
  };

  const loadTVGenreRows = async () => {
    try {
      setIsLoadingTVGenres(true);
      const [action, comedy, drama, horror, romance, thriller] = await Promise.all([
        discoverTVShowsByGenre(GENRE_IDS.action),
        discoverTVShowsByGenre(GENRE_IDS.comedy),
        discoverTVShowsByGenre(GENRE_IDS.drama),
        discoverTVShowsByGenre(GENRE_IDS.horror),
        discoverTVShowsByGenre(GENRE_IDS.romance),
        discoverTVShowsByGenre(GENRE_IDS.thriller),
      ]);
      setActionTVShows(action.slice(0, 10));
      setComedyTVShows(comedy.slice(0, 10));
      setDramaTVShows(drama.slice(0, 10));
      setHorrorTVShows(horror.slice(0, 10));
      setRomanceTVShows(romance.slice(0, 10));
      setThrillerTVShows(thriller.slice(0, 10));
    } catch (error) {
      console.error('Error loading TV genre rows:', error);
    } finally {
      setIsLoadingTVGenres(false);
    }
  };

  const loadTVSpotlight = async () => {
    try {
      setIsLoadingTVSpotlight(true);
      const list = await getTVSpotlightList();
      setTVSpotlightList(list);
      setTVSpotlightIndex(0);
    } catch (error) {
      console.error('Error loading TV spotlight:', error);
    } finally {
      setIsLoadingTVSpotlight(false);
    }
  };

  const loadTopUsers = async () => {
    if (!user) return;
    try {
      setIsLoadingTopUsers(true);
      const users = await getTopRankedUsers(user.id);
      setTopUsers(users);
      // Merge with existing followingIds to preserve optimistic updates
      setFollowingIds((prev) => {
        const newIds = users.filter((u) => u.is_following).map((u) => u.id);
        const combined = [...prev, ...newIds];
        return [...new Set(combined)]; // Dedupe and convert back to array
      });
    } catch (error) {
      console.error('Error loading top users:', error);
    } finally {
      setIsLoadingTopUsers(false);
    }
  };

  // Load top users when switching to people mode
  useEffect(() => {
    if (searchMode === 'people' && topUsers.length === 0) {
      loadTopUsers();
    }
  }, [searchMode, user]);

  // Load TV content when switching to TV mode
  useEffect(() => {
    if (searchMode === 'tv') {
      if (trendingTVShows.length === 0) {
        loadTrendingTVShows();
        loadTVGenreRows();
      }
      if (!tvSpotlightList && !isLoadingTVSpotlight) {
        loadTVSpotlight();
      }
    }
  }, [searchMode]);

  // Rotate spotlight every 5 seconds
  useEffect(() => {
    const list = searchMode === 'movies' ? spotlightList : tvSpotlightList;
    if (!list || list.items.length <= 1) return;

    const interval = setInterval(() => {
      if (searchMode === 'movies') {
        setSpotlightIndex(prev => (prev + 1) % (spotlightList?.items.length || 1));
      } else if (searchMode === 'tv') {
        setTVSpotlightIndex(prev => (prev + 1) % (tvSpotlightList?.items.length || 1));
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [searchMode, spotlightList, tvSpotlightList]);

  // Debounced search with AbortController to prevent stale results
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setUserResults([]);
      setIsSearching(false);
      return;
    }

    // Show loading immediately when user types for responsive feedback
    setIsSearching(true);

    // Create AbortController to cancel in-flight requests
    const abortController = new AbortController();

    const timeoutId = setTimeout(async () => {
      // Check if already aborted before starting
      if (abortController.signal.aborted) return;

      try {
        if (searchMode === 'movies' || searchMode === 'tv') {
          const { results } = await searchAll(searchQuery);
          // Only update state if not aborted
          if (!abortController.signal.aborted) {
            setSearchResults(results as SearchResultItem[]);
          }
        } else {
          if (!user) return;
          const users = await searchUsers(searchQuery, user.id);
          // Only update state if not aborted
          if (!abortController.signal.aborted) {
            setUserResults(users);
            // Merge with existing followingIds to preserve optimistic updates
            setFollowingIds((prev) => {
              const newIds = users.filter((u) => u.is_following).map((u) => u.id);
              const combined = [...prev, ...newIds];
              return [...new Set(combined)]; // Dedupe and convert back to array
            });
          }
        }
      } catch (error) {
        // Ignore abort errors, log others
        if (!abortController.signal.aborted) {
          console.error('Search error:', error);
        }
      } finally {
        // Only update loading state if not aborted
        if (!abortController.signal.aborted) {
          setIsSearching(false);
        }
      }
    }, 300);

    return () => {
      clearTimeout(timeoutId);
      abortController.abort();
    };
  }, [searchQuery, searchMode, user]);

  // Open genre dropdown
  const openGenreDropdown = () => {
    genreButtonRef.current?.measureInWindow((x, y, width, height) => {
      setGenreDropdownPos({ top: y + height + 4, left: x, width: 140 });
      setShowGenreDropdown(true);
    });
  };

  // Open person combobox
  const openPersonCombobox = () => {
    personButtonRef.current?.measureInWindow((x, y, width, height) => {
      setPersonDropdownPos({ top: y + height + 4, left: Math.max(x - 100, 16), width: 220 });
      setShowPersonCombobox(true);
    });
  };

  // Handle genre selection
  const handleGenreSelect = async (genreId: string) => {
    const genreKey = genreId as GenreKey;

    // If same genre selected, clear filter
    if (activeGenre === genreKey) {
      clearFilter();
      return;
    }

    setActiveGenre(genreKey);
    setActivePerson(null);
    setIsLoadingFiltered(true);

    try {
      const movies = await discoverMoviesByGenre(GENRE_IDS[genreKey]);
      setFilteredMovies(movies);
    } catch (error) {
      console.error('Error loading filtered movies:', error);
    } finally {
      setIsLoadingFiltered(false);
    }
  };

  // Handle person selection
  const handlePersonSelect = async (person: Person) => {
    setActivePerson(person);
    setActiveGenre(null);
    setIsLoadingFiltered(true);

    try {
      const movies = await getPersonMovieCredits(person.id);
      setFilteredMovies(movies);
    } catch (error) {
      console.error('Error loading person movies:', error);
    } finally {
      setIsLoadingFiltered(false);
    }
  };

  const clearFilter = () => {
    setActiveGenre(null);
    setActivePerson(null);
    setFilteredMovies([]);
  };

  const clearSearch = useCallback(() => {
    setSearchQuery('');
    setSearchResults([]);
    setUserResults([]);
  }, []);

  const handleFollowPress = async (targetUserId: string) => {
    if (!user || loadingFollowIds.includes(targetUserId)) return;

    const isCurrentlyFollowing = followingIds.includes(targetUserId);

    // Optimistic update
    setFollowingIds((prev) => {
      if (isCurrentlyFollowing) {
        return prev.filter((id) => id !== targetUserId);
      } else {
        return [...prev, targetUserId];
      }
    });

    setLoadingFollowIds((prev) => [...prev, targetUserId]);

    try {
      const success = isCurrentlyFollowing
        ? await unfollowUser(user.id, targetUserId)
        : await followUser(user.id, targetUserId);

      if (success) {
        // Invalidate caches on successful follow/unfollow
        invalidate(isCurrentlyFollowing ? 'unfollow' : 'follow', user.id);
      } else {
        // Revert on failure
        setFollowingIds((prev) => {
          if (isCurrentlyFollowing) {
            return [...prev, targetUserId];
          } else {
            return prev.filter((id) => id !== targetUserId);
          }
        });
      }
    } catch (error) {
      // Revert on error
      setFollowingIds((prev) => {
        if (isCurrentlyFollowing) {
          return [...prev, targetUserId];
        } else {
          return prev.filter((id) => id !== targetUserId);
        }
      });
    } finally {
      setLoadingFollowIds((prev) => prev.filter((id) => id !== targetUserId));
    }
  };

  const handleUserPress = (userId: string) => {
    router.push(`/user/${userId}`);
  };

  const isShowingSearch = searchQuery.trim().length > 0;
  const isShowingFilter = (activeGenre !== null || activePerson !== null) && !isShowingSearch;

  // Get label for active genre
  const getGenreLabel = () => {
    if (!activeGenre) return 'Genre';
    const option = GENRE_OPTIONS.find((o) => o.id === activeGenre);
    return option?.label || 'Genre';
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
        <Text style={styles.title}>Seen</Text>
        <View style={styles.headerActions}>
          <Pressable
            style={styles.iconButton}
            onPress={() => router.push('/notifications')}
          >
            <IconSymbol name="bell" size={22} color={Colors.text} />
            {unreadCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {unreadCount > 9 ? '9+' : unreadCount}
                </Text>
              </View>
            )}
          </Pressable>
        </View>
      </View>

      {/* Search bar and Filters */}
      <View style={styles.searchContainer}>
        <View style={styles.searchRow}>
          <View style={styles.searchBar}>
            <IconSymbol name="magnifyingglass" size={18} color={Colors.textMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder={searchMode === 'people' ? 'Search friends...' : 'Search movies & TV...'}
              placeholderTextColor={Colors.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              blurOnSubmit
              onSubmitEditing={Keyboard.dismiss}
            />
            {searchQuery.length > 0 && (
              <Pressable onPress={clearSearch} hitSlop={8}>
                <IconSymbol name="xmark" size={18} color={Colors.textMuted} />
              </Pressable>
            )}
          </View>

          {/* Pick for Me icon - only show in movies/tv mode */}
          {searchMode !== 'people' && (
            <Pressable
              style={({ pressed }) => [
                styles.pickForMeIcon,
                pressed && styles.pickForMeIconPressed,
              ]}
              onPress={() => setShowPickForMeModal(true)}
            >
              <IconSymbol name="wand.and.stars" size={22} color={Colors.stamp} />
            </Pressable>
          )}
        </View>

        {/* Primary Content Type Toggle */}
        <View style={styles.primaryToggle}>
          <Pressable
            style={[
              styles.toggleSegment,
              searchMode === 'movies' && styles.toggleSegmentActive,
            ]}
            onPress={() => {
              setSearchMode('movies');
              setActiveGenre(null);
              setActivePerson(null);
              setFilteredMovies([]);
            }}
          >
            <Text
              style={[
                styles.toggleText,
                searchMode === 'movies' && styles.toggleTextActive,
              ]}
            >
              Movies
            </Text>
          </Pressable>
          <Pressable
            style={[
              styles.toggleSegment,
              searchMode === 'tv' && styles.toggleSegmentActive,
            ]}
            onPress={() => {
              setSearchMode('tv');
              setActiveGenre(null);
              setActivePerson(null);
              setFilteredMovies([]);
            }}
          >
            <Text
              style={[
                styles.toggleText,
                searchMode === 'tv' && styles.toggleTextActive,
              ]}
            >
              TV Shows
            </Text>
          </Pressable>
          <Pressable
            style={[
              styles.toggleSegment,
              searchMode === 'people' && styles.toggleSegmentActive,
            ]}
            onPress={() => {
              setSearchMode('people');
              setActiveGenre(null);
              setActivePerson(null);
              setFilteredMovies([]);
            }}
          >
            <Text
              style={[
                styles.toggleText,
                searchMode === 'people' && styles.toggleTextActive,
              ]}
            >
              Friends
            </Text>
          </Pressable>
        </View>

        {/* Secondary Filter Buttons (in movies or tv mode when not searching) */}
        {(searchMode === 'movies' || searchMode === 'tv') && !isShowingSearch && (
          <View style={styles.filterButtons}>
            <Pressable
              ref={genreButtonRef}
              style={[
                styles.filterButton,
                activeGenre && styles.filterButtonActive,
              ]}
              onPress={activeGenre ? undefined : openGenreDropdown}
            >
              <Text
                style={[
                  styles.filterButtonText,
                  activeGenre && styles.filterButtonTextActive,
                ]}
              >
                {getGenreLabel()}
              </Text>
              {activeGenre ? (
                <Pressable
                  onPress={() => {
                    setActiveGenre(null);
                    setFilteredMovies([]);
                  }}
                  hitSlop={8}
                >
                  <IconSymbol name="xmark" size={12} color={Colors.white} />
                </Pressable>
              ) : (
                <IconSymbol name="chevron.down" size={12} color={Colors.textMuted} />
              )}
            </Pressable>

            <Pressable
              ref={personButtonRef}
              style={[
                styles.filterButton,
                activePerson && styles.filterButtonActive,
              ]}
              onPress={activePerson ? undefined : openPersonCombobox}
            >
              <Text
                style={[
                  styles.filterButtonText,
                  activePerson && styles.filterButtonTextActive,
                ]}
                numberOfLines={1}
              >
                {activePerson ? activePerson.name : 'Actor/Director'}
              </Text>
              {activePerson ? (
                <Pressable
                  onPress={() => {
                    setActivePerson(null);
                    setFilteredMovies([]);
                  }}
                  hitSlop={8}
                >
                  <IconSymbol name="xmark" size={12} color={Colors.white} />
                </Pressable>
              ) : (
                <IconSymbol name="chevron.down" size={12} color={Colors.textMuted} />
              )}
            </Pressable>
          </View>
        )}
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onScrollBeginDrag={Keyboard.dismiss}
      >
        {/* Error Banner */}
        {loadError && (
          <View style={styles.errorBanner}>
            <IconSymbol name="exclamationmark.triangle" size={16} color={Colors.error} />
            <Text style={styles.errorBannerText}>{loadError}</Text>
            <Pressable
              style={styles.errorRetryButton}
              onPress={() => {
                setLoadError(null);
                loadTrendingMovies();
                loadGenreRows();
              }}
            >
              <Text style={styles.errorRetryText}>Retry</Text>
            </Pressable>
          </View>
        )}

        {/* Spotlight - in movies or tv mode when not searching/filtering */}
        {(searchMode === 'movies' || searchMode === 'tv') && !isShowingSearch && !isShowingFilter && (
          <>
            <VideoSpotlight
              movie={searchMode === 'movies'
                ? spotlightList?.items[spotlightIndex]?.movie || null
                : tvSpotlightList?.items[tvSpotlightIndex]?.show || null}
              isLoading={searchMode === 'movies' ? isLoadingSpotlight : isLoadingTVSpotlight}
              onPress={() => {
                const currentMovie = spotlightList?.items[spotlightIndex]?.movie;
                const currentShow = tvSpotlightList?.items[tvSpotlightIndex]?.show;
                if (searchMode === 'movies' && currentMovie) {
                  router.push(`/title/${currentMovie.id}?type=movie`);
                } else if (searchMode === 'tv' && currentShow) {
                  router.push(`/title/${currentShow.id}?type=tv`);
                }
              }}
            />
          </>
        )}

        {isShowingSearch ? (
          <>
            {/* Search Results */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Search Results</Text>
              {isSearching && <ActivityIndicator size="small" color={Colors.stamp} />}
            </View>

            {searchMode === 'movies' || searchMode === 'tv' ? (
              searchResults.length > 0 ? (
                <View style={styles.searchResultsGrid}>
                  <MovieGrid movies={searchResults} columns={3} />
                </View>
              ) : !isSearching ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyStateText}>
                    No titles found for &quot;{searchQuery}&quot;
                  </Text>
                </View>
              ) : null
            ) : (
              userResults.length > 0 ? (
                <View style={styles.userResultsList}>
                  {userResults.map((userItem) => (
                    <UserListItem
                      key={userItem.id}
                      user={userItem}
                      currentUserId={user?.id || ''}
                      isFollowing={followingIds.includes(userItem.id)}
                      isLoading={loadingFollowIds.includes(userItem.id)}
                      onFollowPress={() => handleFollowPress(userItem.id)}
                      onUserPress={() => handleUserPress(userItem.id)}
                    />
                  ))}
                </View>
              ) : !isSearching ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyStateText}>
                    No users found for &quot;{searchQuery}&quot;
                  </Text>
                </View>
              ) : null
            )}
          </>
        ) : isShowingFilter ? (
          <>
            {/* Filtered Results */}
            {isLoadingFiltered ? (
              <View style={styles.loadingContainer}>
                <SeenLoader size={48} />
              </View>
            ) : filteredMovies.length > 0 ? (
              <View style={styles.filteredResultsGrid}>
                <MovieGrid movies={filteredMovies} columns={3} />
              </View>
            ) : (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateText}>No movies found</Text>
              </View>
            )}
          </>
        ) : searchMode === 'movies' ? (
          <>
            {/* Trending Now */}
            <HorizontalMovieRow
              title="Trending Now"
              subtitle="THIS WEEK"
              movies={trendingMovies}
              isLoading={isLoadingTrending}
            />

            {/* Recommended for You */}
            {recommendedMovies.length > 0 && (
              <HorizontalMovieRow
                title="Recommended for You"
                subtitle="BASED ON YOUR WATCHES"
                movies={recommendedMovies}
                isLoading={isLoadingRecommended}
              />
            )}

            {/* What Your Friends Are Watching */}
            {friendsActivities.length > 0 && (
              <FriendsWatchingRow
                title="Friends Watching"
                subtitle="RECENT ACTIVITY"
                activities={friendsActivities}
                isLoading={isLoadingFriends}
              />
            )}

            {/* Genre Rows */}
            <HorizontalMovieRow
              title="Action"
              movies={actionMovies}
              isLoading={isLoadingGenres}
            />

            <HorizontalMovieRow
              title="Comedy"
              movies={comedyMovies}
              isLoading={isLoadingGenres}
            />

            <HorizontalMovieRow
              title="Drama"
              movies={dramaMovies}
              isLoading={isLoadingGenres}
            />

            <HorizontalMovieRow
              title="Horror"
              movies={horrorMovies}
              isLoading={isLoadingGenres}
            />

            <HorizontalMovieRow
              title="Romance"
              movies={romanceMovies}
              isLoading={isLoadingGenres}
            />

            <HorizontalMovieRow
              title="Thriller"
              movies={thrillerMovies}
              isLoading={isLoadingGenres}
            />
          </>
        ) : searchMode === 'tv' ? (
          <>
            {/* Trending TV Shows */}
            <HorizontalMovieRow
              title="Trending Now"
              subtitle="THIS WEEK"
              movies={trendingTVShows}
              isLoading={isLoadingTVTrending}
              type="tv"
            />

            {/* TV Genre Rows */}
            <HorizontalMovieRow
              title="Action"
              movies={actionTVShows}
              isLoading={isLoadingTVGenres}
              type="tv"
            />

            <HorizontalMovieRow
              title="Comedy"
              movies={comedyTVShows}
              isLoading={isLoadingTVGenres}
              type="tv"
            />

            <HorizontalMovieRow
              title="Drama"
              movies={dramaTVShows}
              isLoading={isLoadingTVGenres}
              type="tv"
            />

            <HorizontalMovieRow
              title="Horror"
              movies={horrorTVShows}
              isLoading={isLoadingTVGenres}
              type="tv"
            />

            <HorizontalMovieRow
              title="Romance"
              movies={romanceTVShows}
              isLoading={isLoadingTVGenres}
              type="tv"
            />

            <HorizontalMovieRow
              title="Thriller"
              movies={thrillerTVShows}
              isLoading={isLoadingTVGenres}
              type="tv"
            />
          </>
        ) : (
          <>
            {/* Top Ranked Users (People mode) */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Top Rankers</Text>
              <Text style={styles.issueNumber}>BY MOVIES RANKED</Text>
            </View>

            {isLoadingTopUsers ? (
              <View style={styles.loadingContainer}>
                <SeenLoader size={48} />
              </View>
            ) : topUsers.length > 0 ? (
              <View style={styles.userResultsList}>
                {topUsers.map((userItem) => (
                  <UserListItem
                    key={userItem.id}
                    user={userItem}
                    currentUserId={user?.id || ''}
                    isFollowing={followingIds.includes(userItem.id)}
                    isLoading={loadingFollowIds.includes(userItem.id)}
                    onFollowPress={() => handleFollowPress(userItem.id)}
                    onUserPress={() => handleUserPress(userItem.id)}
                    subtitle={`${userItem.rankings_count} movies ranked`}
                  />
                ))}
              </View>
            ) : (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateText}>
                  No users have ranked movies yet.
                </Text>
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* Inline Dropdowns */}
      <InlineDropdown
        visible={showGenreDropdown}
        onClose={() => setShowGenreDropdown(false)}
        options={GENRE_OPTIONS}
        selectedId={activeGenre}
        onSelect={handleGenreSelect}
        anchorPosition={genreDropdownPos}
      />

      <PersonCombobox
        visible={showPersonCombobox}
        onClose={() => setShowPersonCombobox(false)}
        onSelect={handlePersonSelect}
        anchorPosition={personDropdownPos}
      />

      {/* Pick for Me Modal */}
      <PickForMeModal
        visible={showPickForMeModal}
        onClose={() => setShowPickForMeModal(false)}
        initialContentType={searchMode === 'tv' ? 'tv' : 'movie'}
      />
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
  title: {
    fontFamily: Fonts.serifBold,
    fontSize: FontSizes['3xl'],
    color: Colors.stamp,
  },
  headerActions: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  iconButton: {
    padding: Spacing.xs,
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: Colors.error,
    borderRadius: 10,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: 10,
    color: Colors.white,
  },
  searchContainer: {
    paddingBottom: Spacing.md,
    gap: Spacing.md,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.xl,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.cardBackground,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dust,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
  },
  pickForMeIcon: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.cardBackground,
    borderWidth: 1,
    borderColor: Colors.stamp,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickForMeIconPressed: {
    opacity: 0.7,
    backgroundColor: Colors.dust,
  },
  searchInput: {
    flex: 1,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.md,
    color: Colors.text,
    paddingVertical: 0,
  },
  primaryToggle: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    gap: Spacing.md,
    paddingBottom: Spacing.xs,
    paddingHorizontal: Spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  toggleSegment: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: 0,
    borderWidth: 0,
    backgroundColor: 'transparent',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    marginBottom: -1,
  },
  toggleSegmentActive: {
    borderBottomColor: Colors.stamp,
  },
  toggleText: {
    fontFamily: Fonts.sansMedium,
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
  },
  toggleTextActive: {
    color: Colors.stamp,
  },
  filterButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.xl,
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    minHeight: 28,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.cardBackground,
    gap: Spacing.xs,
  },
  filterButtonActive: {
    backgroundColor: Colors.stamp,
    borderColor: Colors.stamp,
  },
  filterButtonText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
  },
  filterButtonTextActive: {
    color: Colors.white,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: Spacing['3xl'],
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    fontFamily: Fonts.serifBold,
    fontSize: FontSizes.xl,
    color: Colors.stamp,
  },
  issueNumber: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
    letterSpacing: 1,
  },
  loadingContainer: {
    paddingVertical: Spacing['4xl'],
    alignItems: 'center',
  },
  emptyState: {
    paddingVertical: Spacing['4xl'],
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
  },
  emptyStateText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.md,
    color: Colors.textMuted,
    textAlign: 'center',
  },
  searchResultsGrid: {
    paddingHorizontal: Spacing.xl,
  },
  filteredResultsGrid: {
    paddingHorizontal: Spacing.xl,
  },
  userResultsList: {
    marginHorizontal: 0,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.cardBackground,
    marginHorizontal: Spacing.xl,
    marginBottom: Spacing.lg,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderLeftWidth: 3,
    borderLeftColor: Colors.error,
    gap: Spacing.sm,
  },
  errorBannerText: {
    flex: 1,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    color: Colors.text,
  },
  errorRetryButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.stamp,
    borderRadius: BorderRadius.sm,
  },
  errorRetryText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.xs,
    color: Colors.white,
  },
});
