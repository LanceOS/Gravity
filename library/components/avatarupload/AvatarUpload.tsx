import React from 'react';
import { Eye, EyeOff, Search, Calendar, Clock, Star, Upload, User, ChevronDown, Check } from 'lucide-react';
import { ClickAwayListener } from '../../utilities';

export interface AvatarUploadProps {
  src?: string;
  onChange: (file: File) => void;
  label?: string;
}

export function AvatarUpload({ src, onChange, label }: AvatarUploadProps) {
  const fileRef = React.useRef<HTMLInputElement | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onChange(e.target.files[0]);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'center' }}>
      {label && <label className="label">{label}</label>}
      <div
        className="clickable"
        onClick={() => fileRef.current?.click()}
        style={{
          width: '80px',
          height: '80px',
          borderRadius: 'var(--radius-full)',
          border: '1px solid var(--border)',
          position: 'relative',
          overflow: 'hidden',
          backgroundColor: 'var(--sidebar-bg)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
        }}
      >
        <input ref={fileRef} type="file" accept="image/*" onChange={handleFileChange} style={{ display: 'none' }} />
        {src ? (
          <img src={src} alt="Avatar Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <User size={32} style={{ color: 'var(--text-muted)' }} />
        )}
      </div>
    </div>
  );
}
