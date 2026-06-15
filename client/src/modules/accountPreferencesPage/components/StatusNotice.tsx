import { Alert } from '@library';

import type { StatusMessage } from '../types';

type StatusNoticeTone = 'neutral' | 'success' | 'error';

interface StatusNoticeProps {
  message: StatusMessage | { message: string } | null;
  tone?: StatusNoticeTone;
}

export function StatusNotice({ message, tone = 'neutral' }: StatusNoticeProps) {
  if (!message) {
    return null;
  }

  const alertType = tone === 'success' ? 'success' : tone === 'error' ? 'error' : 'info';

  return (
    <Alert type={alertType}>
      {message.message}
    </Alert>
  );
}

