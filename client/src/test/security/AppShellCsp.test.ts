import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const clientRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

describe('application shell CSP compatibility', () => {
  it('loads every shell script from a same-origin external source', () => {
    const html = readFileSync(resolve(clientRoot, 'index.html'), 'utf8');
    const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];

    expect(scripts).toHaveLength(2);

    for (const [, attributes, content] of scripts) {
      expect(attributes).toMatch(/\bsrc=(['"])[^'"]+\1/i);
      expect(content.trim()).toBe('');
    }

    expect(scripts[0][1]).toMatch(/\bsrc=(['"])\/theme-bootstrap\.js\1/i);
    expect(scripts[0][1]).not.toMatch(/\btype=(['"])module\1/i);
    expect(scripts[0][1]).not.toMatch(/\b(?:async|defer)(?:\s|=|$)/i);
  });
});
