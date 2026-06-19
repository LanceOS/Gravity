import React, { useMemo } from 'react';
import { Card, Stack, Button } from '@library';
import { useSettingsScreenContext } from '../../../context/settings/useSettingsScreenContext';

export function RequestsSection(): React.ReactNode {
  const { joinRequests, approveLoadingId, onApproveJoinRequest } = useSettingsScreenContext();

  const pendingRequests = useMemo(
    () => joinRequests.filter((request) => request.status === 'pending'),
    [joinRequests]
  );

  const reviewedRequests = useMemo(
    () => joinRequests.filter((request) => request.status !== 'pending'),
    [joinRequests]
  );

  return (
    <Card style={{ padding: 'var(--space-lg)', borderRadius: 'var(--radius-lg)' }}>
      <Stack gap="var(--space-lg)">
        <div>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: 'var(--color-text-primary)' }}>Join Requests</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--color-text-disabled)', fontSize: '12.5px', lineHeight: 1.5 }}>
            Manage pending inbound workspace access requests. Requests will remain in a pending state until reviewed and approved by an owner.
          </p>
        </div>

        {pendingRequests.length === 0 && <div style={{ color: 'var(--color-text-disabled)', fontSize: '13px', textAlign: 'center', padding: 'var(--space-md)' }}>No pending join requests at the moment.</div>}

        <Stack gap="var(--space-md)">
          {pendingRequests.map((request) => (
            <div
              key={request.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 'var(--space-md)',
                padding: 'var(--space-md)',
                borderRadius: 'var(--radius-md)',
                background: 'var(--color-base100)',
                border: '1px solid var(--color-border-default)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '50%', display: 'grid', placeItems: 'center', background: 'var(--color-state-selected-bg)', border: '1px solid var(--color-border-focus)', color: 'var(--color-primary)', fontWeight: 700 }}>
                  {request.requesterName.slice(0, 1).toUpperCase()}
                </div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}>{request.requesterName}</div>
                  <div style={{ fontSize: '12px', color: 'var(--color-text-disabled)', marginTop: '2px' }}>{request.requesterEmail}</div>
                  {request.message && (
                    <div style={{ marginTop: '6px', fontSize: '12px', color: 'var(--color-text-primary)', padding: 'var(--space-sm)', borderRadius: 'var(--radius-sm)', background: 'var(--color-surface-app)', border: '1px solid var(--color-border-default)', fontStyle: 'italic' }}>
                      "{request.message}"
                    </div>
                  )}
                </div>
              </div>

              <Button
                variant="primary"
                size="sm"
                onClick={() => void onApproveJoinRequest(request.id)}
                disabled={approveLoadingId === request.id}
              >
                {approveLoadingId === request.id ? 'Approving...' : 'Approve'}
              </Button>
            </div>
          ))}
        </Stack>

        {reviewedRequests.length > 0 && (
          <Stack gap="var(--space-md)" style={{ marginTop: 'var(--space-md)' }}>
            <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--color-text-disabled)' }}>Recently Reviewed</span>
            {reviewedRequests.map((request) => (
              <div
                key={request.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 'var(--space-md)',
                  padding: 'var(--space-md) var(--space-md)',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--color-base100)',
                  border: '1px solid var(--color-border-default)',
                  opacity: 0.75
                }}
              >
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}>{request.requesterName}</div>
                  <div style={{ fontSize: '11px', color: 'var(--color-text-disabled)', marginTop: '2px' }}>
                    {request.status} · Approved by {request.reviewedByName || 'Unknown owner'}
                  </div>
                </div>

                <span style={{ fontSize: '11px', color: 'var(--color-text-disabled)' }}>{new Date(request.createdAt).toLocaleDateString()}</span>
              </div>
            ))}
          </Stack>
        )}
      </Stack>
    </Card>
  );
}
