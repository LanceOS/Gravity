import React from 'react';
import { User, ChevronLeft, ChevronRight, Folder, File, ChevronDown } from 'lucide-react';

export interface CalendarViewProps {
  currentDate?: Date;
  events?: Array<{ date: Date; label: string; color?: string }>;
  style?: React.CSSProperties;
}

export function CalendarView({ currentDate = new Date(), events = [], style }: CalendarViewProps) {
  const daysInMonth = getDaysInMonth(currentDate.getFullYear(), currentDate.getMonth());
  const firstDay = getFirstDayOfMonth(currentDate.getFullYear(), currentDate.getMonth());

  return (
    <div style={{ border: '1px solid var(--color-border-default)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', ...style }}>
      {/* Header */}
      <div style={{ padding: '12px 16px', backgroundColor: 'var(--color-base50)', borderBottom: '1px solid var(--color-border-default)', display: 'flex', justifyContent: 'center' }}>
        <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--color-text-primary)' }}>
          {currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
        </span>
      </div>
      {/* Week Header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid var(--color-border-default)', textAlign: 'center', backgroundColor: 'var(--color-surface-card)' }}>
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div key={d} style={{ padding: '6px', fontSize: '11px', fontWeight: 600, color: 'var(--color-text-disabled)' }}>
            {d}
          </div>
        ))}
      </div>
      {/* Days Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', backgroundColor: 'var(--color-border-default)', gap: '1px' }}>
        {Array.from({ length: firstDay }).map((_, i) => (
          <div key={`empty-${i}`} style={{ backgroundColor: 'var(--color-surface-card)', minHeight: '60px' }} />
        ))}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const dayDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
          const dayEvents = events.filter(
            (evt) =>
              evt.date.getDate() === day &&
              evt.date.getMonth() === currentDate.getMonth() &&
              evt.date.getFullYear() === currentDate.getFullYear()
          );

          return (
            <div
              key={day}
              style={{
                backgroundColor: 'var(--color-surface-card)',
                minHeight: '60px',
                padding: '6px',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
              }}
            >
              <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-primary)' }}>{day}</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', overflowY: 'auto' }}>
                {dayEvents.map((evt, eIdx) => (
                  <div
                    key={eIdx}
                    style={{
                      fontSize: '9px',
                      padding: '1px 4px',
                      borderRadius: 'var(--radius-xs)',
                      backgroundColor: evt.color || 'var(--color-state-selected-bg)',
                      color: 'var(--color-text-primary)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {evt.label}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
