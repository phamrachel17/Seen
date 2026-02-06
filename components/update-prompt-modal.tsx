import { View, Text, StyleSheet, Pressable, Modal, Linking } from 'react-native';
import { Colors, Fonts, FontSizes, Spacing, BorderRadius } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';

interface UpdatePromptModalProps {
  visible: boolean;
  latestVersion: string | null;
  storeUrl: string | null;
  updateMessage: string | null;
  isForceUpdate: boolean;
  onDismiss: () => void;
}

export function UpdatePromptModal({
  visible,
  latestVersion,
  storeUrl,
  updateMessage,
  isForceUpdate,
  onDismiss,
}: UpdatePromptModalProps) {
  const handleUpdate = () => {
    if (storeUrl) {
      Linking.openURL(storeUrl);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={isForceUpdate ? undefined : onDismiss}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.iconContainer}>
            <IconSymbol name="arrow.down.app" size={32} color={Colors.stamp} />
          </View>

          <Text style={styles.title}>Update Available</Text>

          <Text style={styles.message}>
            {updateMessage ||
              `A new version of Seen (${latestVersion}) is available with improvements and bug fixes.`}
          </Text>

          <View style={styles.buttonContainer}>
            <Pressable
              style={({ pressed }) => [
                styles.updateButton,
                pressed && styles.buttonPressed,
              ]}
              onPress={handleUpdate}
            >
              <Text style={styles.updateButtonText}>Update Now</Text>
            </Pressable>

            {!isForceUpdate && (
              <Pressable
                style={({ pressed }) => [
                  styles.laterButton,
                  pressed && styles.buttonPressed,
                ]}
                onPress={onDismiss}
              >
                <Text style={styles.laterButtonText}>Later</Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  container: {
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    width: '100%',
    maxWidth: 320,
    alignItems: 'center',
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.cardBackground,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  title: {
    fontFamily: Fonts.serifBold,
    fontSize: FontSizes['2xl'],
    color: Colors.text,
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  message: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.md,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: Spacing.xl,
  },
  buttonContainer: {
    width: '100%',
    gap: Spacing.md,
  },
  updateButton: {
    backgroundColor: Colors.stamp,
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
  },
  updateButtonText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.md,
    color: Colors.paper,
  },
  laterButton: {
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  laterButtonText: {
    fontFamily: Fonts.sansMedium,
    fontSize: FontSizes.md,
    color: Colors.textMuted,
  },
  buttonPressed: {
    opacity: 0.7,
  },
});
