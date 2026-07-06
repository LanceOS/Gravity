import { useCallback, useEffect, useState } from 'react';

export function useOllamaPanel() {
  const [isOllamaOpen, setIsOllamaOpen] = useState(false);
  const [isOllamaClosing, setIsOllamaClosing] = useState(false);
  const [ollamaCloseTimer, setOllamaCloseTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (ollamaCloseTimer) {
        clearTimeout(ollamaCloseTimer);
      }
    };
  }, [ollamaCloseTimer]);

  const handleOpenOllama = useCallback(() => {
    if (ollamaCloseTimer) {
      clearTimeout(ollamaCloseTimer);
      setOllamaCloseTimer(null);
    }

    setIsOllamaClosing(false);
    setIsOllamaOpen(true);
  }, [ollamaCloseTimer]);

  const handleToggleOllama = useCallback(() => {
    if (isOllamaClosing) {
      return;
    }

    if (isOllamaOpen) {
      setIsOllamaClosing(true);

      if (ollamaCloseTimer) {
        clearTimeout(ollamaCloseTimer);
      }

      const timer = setTimeout(() => {
        setIsOllamaOpen(false);
        setIsOllamaClosing(false);
        setOllamaCloseTimer(null);
      }, 300);

      setOllamaCloseTimer(timer);
      return;
    }

    setIsOllamaOpen(true);
  }, [isOllamaClosing, isOllamaOpen, ollamaCloseTimer]);

  return {
    isOllamaOpen,
    isOllamaClosing,
    handleOpenOllama,
    handleToggleOllama,
  };
}
