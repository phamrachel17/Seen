import { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  RefreshControl,
} from 'react-native';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Fonts, FontSizes, Spacing } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { ActivityFeedCard } from '@/components/activity-feed-card';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { getUnreadNotificationCount } from '@/lib/social';
import { useFeed } from '@/lib/hooks/useFeed';
import { Activity } from '@/types';

export default function FeedScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();

  // Use cached feed hook
  const {
    activities,
    isLoading,
    isRefreshing,
    refresh: refreshFeed,
  } = useFeed(user?.id);

  const [unreadCount, setUnreadCount] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const [displayName, setDisplayName] = useState<string>('');

  // Load profile data and notification count
  const loadExtras = useCallback(async () => {
    if (!user) return;

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

      // Load unread notification count
      const count = await getUnreadNotificationCount(user.id);
      setUnreadCount(count);
    } catch (error) {
      console.error('Error loading extras:', error);
    }
  }, [user]);

  // Load extras on mount and when user changes
  useEffect(() => {
    loadExtras();
  }, [loadExtras]);

  useFocusEffect(
    useCallback(() => {
      // Refresh notification count on focus
      if (user) {
        getUnreadNotificationCount(user.id).then(setUnreadCount);
      }
      // Refresh feed on focus (will use cache if still valid, fetch if invalidated)
      refreshFeed();
      // Increment refreshKey to trigger card interaction reloads
      setRefreshKey((prev) => prev + 1);
      // Note: refreshFeed intentionally excluded from deps to prevent infinite loop
      // (refreshFeed reference changes when offset changes, which happens on every refresh)
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user])
  );

  const onRefresh = async () => {
    await Promise.all([refreshFeed(), loadExtras()]);
  };

  const navigateToNotifications = () => {
    router.push('/notifications');
  };

  const renderItem = useCallback(
    ({ item }: { item: Activity }) => (
      <ActivityFeedCard activity={item} refreshKey={refreshKey} />
    ),
    [refreshKey]
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
        <LoadingScreen />
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
