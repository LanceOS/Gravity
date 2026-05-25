import React from 'react';
import { Eye, EyeOff, Search, Calendar, Clock, Star, Upload, User, ChevronDown, Check } from 'lucide-react';
import { ClickAwayListener } from '../../utilities';

export interface FileUploaderProps {
  onFileSelect: (files: FileList) => void;
  label?: string;
}

export function FileUploader({ onFileSelect, label }: FileUploaderProps) {
  const [isDragActive, setIsDragActive] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragActive(true);
    } else if (e.type === 'dragleave') {
      setIsDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onFileSelect(e.dataTransfer.files);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '100%' }}>
      {label && <label className="label">{label}</label>}
      <div
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className="clickable"
        style={{
          border: '2px dashed var(--color-border-default)',
          borderRadius: 'var(--radius-lg)',
          padding: '24px',
          textAlign: 'center',
          backgroundColor: isDragActive ? 'var(--color-state-selected-bg)' : 'var(--color-surface-card)',
          cursor: 'pointer',
          transition: 'background-color var(--transition-normal), border-color var(--transition-normal)',
        }}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          onChange={(e) => e.target.files && onFileSelect(e.target.files)}
          style={{ display: 'none' }}
        />
        <Upload size={24} style={{ color: 'var(--color-text-disabled)', marginBottom: '8px' }} />
        <p style={{ fontSize: '13px', margin: 0 }}>Drag and drop files here, or click to upload</p>
      </div>
    </div>
  );
}
