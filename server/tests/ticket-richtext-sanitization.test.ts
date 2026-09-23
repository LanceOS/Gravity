import { describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createAuthenticatedApi, seedWorkspaceFixture } from './helpers/test-helpers.js';
import { db } from '../src/db/index.js';
import { comments, tickets } from '../src/db/schema.js';
import { richTextSchema } from '../src/lib/rich-text-schema.js';

const RAW_CONTENT_MARKER = 'server-editor-xss-audit-marker-51cbf6';

type ProseMirrorTextNode = {
  type: string;
  text?: string;
  marks?: Array<{
    type: string;
    attrs?: Record<string, unknown>;
  }>;
};

type ProseMirrorDocument = {
  type: string;
  content: Array<{
    type: string;
    content?: ProseMirrorTextNode[];
  }>;
};

function unsafeHtml(safeText: string): string {
  return [
    `<p>${safeText}</p>`,
    `<script>window.${RAW_CONTENT_MARKER} = true</script>`,
    `<img src="https://images.example.test/safe.png" onerror="window.${RAW_CONTENT_MARKER} = true" alt="safe image">`,
    `<a href="javascript:window.${RAW_CONTENT_MARKER} = true">unsafe link</a>`,
    '<iframe src="https://evil.example.test/payload"></iframe>',
  ].join('');
}

function unsafeProseMirrorLink(label: string): string {
  return JSON.stringify({
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: label,
            marks: [
              {
                type: 'link',
                attrs: {
                  href: `java\nscript:window.${RAW_CONTENT_MARKER} = true`,
                  title: null,
                },
              },
            ],
          },
        ],
      },
    ],
  } satisfies ProseMirrorDocument);
}

function expectRawHtmlToBeSafe(content: string, safeText: string): void {
  const doc = richTextSchema.nodeFromJSON(JSON.parse(content));
  expect(doc.textContent).toContain(safeText);
  expect(content).toContain('"src":"https://images.example.test/safe.png"');
  expect(content).toContain('"alt":"safe image"');
  expect(content.toLowerCase()).not.toContain('<script');
  expect(content.toLowerCase()).not.toContain('<iframe');
  expect(content.toLowerCase()).not.toContain('onerror=');
  expect(content.toLowerCase()).not.toContain('javascript:');
  expect(content).not.toContain(RAW_CONTENT_MARKER);
}

function expectUnsafeProseMirrorLinkToBeRemoved(content: string, label: string): void {
  const document = JSON.parse(content) as ProseMirrorDocument;
  const textNode = document.content[0]?.content?.[0];

  expect(document.type).toBe('doc');
  expect(textNode?.text).toBe(label);
  expect(textNode?.marks).toEqual([]);
  expect(content.toLowerCase()).not.toContain('javascript:');
  expect(content).not.toContain(RAW_CONTENT_MARKER);
}

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

function sanitizedAuditEntries(infoSpy: ReturnType<typeof vi.spyOn>) {
  return infoSpy.mock.calls.flatMap(([message]) => {
    const line = String(message);

    try {
      const entry = JSON.parse(line) as Record<string, unknown>;
      return entry.event === 'tickets.editor_content_sanitized' ? [{ line, entry }] : [];
    } catch {
      return [];
    }
  });
}

