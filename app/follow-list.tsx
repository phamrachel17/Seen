import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Fonts, FontSizes, Spacing, BorderRadius } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { UserListItem } from '@/components/user-list-item';
import { useAuth } from '@/lib/auth-context';
import {
  getFollowers,
  getFollowing,
  followUser,
  unfollowUser,
} from '@/lib/follows';
import { UserSearchResult } from '@/types';

type ListType = 'followers' | 'following';

export default function FollowListModal() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ type: string; userId: string }>();

  const listType = (params.type as ListType) || 'followers';
  const targetUserId = params.userId || user?.id || '';

  const [users, setUsers] = useState<UserSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [loadingFollowIds, setLoadingFollowIds] = useState<Set<string>>(
    new Set()
  );

  const loadUsers = useCallback(async () => {
    if (!user || !targetUserId) return;

    setIsLoading(true);
    try {
      const data =
        listType === 'followers'
          ? await getFollowers(targetUserId, user.id)
          : await getFollowing(targetUserId, user.id);

      setUsers(data);
      setFollowingIds(
        new Set(data.filter((u) => u.is_following).map((u) => u.id))
      );
    } catch (error) {
      console.error('Error loading users:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user, targetUserId, listType]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleFollowPress = async (targetId: string) => {
    if (!user || loadingFollowIds.has(targetId)) return;

    const isCurrentlyFollowing = followingIds.has(targetId);

    // Optimistic update
    setFollowingIds((prev) => {
      const next = new Set(prev);
      if (isCurrentlyFollowing) {
        next.delete(targetId);
      } else {
        next.add(targetId);
      }
      return next;
    });

    setLoadingFollowIds((prev) => new Set(prev).add(targetId));

    try {
      const success = isCurrentlyFollowing
        ? await unfollowUser(user.id, targetId)
        : await followUser(user.id, targetId);

      if (!success) {
        // Revert on failure
        setFollowingIds((prev) => {
          const next = new Set(prev);
          if (isCurrentlyFollowing) {
            next.add(targetId);
          } else {
            next.delete(targetId);
          }
          return next;
        });
      }
    } catch (error) {
      // Revert on error
      setFollowingIds((prev) => {
        const next = new Set(prev);
        if (isCurrentlyFollowing) {
          next.add(targetId);
        } else {
          next.delete(targetId);
        }
        return next;
      });
    } finally {
      setLoadingFollowIds((prev) => {
        const next = new Set(prev);
        next.delete(targetId);
        return next;
      });
    }
  };

  const handleUserPress = (userId: string) => {
    router.push(`/user/${userId}`);
  };

  const handleClose = () => {
    router.back();
  };

  const title = listType === 'followers' ? 'Followers' : 'Following';

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
        <Pressable style={styles.closeButton} onPress={handleClose}>
          <IconSymbol name="xmark" size={20} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>{title}</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* User List */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.stamp} />
        </View>
      ) : users.length > 0 ? (
        <FlatList
          data={users}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <UserListItem
              user={item}
              currentUserId={user?.id || ''}
              isFollowing={followingIds.has(item.id)}
              isLoading={loadingFollowIds.has(item.id)}
              onFollowPress={() => handleFollowPress(item.id)}
              onUserPress={() => handleUserPress(item.id)}
            />
          )}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>
            {listType === 'followers'
              ? 'No followers yet'
              : 'Not following anyone yet'}
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  closeButton: {
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    paddingVertical: Spacing.sm,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
  },
  emptyStateText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.md,
    color: Colors.textMuted,
    textAlign: 'center',
  },
});
