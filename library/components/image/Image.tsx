import React from 'react';
import { User, ChevronLeft, ChevronRight, Folder, File, ChevronDown } from 'lucide-react';

export interface ImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  fallback?: string;
}

export function Image({ src, fallback = 'https://placehold.co/100', alt, style, ...props }: ImageProps) {
  const [imgSrc, setImgSrc] = React.useState(src);
  const [error, setError] = React.useState(false);

  return (
    <img
      src={error ? fallback : imgSrc}
      alt={alt}
      loading="lazy"
      onError={() => {
        setError(true);
      }}
      style={{
        maxWidth: '100%',
        height: 'auto',
        borderRadius: 'var(--radius-md)',
        ...style,
      }}
      {...props}
    />
  );
}
