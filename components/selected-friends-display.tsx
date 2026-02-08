import { useState, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { ProfileAvatar } from './profile-avatar';
import { IconSymbol } from './ui/icon-symbol';
import { getUsersByIds } from '@/lib/social';
import { Colors, Fonts, FontSizes, Spacing, BorderRadius } from '@/constants/theme';
import { User } from '@/types';

type UserProfile = Pick<User, 'id' | 'username' | 'display_name' | 'profile_image_url'>;

interface SelectedFriendsDisplayProps {
  selectedIds: string[];
  onRemove: (id: string) => void;
}

export function SelectedFriendsDisplay({
  selectedIds,
  onRemove,
}: SelectedFriendsDisplayProps) {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (selectedIds.length > 0) {
      setLoading(true);
      getUsersByIds(selectedIds)
        .then(setUsers)
        .finally(() => setLoading(false));
    } else {
      setUsers([]);
      setLoading(false);
    }
  }, [selectedIds]);

  if (selectedIds.length === 0) {
    return null;
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color={Colors.stamp} />
      </View>
    );
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}
    >
      {users.map((friend) => (
        <View key={friend.id} style={styles.chip}>
          <ProfileAvatar
            imageUrl={friend.profile_image_url}
            username={friend.username}
            size="tiny"
            variant="circle"
          />
          <Text style={styles.chipText} numberOfLines={1}>
            {friend.display_name?.split(' ')[0] || friend.username}
          </Text>
          <Pressable
            style={styles.removeButton}
            onPress={() => onRemove(friend.id)}
            hitSlop={8}
          >
            <IconSymbol name="xmark" size={10} color={Colors.white} />
          </Pressable>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  loadingContainer: {
    paddingVertical: Spacing.md,
    alignItems: 'flex-start',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.stamp,
    borderRadius: BorderRadius.full,
    paddingVertical: Spacing.xs,
    paddingLeft: Spacing.xs,
    paddingRight: Spacing.sm,
    gap: Spacing.xs,
  },
  chipText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    color: Colors.white,
    maxWidth: 80,
  },
  removeButton: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
