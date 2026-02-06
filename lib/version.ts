/**
 * Compares two semantic version strings.
 * Returns:
 *   -1 if a < b
 *    0 if a === b
 *    1 if a > b
 */
export function compareVersions(a: string, b: string): number {
  const partsA = a.split('.').map(Number);
  const partsB = b.split('.').map(Number);
  const maxLen = Math.max(partsA.length, partsB.length);

  while (partsA.length < maxLen) partsA.push(0);
  while (partsB.length < maxLen) partsB.push(0);

  for (let i = 0; i < maxLen; i++) {
    if (partsA[i] > partsB[i]) return 1;
    if (partsA[i] < partsB[i]) return -1;
  }
  return 0;
}

/**
 * Checks if currentVersion is less than targetVersion.
 */
export function isVersionLessThan(current: string, target: string): boolean {
  return compareVersions(current, target) < 0;
}
