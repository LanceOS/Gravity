import type { User } from '../../types/domain';

export type SessionUser = Pick<User, 'id' | 'name' | 'email'> & {
  image?: string | null;
  tutorialCompleted?: User['tutorial_completed'];
  tutorial_completed?: User['tutorial_completed'];
};
