import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Fonts, FontSizes, Spacing, BorderRadius } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAuth } from '@/lib/auth-context';
import { getUserActivities, formatProgress, isActivityInProgress } from '@/lib/activity';
import { Activity } from '@/types';

export default function CurrentlyWatchingScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();

  const [activities, setActivities] = useState<Activity[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!user) return;
    try {
      const data = await getUserActivities(user.id, 'in_progress');

      // Deduplicate by content_id FIRST, keeping the most recent activity per content
      // (data is already sorted by created_at DESC)
      const latestByContent = new Map<number, Activity>();
      for (const activity of data) {
        const contentId = activity.content_id;
        if (!latestByContent.has(contentId)) {
          latestByContent.set(contentId, activity);
        }
      }

      // Filter to only include activities that are truly in progress (< 100%)
      const activeInProgress = Array.from(latestByContent.values()).filter(isActivityInProgress);

      setActivities(activeInProgress);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      if (user) loadData();
    }, [user, loadData])
  );

  const onRefresh = async () => {
    setIsRefreshing(true);
    await loadData();
    setIsRefreshing(false);
  };

  const navigateToContent = (tmdbId: number, contentType: string) => {
    router.push(`/title/${tmdbId}?type=${contentType}` as any);
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol name="arrow.left" size={24} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Currently Watching</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor={Colors.stamp}
            colors={[Colors.stamp]}
          />
        }
      >
        {!isLoading && activities.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>
              Nothing in progress. Start watching something and track your progress!
            </Text>
          </View>
        ) : (
          <View style={styles.list}>
            {activities.map((activity) => (
              <Pressable
                key={activity.id}
                style={({ pressed }) => [
                  styles.item,
                  pressed && styles.itemPressed,
                ]}
                onPress={() => navigateToContent(
                  activity.content?.tmdb_id || activity.content_id,
                  activity.content?.content_type || 'movie'
                )}
              >
                {/* Poster */}
                {activity.content?.poster_url ? (
                  <Image
                    source={{ uri: activity.content.poster_url }}
                    style={styles.poster}
                    contentFit="cover"
                  />
                ) : (
                  <View style={[styles.poster, styles.posterPlaceholder]}>
                    <Text style={styles.placeholderLetter}>
                      {activity.content?.title?.[0] || '?'}
                    </Text>
                  </View>
                )}

                {/* Info */}
                <View style={styles.info}>
                  <Text style={styles.title} numberOfLines={2}>
                    {activity.content?.title || 'Unknown'}
                  </Text>
                  <View style={styles.metaRow}>
                    {activity.watch && (
                      <View style={styles.watchBadge}>
                        <Text style={styles.watchBadgeText}>Watch #{activity.watch.watch_number}</Text>
                      </View>
                    )}
                    <Text style={styles.meta}>
                      {formatProgress(activity) || 'In Progress'}
                    </Text>
                  </View>
                </View>

                <IconSymbol name="chevron.right" size={16} color={Colors.textMuted} />
              </Pressable>
            ))}
          </View>
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
  headerTitle: {
    fontFamily: Fonts.serifSemiBold,
    fontSize: FontSizes.xl,
    color: Colors.text,
  },
  headerSpacer: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: Spacing['3xl'],
  },
  emptyState: {
    paddingVertical: Spacing['4xl'],
    paddingHorizontal: Spacing.xl,
    alignItems: 'center',
  },
  emptyStateText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.md,
    color: Colors.textMuted,
    textAlign: 'center',
  },
  list: {
    paddingTop: Spacing.sm,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  itemPressed: {
    backgroundColor: Colors.dust,
  },
  poster: {
    width: 50,
    height: 75,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.dust,
  },
  posterPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderLetter: {
    fontFamily: Fonts.serifBold,
    fontSize: FontSizes.lg,
    color: Colors.textMuted,
  },
  info: {
    flex: 1,
    marginLeft: Spacing.md,
    marginRight: Spacing.sm,
  },
  title: {
    fontFamily: Fonts.sansMedium,
    fontSize: FontSizes.md,
    color: Colors.text,
    marginBottom: 2,
  },
  meta: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  watchBadge: {
    backgroundColor: Colors.dust,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 1,
    borderRadius: BorderRadius.sm,
  },
  watchBadgeText: {
    fontFamily: Fonts.sansMedium,
    fontSize: FontSizes.xs,
    color: Colors.text,
  },
});
