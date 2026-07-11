import { apiClient } from './apiClient';

export const patchTutorialCompleted = (userId: string, completed: boolean) =>
  apiClient.patch(`/users/${userId}/tutorial`, { completed });
