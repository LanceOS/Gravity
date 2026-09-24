import React from 'react';
import { createPortal } from 'react-dom';

interface PortalProps {
  children: React.ReactNode;
  container?: HTMLElement;
}

export function Portal({ children, container }: PortalProps) {
  const [mountNode, setMountNode] = React.useState<HTMLElement | null>(null);

  // Match the server and first hydration render; resolve the host only after commit.
  React.useEffect(() => {
    setMountNode(container || document.body);
  }, [container]);

  if (!mountNode) {
    return null;
  }

  return createPortal(children, mountNode);
}
