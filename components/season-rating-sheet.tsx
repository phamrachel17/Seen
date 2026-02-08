import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  ActivityIndicator,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Fonts, FontSizes, Spacing, BorderRadius } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { StarRating } from '@/components/star-rating';
import { useAuth } from '@/lib/auth-context';
import {
  getSeasonRating,
  setSeasonRating,
  deleteSeasonRating,
} from '@/lib/season-ratings';

interface SeasonRatingSheetProps {
  visible: boolean;
  onClose: () => void;
  onSave: () => void;
  contentId: number;
  seasonNumber: number;
  showTitle: string;
}

export function SeasonRatingSheet({
  visible,
  onClose,
  onSave,
  contentId,
  seasonNumber,
  showTitle,
}: SeasonRatingSheetProps) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [existingRating, setExistingRating] = useState<number | null>(null);
  const [existingReviewText, setExistingReviewText] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (visible && user) {
      loadExistingRating();
    }
  }, [visible, user, contentId, seasonNumber]);

  const loadExistingRating = async () => {
    if (!user) return;

    setIsLoading(true);
    const existing = await getSeasonRating(user.id, contentId, seasonNumber);

    if (existing) {
      setRating(existing.star_rating);
      setExistingRating(existing.star_rating);
      setReviewText(existing.review_text || '');
      setExistingReviewText(existing.review_text || '');
    } else {
      setRating(0);
      setExistingRating(null);
      setReviewText('');
      setExistingReviewText('');
    }

    setIsLoading(false);
  };

  const handleSave = async () => {
    if (!user || rating === 0) return;

    setIsSaving(true);
    const result = await setSeasonRating(
      user.id,
      contentId,
      seasonNumber,
      rating,
      reviewText.trim() || undefined
    );
    setIsSaving(false);

    if (result) {
      onSave();
      onClose();
    }
  };

  const handleDelete = async () => {
    if (!user || existingRating === null) return;

    setIsSaving(true);
    const success = await deleteSeasonRating(user.id, contentId, seasonNumber);
    setIsSaving(false);

    if (success) {
      onSave();
      onClose();
    }
  };

  const handleClose = () => {
    setRating(existingRating || 0);
    setReviewText(existingReviewText);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <Pressable style={styles.overlay} onPress={handleClose}>
          <Pressable
            style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.lg }]}
            onPress={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.headerText}>
                <Text style={styles.seasonTitle}>Season {seasonNumber}</Text>
                <Text style={styles.showTitle} numberOfLines={1}>
                  {showTitle}
                </Text>
              </View>
              <Pressable style={styles.closeButton} onPress={handleClose}>
                <IconSymbol name="xmark" size={18} color={Colors.text} />
              </Pressable>
            </View>

            {/* Content */}
            {isLoading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={Colors.stamp} />
              </View>
            ) : (
              <View style={styles.content}>
                {/* Star Rating */}
                <View style={styles.ratingContainer}>
                  <StarRating
                    rating={rating}
                    onRatingChange={setRating}
                    size={40}
                  />
                </View>

                {/* Rating Hint */}
                <Text style={styles.ratingHint}>
                  {rating === 0
                    ? 'Tap a star to rate'
                    : `${rating} star${rating !== 1 ? 's' : ''}`}
                </Text>

                {/* Review Text Input */}
                <Text style={styles.reviewLabel}>Critique:</Text>
                <TextInput
                  style={styles.reviewInput}
                  placeholder="Add your thoughts about this season..."
                  placeholderTextColor={Colors.textMuted}
                  value={reviewText}
                  onChangeText={setReviewText}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                />

                {/* Save Button */}
                <Pressable
                  style={({ pressed }) => [
                    styles.saveButton,
                    pressed && styles.buttonPressed,
                    (isSaving || rating === 0) && styles.buttonDisabled,
                  ]}
                  onPress={handleSave}
                  disabled={isSaving || rating === 0}
                >
                  {isSaving ? (
                    <ActivityIndicator color={Colors.white} />
                  ) : (
                    <Text style={styles.saveButtonText}>
                      {existingRating !== null ? 'Update Rating' : 'Save Rating'}
                    </Text>
                  )}
                </Pressable>

                {/* Delete Button (only if existing rating) */}
                {existingRating !== null && (
                  <Pressable
                    style={({ pressed }) => [
                      styles.deleteButton,
                      pressed && styles.buttonPressed,
                    ]}
                    onPress={handleDelete}
                    disabled={isSaving}
                  >
                    <Text style={styles.deleteButtonText}>Remove Rating</Text>
                  </Pressable>
                )}
              </View>
            )}
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  keyboardView: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: Spacing.xl,
  },
  headerText: {
    flex: 1,
  },
  seasonTitle: {
    fontFamily: Fonts.serifBold,
    fontSize: FontSizes.xl,
    color: Colors.text,
  },
  showTitle: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
    marginTop: 2,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.dust,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingContainer: {
    paddingVertical: Spacing['2xl'],
    alignItems: 'center',
  },
  content: {
    paddingBottom: Spacing.md,
  },
  ratingContainer: {
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  ratingHint: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  reviewLabel: {
    fontFamily: Fonts.sansBold,
    fontSize: FontSizes.md,
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  reviewInput: {
    backgroundColor: Colors.cardBackground,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    fontFamily: Fonts.sans,
    fontSize: FontSizes.md,
    color: Colors.text,
    minHeight: 80,
    marginBottom: Spacing.lg,
  },
  saveButton: {
    backgroundColor: Colors.stamp,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
  },
  saveButtonText: {
    fontFamily: Fonts.sansSemiBold,
    fontSize: FontSizes.md,
    color: Colors.white,
  },
  deleteButton: {
    paddingVertical: Spacing.md,
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  deleteButtonText: {
    fontFamily: Fonts.sans,
    fontSize: FontSizes.md,
    color: Colors.error,
  },
  buttonPressed: {
    opacity: 0.8,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
