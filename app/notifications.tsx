import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  RefreshControl,
} from 'react-native';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Image } from 'expo-image';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Fonts, FontSizes, Spacing, BorderRadius } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { ProfileAvatar } from '@/components/profile-avatar';
import {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from '@/lib/social';
import { useAuth } from '@/lib/auth-context';
import { Notification } from '@/types';

export default function NotificationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadNotifications = useCallback(async () => {
    if (!user) return;

    try {
      const data = await getNotifications(user.id);
      setNotifications(data);

      // Auto-mark all as read after loading
      const hasUnread = data.some((n) => !n.read);
      if (hasUnread) {
        await markAllNotificationsRead(user.id);
        setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      }
    } catch (error) {
      console.error('Error loading notifications:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      loadNotifications();
    }, [loadNotifications])
  );

  const onRefresh = async () => {
    setIsRefreshing(true);
    await loadNotifications();
    setIsRefreshing(false);
  };

  const handleMarkAllRead = async () => {
    if (!user) return;
    await markAllNotificationsRead(user.id);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const handleNotificationPress = async (notification: Notification) => {
    // Mark as read
    if (!notification.read) {
      await markNotificationRead(notification.id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === notification.id ? { ...n, read: true } : n))
      );
    }

    // Navigate based on notification type
    switch (notification.type) {
      case 'like':
      case 'comment':
      case 'tagged':
        // Navigate to title detail page using activity content info
        if (notification.activity?.content) {
          const { tmdb_id, content_type } = notification.activity.content;
          router.push(`/title/${tmdb_id}?type=${content_type}` as any);
        }
        break;
      case 'follow':
        if (notification.actor_id) {
          router.push(`/user/${notification.actor_id}`);
        }
        break;
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const getNotificationText = (notification: Notification) => {
    const actorName = notification.actor?.display_name || notification.actor?.username || 'Someone';
    // Use activity.content.title (new) or fall back to review.movies.title (legacy)
    const contentTitle = notification.activity?.content?.title || notification.review?.movies?.title;

    switch (notification.type) {
      case 'like':
        return contentTitle
          ? `${actorName} liked your review of ${contentTitle}`
          : `${actorName} liked your review`;
      case 'comment':
        return contentTitle
          ? `${actorName} commented on your review of ${contentTitle}`
          : `${actorName} commented on your review`;
      case 'tagged':
        return contentTitle
          ? `${actorName} tagged you in a review of ${contentTitle}`
          : `${actorName} tagged you in a review`;
      case 'follow':
        return `${actorName} started following you`;
      default:
        return 'New notification';
    }
  };

  const getNotificationIcon = (type: Notification['type']) => {
    switch (type) {
      case 'like':
        return 'heart.fill';
      case 'comment':
        return 'bubble.left.fill';
      case 'tagged':
        return 'tag.fill';
      case 'follow':
        return 'person.badge.plus';
      default:
        return 'bell.fill';
    }
  };

  const getNotificationIconColor = (type: Notification['type']) => {
    switch (type) {
      case 'like':
        return Colors.stamp;
      case 'comment':
        return Colors.navy;
      case 'tagged':
        return Colors.handwriting;
      case 'follow':
        return Colors.stamp;
      default:
        return Colors.textMuted;
    }
  };

  const renderItem = ({ item }: { item: Notification }) => (
    <Pressable
      style={({ pressed }) => [
        styles.notificationItem,
        !item.read && styles.unread,
        pressed && styles.pressed,
      ]}
      onPress={() => handleNotificationPress(item)}
    >
      <View style={styles.avatarContainer}>
        <ProfileAvatar
          imageUrl={item.actor?.profile_image_url}
          username={item.actor?.username || '?'}
          size="small"
          variant="circle"
        />
        <View
          style={[
            styles.iconBadge,
            { backgroundColor: getNotificationIconColor(item.type) },
          ]}
        >
          <IconSymbol
            name={getNotificationIcon(item.type)}
            size={10}
            color={Colors.white}
          />
        </View>
      </View>

      <View style={styles.notificationContent}>
        <Text style={[styles.notificationText, !item.read && styles.unreadText]}>
          {getNotificationText(item)}
        </Text>
        <Text style={styles.timeText}>{formatTime(item.created_at)}</Text>
      </View>

      {(item.activity?.content?.poster_url || item.review?.movies?.poster_url) && (
        <Image
          source={{ uri: item.activity?.content?.poster_url || item.review?.movies?.poster_url }}
          style={styles.movieThumb}
          contentFit="cover"
        />
      )}
    </Pressable>
  );

  const renderEmpty = () => {
    if (isLoading) return null;

    return (
      <View style={styles.emptyState}>
        <IconSymbol name="bell" size={48} color={Colors.textMuted} />
        <Text style={styles.emptyStateTitle}>No notifications yet</Text>
        <Text style={styles.emptyStateText}>
          When someone likes, comments, or tags you, you'll see it here
        </Text>
      </View>
    );
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol name="chevron.left" size={24} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Notifications</Text>
        {unreadCount > 0 ? (
          <Pressable onPress={handleMarkAllRead} style={styles.markReadButton}>
            <Text style={styles.markReadText}>Mark all read</Text>
          </Pressable>
        ) : (
          <View style={styles.headerSpacer} />
        )}
      </View>

      {isLoading ? (
        <LoadingScreen />
      ) : (
        <FlatList
          data={notifications}
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
    width: 80,
  },
  markReadButton: {
    padding: Spacing.sm,
  },
  markReadText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    color: Colors.stamp,
  },
  listContent: {
    flexGrow: 1,
  },
  notificationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
  },
  unread: {
    backgroundColor: Colors.cardBackground,
  },
  pressed: {
    opacity: 0.7,
  },
  avatarContainer: {
    position: 'relative',
  },
  iconBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.background,
  },
  notificationContent: {
    flex: 1,
    gap: 2,
  },
  notificationText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    lineHeight: FontSizes.sm * 1.4,
  },
  unreadText: {
    fontFamily: Fonts.sansMedium,
    color: Colors.text,
  },
  timeText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
  },
  movieThumb: {
    width: 40,
    height: 60,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.dust,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
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
  },
});
