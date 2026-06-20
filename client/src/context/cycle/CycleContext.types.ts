import type { Cycle } from '../../types/domain';

export interface CycleContextType {
  cycles: Cycle[];
  isLoading: boolean;
  error: Error | null;
}
