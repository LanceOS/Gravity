import { beforeEach, describe, expect, it, vi } from 'vitest';
import { S3Client, HeadObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

const { RustFS } = await vi.importActual<typeof import('../src/lib/rustfs.js')>('../src/lib/rustfs.js');
let send: ReturnType<typeof vi.spyOn>;
beforeEach(() => { send = vi.spyOn(S3Client.prototype, 'send'); });

describe('cleanup object version protection', () => {
  it('reads upload age and passes the exact ETag as the delete precondition', async () => {
    const lastModified = new Date('2020-01-01');
    send.mockResolvedValueOnce({ LastModified: lastModified, ETag: '"opaque-etag"' }).mockResolvedValueOnce({});
    const version = await RustFS.statFile('notes/owner', 'photo.png');
    expect(version).toEqual({ lastModified, etag: '"opaque-etag"' });
    await RustFS.deleteFile('notes/owner', 'photo.png', version.etag);
    expect(send.mock.calls[0][0]).toBeInstanceOf(HeadObjectCommand);
    expect(send.mock.calls[1][0]).toBeInstanceOf(DeleteObjectCommand);
    expect(send.mock.calls[1][0].input).toMatchObject({ Key: 'notes/owner/photo.png', IfMatch: '"opaque-etag"' });
  });

  it.each([{}, { LastModified: new Date() }, { ETag: '"etag"' }])('fails closed when object metadata is incomplete', async response => {
    send.mockResolvedValueOnce(response);
    await expect(RustFS.statFile('notes/owner', 'photo.png')).rejects.toThrow('Missing object version');
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('propagates conditional deletion failures without an unconditional retry', async () => {
    send.mockRejectedValueOnce(Object.assign(new Error('changed'), { name: 'PreconditionFailed' }));
    await expect(RustFS.deleteFile('notes/owner', 'photo.png', '"old"')).rejects.toThrow('changed');
    expect(send).toHaveBeenCalledTimes(1);
  });
});
