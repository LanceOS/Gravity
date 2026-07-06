import { useCallback, useEffect, useState } from 'react';

export function useAgentPanel() {
  const [isAgentOpen, setIsAgentOpen] = useState(false);
  const [isAgentClosing, setIsAgentClosing] = useState(false);
  const [agentCloseTimer, setAgentCloseTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (agentCloseTimer) {
        clearTimeout(agentCloseTimer);
      }
    };
  }, [agentCloseTimer]);

  const handleOpenAgent = useCallback(() => {
    if (agentCloseTimer) {
      clearTimeout(agentCloseTimer);
      setAgentCloseTimer(null);
    }

    setIsAgentClosing(false);
    setIsAgentOpen(true);
  }, [agentCloseTimer]);

  const handleToggleAgent = useCallback(() => {
    if (isAgentClosing) {
      return;
    }

    if (isAgentOpen) {
      setIsAgentClosing(true);

      if (agentCloseTimer) {
        clearTimeout(agentCloseTimer);
      }

      const timer = setTimeout(() => {
        setIsAgentOpen(false);
        setIsAgentClosing(false);
        setAgentCloseTimer(null);
      }, 300);

      setAgentCloseTimer(timer);
      return;
    }

    setIsAgentOpen(true);
  }, [isAgentClosing, isAgentOpen, agentCloseTimer]);

  return {
    isAgentOpen,
    isAgentClosing,
    handleOpenAgent,
    handleToggleAgent,
  };
}
