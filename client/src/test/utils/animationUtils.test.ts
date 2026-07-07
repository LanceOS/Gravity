import { describe, expect, it } from 'vitest';
import { normalizeAnimeEasing } from '../../utils/animationUtils';

describe('normalizeAnimeEasing', () => {
  it('converts CSS cubic-bezier syntax to AnimeJS camelCase syntax', () => {
    expect(normalizeAnimeEasing('cubic-bezier(0.2, 0, 0.38, 1)')).toBe(
      'cubicBezier(0.2, 0, 0.38, 1)',
    );
  });

  it('leaves non-CSS easing strings untouched', () => {
    expect(normalizeAnimeEasing('easeOutCubic')).toBe('easeOutCubic');
  });
});
