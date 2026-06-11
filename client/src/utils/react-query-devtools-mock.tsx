import React, { useState, useEffect } from 'react';
import { useQueryClient } from './react-query-mock';

interface ReactQueryDevtoolsProps {
  initialIsOpen?: boolean;
}

export const ReactQueryDevtools: React.FC<ReactQueryDevtoolsProps> = ({ initialIsOpen = false }) => {
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(initialIsOpen);
  const [cacheKeys, setCacheKeys] = useState<{ key: string; status: string }[]>([]);

  useEffect(() => {
    if (!isOpen) return;

    const updateCacheKeys = () => {
      const keys: { key: string; status: string }[] = [];
      const cache = (queryClient as any).cache as Map<string, any>;
      for (const [serialized, state] of cache.entries()) {
        keys.push({
          key: serialized,
          status: `${state.status} (${state.fetchStatus})`,
        });
      }
      setCacheKeys(keys);
    };

    updateCacheKeys();
    
    // Subscribe to query client changes
    const timer = window.setInterval(updateCacheKeys, 1000);
    return () => window.clearInterval(timer);
  }, [isOpen, queryClient]);

  if (import.meta.env?.MODE === 'production') {
    return null;
  }

  return (
    <div style={{ position: 'fixed', bottom: '16px', right: '16px', zIndex: 99999, fontFamily: 'monospace', fontSize: '12px' }}>
      {/* Devtools Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          width: '32px',
          height: '32px',
          borderRadius: '50%',
          backgroundColor: '#ff4154',
          color: '#ffffff',
          border: 'none',
          cursor: 'pointer',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 'bold',
          transition: 'transform 0.2s ease',
        }}
        onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.1)'}
        onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
        title="Query Cache DevTools"
      >
        Q
      </button>

      {/* Devtools Panel */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            bottom: '40px',
            right: '0',
            width: '320px',
            maxHeight: '400px',
            overflowY: 'auto',
            backgroundColor: 'rgba(15, 23, 42, 0.95)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '12px',
            padding: '16px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
            color: '#e2e8f0',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', borderBottom: '1px solid rgba(255, 255, 255, 0.1)', paddingBottom: '8px' }}>
            <span style={{ fontWeight: 'bold', color: '#ff4154' }}>Gravity Cache DevTools</span>
            <button
              onClick={() => queryClient.invalidateQueries()}
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                border: 'none',
                color: '#e2e8f0',
                padding: '4px 8px',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              Invalidate All
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {cacheKeys.length === 0 ? (
              <div style={{ color: '#94a3b8', textAlign: 'center', padding: '12px' }}>Cache is empty</div>
            ) : (
              cacheKeys.map(({ key, status }) => (
                <div
                  key={key}
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    padding: '8px',
                    borderRadius: '6px',
                    borderLeft: status.includes('success') ? '3px solid #10b981' : '3px solid #f59e0b',
                  }}
                >
                  <div style={{ wordBreak: 'break-all', fontWeight: 'bold', marginBottom: '4px' }}>
                    {key}
                  </div>
                  <div style={{ color: '#94a3b8', fontSize: '10px' }}>
                    Status: {status}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
