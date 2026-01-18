// Simple state bridge for passing friend picker selections back to the review modal
// This avoids navigation params which can cause screen re-mounting

let pendingSelection: string[] | null = null;

export function setPendingFriendSelection(ids: string[]) {
  pendingSelection = ids;
}

export function getPendingFriendSelection(): string[] | null {
  const result = pendingSelection;
  pendingSelection = null; // Clear after reading
  return result;
}
