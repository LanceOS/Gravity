import DOMPurify from 'dompurify';

export function sanitizeHtml(html: string): string {
  if (!html) {
    return '';
  }

  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
}

export function isSafeHref(href: string): boolean {
  const normalized = href.replace(/[\s\t\r\n]/g, '');
  return DOMPurify.isValidAttribute('a', 'href', normalized);
}
