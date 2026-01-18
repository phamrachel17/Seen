import { useState, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { ProfileAvatar } from './profile-avatar';
import { IconSymbol } from './ui/icon-symbol';
import { getSuggestedFriends } from '@/lib/social';
import { Colors, Fonts, FontSizes, Spacing, BorderRadius } from '@/constants/theme';
import { User } from '@/types';

type UserProfile = Pick<User, 'id' | 'username' | 'display_name' | 'profile_image_url'>;

interface SuggestedFriendPillsProps {
  userId: string;
  selectedIds: string[];
  onToggle: (id: string) => void;
  maxSuggestions?: number;
}

export function SuggestedFriendPills({
  userId,
  selectedIds,
  onToggle,
  maxSuggestions = 5,
}: SuggestedFriendPillsProps) {
  const [suggestions, setSuggestions] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (userId) {
      setLoading(true);
      getSuggestedFriends(userId, maxSuggestions)
        .then(setSuggestions)
        .finally(() => setLoading(false));
    }
  }, [userId, maxSuggestions]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color={Colors.stamp} />
      </View>
    );
  }

  if (suggestions.length === 0) {
    return (
      <Text style={styles.emptyText}>
        Follow people to see suggestions
      </Text>
    );
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}
    >
      {suggestions.map((friend) => {
        const isSelected = selectedIds.includes(friend.id);
        return (
          <Pressable
            key={friend.id}
            style={({ pressed }) => [
              styles.pill,
              isSelected && styles.pillSelected,
              pressed && styles.pillPressed,
            ]}
            onPress={() => onToggle(friend.id)}
          >
            <ProfileAvatar
              imageUrl={friend.profile_image_url}
              username={friend.username}
              size="tiny"
              variant="circle"
            />
            <Text
              style={[styles.pillText, isSelected && styles.pillTextSelected]}
              numberOfLines={1}
            >
              {friend.display_name?.split(' ')[0] || friend.username}
            </Text>
            <IconSymbol
              name={isSelected ? 'checkmark' : 'plus'}
              size={12}
              color={isSelected ? Colors.white : Colors.stamp}
            />
          </Pressable>
        );
      })}
    </ScrollView>
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
    alignItems: 'flex-start',
  },
  emptyText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
    paddingVertical: Spacing.sm,
  },
  pill: {
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
  pillSelected: {
    backgroundColor: Colors.stamp,
    borderColor: Colors.stamp,
  },
  pillPressed: {
    opacity: 0.8,
  },
  pillText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    color: Colors.text,
    maxWidth: 80,
  },
  pillTextSelected: {
    color: Colors.white,
  },
});
