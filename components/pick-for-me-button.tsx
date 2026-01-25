import { Pressable, Text, StyleSheet, View } from 'react-native';
import {
  Colors,
  Fonts,
  FontSizes,
  Spacing,
  BorderRadius,
} from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';

interface PickForMeButtonProps {
  onPress: () => void;
  variant?: 'prominent' | 'compact';
}

export function PickForMeButton({
  onPress,
  variant = 'prominent',
}: PickForMeButtonProps) {
  if (variant === 'compact') {
    return (
      <Pressable
        style={({ pressed }) => [
          styles.compactButton,
          pressed && styles.buttonPressed,
        ]}
        onPress={onPress}
      >
        <IconSymbol name="sparkles" size={16} color={Colors.paper} />
        <Text style={styles.compactButtonText}>Pick for Me</Text>
      </Pressable>
    );
  }

  return (
    <Pressable
      style={({ pressed }) => [
        styles.prominentButton,
        pressed && styles.buttonPressed,
      ]}
      onPress={onPress}
    >
      <View style={styles.prominentIconContainer}>
        <IconSymbol name="sparkles" size={24} color={Colors.paper} />
      </View>
      <View style={styles.prominentTextContainer}>
        <Text style={styles.prominentTitle}>Pick for Me</Text>
        <Text style={styles.prominentSubtitle}>
          Can&apos;t decide? Let us choose
        </Text>
      </View>
      <IconSymbol name="chevron.right" size={16} color={Colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  prominentButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.cardBackground,
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.md,
    marginBottom: Spacing.xl,
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.stamp,
    gap: Spacing.md,
  },
  buttonPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
  prominentIconContainer: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.stamp,
    alignItems: 'center',
    justifyContent: 'center',
  },
  prominentTextContainer: {
    flex: 1,
  },
  prominentTitle: {
    fontFamily: Fonts.serifSemiBold,
    fontSize: FontSizes.lg,
    color: Colors.text,
  },
  prominentSubtitle: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
    marginTop: 2,
  },
  compactButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.stamp,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    gap: Spacing.xs,
  },
  compactButtonText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.sm,
    color: Colors.paper,
  },
});
