import React from 'react';
import { User, ChevronLeft, ChevronRight, Folder, File, ChevronDown } from 'lucide-react';

export interface CarouselProps {
  images: string[];
  style?: React.CSSProperties;
}

export function Carousel({ images, style }: CarouselProps) {
  const [idx, setIdx] = React.useState(0);

  const prev = () => setIdx((i) => (i > 0 ? i - 1 : images.length - 1));
  const next = () => setIdx((i) => (i < images.length - 1 ? i + 1 : 0));

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '200px',
        overflow: 'hidden',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--color-border-default)',
        ...style,
      }}
    >
      <img src={images[idx]} alt="Carousel slide" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      <button
        type="button"
        onClick={prev}
        className="btn btn-ghost clickable"
        style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', padding: '6px' }}
      >
        <ChevronLeft size={16} />
      </button>
      <button
        type="button"
        onClick={next}
        className="btn btn-ghost clickable"
        style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', padding: '6px' }}
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
}
