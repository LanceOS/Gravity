import React from 'react';

export const getWindowStyle = (isMobile: boolean, isClosing: boolean): React.CSSProperties => ({
  position: 'fixed',
  top: isMobile ? undefined : '64px',
  bottom: isMobile ? '16px' : undefined,
  left: isMobile ? '0' : undefined,
  right: isMobile ? '0' : '24px',
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
  animation: isClosing 
    ? 'aiChatFadeUpClose 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards'
    : 'aiChatFadeDownOpen 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
});