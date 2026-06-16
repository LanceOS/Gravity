import { useState } from 'react';
import { Button } from '@library';
import { FormSection } from '../../../components/FormSection';
import { ModalDialog } from '../../../components/ModalDialog';
import useWorkspaceMcp from '../../../hooks/useWorkspaceMcp';

type Props = {
  workspaceId?: string;
  isOpen: boolean;
  onClose: () => void;
};

type WorkspaceMcpModalResult = Record<string, unknown> & {
  error?: string;
};

export function WorkspaceMcpModal({ workspaceId, isOpen, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<WorkspaceMcpModalResult | null>(null);
  const [rawToken, setRawToken] = useState<string | null>(null);
  const mcp = useWorkspaceMcp(workspaceId);

  async function handleCreate() {
    setLoading(true);
    setResult(null);
    try {
      const payload = await mcp.createConnection({ ttlSeconds: 300 });
      // Extract raw token and avoid storing it in the main result object
      // Use `auth.token` as the canonical raw token field.
      const auth = payload.auth && typeof payload.auth === 'object' && !Array.isArray(payload.auth)
        ? payload.auth as Record<string, unknown>
        : null;
      const token = typeof auth?.token === 'string' ? auth.token : null;
      const safePayload: WorkspaceMcpModalResult = { ...payload };

      delete safePayload.token;

      if (auth) {
        const safeAuth = { ...auth };
        delete safeAuth.token;
        safePayload.auth = safeAuth;
      }

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
    <ModalDialog.Root isOpen={isOpen} onClose={handleClose} size="md">
      <ModalDialog.Header
        title="Connect External AI"
        description="Generate a short-lived one-time connection token for external AI connectors."
      />

      <ModalDialog.Body>
        <FormSection.Root as="div">
          <p>
            The token is shown only once.
          </p>

          {result ? (
            <FormSection.Body>
              {result.error ? (
                <ModalDialog.Feedback type="error">{result.error}</ModalDialog.Feedback>
              ) : (
                <>
                  {rawToken ? (
                    <>
                      <FormSection.Field label="Token (copy now)">
                        <input readOnly value={rawToken} style={{ width: '100%' }} />
                      </FormSection.Field>
                      <p>
                        Token will be cleared from the UI after copying or when you close this dialog.
                      </p>
                    </>
                  ) : (
                    <FormSection.Field label="Connection Payload">
                      <textarea readOnly value={JSON.stringify(result, null, 2)} style={{ width: '100%', minHeight: 120 }} />
                    </FormSection.Field>
                  )}
                </>
              )}
            </FormSection.Body>
          ) : null}
        </FormSection.Root>
      </ModalDialog.Body>

      <ModalDialog.Footer>
        <ModalDialog.Actions>
          <Button type="button" variant="secondary" onClick={handleClose}>Close</Button>
          {rawToken ? (
            <Button type="button" variant="primary" onClick={handleCopy}>Copy</Button>
          ) : null}
          <Button type="button" variant="primary" onClick={handleCreate} loading={loading} disabled={loading}>
            {loading ? 'Generating...' : 'Generate Token'}
          </Button>
        </ModalDialog.Actions>
      </ModalDialog.Footer>
    </ModalDialog.Root>
  );
}

export default WorkspaceMcpModal;
