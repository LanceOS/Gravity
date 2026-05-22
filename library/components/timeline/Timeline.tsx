import React from 'react';
import { User, ChevronLeft, ChevronRight, Folder, File, ChevronDown } from 'lucide-react';

export interface TimelineProps {
  events: TimelineEvent[];
  style?: React.CSSProperties;
}

export function Timeline({ events, style }: TimelineProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', position: 'relative', paddingLeft: '20px', ...style }}>
      {/* Vert line */}
      <div
        style={{
          position: 'absolute',
          left: '4px',
          top: '4px',
          bottom: '4px',
          width: '2px',
          backgroundColor: 'var(--border)',
        }}
      />
      {events.map((evt, idx) => (
        <div key={idx} style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {/* Dot */}
          <div
            style={{
              position: 'absolute',
              left: '-20px',
              top: '4px',
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              backgroundColor: 'var(--accent-solid)',
              border: '2px solid var(--card-bg)',
            }}
          />
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 500 }}>{evt.time}</div>
          <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-heading)' }}>{evt.title}</div>
          {evt.description && <div style={{ fontSize: '12px', color: 'var(--text)' }}>{evt.description}</div>}
        </div>
      ))}
    </div>
  );
}
