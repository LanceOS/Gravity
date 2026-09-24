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
    background: 'var(--surface-glass-strong)',
    border: '1px solid var(--border-glass)',
    borderRadius: 'var(--radius-xl)',
    boxShadow: 'var(--shadow-xl)',
    display: 'flex',
    flexDirection: 'column',
    zIndex: 900,
    overflow: 'hidden',
    backdropFilter: 'blur(var(--glass-blur)) saturate(var(--glass-saturate))',
    WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(var(--glass-saturate))',
  };
};
