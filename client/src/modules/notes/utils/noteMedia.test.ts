import { describe, expect, it } from 'vitest';
import { validateNoteImage } from './noteMedia';

describe('note image selection policy', () => {
  it.each(['png', 'jpg', 'jpeg', 'webp', 'gif', 'PNG', 'JPEG'])('allows %s with an unknown browser MIME', extension => {
    expect(validateNoteImage(new File(['x'], `image.${extension}`))).toBeNull();
  });
  it.each(['png', 'image.svg', 'image.constructor'])('rejects unsupported filename %s', name => {
    expect(validateNoteImage(new File(['x'], name))).toBe('Choose a PNG, JPEG, WebP, or GIF image.');
  });
  it('rejects an oversized image before uploading', () => {
    const file = new File(['x'], 'photo.png', { type: 'image/png' });
    Object.defineProperty(file, 'size', { value: 10 * 1024 * 1024 + 1 });
    expect(validateNoteImage(file)).toBe('Images must be 10 MB or smaller.');
  });
  it('accepts an image at the API size limit', () => {
    const file = new File(['x'], 'photo.png', { type: 'image/png' });
    Object.defineProperty(file, 'size', { value: 10 * 1024 * 1024 });
    expect(validateNoteImage(file)).toBeNull();
  });
});
