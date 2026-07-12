import { describe, expect, it } from 'vitest';
import { clampLauncherSelection, moveLauncherSelection } from '../../src/renderer/lib/utils/launcher-navigation';

describe('launcher keyboard selection', () => {
  it('moves down and wraps from the last result to the first', () => {
    expect(moveLauncherSelection(0, 4, 1)).toBe(1);
    expect(moveLauncherSelection(3, 4, 1)).toBe(0);
  });

  it('moves up and wraps from the first result to the last', () => {
    expect(moveLauncherSelection(3, 4, -1)).toBe(2);
    expect(moveLauncherSelection(0, 4, -1)).toBe(3);
  });

  it('keeps empty and filtered result selections valid', () => {
    expect(moveLauncherSelection(5, 0, 1)).toBe(0);
    expect(clampLauncherSelection(7, 3)).toBe(2);
    expect(clampLauncherSelection(-1, 3)).toBe(0);
  });
});