describe('ticket rich-text server sanitization', () => {
  it('preserves Markdown descriptions and comments through create and update', async () => {
    const { ownerApi, project } = await setupOwnerAndProject();
    const markdown = 'Use `<button>` and `a && b`.\n\n```html\n<script>literal code</script>\n```\n\n<dev@example.test>';
    const create = await ownerApi.post('/api/v1/tickets').send({
      projectId: project.id,
      title: 'Markdown round trip',
      description: markdown,
    });
    expect(create.status).toBe(201);
    expect(create.body.description).toBe(markdown);

    const update = await ownerApi.patch(`/api/v1/tickets/${create.body.id}`)
      .set('x-project-id', project.id).send({ description: `${markdown}\n\nMore text.` });
    expect(update.status).toBe(200);
    expect(update.body.description).toBe(`${markdown}\n\nMore text.`);

    const comment = await ownerApi.post(`/api/v1/tickets/${create.body.id}/comments`)
      .send({ body: '<https://example.test>' });
    expect(comment.status).toBe(201);
    expect(comment.body.body).toBe('<https://example.test>');

    const commentUpdate = await ownerApi.patch(`/api/v1/tickets/${create.body.id}/comments/${comment.body.id}`)
      .send({ body: markdown });
    expect(commentUpdate.status).toBe(200);
    const [stored] = await db.select().from(comments).where(eq(comments.id, comment.body.id));
    expect(stored?.body).toBe(markdown);
  });

  it('sanitizes ticket creation and update before returning and persisting descriptions', async () => {
    const { ownerApi, project } = await setupOwnerAndProject();
    const createSafeText = 'Ticket create safe content';
    const createResponse = await ownerApi.post('/api/v1/tickets').send({
      projectId: project.id,
      title: 'Ticket sanitization coverage',
      description: unsafeHtml(createSafeText),
      priority: 'medium',
    });

    expect(createResponse.status).toBe(201);
    expectRawHtmlToBeSafe(createResponse.body.description, createSafeText);

    const ticketId = createResponse.body.id as string;
    const [createdRow] = await db
      .select({ description: tickets.description })
      .from(tickets)
      .where(eq(tickets.id, ticketId));
    expect(createdRow?.description).toBe(createResponse.body.description);

    const updateLabel = 'Ticket update keeps this text';
    const updateResponse = await ownerApi
      .patch(`/api/v1/tickets/${ticketId}`)
      .set('x-project-id', project.id)
      .send({ description: unsafeProseMirrorLink(updateLabel) });

    expect(updateResponse.status).toBe(200);
    expectUnsafeProseMirrorLinkToBeRemoved(updateResponse.body.description, updateLabel);

    const [updatedRow] = await db
      .select({ description: tickets.description })
      .from(tickets)
      .where(eq(tickets.id, ticketId));
    expect(updatedRow?.description).toBe(updateResponse.body.description);
  });

  it('sanitizes comment creation and update before returning and persisting bodies', async () => {
    const { ownerApi, project } = await setupOwnerAndProject();
    const ticketResponse = await ownerApi.post('/api/v1/tickets').send({
      projectId: project.id,
      title: 'Comment sanitization coverage',
      description: 'safe ticket description',
      priority: 'medium',
    });
    expect(ticketResponse.status).toBe(201);
    const ticketId = ticketResponse.body.id as string;

    const createSafeText = 'Comment create safe content';
    const commentResponse = await ownerApi
      .post(`/api/v1/tickets/${ticketId}/comments`)
      .send({ body: unsafeHtml(createSafeText) });

    expect(commentResponse.status).toBe(201);
    expectRawHtmlToBeSafe(commentResponse.body.body, createSafeText);
    const commentId = commentResponse.body.id as string;

    const [createdRow] = await db
      .select({ body: comments.body })
      .from(comments)
      .where(eq(comments.id, commentId));
    expect(createdRow?.body).toBe(commentResponse.body.body);

    const updateLabel = 'Comment update keeps this text';
    const updateResponse = await ownerApi
      .patch(`/api/v1/tickets/${ticketId}/comments/${commentId}`)
      .send({ body: unsafeProseMirrorLink(updateLabel) });

    expect(updateResponse.status).toBe(200);
    expectUnsafeProseMirrorLinkToBeRemoved(updateResponse.body.body, updateLabel);

    const [updatedRow] = await db
      .select({ body: comments.body })
      .from(comments)
      .where(eq(comments.id, commentId));
    expect(updatedRow?.body).toBe(updateResponse.body.body);
  });

  it('rejects comments when sanitization removes all meaningful content', async () => {
    const { ownerApi, project } = await setupOwnerAndProject();
    const ticketResponse = await ownerApi.post('/api/v1/tickets').send({
      projectId: project.id,
      title: 'Empty comment sanitization coverage',
      description: 'safe ticket description',
      priority: 'medium',
    });
    expect(ticketResponse.status).toBe(201);
    const ticketId = ticketResponse.body.id as string;

    for (const body of [
      '<script>alert(1)</script>',
      '<img src="javascript:alert(1)" alt="unsafe image">',
      JSON.stringify({ type: 'doc', content: [{ type: ['image'], attrs: { src: 'javascript:alert(1)' } }] }),
    ]) {
      const rejectedCreate = await ownerApi
        .post(`/api/v1/tickets/${ticketId}/comments`)
        .send({ body });
      expect(rejectedCreate.status).toBe(400);
      expect(rejectedCreate.body.error).toBe('Comment body must contain safe content.');
    }
    expect(await ownerApi.get(`/api/v1/tickets/${ticketId}/comments`)).toMatchObject({
      status: 200,
      body: [],
    });

    const safeComment = await ownerApi
      .post(`/api/v1/tickets/${ticketId}/comments`)
      .send({ body: 'A safe comment' });
    expect(safeComment.status).toBe(201);
    const commentId = safeComment.body.id as string;

    const rejectedUpdate = await ownerApi
      .patch(`/api/v1/tickets/${ticketId}/comments/${commentId}`)
      .send({ body: '<script>alert(2)</script>' });
    expect(rejectedUpdate.status).toBe(400);
    expect(rejectedUpdate.body.error).toBe('Comment body must contain safe content.');

    const [row] = await db
      .select({ body: comments.body })
      .from(comments)
      .where(eq(comments.id, commentId));
    expect(row?.body).toBe('A safe comment');
  });

  it('removes coercible node and mark types before descriptions and comments reach storage', async () => {
    const { ownerApi, project } = await setupOwnerAndProject();
    const unsafeContent = (text: string) => JSON.stringify({
      type: 'doc',
      content: [{ type: 'paragraph', content: [
        { type: 'text', text, marks: [{ type: ['link'], attrs: { href: 'javascript:alert(1)' } }] },
        { type: ['image'], attrs: { src: 'data:image/svg+xml,<svg onload="alert(1)"/>' } },
      ] }],
    });
    const expectSafeDocument = (content: string, text: string) => {
      const doc = richTextSchema.nodeFromJSON(JSON.parse(content));
      doc.check();
      expect(doc.textContent).toBe(text);
      expect(doc.firstChild?.childCount).toBe(1);
      expect(doc.firstChild?.firstChild?.marks).toEqual([]);
      expect(content).not.toMatch(/javascript:|data:image/);
    };

    const create = await ownerApi.post('/api/v1/tickets').send({
      projectId: project.id,
      title: 'Coercible editor types',
      description: unsafeContent('Created description'),
    });
    expect(create.status).toBe(201);
    expectSafeDocument(create.body.description, 'Created description');

    const update = await ownerApi.patch(`/api/v1/tickets/${create.body.id}`)
      .set('x-project-id', project.id).send({ description: unsafeContent('Updated description') });
    expect(update.status).toBe(200);
    expectSafeDocument(update.body.description, 'Updated description');
    const [storedTicket] = await db.select().from(tickets).where(eq(tickets.id, create.body.id));
    expect(storedTicket.description).toBe(update.body.description);

    const comment = await ownerApi.post(`/api/v1/tickets/${create.body.id}/comments`)
      .send({ body: unsafeContent('Created comment') });
    expect(comment.status).toBe(201);
    expectSafeDocument(comment.body.body, 'Created comment');

    const commentUpdate = await ownerApi.patch(`/api/v1/tickets/${create.body.id}/comments/${comment.body.id}`)
      .send({ body: unsafeContent('Updated comment') });
    expect(commentUpdate.status).toBe(200);
    expectSafeDocument(commentUpdate.body.body, 'Updated comment');
    const [storedComment] = await db.select().from(comments).where(eq(comments.id, comment.body.id));
    expect(storedComment.body).toBe(commentUpdate.body.body);
  });

  it('emits structured audit events for stripped content without logging the raw payload', async () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const { ownerApi, project } = await setupOwnerAndProject();

    const createResponse = await ownerApi.post('/api/v1/tickets').send({
      projectId: project.id,
      title: 'Audit sanitization coverage',
      description: unsafeHtml('Ticket audit content'),
      priority: 'medium',
    });
    expect(createResponse.status).toBe(201);
    const ticketId = createResponse.body.id as string;

    const ticketUpdateResponse = await ownerApi
      .patch(`/api/v1/tickets/${ticketId}`)
      .set('x-project-id', project.id)
      .send({ description: unsafeProseMirrorLink('Ticket update audit content') });
    expect(ticketUpdateResponse.status).toBe(200);

    const commentResponse = await ownerApi
      .post(`/api/v1/tickets/${ticketId}/comments`)
      .send({ body: unsafeHtml('Comment audit content') });
    expect(commentResponse.status).toBe(201);
    const commentId = commentResponse.body.id as string;

    const commentUpdateResponse = await ownerApi
      .patch(`/api/v1/tickets/${ticketId}/comments/${commentId}`)
      .send({ body: unsafeProseMirrorLink('Comment update audit content') });
    expect(commentUpdateResponse.status).toBe(200);

    const auditEntries = sanitizedAuditEntries(infoSpy);
    expect(auditEntries).toHaveLength(4);
    expect(auditEntries.map(({ entry }) => entry)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        event: 'tickets.editor_content_sanitized',
        operation: 'ticket_create',
        field: 'description',
        ticketId,
        projectId: project.id,
        contentFormat: 'html_or_text',
        strippedCount: expect.any(Number),
      }),
      expect.objectContaining({
        event: 'tickets.editor_content_sanitized',
        operation: 'ticket_update',
        field: 'description',
        ticketId,
        projectId: project.id,
        contentFormat: 'prosemirror_json',
        strippedCount: expect.any(Number),
      }),
      expect.objectContaining({
        event: 'tickets.editor_content_sanitized',
        operation: 'comment_create',
        field: 'body',
        ticketId,
        commentId,
        contentFormat: 'html_or_text',
        strippedCount: expect.any(Number),
      }),
      expect.objectContaining({
        event: 'tickets.editor_content_sanitized',
        operation: 'comment_update',
        field: 'body',
        ticketId,
        commentId,
        contentFormat: 'prosemirror_json',
        strippedCount: expect.any(Number),
      }),
    ]));

    for (const { line, entry } of auditEntries) {
      expect(entry).not.toHaveProperty('content');
      expect(entry).not.toHaveProperty('description');
      expect(entry).not.toHaveProperty('body');
      expect(line).not.toContain(RAW_CONTENT_MARKER);
      expect(JSON.stringify(entry)).not.toContain(RAW_CONTENT_MARKER);
    }
  });
});
