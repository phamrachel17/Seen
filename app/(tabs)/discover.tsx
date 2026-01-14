import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Fonts, FontSizes, Spacing, BorderRadius } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { MovieGrid } from '@/components/movie-card';
import { searchMovies, getTrendingMovies } from '@/lib/tmdb';
import { Movie } from '@/types';

export default function DiscoverScreen() {
  const insets = useSafeAreaInsets();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Movie[]>([]);
  const [trendingMovies, setTrendingMovies] = useState<Movie[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingTrending, setIsLoadingTrending] = useState(true);

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
      return;
    }

    const timeoutId = setTimeout(async () => {
      setIsSearching(true);
      try {
        const { movies } = await searchMovies(searchQuery);
        setSearchResults(movies);
      } catch (error) {
        console.error('Search error:', error);
      } finally {
        setIsSearching(false);
      }
    }, 400);

    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  const clearSearch = useCallback(() => {
    setSearchQuery('');
    setSearchResults([]);
  }, []);

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
            placeholder="Search movies..."
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

            {searchResults.length > 0 ? (
              <MovieGrid movies={searchResults} columns={3} />
            ) : !isSearching ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateText}>
                  No movies found for &quot;{searchQuery}&quot;
                </Text>
              </View>
            ) : null}
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
});
