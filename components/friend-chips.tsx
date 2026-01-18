import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { Colors, Fonts, FontSizes, Spacing, BorderRadius } from '@/constants/theme';
import { ProfileAvatar } from '@/components/profile-avatar';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { getUsersByIds } from '@/lib/social';
import { User } from '@/types';

interface FriendChipsProps {
  userIds: string[];
  onRemove?: (userId: string) => void;
  onAddPress?: () => void;
  editable?: boolean;
  showAddButton?: boolean;
}

type UserProfile = Pick<User, 'id' | 'username' | 'display_name' | 'profile_image_url'>;

export function FriendChips({
  userIds,
  onRemove,
  onAddPress,
  editable = false,
  showAddButton = true,
}: FriendChipsProps) {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (userIds.length > 0) {
      loadUsers();
    } else {
      setUsers([]);
    }
  }, [userIds]);

  const loadUsers = async () => {
    setIsLoading(true);
    try {
      const userData = await getUsersByIds(userIds);
      setUsers(userData);
    } catch (error) {
      console.error('Error loading users:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading && userIds.length > 0) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color={Colors.stamp} />
      </View>
    );
  }

  if (userIds.length === 0 && !editable) {
    return null;
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}
    >
      {users.map((user) => (
        <View key={user.id} style={styles.chip}>
          <ProfileAvatar
            imageUrl={user.profile_image_url}
            username={user.username}
            size="tiny"
            variant="circle"
          />
          <Text style={styles.chipText} numberOfLines={1}>
            {user.display_name || user.username}
          </Text>
          {editable && onRemove && (
            <Pressable
              onPress={() => onRemove(user.id)}
              hitSlop={8}
              style={styles.removeButton}
            >
              <IconSymbol name="xmark" size={12} color={Colors.textMuted} />
            </Pressable>
          )}
        </View>
      ))}

      {editable && showAddButton && onAddPress && (
        <Pressable
          onPress={onAddPress}
          style={({ pressed }) => [
            styles.addChip,
            pressed && styles.addChipPressed,
          ]}
        >
          <IconSymbol name="plus" size={14} color={Colors.stamp} />
          <Text style={styles.addChipText}>Add</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

// Read-only version for displaying on feed cards
export function FriendChipsDisplay({ userIds }: { userIds: string[] }) {
  const [users, setUsers] = useState<UserProfile[]>([]);

  useEffect(() => {
    if (userIds.length > 0) {
      getUsersByIds(userIds).then(setUsers);
    }
  }, [userIds]);

  if (users.length === 0) return null;

  return (
    <View style={styles.displayContainer}>
      <Text style={styles.watchedWithLabel}>Watched with</Text>
      <View style={styles.displayChips}>
        {users.slice(0, 3).map((user, index) => (
          <View key={user.id} style={styles.displayChip}>
            <ProfileAvatar
              imageUrl={user.profile_image_url}
              username={user.username}
              size="tiny"
              variant="circle"
            />
            <Text style={styles.displayChipText} numberOfLines={1}>
              {user.display_name || user.username}
            </Text>
          </View>
        ))}
        {users.length > 3 && (
          <Text style={styles.moreText}>+{users.length - 3} more</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  loadingContainer: {
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.cardBackground,
    borderRadius: BorderRadius.full,
    paddingVertical: Spacing.xs,
    paddingLeft: Spacing.xs,
    paddingRight: Spacing.md,
    gap: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    color: Colors.text,
    maxWidth: 100,
  },
  removeButton: {
    marginLeft: Spacing.xs,
    padding: 2,
  },
  addChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderRadius: BorderRadius.full,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
    gap: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.stamp,
    borderStyle: 'dashed',
  },
  addChipPressed: {
    opacity: 0.7,
  },
  addChipText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.sm,
    color: Colors.stamp,
  },
  // Display-only styles (for feed cards)
  displayContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  watchedWithLabel: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
  },
  displayChips: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    flex: 1,
  },
  displayChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  displayChipText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
    maxWidth: 60,
  },
  moreText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
  },
});
