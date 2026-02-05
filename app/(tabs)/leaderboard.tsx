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
import { ProfileAvatar } from '@/components/profile-avatar';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAuth } from '@/lib/auth-context';
import { getTopRankedUsers } from '@/lib/follows';
import { UserSearchResult } from '@/types';

interface LeaderboardUser extends UserSearchResult {
  rankings_count: number;
}

export default function LeaderboardScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();

  const [users, setUsers] = useState<LeaderboardUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadLeaderboard = useCallback(async () => {
    if (!user) return;

    try {
      const data = await getTopRankedUsers(user.id, 50, true);
      setUsers(data);
    } catch (error) {
      console.error('Error loading leaderboard:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      loadLeaderboard();
    }, [loadLeaderboard])
  );

  const onRefresh = async () => {
    setIsRefreshing(true);
    await loadLeaderboard();
  };

  const handleUserPress = (userId: string) => {
    if (userId === user?.id) {
      router.push('/(tabs)/profile');
    } else {
      router.push(`/user/${userId}`);
    }
  };

  // Calculate rank position accounting for ties
  const getRankPosition = (index: number, currentUser: LeaderboardUser): number => {
    if (index === 0) return 1;

    // Check if this user has the same count as the previous user
    const prevUser = users[index - 1];
    if (prevUser.rankings_count === currentUser.rankings_count) {
      // Find the first user with this count
      let rank = index + 1;
      for (let i = index - 1; i >= 0; i--) {
        if (users[i].rankings_count === currentUser.rankings_count) {
          rank = i + 1;
        } else {
          break;
        }
      }
      return rank;
    }

    return index + 1;
  };

  const renderItem = useCallback(
    ({ item, index }: { item: LeaderboardUser; index: number }) => {
      const isCurrentUser = item.id === user?.id;
      const rankPosition = getRankPosition(index, item);
      const isTopThree = rankPosition <= 3;
      const isFirst = rankPosition === 1;

      return (
        <Pressable
          style={({ pressed }) => [
            styles.userRow,
            pressed && styles.userRowPressed,
            isCurrentUser && styles.currentUserRow,
          ]}
          onPress={() => handleUserPress(item.id)}
        >
          {/* Rank Number */}
          <View style={styles.rankContainer}>
            {isFirst && (
              <IconSymbol name="trophy.fill" size={14} color={Colors.stamp} style={styles.trophyIcon} />
            )}
            <Text style={[
              styles.rankText,
              isTopThree && styles.rankTextTop,
            ]}>
              #{rankPosition}
            </Text>
          </View>

          {/* Avatar */}
          <ProfileAvatar
            imageUrl={item.profile_image_url}
            username={item.username}
            size="small"
            variant="circle"
          />

          {/* User Info */}
          <View style={styles.userInfo}>
            <Text style={[
              styles.displayName,
              isFirst && styles.displayNameFirst,
            ]} numberOfLines={1}>
              {item.display_name || item.username}
              {isCurrentUser && <Text style={styles.youBadge}> (You)</Text>}
            </Text>
            <Text style={styles.subtitle} numberOfLines={1}>
              @{item.username} • {item.rankings_count} ranked
            </Text>
          </View>
        </Pressable>
      );
    },
    [user?.id, users]
  );

  if (isLoading) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <ActivityIndicator size="large" color={Colors.stamp} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
        <View style={styles.headerTextContainer}>
          <Text style={styles.headerTitle}>Seen</Text>
          <Text style={styles.headerSubtitle}>LEADERBOARD</Text>
        </View>
      </View>

      {/* Leaderboard List */}
      {users.length > 0 ? (
        <FlatList
          data={users}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
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
        />
      ) : (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>No rankings yet</Text>
          <Text style={styles.emptyStateSubtext}>
            Be the first to rank movies and TV shows!
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
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
  headerTitle: {
    fontFamily: Fonts.serifBold,
    fontSize: FontSizes['3xl'],
    color: Colors.stamp,
  },
  headerSubtitle: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
    letterSpacing: 1,
    marginTop: Spacing.xs,
  },
  listContent: {
    paddingBottom: Spacing['3xl'],
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    gap: Spacing.md,
  },
  userRowPressed: {
    opacity: 0.8,
    backgroundColor: Colors.cardBackground,
  },
  currentUserRow: {
    backgroundColor: Colors.cardBackground,
  },
  rankContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 44,
    gap: 2,
  },
  trophyIcon: {
    marginRight: 2,
  },
  rankText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
  },
  rankTextTop: {
    fontFamily: Fonts.sansSemiBold,
    color: Colors.stamp,
  },
  userInfo: {
    flex: 1,
    gap: 2,
  },
  displayName: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.md,
    color: Colors.text,
  },
  displayNameFirst: {
    fontFamily: Fonts.sansSemiBold,
  },
  youBadge: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
  },
  subtitle: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
  },
  emptyStateText: {
    fontFamily: Fonts.serifBold,
    fontSize: FontSizes.xl,
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  emptyStateSubtext: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.md,
    color: Colors.textMuted,
    textAlign: 'center',
  },
});
