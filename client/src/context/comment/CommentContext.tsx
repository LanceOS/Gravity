import { createContext, useCallback, useContext, useMemo, type FC, type ReactNode } from 'react';
import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { apiClient } from '../../utils/apiClient';
import { queryKeys } from '../../utils/queryClient';
import { normalizeCommentPayload } from '../shared';
import { useAuth } from '../auth/AuthContext';
import { useActiveProject } from '../project/ActiveProjectContext';
import type { Comment } from '../../types/domain';
import type { CommentContextType, CommentContextValueArgs } from './CommentContext.types';

type CommentMutationSnapshot = {
  queryKey: ReturnType<typeof queryKeys.comments>;
  previousComments: Comment[] | undefined;
  hadSnapshot: boolean;
  optimisticCommentId?: string;
};

export const CommentContext = createContext<CommentContextType | undefined>(undefined);

export function useCommentContext(): CommentContextType {
  const context = useContext(CommentContext);
  if (!context) {
    throw new Error('useCommentContext must be used within a CommentContext provider');
  }

  return context;
}

export const CommentProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const { currentUser } = useAuth();
  const { activeProjectIdRef } = useActiveProject();
  const value = useCommentContextValue({
    currentUser,
    activeProjectIdRef,
  });

  return <CommentContext.Provider value={value}>{children}</CommentContext.Provider>;
};

function createOptimisticComment(
  ticketId: string,
  body: string,
  currentUser: NonNullable<CommentContextValueArgs['currentUser']>
): Comment {
  const timestamp = new Date().toISOString();

  return {
    id: `co-opt-${Date.now()}`,
    ticketId,
    userId: currentUser.id,
    body,
    createdAt: timestamp,
    updatedAt: timestamp,
    userName: currentUser.name,
    userAvatar: currentUser.avatar,
    author: {
      id: currentUser.id,
      username: currentUser.name,
      avatar_url: currentUser.avatar,
      role: currentUser.role,
    },
  };
}

function applyCommentReplacement(
  comments: Comment[],
  optimisticCommentId: string | undefined,
  nextComment: Comment
) {
  const optimisticIndex = optimisticCommentId
    ? comments.findIndex((comment) => comment.id === optimisticCommentId)
    : -1;

  if (optimisticIndex !== -1) {
    const next = [...comments];
    next[optimisticIndex] = {
      ...next[optimisticIndex],
      ...nextComment,
    };
    return next;
  }

  const existingIndex = comments.findIndex((comment) => comment.id === nextComment.id);
  if (existingIndex !== -1) {
    const next = [...comments];
    next[existingIndex] = {
      ...next[existingIndex],
      ...nextComment,
    };
    return next;
  }

  return [...comments, nextComment];
}

function restoreCommentSnapshot(queryClient: QueryClient, snapshot: CommentMutationSnapshot) {
  if (!snapshot.hadSnapshot) {
    queryClient.removeQueries({ queryKey: snapshot.queryKey, exact: true });
    return;
  }

  queryClient.setQueryData<Comment[]>(
    snapshot.queryKey,
    [...(snapshot.previousComments ?? [])]
  );
}

