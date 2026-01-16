import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  FlatList,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Fonts, FontSizes, Spacing, BorderRadius } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { MovieGrid } from '@/components/movie-card';
import { UserListItem } from '@/components/user-list-item';
import { searchMovies, getTrendingMovies } from '@/lib/tmdb';
import { searchUsers, followUser, unfollowUser } from '@/lib/follows';
import { useAuth } from '@/lib/auth-context';
import { Movie, UserSearchResult } from '@/types';

type SearchMode = 'movies' | 'people';

export default function DiscoverScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();

  const [searchQuery, setSearchQuery] = useState('');
  const [searchMode, setSearchMode] = useState<SearchMode>('movies');
  const [searchResults, setSearchResults] = useState<Movie[]>([]);
  const [userResults, setUserResults] = useState<UserSearchResult[]>([]);
  const [trendingMovies, setTrendingMovies] = useState<Movie[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingTrending, setIsLoadingTrending] = useState(true);
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [loadingFollowIds, setLoadingFollowIds] = useState<Set<string>>(new Set());

  // Load trending movies on mount
  useEffect(() => {
    loadTrendingMovies();
  }, []);

  const loadTrendingMovies = async () => {
    try {
      setIsLoadingTrending(true);
      const movies = await getTrendingMovies();
      setTrendingMovies(movies.slice(0, 12)); // Show top 12
    } catch (error) {
      console.error('Error loading trending movies:', error);
    } finally {
      setIsLoadingTrending(false);
    }
  };

  // Debounced search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setUserResults([]);
      return;
    }

    const timeoutId = setTimeout(async () => {
      setIsSearching(true);
      try {
        if (searchMode === 'movies') {
          const { movies } = await searchMovies(searchQuery);
          setSearchResults(movies);
        } else {
          if (!user) return;
          const users = await searchUsers(searchQuery, user.id);
          setUserResults(users);
          setFollowingIds(
            new Set(users.filter((u) => u.is_following).map((u) => u.id))
          );
        }
      } catch (error) {
        console.error('Search error:', error);
      } finally {
        setIsSearching(false);
      }
    }, 400);

    return () => clearTimeout(timeoutId);
  }, [searchQuery, searchMode, user]);

  const clearSearch = useCallback(() => {
    setSearchQuery('');
    setSearchResults([]);
    setUserResults([]);
  }, []);

  const handleFollowPress = async (targetUserId: string) => {
    if (!user || loadingFollowIds.has(targetUserId)) return;

    const isCurrentlyFollowing = followingIds.has(targetUserId);

    // Optimistic update
    setFollowingIds((prev) => {
      const next = new Set(prev);
      if (isCurrentlyFollowing) {
        next.delete(targetUserId);
      } else {
        next.add(targetUserId);
      }
      return next;
    });

    setLoadingFollowIds((prev) => new Set(prev).add(targetUserId));

    try {
      const success = isCurrentlyFollowing
        ? await unfollowUser(user.id, targetUserId)
        : await followUser(user.id, targetUserId);

      if (!success) {
        // Revert on failure
        setFollowingIds((prev) => {
          const next = new Set(prev);
          if (isCurrentlyFollowing) {
            next.add(targetUserId);
          } else {
            next.delete(targetUserId);
          }
          return next;
        });
      }
    } catch (error) {
      // Revert on error
      setFollowingIds((prev) => {
        const next = new Set(prev);
        if (isCurrentlyFollowing) {
          next.add(targetUserId);
        } else {
          next.delete(targetUserId);
        }
        return next;
      });
    } finally {
      setLoadingFollowIds((prev) => {
        const next = new Set(prev);
        next.delete(targetUserId);
        return next;
      });
    }
  };

  const handleUserPress = (userId: string) => {
    router.push(`/user/${userId}`);
  };

  const isShowingSearch = searchQuery.trim().length > 0;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
        <Text style={styles.title}>Seen</Text>
        <View style={styles.headerActions}>
          <Pressable style={styles.iconButton}>
            <IconSymbol name="bell" size={22} color={Colors.text} />
          </Pressable>
        </View>
      </View>

      {/* Search bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <IconSymbol name="magnifyingglass" size={18} color={Colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder={searchMode === 'movies' ? 'Search movies...' : 'Search people...'}
            placeholderTextColor={Colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={clearSearch} hitSlop={8}>
              <IconSymbol name="xmark" size={18} color={Colors.textMuted} />
            </Pressable>
          )}
        </View>

        {/* Search Mode Toggle */}
        <View style={styles.searchModeToggle}>
          <Pressable
            style={[
              styles.modeButton,
              searchMode === 'movies' && styles.modeButtonActive,
            ]}
            onPress={() => setSearchMode('movies')}
          >
            <Text
              style={[
                styles.modeButtonText,
                searchMode === 'movies' && styles.modeButtonTextActive,
              ]}
            >
              Movies
            </Text>
          </Pressable>
          <Pressable
            style={[
              styles.modeButton,
              searchMode === 'people' && styles.modeButtonActive,
            ]}
            onPress={() => setSearchMode('people')}
          >
            <Text
              style={[
                styles.modeButtonText,
                searchMode === 'people' && styles.modeButtonTextActive,
              ]}
            >
              People
            </Text>
          </Pressable>
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {isShowingSearch ? (
          <>
            {/* Search Results */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Search Results</Text>
              {isSearching && <ActivityIndicator size="small" color={Colors.stamp} />}
            </View>

            {searchMode === 'movies' ? (
              // Movie search results
              searchResults.length > 0 ? (
                <MovieGrid movies={searchResults} columns={3} />
              ) : !isSearching ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyStateText}>
                    No movies found for &quot;{searchQuery}&quot;
                  </Text>
                </View>
              ) : null
            ) : (
              // People search results
              userResults.length > 0 ? (
                <View style={styles.userResultsList}>
                  {userResults.map((userItem) => (
                    <UserListItem
                      key={userItem.id}
                      user={userItem}
                      currentUserId={user?.id || ''}
                      isFollowing={followingIds.has(userItem.id)}
                      isLoading={loadingFollowIds.has(userItem.id)}
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
        ) : (
          <>
            {/* Curated/Trending List */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>The Curated List</Text>
              <Text style={styles.issueNumber}>TRENDING</Text>
            </View>

            {isLoadingTrending ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={Colors.stamp} />
              </View>
            ) : trendingMovies.length > 0 ? (
              <MovieGrid movies={trendingMovies} columns={3} />
            ) : (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateText}>
                  Unable to load movies. Check your API key.
                </Text>
              </View>
            )}
          </>
        )}
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
  title: {
    fontFamily: Fonts.serifBoldItalic,
    fontSize: FontSizes['3xl'],
    color: Colors.stamp,
  },
  headerActions: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  iconButton: {
    padding: Spacing.xs,
  },
  searchContainer: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.lg,
    gap: Spacing.md,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.md,
    color: Colors.text,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing['3xl'],
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    fontFamily: Fonts.serifItalic,
    fontSize: FontSizes['2xl'],
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
  },
  emptyStateText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.md,
    color: Colors.textMuted,
    textAlign: 'center',
  },
  searchModeToggle: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  modeButton: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modeButtonActive: {
    backgroundColor: Colors.stamp,
    borderColor: Colors.stamp,
  },
  modeButtonText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
  },
  modeButtonTextActive: {
    color: Colors.paper,
  },
  userResultsList: {
    marginHorizontal: -Spacing.xl,
  },
});
