import { useState, useEffect, useCallback, useRef } from 'react';
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

  const initialTab = (params.type as ListType) || 'followers';
  const targetUserId = params.userId || user?.id || '';

  const [activeTab, setActiveTab] = useState<ListType>(initialTab);
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [loadingFollowIds, setLoadingFollowIds] = useState<Set<string>>(new Set());

  // Separate state for each tab
  const [followersData, setFollowersData] = useState<UserSearchResult[]>([]);
  const [followingData, setFollowingData] = useState<UserSearchResult[]>([]);
  const [followersLoading, setFollowersLoading] = useState(false);
  const [followingLoading, setFollowingLoading] = useState(false);

  // Track which tabs have been loaded
  const loadedTabs = useRef<Set<ListType>>(new Set());

  const loadTabData = useCallback(async (tab: ListType) => {
    if (!user || !targetUserId) return;
    if (loadedTabs.current.has(tab)) return;

    // Mark as loading
    loadedTabs.current.add(tab);

    if (tab === 'followers') {
      setFollowersLoading(true);
    } else {
      setFollowingLoading(true);
    }

    try {
      const data =
        tab === 'followers'
          ? await getFollowers(targetUserId, user.id)
          : await getFollowing(targetUserId, user.id);

      if (tab === 'followers') {
        setFollowersData(data);
        setFollowersLoading(false);
      } else {
        setFollowingData(data);
        setFollowingLoading(false);
      }

      // Update following IDs from the loaded data
      const newFollowingIds = data.filter((u) => u.is_following).map((u) => u.id);
      setFollowingIds((prev) => {
        const next = new Set(prev);
        newFollowingIds.forEach((id) => next.add(id));
        return next;
      });
    } catch (error) {
      console.error(`Error loading ${tab}:`, error);
      if (tab === 'followers') {
        setFollowersLoading(false);
      } else {
        setFollowingLoading(false);
      }
      // Allow retry on error
      loadedTabs.current.delete(tab);
    }
  }, [user, targetUserId]);

  // Load initial tab data
  useEffect(() => {
    if (user && targetUserId) {
      loadTabData(initialTab);
    }
  }, [user, targetUserId, initialTab, loadTabData]);

  const handleTabChange = (tab: ListType) => {
    setActiveTab(tab);
    loadTabData(tab);
  };

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
    // Close modal first, then navigate to user profile
    router.back();
    // Use setTimeout to ensure modal closes before navigation
    setTimeout(() => {
      router.push(`/user/${userId}`);
    }, 100);
  };

  const handleClose = () => {
    router.back();
  };

  // Get current tab's data
  const currentUsers = activeTab === 'followers' ? followersData : followingData;
  const isLoading = activeTab === 'followers' ? followersLoading : followingLoading;

  const renderUserItem = ({ item }: { item: UserSearchResult }) => (
    <UserListItem
      user={item}
      currentUserId={user?.id || ''}
      isFollowing={followingIds.has(item.id)}
      isLoading={loadingFollowIds.has(item.id)}
      onFollowPress={() => handleFollowPress(item.id)}
      onUserPress={() => handleUserPress(item.id)}
    />
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
        <Pressable style={styles.closeButton} onPress={handleClose}>
          <IconSymbol name="xmark" size={20} color={Colors.text} />
        </Pressable>
        <View style={styles.headerSpacer} />
      </View>

      {/* Tabs */}
      <View style={styles.tabContainer}>
        <Pressable
          style={[styles.tab, activeTab === 'followers' && styles.activeTab]}
          onPress={() => handleTabChange('followers')}
        >
          <Text style={[styles.tabText, activeTab === 'followers' && styles.activeTabText]}>
            Followers
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tab, activeTab === 'following' && styles.activeTab]}
          onPress={() => handleTabChange('following')}
        >
          <Text style={[styles.tabText, activeTab === 'following' && styles.activeTabText]}>
            Following
          </Text>
        </Pressable>
      </View>

      {/* Content */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.stamp} />
        </View>
      ) : currentUsers.length > 0 ? (
        <FlatList
          data={currentUsers}
          keyExtractor={(item) => item.id}
          renderItem={renderUserItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>
            {activeTab === 'followers'
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
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dust,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerSpacer: {
    width: 36,
  },
  tabContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  tab: {
    flex: 1,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: Colors.stamp,
  },
  tabText: {
    fontFamily: Fonts.sansMedium,
    fontSize: FontSizes.md,
    color: Colors.textMuted,
  },
  activeTabText: {
    fontFamily: Fonts.sansSemiBold,
    color: Colors.text,
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
