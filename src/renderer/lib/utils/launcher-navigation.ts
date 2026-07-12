export type LauncherSelectionDirection = -1 | 1;

export function moveLauncherSelection(
  currentIndex: number,
  itemCount: number,
  direction: LauncherSelectionDirection,
): number {
  if (itemCount <= 0) return 0;
  const normalizedCurrent = Math.min(Math.max(currentIndex, 0), itemCount - 1);
  return (normalizedCurrent + direction + itemCount) % itemCount;
}

export function clampLauncherSelection(currentIndex: number, itemCount: number): number {
  if (itemCount <= 0) return 0;
  return Math.min(Math.max(currentIndex, 0), itemCount - 1);
}
