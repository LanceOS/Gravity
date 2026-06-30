import anime from 'animejs';

/**
 * Checks if the user has requested reduced motion at the system level.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Safely runs an AnimeJS animation. If the user prefers reduced motion,
 * the animation's duration and delay are overridden to 0 so it executes
 * instantly without motion.
 */
export function safeAnime(params: anime.AnimeParams): anime.AnimeInstance {
  if (prefersReducedMotion()) {
    return anime({
      ...params,
      duration: 0,
      delay: 0,
    });
  }
  return anime(params);
}
