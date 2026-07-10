import { apiClient } from './apiClient';

export const setTutorialCompleted = (userId: string, completed: boolean) =>
  apiClient.patch(`/users/${userId}/tutorial`, { completed });
