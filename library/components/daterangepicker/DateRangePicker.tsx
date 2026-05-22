import React from 'react';
import { Eye, EyeOff, Search, Calendar, Clock, Star, Upload, User, ChevronDown, Check } from 'lucide-react';
import { ClickAwayListener } from '../utilities/ClickAwayListener';

export interface DateRangePickerProps {
  value: [Date | undefined, Date | undefined];
  onChange: (val: [Date | undefined, Date | undefined]) => void;
  label?: string;
}

export function DateRangePicker({ value, onChange, label }: DateRangePickerProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [currentDate, setCurrentDate] = React.useState(new Date());

  const daysInMonth = getDaysInMonth(currentDate.getFullYear(), currentDate.getMonth());
  const firstDay = getFirstDayOfMonth(currentDate.getFullYear(), currentDate.getMonth());

  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const selectDay = (day: number) => {
    const clickedDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
    if (!value[0] || (value[0] && value[1])) {
      onChange([clickedDate, undefined]);
    } else {
      if (clickedDate < value[0]) {
        onChange([clickedDate, undefined]);
      } else {
        onChange([value[0], clickedDate]);
        setIsOpen(false);
      }
    }
  };

  const getRangeText = () => {
    if (value[0] && value[1]) {
      return `${value[0].toLocaleDateString()} - ${value[1].toLocaleDateString()}`;
    }
    if (value[0]) {
      return `${value[0].toLocaleDateString()} - Select end date`;
    }
    return 'Select date range';
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
            {getRangeText()}
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
                const activeDayDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
                const isStart = value[0] && value[0].getDate() === day && value[0].getMonth() === currentDate.getMonth() && value[0].getFullYear() === currentDate.getFullYear();
                const isEnd = value[1] && value[1].getDate() === day && value[1].getMonth() === currentDate.getMonth() && value[1].getFullYear() === currentDate.getFullYear();
                const inRange = value[0] && value[1] && activeDayDate > value[0] && activeDayDate < value[1];

                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => selectDay(day)}
                    className="clickable"
                    style={{
                      border: 'none',
                      background: isStart || isEnd ? 'var(--accent-solid)' : inRange ? 'var(--accent-glow)' : 'transparent',
                      color: isStart || isEnd ? '#ffffff' : 'var(--text-heading)',
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
