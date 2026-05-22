import React from 'react';
import { Eye, EyeOff, Search, Calendar, Clock, Star, Upload, User, ChevronDown, Check } from 'lucide-react';
import { ClickAwayListener } from '../../utilities';

export interface DatePickerProps {
  value?: Date;
  onChange: (val: Date) => void;
  placeholder?: string;
  label?: string;
}

export function DatePicker({ value, onChange, placeholder = 'Pick date', label }: DatePickerProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [currentDate, setCurrentDate] = React.useState(value || new Date());

  const daysInMonth = getDaysInMonth(currentDate.getFullYear(), currentDate.getMonth());
  const firstDay = getFirstDayOfMonth(currentDate.getFullYear(), currentDate.getMonth());

  const selectDay = (day: number) => {
    const nextDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
    onChange(nextDate);
    setIsOpen(false);
  };

  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  return (
    <ClickAwayListener onClickAway={() => setIsOpen(false)}>
      <div style={{ position: 'relative', width: '100%' }}>
        {label && <label className="label">{label}</label>}
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="select-trigger clickable"
          style={{ minHeight: '36px' }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
            <Calendar size={14} className="select-trigger__icon" />
            {value ? value.toLocaleDateString() : placeholder}
          </span>
        </button>
        {isOpen && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              zIndex: 1000,
              padding: '12px',
              backgroundColor: 'var(--card-bg)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              boxShadow: 'var(--shadow-md)',
              marginTop: '4px',
              width: '240px',
            }}
          >
            {/* Header controls */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', alignItems: 'center' }}>
              <button type="button" onClick={handlePrevMonth} className="btn btn-sm clickable" style={{ padding: '2px 6px' }}>
                &lt;
              </button>
              <span style={{ fontSize: '13px', fontWeight: 500 }}>
                {currentDate.toLocaleString('default', { month: 'short', year: 'numeric' })}
              </span>
              <button type="button" onClick={handleNextMonth} className="btn btn-sm clickable" style={{ padding: '2px 6px' }}>
                &gt;
              </button>
            </div>
            {/* Day grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', textAlign: 'center' }}>
              {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
                <span key={d} style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-muted)' }}>
                  {d}
                </span>
              ))}
              {Array.from({ length: firstDay }).map((_, i) => (
                <span key={`empty-${i}`} />
              ))}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const isSelected = value && value.getDate() === day && value.getMonth() === currentDate.getMonth() && value.getFullYear() === currentDate.getFullYear();
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => selectDay(day)}
                    className="clickable"
                    style={{
                      border: 'none',
                      background: isSelected ? 'var(--accent-solid)' : 'transparent',
                      color: isSelected ? '#ffffff' : 'var(--text-heading)',
                      borderRadius: 'var(--radius-xs)',
                      padding: '4px',
                      cursor: 'pointer',
                      fontSize: '11px',
                    }}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </ClickAwayListener>
  );
}
