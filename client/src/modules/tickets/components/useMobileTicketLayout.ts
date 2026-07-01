import * as React from 'react';

const MOBILE_LAYOUT_QUERY = '(max-width: 768px)';

const isBrowser = typeof window !== 'undefined';

const getMobileMatch = () => {
  if (!isBrowser || !window.matchMedia) {
    return false;
  }

  return window.matchMedia(MOBILE_LAYOUT_QUERY).matches;
};

const bindMediaQuery = (
  mediaQuery: MediaQueryList,
  onMatchChange: (event: MediaQueryListEvent | MediaQueryList) => void
) => {
  if (typeof mediaQuery.addEventListener === 'function') {
    mediaQuery.addEventListener('change', onMatchChange);
    return () => mediaQuery.removeEventListener('change', onMatchChange);
  }

  mediaQuery.addListener(onMatchChange);
  return () => mediaQuery.removeListener(onMatchChange);
};

export function useIsMobileTicketLayout(): boolean {
  const [isMobile, setIsMobile] = React.useState(getMobileMatch);

  React.useEffect(() => {
    if (!isBrowser || !window.matchMedia) {
      return undefined;
    }

    const mediaQuery = window.matchMedia(MOBILE_LAYOUT_QUERY);
    setIsMobile(mediaQuery.matches);

    const onMatchChange = (event: MediaQueryListEvent | MediaQueryList) => {
      setIsMobile(event.matches);
    };

    return bindMediaQuery(mediaQuery, onMatchChange);
  }, []);

  return isMobile;
}
