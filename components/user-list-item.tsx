import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { Colors, Fonts, FontSizes, Spacing, BorderRadius } from '@/constants/theme';
import { ProfileAvatar } from '@/components/profile-avatar';
import { UserSearchResult } from '@/types';

interface UserListItemProps {
  user: UserSearchResult;
  currentUserId: string;
  isFollowing: boolean;
  isLoading: boolean;
  onFollowPress: () => void;
  onUserPress?: () => void;
  subtitle?: string;
}

export function UserListItem({
  user,
  currentUserId,
  isFollowing,
  isLoading,
  onFollowPress,
  onUserPress,
  subtitle,
}: UserListItemProps) {
  const isCurrentUser = user.id === currentUserId;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.container,
        pressed && onUserPress && styles.pressed,
      ]}
      onPress={onUserPress}
      disabled={!onUserPress}
    >
      <ProfileAvatar
        imageUrl={user.profile_image_url}
        username={user.username}
        size="small"
        variant="circle"
      />

      <View style={styles.info}>
        <Text style={styles.displayName} numberOfLines={1}>
          {user.display_name || user.username}
        </Text>
        <Text style={styles.username} numberOfLines={1}>
          {subtitle || `@${user.username}`}
        </Text>
      </View>

      {!isCurrentUser && (
        <Pressable
          style={({ pressed }) => [
            styles.followButton,
            isFollowing ? styles.followingButton : styles.notFollowingButton,
            pressed && styles.buttonPressed,
            isLoading && styles.buttonDisabled,
          ]}
          onPress={onFollowPress}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator
              size="small"
              color={isFollowing ? Colors.stamp : Colors.paper}
            />
          ) : (
            <Text
              style={[
                styles.followButtonText,
                isFollowing
                  ? styles.followingButtonText
                  : styles.notFollowingButtonText,
              ]}
            >
              {isFollowing ? 'Following' : 'Follow'}
            </Text>
          )}
        </Pressable>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    gap: Spacing.md,
  },
  pressed: {
    opacity: 0.8,
    backgroundColor: Colors.cardBackground,
  },
  info: {
    flex: 1,
    gap: 2,
  },
  displayName: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.md,
    color: Colors.text,
  },
  username: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
  },
  followButton: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    minWidth: 90,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 32,
  },
  notFollowingButton: {
    backgroundColor: Colors.stamp,
  },
  followingButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  buttonPressed: {
    opacity: 0.8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  followButtonText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.sm,
  },
  notFollowingButtonText: {
    color: Colors.paper,
  },
  followingButtonText: {
    color: Colors.text,
  },
});
