import React from 'react';
import { Eye, EyeOff, Search, Calendar, Clock, Star, Upload, User, ChevronDown, Check } from 'lucide-react';
import { ClickAwayListener } from '../../utilities';
import { DatePicker } from '../datepicker';
import { TimePicker } from '../timepicker';

export interface DateTimePickerProps {
  value?: Date;
  onChange: (val: Date) => void;
  label?: string;
}

export function DateTimePicker({ value, onChange, label }: DateTimePickerProps) {
  const handleDateChange = (date: Date) => {
    const nextDate = value ? new Date(value) : new Date();
    nextDate.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
    onChange(nextDate);
  };

  const handleTimeChange = (time: string) => {
    const [hours, minutes] = time.split(':').map(Number);
    const nextDate = value ? new Date(value) : new Date();
    nextDate.setHours(hours, minutes, 0, 0);
    onChange(nextDate);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '100%' }}>
      {label && <label className="label">{label}</label>}
      <div style={{ display: 'flex', gap: '8px' }}>
        <DatePicker value={value} onChange={handleDateChange} />
        <TimePicker
          value={value ? `${value.getHours().toString().padStart(2, '0')}:${value.getMinutes().toString().padStart(2, '0')}` : ''}
          onChange={handleTimeChange}
        />
      </div>
    </div>
  );
}
