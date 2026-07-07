import { describe, expect, it, vi } from 'vitest';

const animeMock = vi.hoisted(() => vi.fn(() => ({ finished: Promise.resolve() })));

vi.mock('animejs', () => ({
  default: animeMock,
}));

import { normalizeAnimeEasing, runAnime } from '@library';

describe('library anime utilities', () => {
  it('normalizes CSS cubic-bezier syntax for AnimeJS', () => {
    expect(normalizeAnimeEasing('cubic-bezier(0.2, 0, 0.38, 1)')).toBe(
      'cubicBezier(0.2, 0, 0.38, 1)',
    );
  });

  it('passes normalized easing into AnimeJS', () => {
    runAnime({
      targets: { opacity: 0 },
      opacity: [0, 1],
      easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
    });

    expect(animeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        easing: 'cubicBezier(0.4, 0, 0.2, 1)',
      }),
    );
  });
});
