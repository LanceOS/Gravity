import { describe, expect, it } from 'vitest';
import {
  buildTicketUrl,
  DEFAULT_TICKET_URL_BASE,
  parseAllowedTicketHosts,
  sanitizeTicketUrlBase,
} from './ticketUrl';

const TRUSTED_HOSTS = ['tickets.example.com'];

describe('sanitizeTicketUrlBase', () => {
  it('uses the placeholder for missing configuration', () => {
    expect(sanitizeTicketUrlBase(undefined, TRUSTED_HOSTS)).toBe(DEFAULT_TICKET_URL_BASE);
    expect(sanitizeTicketUrlBase('   ', TRUSTED_HOSTS)).toBe(DEFAULT_TICKET_URL_BASE);
  });

  it('accepts and normalizes a same-origin path prefix', () => {
    expect(sanitizeTicketUrlBase('/tickets/', TRUSTED_HOSTS)).toBe('/tickets');
    expect(sanitizeTicketUrlBase('/tickets?view=compact#details', TRUSTED_HOSTS)).toBe('/tickets');
    expect(sanitizeTicketUrlBase('/', TRUSTED_HOSTS)).toBe('');
  });

  it.each([
    '//evil.example',
    '///evil.example',
    '/\\evil.example',
  ])('rejects an external URL disguised as a relative path: %s', (value) => {
    expect(sanitizeTicketUrlBase(value, TRUSTED_HOSTS)).toBe(DEFAULT_TICKET_URL_BASE);
  });

  it.each([
    'http://tickets.example.com',
    'javascript:alert(1)',
    'data:text/html,unsafe',
    'https://evil.example',
    'https://tickets.example.com.evil.example',
    'https://user:password@tickets.example.com',
  ])('rejects an unsafe external base: %s', (value) => {
    expect(sanitizeTicketUrlBase(value, TRUSTED_HOSTS)).toBe(DEFAULT_TICKET_URL_BASE);
  });

  it('requires an explicit port allowlist entry for a non-default HTTPS port', () => {
    expect(sanitizeTicketUrlBase('https://tickets.example.com:8443', TRUSTED_HOSTS)).toBe(DEFAULT_TICKET_URL_BASE);
    expect(sanitizeTicketUrlBase('https://tickets.example.com:8443', ['tickets.example.com:8443']))
      .toBe('https://tickets.example.com:8443');
  });

  it('accepts an allowlisted HTTPS host and strips untrusted URL parts', () => {
    expect(sanitizeTicketUrlBase('https://tickets.example.com/team?redirect=evil#fragment', TRUSTED_HOSTS))
      .toBe('https://tickets.example.com');
  });

  it('supports explicit wildcard subdomains but not their root domain', () => {
    expect(sanitizeTicketUrlBase('https://api.tickets.example.com', ['*.tickets.example.com']))
      .toBe('https://api.tickets.example.com');
    expect(sanitizeTicketUrlBase('https://tickets.example.com', ['*.tickets.example.com']))
      .toBe(DEFAULT_TICKET_URL_BASE);
  });

  it('does not accept an unrestricted wildcard allowlist entry', () => {
    expect(parseAllowedTicketHosts('*')).toEqual([]);
    expect(sanitizeTicketUrlBase('https://evil.example', ['*'])).toBe(DEFAULT_TICKET_URL_BASE);
  });
});

describe('buildTicketUrl', () => {
  it('keeps ticket keys within one URL path segment', () => {
    expect(buildTicketUrl('/tickets', '../evil?next=https://evil.example')).toBe(
      '/tickets/..%2Fevil%3Fnext%3Dhttps%3A%2F%2Fevil.example',
    );
  });

  it('does not produce a protocol-relative URL for a root-relative base', () => {
    expect(buildTicketUrl('', 'GRA-101')).toBe('/GRA-101');
  });

  it('does not throw for malformed Unicode ticket keys', () => {
    expect(buildTicketUrl('/tickets', 'GRA-\uD800')).toBe('/tickets/GRA-%EF%BF%BD');
  });
});
