import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Fonts, FontSizes, Spacing } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { FeedCard } from '@/components/feed-card';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { getUnreadNotificationCount } from '@/lib/social';
import { Movie, Review, User } from '@/types';

interface FeedReview extends Review {
  movies: Movie;
  users: Pick<User, 'id' | 'username' | 'display_name' | 'profile_image_url'>;
}

export default function FeedScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();

  const [reviews, setReviews] = useState<FeedReview[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);

  const loadFeed = useCallback(async () => {
    if (!user) {
      setIsLoading(false);
      return;
    }

    try {
      // Get users the current user is following
      const { data: followingData } = await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', user.id);

      const followingIds = followingData?.map((f) => f.following_id) || [];
      const feedUserIds = [user.id, ...followingIds];

      // Fetch reviews from the user and people they follow
      // Don't order by created_at - we'll sort by most recent activity (created or updated)
      const { data, error } = await supabase
        .from('reviews')
        .select(`
          *,
          movies (*),
          users!reviews_user_id_fkey (id, username, display_name, profile_image_url)
        `)
        .in('user_id', feedUserIds)
        .or(`is_private.eq.false,user_id.eq.${user.id}`)
        .limit(100);

      if (error) {
        console.error('Error loading feed:', error);
        return;
      }

      // Filter and sort by most recent activity (created_at or updated_at)
      const feedReviews = (data || [])
        .filter((item: FeedReview) => item.movies && item.users)
        .sort((a, b) => {
          // Get the most recent date for each review
          const aDate = new Date(a.updated_at) > new Date(a.created_at)
            ? new Date(a.updated_at)
            : new Date(a.created_at);
          const bDate = new Date(b.updated_at) > new Date(b.created_at)
            ? new Date(b.updated_at)
            : new Date(b.created_at);
          return bDate.getTime() - aDate.getTime();
        })
        .slice(0, 50) as FeedReview[];

      setReviews(feedReviews);

      // Load unread notification count
      const count = await getUnreadNotificationCount(user.id);
      setUnreadCount(count);
    } catch (error) {
      console.error('Error loading feed:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      loadFeed();
    }, [loadFeed])
  );

  const onRefresh = async () => {
    setIsRefreshing(true);
    await loadFeed();
    setIsRefreshing(false);
  };

  const navigateToNotifications = () => {
    router.push('/notifications');
  };

  const renderItem = ({ item }: { item: FeedReview }) => (
    <FeedCard review={item} onLikeChange={loadFeed} />
  );

  const renderHeader = () => (
    <Text style={styles.sectionTitle}>The Ledger</Text>
  );

  const renderEmpty = () => {
    if (isLoading) return null;

    return (
      <View style={styles.emptyState}>
        <IconSymbol name="film" size={48} color={Colors.textMuted} />
        <Text style={styles.emptyStateTitle}>Your feed is empty</Text>
        <Text style={styles.emptyStateText}>
          Follow people and watch movies to see activity here
        </Text>
        <Pressable
          style={styles.discoverButton}
          onPress={() => router.push('/(tabs)/discover')}
        >
          <Text style={styles.discoverButtonText}>Discover Films & People</Text>
        </Pressable>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
        <Text style={styles.title}>Seen</Text>
        <Pressable style={styles.iconButton} onPress={navigateToNotifications}>
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

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.stamp} />
        </View>
      ) : (
        <FlatList
          data={reviews}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          ListHeaderComponent={renderHeader}
          ListEmptyComponent={renderEmpty}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={onRefresh}
              tintColor={Colors.stamp}
            />
          }
          ItemSeparatorComponent={() => <View style={styles.separator} />}
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing['3xl'],
  },
  sectionTitle: {
    fontFamily: Fonts.serifItalic,
    fontSize: FontSizes['2xl'],
    color: Colors.text,
    marginBottom: Spacing.lg,
  },
  separator: {
    height: Spacing.md,
  },
  emptyState: {
    paddingVertical: Spacing['4xl'],
    alignItems: 'center',
    gap: Spacing.md,
  },
  emptyStateTitle: {
    fontFamily: Fonts.serifSemiBold,
    fontSize: FontSizes.xl,
    color: Colors.text,
  },
  emptyStateText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.md,
    color: Colors.textMuted,
    textAlign: 'center',
    paddingHorizontal: Spacing.xl,
  },
  discoverButton: {
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.stamp,
    borderRadius: 8,
  },
  discoverButtonText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.sm,
    color: Colors.stamp,
    letterSpacing: 0.5,
  },
});
