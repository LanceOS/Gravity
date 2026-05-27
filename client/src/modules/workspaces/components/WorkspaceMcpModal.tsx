import React, { useState } from 'react';
import { Modal, Button } from '@library';
import useWorkspaceMcp from '../../../hooks/useWorkspaceMcp';

type Props = {
  workspaceId?: string;
  isOpen: boolean;
  onClose: () => void;
};

export function WorkspaceMcpModal({ workspaceId, isOpen, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any | null>(null);
  const mcp = useWorkspaceMcp(workspaceId);

  async function handleCreate() {
    setLoading(true);
    setResult(null);
    try {
      const payload = await mcp.createConnection({ ttlSeconds: 300 });
      setResult(payload);
    } catch (err) {
      setResult({ error: err instanceof Error ? err.message : String(err) });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Connect External AI">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p>
          Generate a short-lived one-time connection token for external AI connectors. The token is shown only once.
        </p>

        {result ? (
          <div>
            {result.error ? (
              <div style={{ color: 'var(--color-danger)' }}>{result.error}</div>
            ) : (
              <>
                <div style={{ marginBottom: 8 }}>
                  <strong>Token (copy now)</strong>
                </div>
                <textarea readOnly value={JSON.stringify(result, null, 2)} style={{ width: '100%', minHeight: 120 }} />
              </>
            )}
          </div>
        ) : null}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button type="button" variant="secondary" onClick={onClose}>Close</Button>
          <Button type="button" variant="primary" onClick={handleCreate} disabled={loading}>
            {loading ? 'Generating…' : 'Generate Token'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export default WorkspaceMcpModal;
