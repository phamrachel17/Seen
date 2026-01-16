import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Colors, Fonts, FontSizes, Spacing, BorderRadius } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';

type AvatarVariant = 'circle' | 'poster';
type AvatarSize = 'small' | 'medium' | 'large';

interface ProfileAvatarProps {
  imageUrl?: string | null;
  username: string;
  size?: AvatarSize;
  variant?: AvatarVariant;
}

// Circular sizes (for feed, comments, etc.)
const CIRCLE_SIZES: Record<AvatarSize, number> = {
  small: 40,
  medium: 64,
  large: 96,
};

// Poster sizes (width) - height is calculated from aspect ratio
const POSTER_WIDTHS: Record<AvatarSize, number> = {
  small: 60,
  medium: 100,
  large: 140,
};

const POSTER_ASPECT_RATIO = 2 / 3; // Classic movie poster ratio

const FONT_SIZES: Record<AvatarSize, number> = {
  small: FontSizes.md,
  medium: FontSizes.xl,
  large: FontSizes['2xl'],
};

function getInitials(username: string): string {
  return username.slice(0, 2).toUpperCase();
}

export function ProfileAvatar({
  imageUrl,
  username,
  size = 'large',
  variant = 'poster',
}: ProfileAvatarProps) {
  const isCircle = variant === 'circle';

  if (isCircle) {
    const dimension = CIRCLE_SIZES[size];
    const fontSize = FONT_SIZES[size];

    if (imageUrl) {
      const cacheKey = imageUrl.split('/').pop() || imageUrl;
      return (
        <Image
          key={cacheKey}
          source={{ uri: imageUrl }}
          style={[
            styles.circleImage,
            {
              width: dimension,
              height: dimension,
              borderRadius: dimension / 2,
            },
          ]}
          contentFit="cover"
          transition={200}
        />
      );
    }

    return (
      <View
        style={[
          styles.circleFallback,
          {
            width: dimension,
            height: dimension,
            borderRadius: dimension / 2,
          },
        ]}
      >
        <Text style={[styles.initials, { fontSize }]}>
          {getInitials(username)}
        </Text>
      </View>
    );
  }

  // Poster variant
  const width = POSTER_WIDTHS[size];
  const height = width / POSTER_ASPECT_RATIO;

  if (imageUrl) {
    const cacheKey = imageUrl.split('/').pop() || imageUrl;
    return (
      <View style={[styles.posterContainer, { width, height }]}>
        <Image
          key={cacheKey}
          source={{ uri: imageUrl }}
          style={styles.posterImage}
          contentFit="cover"
          transition={200}
        />
        <View style={styles.posterBorder} />
      </View>
    );
  }

  // Poster fallback - film strip aesthetic
  return (
    <View style={[styles.posterContainer, { width, height }]}>
      <View style={styles.posterFallback}>
        <View style={styles.filmHoles}>
          {[...Array(4)].map((_, i) => (
            <View key={i} style={styles.filmHole} />
          ))}
        </View>
        <View style={styles.posterFallbackContent}>
          <IconSymbol name="film" size={size === 'large' ? 32 : 24} color={Colors.textMuted} />
          <Text style={styles.posterFallbackText}>
            {getInitials(username)}
          </Text>
        </View>
        <View style={styles.filmHoles}>
          {[...Array(4)].map((_, i) => (
            <View key={i} style={styles.filmHole} />
          ))}
        </View>
      </View>
      <View style={styles.posterBorder} />
    </View>
  );
}

const styles = StyleSheet.create({
  // Circle variant styles
  circleImage: {
    backgroundColor: Colors.dust,
  },
  circleFallback: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.navy,
  },
  initials: {
    fontFamily: Fonts.sansSemiBold,
    color: Colors.paper,
  },

  // Poster variant styles
  posterContainer: {
    position: 'relative',
    borderRadius: BorderRadius.sm,
    overflow: 'hidden',
    shadowColor: Colors.text,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  posterImage: {
    width: '100%',
    height: '100%',
  },
  posterBorder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderWidth: 1,
    borderColor: Colors.dust,
    borderRadius: BorderRadius.sm,
  },
  posterFallback: {
    flex: 1,
    backgroundColor: Colors.dust,
    flexDirection: 'row',
  },
  filmHoles: {
    width: 8,
    backgroundColor: Colors.border,
    justifyContent: 'space-evenly',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  filmHole: {
    width: 4,
    height: 6,
    backgroundColor: Colors.background,
    borderRadius: 1,
  },
  posterFallbackContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  posterFallbackText: {
    fontFamily: Fonts.serifBold,
    fontSize: FontSizes.xl,
    color: Colors.textMuted,
    letterSpacing: 2,
  },
});
