import { describe, expect, it } from 'vitest';
import { createAuthenticatedApi, seedWorkspaceFixture } from './helpers/test-helpers.js';
import { Readable } from 'node:stream';

describe('RustFS Security & Performance Endpoints', () => {
  it('enforces secure uploads, downloads, and deletions', async () => {
    const ownerApi = await createAuthenticatedApi({
      name: 'Security Tester',
      email: 'tester@example.com',
      role: 'owner',
    });
    const owner = ownerApi.user;
    
    const { project } = await seedWorkspaceFixture({
      owner: {
        id: owner.id,
        name: owner.name,
        email: owner.email,
        role: 'owner',
        avatarUrl: owner.avatar,
      },
    });

    // Create a note first
    const createResponse = await ownerApi
      .post('/api/v1/notes')
      .set('x-project-id', project.id)
      .send({
        title: 'Security Note',
        body: '# Test body',
      });

    expect(createResponse.status).toBe(201);
    const noteId = createResponse.body.id;

    // 1. Safe Upload
    const content = 'Hello world from a stream test';
    const uploadRes = await ownerApi
      .post(`/api/v1/notes/${noteId}/media?filename=test-image.png`)
      .set('x-project-id', project.id)
      .set('Content-Type', 'image/png')
      .set('Content-Length', String(content.length))
      .send(content);

    expect(uploadRes.status).toBe(201);
    expect(uploadRes.body.url).toBe(`/api/v1/notes/${noteId}/media/test-image.png`);

    // 2. Reject Path Traversal on Upload
    const traversalUploadRes = await ownerApi
      .post(`/api/v1/notes/${noteId}/media?filename=../../secret.png`)
      .set('x-project-id', project.id)
      .set('Content-Type', 'image/png')
      .set('Content-Length', String(content.length))
      .send(content);

    expect(traversalUploadRes.status).toBe(400);
    expect(traversalUploadRes.body.error).toBe('Invalid filename format.');

    // 3. Reject Forbidden Extension
    const forbiddenUploadRes = await ownerApi
      .post(`/api/v1/notes/${noteId}/media?filename=exploit.exe`)
      .set('x-project-id', project.id)
      .set('Content-Type', 'application/octet-stream')
      .set('Content-Length', String(content.length))
      .send(content);

    expect(forbiddenUploadRes.status).toBe(400);
    expect(forbiddenUploadRes.body.error).toBe('File extension is not allowed.');

    // 4. Reject Payload Too Large (>10MB) via Content-Length Header
    const largeContentRes = await ownerApi
      .post(`/api/v1/notes/${noteId}/media?filename=large.png`)
      .set('x-project-id', project.id)
      .set('Content-Type', 'image/png')
      .set('Content-Length', String(11 * 1024 * 1024))
      .send('a');

    expect(largeContentRes.status).toBe(413);

    // 5. Download verification (headers)
    const downloadRes = await ownerApi
      .get(`/api/v1/notes/${noteId}/media/test-image.png`)
      .set('x-project-id', project.id);

    expect(downloadRes.status).toBe(200);
    expect(downloadRes.headers['content-type']).toBe('image/png');
    expect(downloadRes.headers['content-security-policy']).toBe("default-src 'none'; sandbox");
    expect(downloadRes.headers['content-disposition']).toBe('inline');

    // 6. Download verification for attachment (non-inline safe type)
    // Upload text file first
    const txtContent = 'Some text';
    await ownerApi
      .post(`/api/v1/notes/${noteId}/media?filename=doc.txt`)
      .set('x-project-id', project.id)
      .set('Content-Type', 'text/plain')
      .set('Content-Length', String(txtContent.length))
      .send(txtContent);

    const downloadTxtRes = await ownerApi
      .get(`/api/v1/notes/${noteId}/media/doc.txt`)
      .set('x-project-id', project.id);

    expect(downloadTxtRes.status).toBe(200);
    expect(downloadTxtRes.headers['content-type']).toBe('text/plain');
    expect(downloadTxtRes.headers['content-security-policy']).toBe("default-src 'none'; sandbox");
    expect(downloadTxtRes.headers['content-disposition']).toBe('attachment; filename="doc.txt"');

    // 7. Path Traversal reject on Download
    const traversalDownloadRes = await ownerApi
      .get(`/api/v1/notes/${noteId}/media/..%2F..%2Fsecret.png`)
      .set('x-project-id', project.id);

    expect(traversalDownloadRes.status).toBe(400);

    // 8. Delete verification
    const deleteRes = await ownerApi
      .delete(`/api/v1/notes/${noteId}/media/test-image.png`)
      .set('x-project-id', project.id);

    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body).toEqual({ deleted: true, remainingReferences: [] });

    // 9. Path Traversal reject on Delete
    const traversalDeleteRes = await ownerApi
      .delete(`/api/v1/notes/${noteId}/media/..%2Fsecret.png`)
      .set('x-project-id', project.id);

    expect(traversalDeleteRes.status).toBe(400);
  });
});
