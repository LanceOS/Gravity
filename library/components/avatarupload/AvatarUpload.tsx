import React from 'react';
import { User } from 'lucide-react';

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
          border: '1px solid var(--color-border-default)',
          position: 'relative',
          overflow: 'hidden',
          backgroundColor: 'var(--color-base50)',
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
          <User size={32} style={{ color: 'var(--color-text-disabled)' }} />
        )}
      </div>
    </div>
  );
}
