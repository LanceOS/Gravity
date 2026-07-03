import React from 'react';

export type AIChatWindowVariant = 'floating' | 'embedded';

export const getWindowStyle = (
  variant: AIChatWindowVariant,
  isMobile: boolean,
  isClosing: boolean
): React.CSSProperties => {
  if (variant === 'embedded') {
    return {
      position: 'relative',
      top: 'auto',
      bottom: 'auto',
      left: 'auto',
      right: 'auto',
      margin: 0,
      width: '100%',
      maxWidth: 'none',
      height: '100%',
      maxHeight: 'none',
      background: 'transparent',
      border: 'none',
      borderRadius: 0,
      boxShadow: 'none',
      display: 'flex',
      flexDirection: 'column',
      zIndex: 0,
      overflow: 'hidden',
      backdropFilter: 'none',
      WebkitBackdropFilter: 'none',
    };
  }

  return {
    position: 'fixed',
    top: isMobile ? undefined : '50px',
    bottom: isMobile ? '16px' : undefined,
    left: isMobile ? '0' : undefined,
    right: isMobile ? '0' : '16px',
    margin: isMobile ? '0 auto' : undefined,
    width: isMobile ? 'calc(100% - 32px)' : '360px',
    maxWidth: isMobile ? '400px' : undefined,
    height: isMobile ? 'calc(100dvh - 80px)' : '580px',
    maxHeight: isMobile ? 'calc(100dvh - 32px)' : 'calc(100vh - 140px)',
    background: 'var(--color-surface-elevated)',
    border: '1px solid var(--color-border-default)',
    borderRadius: '16px',
    boxShadow: 'var(--shadow-xl)',
    display: 'flex',
    flexDirection: 'column',
    zIndex: 900,
    overflow: 'hidden',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
  };
};
