import type { MutableRefObject } from 'react';
import type { User } from '../../types/domain';

export interface CommentContextType {
  addComment: (ticketId: string, body: string) => Promise<void>;
  updateComment: (ticketId: string, commentId: string, body: string) => Promise<void>;
  deleteComment: (ticketId: string, commentId: string) => Promise<void>;
}

export interface CommentContextValueArgs {
  currentUser: Pick<User, 'id' | 'name' | 'avatar' | 'role'> | null;
  activeProjectIdRef: MutableRefObject<string>;
}
