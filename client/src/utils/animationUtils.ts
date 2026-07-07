import anime from 'animejs';

/**
 * Checks if the user has requested reduced motion at the system level.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * AnimeJS expects the camel-cased `cubicBezier(...)` form, while some callers
 * use the CSS `cubic-bezier(...)` syntax. Normalize the common CSS form so the
 * shared wrapper can safely accept either style.
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

/**
 * Safely runs an AnimeJS animation. If the user prefers reduced motion,
 * the animation's duration and delay are overridden to 0 so it executes
 * instantly without motion.
 */
export function safeAnime(params: anime.AnimeParams): anime.AnimeInstance {
  const normalizedParams = {
    ...params,
    easing: normalizeAnimeEasing(params.easing),
  };

  if (prefersReducedMotion()) {
    return anime({
      ...normalizedParams,
      duration: 0,
      delay: 0,
    });
  }
  return anime(normalizedParams);
}