export function useCommentContextValue({
  currentUser,
  activeProjectIdRef,
}: CommentContextValueArgs): CommentContextType {
  const queryClient = useQueryClient();

  const addCommentMutation = useMutation({
    mutationFn: async ({ ticketId, body }: { ticketId: string; body: string }) => {
      const activeProjectId = activeProjectIdRef.current.trim();
      if (!currentUser) {
        throw new Error('Not authenticated');
      }

      if (!activeProjectId) {
        throw new Error('Missing active project');
      }

      return apiClient.post<Comment>(
        `/tickets/${ticketId}/comments`,
        { userId: currentUser.id, body },
        { projectId: activeProjectId }
      );
    },
    onMutate: async ({ ticketId, body }) => {
      const queryKey = queryKeys.comments(ticketId);
      await queryClient.cancelQueries({ queryKey });

      const previousComments = queryClient.getQueryData<Comment[]>(queryKey);
      const snapshot: CommentMutationSnapshot = {
        queryKey,
        previousComments,
        hadSnapshot: previousComments !== undefined,
      };

      const activeProjectId = activeProjectIdRef.current.trim();
      if (currentUser && activeProjectId) {
        const optimisticComment = createOptimisticComment(ticketId, body, currentUser);
        snapshot.optimisticCommentId = optimisticComment.id;
        queryClient.setQueryData<Comment[]>(queryKey, (old) => [...(old ?? []), optimisticComment]);
      }

      return snapshot;
    },
    onSuccess: (createdComment, _variables, context) => {
      if (!context) {
        return;
      }

      const normalizedComment = normalizeCommentPayload(createdComment);
      if (!normalizedComment) {
        return;
      }

      queryClient.setQueryData<Comment[]>(context.queryKey, (old) => {
        const comments = old ?? context.previousComments ?? [];
        return applyCommentReplacement(comments, context.optimisticCommentId, normalizedComment);
      });
    },
    onError: (_error, _variables, context) => {
      if (context) {
        restoreCommentSnapshot(queryClient, context);
      }
    },
  });

  const updateCommentMutation = useMutation({
    mutationFn: async ({ ticketId, commentId, body }: { ticketId: string; commentId: string; body: string }) => {
      const activeProjectId = activeProjectIdRef.current.trim();
      if (!activeProjectId) {
        throw new Error('Missing active project');
      }

      return apiClient.patch<Comment>(
        `/tickets/${ticketId}/comments/${commentId}`,
        { body },
        { projectId: activeProjectId }
      );
    },
    onMutate: async ({ ticketId, commentId, body }) => {
      const queryKey = queryKeys.comments(ticketId);
      await queryClient.cancelQueries({ queryKey });

      const previousComments = queryClient.getQueryData<Comment[]>(queryKey);
      const snapshot: CommentMutationSnapshot = {
        queryKey,
        previousComments,
        hadSnapshot: previousComments !== undefined,
      };

      const activeProjectId = activeProjectIdRef.current.trim();
      if (activeProjectId) {
        const optimisticUpdatedAt = new Date().toISOString();
        queryClient.setQueryData<Comment[]>(queryKey, (old) =>
          (old ?? []).map((comment) =>
            comment.id === commentId
              ? { ...comment, body, updatedAt: optimisticUpdatedAt }
              : comment
          )
        );
      }

      return snapshot;
    },
    onSuccess: (updatedComment, _variables, context) => {
      if (!context) {
        return;
      }

      const normalizedComment = normalizeCommentPayload(updatedComment);
      if (!normalizedComment) {
        return;
      }

      queryClient.setQueryData<Comment[]>(context.queryKey, (old) => {
        const comments = old ?? context.previousComments ?? [];
        return comments.map((comment) =>
          comment.id === normalizedComment.id
            ? { ...comment, ...normalizedComment }
            : comment
        );
      });
    },
    onError: (_error, _variables, context) => {
      if (context) {
        restoreCommentSnapshot(queryClient, context);
      }
    },
  });

  const deleteCommentMutation = useMutation({
    mutationFn: async ({ ticketId, commentId }: { ticketId: string; commentId: string }) => {
      const activeProjectId = activeProjectIdRef.current.trim();
      if (!activeProjectId) {
        throw new Error('Missing active project');
      }

      await apiClient.delete(`/tickets/${ticketId}/comments/${commentId}`, { projectId: activeProjectId });
    },
    onMutate: async ({ ticketId, commentId }) => {
      const queryKey = queryKeys.comments(ticketId);
      await queryClient.cancelQueries({ queryKey });

      const previousComments = queryClient.getQueryData<Comment[]>(queryKey);
      const snapshot: CommentMutationSnapshot = {
        queryKey,
        previousComments,
        hadSnapshot: previousComments !== undefined,
      };

      const activeProjectId = activeProjectIdRef.current.trim();
      if (activeProjectId) {
        queryClient.setQueryData<Comment[]>(queryKey, (old) => (old ?? []).filter((comment) => comment.id !== commentId));
      }

      return snapshot;
    },
    onError: (_error, _variables, context) => {
      if (context) {
        restoreCommentSnapshot(queryClient, context);
      }
    },
  });

  const addComment = useCallback(async (ticketId: string, body: string) => {
    await addCommentMutation.mutateAsync({ ticketId, body });
  }, [addCommentMutation]);

  const updateComment = useCallback(async (ticketId: string, commentId: string, body: string) => {
    await updateCommentMutation.mutateAsync({ ticketId, commentId, body });
  }, [updateCommentMutation]);

  const deleteComment = useCallback(async (ticketId: string, commentId: string) => {
    await deleteCommentMutation.mutateAsync({ ticketId, commentId });
  }, [deleteCommentMutation]);

  return useMemo(() => ({
    addComment,
    updateComment,
    deleteComment,
  }), [addComment, updateComment, deleteComment]);
}
