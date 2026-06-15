import { useEffect, useState } from 'react';

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

  const handleToggleOllama = () => {
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
  };

  return {
    isOllamaOpen,
    isOllamaClosing,
    handleToggleOllama,
  };
}
