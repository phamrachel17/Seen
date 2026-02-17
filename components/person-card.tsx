import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Colors, Fonts, FontSizes, Spacing } from '@/constants/theme';

interface PersonCardProps {
  name: string;
  role: string;
  imageUrl: string;
  onPress?: () => void;
}

export function PersonCard({ name, role, imageUrl, onPress }: PersonCardProps) {
  // Get initials for fallback
  const initials = name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const content = (
    <>
      {imageUrl ? (
        <Image
          source={{ uri: imageUrl }}
          style={styles.photo}
          contentFit="cover"
          transition={200}
        />
      ) : (
        <View style={styles.photoFallback}>
          <Text style={styles.initials}>{initials}</Text>
        </View>
      )}
      <Text style={styles.name} numberOfLines={2}>
        {name}
      </Text>
      <Text style={styles.role} numberOfLines={1}>
        {role}
      </Text>
    </>
  );

  if (onPress) {
    return (
      <Pressable
        style={({ pressed }) => [styles.container, pressed && { opacity: 0.7 }]}
        onPress={onPress}
      >
        {content}
      </Pressable>
    );
  }

  return <View style={styles.container}>{content}</View>;
}

const CARD_WIDTH = 80;
const PHOTO_SIZE = 64;

const styles = StyleSheet.create({
  container: {
    width: CARD_WIDTH,
    alignItems: 'center',
  },
  photo: {
    width: PHOTO_SIZE,
    height: PHOTO_SIZE,
    borderRadius: PHOTO_SIZE / 2,
    backgroundColor: Colors.dust,
  },
  photoFallback: {
    width: PHOTO_SIZE,
    height: PHOTO_SIZE,
    borderRadius: PHOTO_SIZE / 2,
    backgroundColor: Colors.dust,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.lg,
    color: Colors.textMuted,
  },
  name: {
    fontFamily: Fonts.sansMedium,
    fontSize: FontSizes.sm,
    color: Colors.text,
    textAlign: 'center',
    marginTop: Spacing.xs,
    lineHeight: FontSizes.sm * 1.3,
  },
  role: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: 2,
  },
});
