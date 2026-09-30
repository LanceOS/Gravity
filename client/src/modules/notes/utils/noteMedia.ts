// Raster image subset of the note-media API's extension policy. Other API
// attachments are not offered here because the editor inserts image nodes.
const IMAGE_TYPES: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  webp: 'image/webp', gif: 'image/gif',
};
export const NOTE_IMAGE_ACCEPT = '.png,.jpg,.jpeg,.webp,.gif';

export function validateNoteImage(file: File): string | null {
  const extension = /\.([^.]+)$/.exec(file.name)?.[1].toLowerCase() || '';
  const mime = Object.hasOwn(IMAGE_TYPES, extension) ? IMAGE_TYPES[extension] : null;
  if (!mime || (file.type && file.type !== mime)) {
    return 'Choose a PNG, JPEG, WebP, or GIF image.';
  }
  if (!/^[a-zA-Z0-9_.-]+$/.test(file.name)) {
    return 'Rename the file using only letters, numbers, dots, hyphens, and underscores.';
  }
  if (file.size > 10 * 1024 * 1024) return 'Images must be 10 MB or smaller.';
  return null;
}
