import { useRef, useState } from 'react';
import { toast } from '@library';

/** Status belongs to the submitted input, so edits permit another action. */
export function useActionStatus(inputKey = '') {
  const inFlight = useRef(false);
  const completedRef = useRef<string | null>(null);
  const [pending, setPending] = useState(false);
  const [completedKey, setCompletedKey] = useState<string | null>(null);
  const completed = completedKey === inputKey;

  async function run<T>(operation: () => Promise<T>, success: string, failure: string): Promise<boolean> {
    if (inFlight.current || completedRef.current === inputKey) return false;
    inFlight.current = true;
    setPending(true);
    try {
      const result = await operation();
      if (result === false || result === null) throw new Error(failure);
      completedRef.current = inputKey;
      setCompletedKey(inputKey);
      toast.show(success, 'success');
      return true;
    } catch (error) {
      toast.show(`${error instanceof Error ? error.message : failure} Please try again.`, 'error');
      return false;
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  return { pending, completed, disabled: pending || completed, run };
}
