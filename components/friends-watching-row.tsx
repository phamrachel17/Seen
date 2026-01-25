import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Colors, Fonts, FontSizes, Spacing, BorderRadius } from '@/constants/theme';
import { Activity } from '@/types';
import { ProfileAvatar } from './profile-avatar';

const POSTER_WIDTH = 100;
const POSTER_HEIGHT = 150;
const AVATAR_SIZE = 28;

interface FriendsWatchingRowProps {
  title: string;
  subtitle?: string;
  activities: Activity[];
  isLoading?: boolean;
}

export function FriendsWatchingRow({
  title,
  subtitle,
  activities,
  isLoading = false,
}: FriendsWatchingRowProps) {
  const router = useRouter();

  const handlePress = (activity: Activity) => {
    if (activity.content) {
      const type = activity.content.content_type || 'movie';
      router.push(`/title/${activity.content.tmdb_id}?type=${type}` as any);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
        </View>
        <View style={styles.loadingContainer}>
          {[1, 2, 3].map((i) => (
            <View key={i} style={styles.loadingPoster} />
          ))}
        </View>
      </View>
    );
  }

  if (activities.length === 0) {
    return null;
  }

  // Deduplicate by content_id - show only unique titles
  const uniqueActivities = activities.reduce((acc, activity) => {
    if (!acc.find((a) => a.content_id === activity.content_id)) {
      acc.push(activity);
    }
    return acc;
  }, [] as Activity[]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {uniqueActivities.map((activity) => (
          <Pressable
            key={activity.id}
            style={({ pressed }) => [
              styles.activityItem,
              pressed && styles.pressed,
            ]}
            onPress={() => handlePress(activity)}
          >
            <View style={styles.posterWrapper}>
              {activity.content?.poster_url ? (
                <Image
                  source={{ uri: activity.content.poster_url }}
                  style={styles.poster}
                  contentFit="cover"
                  transition={200}
                />
              ) : (
                <View style={styles.posterPlaceholder}>
                  <Text style={styles.placeholderText}>
                    {activity.content?.title?.[0] || '?'}
                  </Text>
                </View>
              )}

              {/* Friend avatar overlay */}
              <View style={styles.avatarContainer}>
                <ProfileAvatar
                  imageUrl={activity.user?.profile_image_url}
                  username={activity.user?.username || '?'}
                  size="tiny"
                  variant="circle"
                />
              </View>
            </View>

            <Text style={styles.movieTitle} numberOfLines={2}>
              {activity.content?.title || 'Unknown'}
            </Text>
            <Text style={styles.friendName} numberOfLines={1}>
              {activity.user?.display_name || activity.user?.username}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.xl,
  },
  header: {
    paddingHorizontal: Spacing.xl,
    marginBottom: Spacing.md,
  },
  title: {
    fontFamily: Fonts.serifBold,
    fontSize: FontSizes.xl,
    color: Colors.stamp,
  },
  subtitle: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
    letterSpacing: 1,
    marginTop: 2,
  },
  scrollContent: {
    paddingHorizontal: Spacing.xl,
    gap: Spacing.md,
  },
  activityItem: {
    width: POSTER_WIDTH,
  },
  pressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
  posterWrapper: {
    position: 'relative',
  },
  poster: {
    width: POSTER_WIDTH,
    height: POSTER_HEIGHT,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.dust,
  },
  posterPlaceholder: {
    width: POSTER_WIDTH,
    height: POSTER_HEIGHT,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.dust,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    fontFamily: Fonts.serifBold,
    fontSize: FontSizes['2xl'],
    color: Colors.textMuted,
  },
  avatarContainer: {
    position: 'absolute',
    bottom: -8,
    right: -4,
    borderWidth: 2,
    borderColor: Colors.background,
    borderRadius: AVATAR_SIZE / 2 + 2,
  },
  movieTitle: {
    fontFamily: Fonts.sansMedium,
    fontSize: FontSizes.xs,
    color: Colors.text,
    marginTop: Spacing.sm,
    lineHeight: FontSizes.xs * 1.3,
  },
  friendName: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
    marginTop: 2,
  },
  loadingContainer: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.xl,
    gap: Spacing.md,
  },
  loadingPoster: {
    width: POSTER_WIDTH,
    height: POSTER_HEIGHT,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.dust,
  },
});
