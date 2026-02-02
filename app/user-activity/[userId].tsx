import { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, RefreshControl } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Fonts, FontSizes, Spacing, BorderRadius } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { ActivityFeedCard } from '@/components/activity-feed-card';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { getUserActivitiesFeed } from '@/lib/activity';
import { Activity } from '@/types';

const PAGE_SIZE = 50;

export default function UserActivityScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const { user } = useAuth();

  const [activities, setActivities] = useState<Activity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [userName, setUserName] = useState<string>('');
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);

  const isOwnProfile = userId === user?.id;

  // Fetch user name for header
  useEffect(() => {
    if (!userId) return;

    const fetchUserName = async () => {
      const { data } = await supabase
        .from('users')
        .select('display_name, username')
        .eq('id', userId)
        .single();

      if (data) {
        setUserName(data.display_name || data.username || 'User');
      }
    };

    fetchUserName();
  }, [userId]);

  const loadActivities = useCallback(async (refresh = false) => {
    if (!userId) return;

    if (refresh) {
      setIsRefreshing(true);
    } else if (offset === 0) {
      setIsLoading(true);
    }

    try {
      const currentOffset = refresh ? 0 : offset;
      const data = await getUserActivitiesFeed(userId, user?.id, PAGE_SIZE, currentOffset);

      if (refresh || currentOffset === 0) {
        setActivities(data);
        setOffset(PAGE_SIZE);
      } else {
        setActivities(prev => [...prev, ...data]);
        setOffset(currentOffset + PAGE_SIZE);
      }

      setHasMore(data.length >= PAGE_SIZE);
    } catch (error) {
      console.error('Error loading activities:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [userId, user?.id, offset]);

  useEffect(() => {
    if (userId) {
      loadActivities();
    }
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRefresh = () => loadActivities(true);

  const handleLoadMore = () => {
    if (!hasMore || isLoading || isRefreshing) return;
    loadActivities();
  };

  const renderItem = useCallback(
    ({ item }: { item: Activity }) => <ActivityFeedCard activity={item} />,
    []
  );

  const renderEmpty = () => {
    if (isLoading) return null;
    return (
      <View style={styles.emptyState}>
        <IconSymbol name="film" size={48} color={Colors.textMuted} />
        <Text style={styles.emptyStateText}>
          {isOwnProfile ? 'No activity yet' : `${userName} hasn't logged any activity yet`}
        </Text>
      </View>
    );
  };

  if (isLoading && activities.length === 0) {
    return <LoadingScreen />;
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <IconSymbol name="chevron.left" size={20} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>
          {isOwnProfile ? 'Your Activity' : `${userName}'s Activity`}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

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
            onRefresh={handleRefresh}
            tintColor={Colors.stamp}
          />
        }
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
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
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.md,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dust,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: Fonts.serifBold,
    fontSize: FontSizes.xl,
    color: Colors.text,
  },
  headerSpacer: {
    width: 36,
  },
  listContent: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing['3xl'],
    flexGrow: 1,
  },
  separator: {
    height: Spacing.md,
  },
  emptyState: {
    flex: 1,
    paddingVertical: Spacing['4xl'],
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
  },
  emptyStateText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.md,
    color: Colors.textMuted,
    textAlign: 'center',
  },
});
