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
  const [rawToken, setRawToken] = useState<string | null>(null);
  const mcp = useWorkspaceMcp(workspaceId);

  async function handleCreate() {
    setLoading(true);
    setResult(null);
    try {
      const payload = await mcp.createConnection({ ttlSeconds: 300 });
      // Extract raw token and avoid storing it in the main result object
      // Use `auth.token` as the canonical raw token field.
      const token = payload?.auth?.token ?? null;
      const safePayload = {
        ...payload,
        ...(payload?.auth ? { auth: { ...payload.auth } } : {}),
      };
      if (safePayload.token) delete safePayload.token;
      if (safePayload.auth && safePayload.auth.token) delete safePayload.auth.token;
      setResult(safePayload);
      setRawToken(token);
    } catch (err) {
      setResult({ error: err instanceof Error ? err.message : String(err) });
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy() {
    if (!rawToken) return;
    try {
      await navigator.clipboard.writeText(rawToken);
    } catch (e) {
      // best-effort copy; ignore failures
    } finally {
      // Clear the token from the UI immediately after copy
      setRawToken(null);
    }
  }

  function handleClose() {
    setRawToken(null);
    setResult(null);
    onClose();
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Connect External AI">
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
                {rawToken ? (
                  <>
                    <div style={{ marginBottom: 8 }}>
                      <strong>Token (copy now)</strong>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input readOnly value={rawToken} style={{ width: '100%' }} />
                      <Button type="button" variant="primary" onClick={handleCopy}>Copy</Button>
                    </div>
                    <div style={{ marginTop: 8, fontSize: 'smaller' }}>
                      Token will be cleared from the UI after copying or when you close this dialog.
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ marginBottom: 8 }}>
                      <strong>Connection Payload</strong>
                    </div>
                    <textarea readOnly value={JSON.stringify(result, null, 2)} style={{ width: '100%', minHeight: 120 }} />
                  </>
                )}
              </>
            )}
          </div>
        ) : null}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button type="button" variant="secondary" onClick={handleClose}>Close</Button>
          <Button type="button" variant="primary" onClick={handleCreate} disabled={loading}>
            {loading ? 'Generating…' : 'Generate Token'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export default WorkspaceMcpModal;
