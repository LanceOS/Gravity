import anime from 'animejs';

/**
 * AnimeJS expects `cubicBezier(...)`, while design-oriented code often uses the
 * CSS `cubic-bezier(...)` form. Normalize the CSS syntax before passing params
 * into AnimeJS so shared overlay components can use either style safely.
 */
export function normalizeAnimeEasing(easing: anime.AnimeParams['easing']): anime.AnimeParams['easing'] {
  if (typeof easing !== 'string') {
    return easing;
  }

  const cubicBezierMatch = /^cubic-bezier\((.+)\)$/i.exec(easing);
  if (!cubicBezierMatch) {
    return easing;
  }

  return `cubicBezier(${cubicBezierMatch[1]})`;
}

export function runAnime(params: anime.AnimeParams): anime.AnimeInstance {
  return anime({
    ...params,
    easing: normalizeAnimeEasing(params.easing),
  });
}
