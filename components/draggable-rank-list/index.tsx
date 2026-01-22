import { useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { DraggableRankItem, RankedMovie } from './draggable-rank-item';

const ITEM_HEIGHT = 99; // paddingVertical (12*2) + poster height (75)

interface DraggableRankListProps {
  rankings: RankedMovie[];
  onReorder: (fromIndex: number, toIndex: number) => void;
  isEditMode: boolean;
  onItemPress: (tmdbId: number) => void;
}

export function DraggableRankList({
  rankings,
  onReorder,
  isEditMode,
  onItemPress,
}: DraggableRankListProps) {
  // Shared values for coordinating animations on UI thread
  const dragY = useSharedValue(0);
  const draggedIndex = useSharedValue(-1);

  const handleDragEnd = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (fromIndex !== toIndex) {
        onReorder(fromIndex, toIndex);
      }
    },
    [onReorder]
  );

  const handleItemPress = useCallback(
    (tmdbId: number) => {
      onItemPress(tmdbId);
    },
    [onItemPress]
  );

  return (
    <View style={styles.container}>
      {rankings.map((movie, index) => (
        <DraggableRankItem
          key={movie.id}
          movie={movie}
          index={index}
          itemHeight={ITEM_HEIGHT}
          itemCount={rankings.length}
          isEditMode={isEditMode}
          dragY={dragY}
          draggedIndex={draggedIndex}
          onDragEnd={handleDragEnd}
          onPress={() => handleItemPress(movie.id)}
        />
      ))}
    </View>
  );
}

export { RankedMovie };

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
