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
import { ActivityFeedCard } from '@/components/activity-feed-card';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { getUnreadNotificationCount } from '@/lib/social';
import { getFeedActivities } from '@/lib/activity';
import { getFollowingIds } from '@/lib/follows';
import { Activity } from '@/types';

export default function FeedScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();

  const [activities, setActivities] = useState<Activity[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const [displayName, setDisplayName] = useState<string>('');

  const loadFeed = useCallback(async () => {
    if (!user) {
      setIsLoading(false);
      return;
    }

    try {
      // Fetch user profile for display name
      const { data: profile } = await supabase
        .from('users')
        .select('display_name, username')
        .eq('id', user.id)
        .single();

      if (profile) {
        const name = profile.display_name || profile.username || 'there';
        // Get first name only for a friendlier greeting
        setDisplayName(name.split(' ')[0]);
      }

      // Get users the current user is following
      const followingIds = await getFollowingIds(user.id);

      // Include current user's activities in feed
      const feedUserIds = [user.id, ...followingIds];

      // Fetch activities from the user and people they follow
      const feedActivities = await getFeedActivities(user.id, feedUserIds, 50);
      setActivities(feedActivities);

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
      // Increment refreshKey to trigger card interaction reloads
      setRefreshKey((prev) => prev + 1);
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

  const renderItem = ({ item }: { item: Activity }) => (
    <ActivityFeedCard activity={item} refreshKey={refreshKey} />
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
        <View style={styles.headerTextContainer}>
          <Text style={styles.title}>Seen</Text>
          <Text style={styles.feedLabel}>YOUR FEED</Text>
        </View>
        <View style={styles.headerRight}>
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
          <Text style={styles.welcomeText}>
            Welcome back{displayName ? `, ${displayName}` : ''}
          </Text>
        </View>
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.stamp} />
        </View>
      ) : (
        <FlatList
          data={activities}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          ListEmptyComponent={renderEmpty}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={onRefresh}
              tintColor={Colors.stamp}
              colors={[Colors.stamp]}
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
    alignItems: 'flex-start',
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.md,
  },
  headerTextContainer: {
    flex: 1,
  },
  title: {
    fontFamily: Fonts.serifBold,
    fontSize: FontSizes['3xl'],
    color: Colors.stamp,
  },
  welcomeText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.md,
    color: Colors.text,
    marginTop: Spacing.xs,
  },
  feedLabel: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
    letterSpacing: 1,
    marginTop: Spacing.xs,
  },
  headerRight: {
    alignItems: 'flex-end',
    gap: Spacing.xs,
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
