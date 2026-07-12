import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createAuthenticatedApi, seedWorkspaceFixture } from './helpers/test-helpers.js';
import { db } from '../src/db/index.js';
import { comments, tickets } from '../src/db/schema.js';

/**
 * Server-side trust-boundary coverage for rich-text XSS.
 *
 * The server is deliberately NOT the HTML-sanitization layer. It is a JSON API
 * that persists ticket descriptions and comment bodies as opaque rich-text data
 * (ProseMirror JSON in practice, but any string) and never renders them to
 * HTML. XSS safety is enforced entirely on the client at render time by
 * `renderRichTextHtml` (see client/src/test/utilities/richtext-paste-xss.test.ts).
 *
 * Because the server does not sanitize, a crafted payload can be written
 * straight to the API without ever passing through the editor's paste handler.
 * These tests pin that contract in two directions:
 *
 *   1. Malicious rich-text content is stored and returned BYTE-FOR-BYTE
 *      unchanged - proving the server treats it as inert, opaque data (it does
 *      not execute, interpret, partially strip, or otherwise mangle it), which
 *      is exactly what lets the client be the single sanitization boundary.
 *   2. If someone later assumes "the server already sanitized this" and drops a
 *      client-side guard, or accidentally starts transforming rich text on the
 *      server, this test fails and forces a deliberate re-evaluation.
 */

const XSS_PAYLOADS: Array<[string, string]> = [
  ['inline script tag', '<script>alert(1)</script>'],
  ['img onerror handler', '<img src=x onerror="alert(1)">'],
  ['javascript: link', '<a href="javascript:alert(1)">click</a>'],
  ['svg onload handler', '<svg onload="alert(1)"></svg>'],
  ['iframe payload', '<iframe src="https://evil.com/frame"></iframe>'],
  // What the client actually persists: ProseMirror JSON. A dangerous href can
  // be smuggled into stored JSON; the server must keep it verbatim (the client
  // strips it on render) rather than silently rewrite it.
  [
    'prosemirror json with javascript href',
    JSON.stringify({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'click', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)', title: null } }] },
          ],
        },
      ],
    }),
  ],
];

async function setupOwnerAndProject() {
  const ownerApi = await createAuthenticatedApi({
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    role: 'owner',
  });
  const { owner, project } = await seedWorkspaceFixture({
    owner: {
      id: ownerApi.user.id,
      name: ownerApi.user.name,
      email: ownerApi.user.email,
      role: 'owner',
      avatarUrl: ownerApi.user.avatar,
    },
  });

  return { ownerApi, owner, project };
}

describe('ticket rich-text server trust boundary', () => {
  it('stores and returns a malicious ticket description verbatim without sanitizing', async () => {
    const { ownerApi, project } = await setupOwnerAndProject();

    for (const [, payload] of XSS_PAYLOADS) {
      const createResponse = await ownerApi.post('/api/v1/tickets').send({
        projectId: project.id,
        title: 'Rich text boundary check',
        description: payload,
        priority: 'medium',
      });

      expect(createResponse.status).toBe(201);
      // The create response echoes the description back untouched.
      expect(createResponse.body.description).toBe(payload);

      const ticketId = createResponse.body.id as string;

      // A fresh read returns the same opaque payload...
      const detailResponse = await ownerApi
        .get(`/api/v1/tickets/${ticketId}`)
        .query({ projectId: project.id });

      expect(detailResponse.status).toBe(200);
      expect(detailResponse.body.description).toBe(payload);

      // ...and it is persisted verbatim at rest, not transformed on write.
      const [row] = await db
        .select({ description: tickets.description })
        .from(tickets)
        .where(eq(tickets.id, ticketId));
      expect(row?.description).toBe(payload);
    }
  });

  it('stores and returns a malicious comment body verbatim without sanitizing', async () => {
    const { ownerApi, owner, project } = await setupOwnerAndProject();

    const createTicketResponse = await ownerApi.post('/api/v1/tickets').send({
      projectId: project.id,
      title: 'Comment boundary check',
      description: 'plain description',
      priority: 'medium',
    });
    expect(createTicketResponse.status).toBe(201);
    const ticketId = createTicketResponse.body.id as string;

    for (const [, payload] of XSS_PAYLOADS) {
      const commentResponse = await ownerApi
        .post(`/api/v1/tickets/${ticketId}/comments`)
        .send({ userId: owner.id, body: payload });

      expect(commentResponse.status).toBe(201);
      expect(commentResponse.body.body).toBe(payload);

      const commentId = commentResponse.body.id as string;

      // The list endpoint returns the stored body unchanged.
      const listResponse = await ownerApi.get(`/api/v1/tickets/${ticketId}/comments`);
      expect(listResponse.status).toBe(200);
      const stored = listResponse.body.find((c: { id: string }) => c.id === commentId);
      expect(stored?.body).toBe(payload);

      // And it is persisted verbatim at rest.
      const [row] = await db
        .select({ body: comments.body })
        .from(comments)
        .where(eq(comments.id, commentId));
      expect(row?.body).toBe(payload);
    }
  });

  it('preserves a malicious payload through a comment update (still no server sanitizing)', async () => {
    const { ownerApi, owner, project } = await setupOwnerAndProject();

    const createTicketResponse = await ownerApi.post('/api/v1/tickets').send({
      projectId: project.id,
      title: 'Comment update boundary check',
      description: 'plain description',
      priority: 'medium',
    });
    expect(createTicketResponse.status).toBe(201);
    const ticketId = createTicketResponse.body.id as string;

    const commentResponse = await ownerApi
      .post(`/api/v1/tickets/${ticketId}/comments`)
      .send({ userId: owner.id, body: 'harmless first draft' });
    expect(commentResponse.status).toBe(201);
    const commentId = commentResponse.body.id as string;

    const payload = '<img src=x onerror="alert(1)"><script>alert(2)</script>';
    const updateResponse = await ownerApi
      .patch(`/api/v1/tickets/${ticketId}/comments/${commentId}`)
      .send({ body: payload });

    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.body).toBe(payload);

    const [row] = await db
      .select({ body: comments.body })
      .from(comments)
      .where(eq(comments.id, commentId));
    expect(row?.body).toBe(payload);
  });
});
