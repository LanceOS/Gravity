import type { ReactNode } from 'react';

export interface RealtimeContextType {
  workspaceId: string | null;
}

export interface RealtimeContextValueArgs {
  currentUserId: string | null;
}

export interface RealtimeProviderProps extends RealtimeContextValueArgs {
  children: ReactNode;
}
