import { beforeEach, describe, expect, it, vi } from 'vitest';
import { S3Client, ListObjectsV2Command, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { MAX_LISTING_PAGES, MAX_LISTED_FILES, MAX_LISTED_KEY_BYTES } from '../src/lib/object-list-limits.js';

// setup.ts stubs RustFS for database integration tests. Exercise the real adapter
// here, intercepting only its SDK boundary; no live storage is touched.
const { RustFS } = await vi.importActual<typeof import('../src/lib/rustfs.js')>('../src/lib/rustfs.js');
const prefix = 'notes/project/user/note/';
let send: ReturnType<typeof vi.spyOn>;
beforeEach(() => { send = vi.spyOn(S3Client.prototype, 'send'); });

describe('complete object-store inventories', () => {
  it('follows multiple pages including an empty intermediate page and preserves relative paths', async () => {
    send.mockResolvedValueOnce({ Contents: [{ Key: prefix }, { Key: `${prefix}body.md` }], IsTruncated: true, NextContinuationToken: 'first' })
      .mockResolvedValueOnce({ IsTruncated: true, NextContinuationToken: 'second' })
      .mockResolvedValueOnce({ Contents: [{ Key: `${prefix}images/café.png` }], IsTruncated: false });
    expect(await RustFS.listFiles(prefix.slice(0, -1))).toEqual(['body.md', 'images/café.png']);
    expect(send.mock.calls.map(([command]) => command.input)).toEqual([
      expect.objectContaining({ Prefix: prefix, MaxKeys: 1000, ContinuationToken: undefined }),
      expect.objectContaining({ Prefix: prefix, ContinuationToken: 'first' }),
      expect.objectContaining({ Prefix: prefix, ContinuationToken: 'second' }),
    ]);
  });

  it('completes all listing pages before deleting any objects', async () => {
    const calls: string[] = [];
    send.mockImplementation(async (command: any) => {
      if (command instanceof ListObjectsV2Command) {
        calls.push('list');
        return command.input.ContinuationToken
          ? { Contents: [{ Key: `${prefix}second.png` }], IsTruncated: false }
          : { Contents: [{ Key: `${prefix}first.png` }], IsTruncated: true, NextContinuationToken: 'next' };
      }
      expect(command).toBeInstanceOf(DeleteObjectCommand);
      calls.push(command.input.Key);
      return {};
    });
    await RustFS.deleteBucket(prefix.slice(0, -1));
    expect(calls).toEqual(['list', 'list', `${prefix}first.png`, `${prefix}second.png`]);
  });

  it.each(['network', 'missing-bucket', 'missing-token', 'repeated-token', 'foreign-key', 'missing-completion', 'missing-key'])('does not delete after a failed or incomplete listing (%s)', async failure => {
    send.mockResolvedValueOnce({ Contents: [{ Key: `${prefix}first.png` }], IsTruncated: true, NextContinuationToken: 'next' });
    if (failure === 'network') send.mockRejectedValueOnce(new Error('network failure'));
    if (failure === 'missing-bucket') send.mockRejectedValueOnce(Object.assign(new Error('gone'), { name: 'NoSuchBucket' }));
    if (failure === 'missing-token') send.mockResolvedValueOnce({ IsTruncated: true });
    if (failure === 'repeated-token') send.mockResolvedValueOnce({ IsTruncated: true, NextContinuationToken: 'next' });
    if (failure === 'foreign-key') send.mockResolvedValueOnce({ Contents: [{ Key: 'different/prefix/file.png' }], IsTruncated: false });
    if (failure === 'missing-completion') send.mockResolvedValueOnce({ Contents: [{ Key: `${prefix}second.png` }] });
    if (failure === 'missing-key') send.mockResolvedValueOnce({ Contents: [{}], IsTruncated: false });
    await expect(RustFS.deleteBucket(prefix.slice(0, -1))).rejects.toThrow();
    expect(send.mock.calls.every(([command]) => command instanceof ListObjectsV2Command)).toBe(true);
  });

  it('accepts an explicitly complete empty inventory', async () => {
    send.mockResolvedValueOnce({ IsTruncated: false });
    expect(await RustFS.listFiles('empty')).toEqual([]);
  });

  it('returns the entire maximum-sized inventory when the final page confirms completion', async () => {
    let page = 0;
    send.mockImplementation(async () => {
      const current = page++;
      return {
        Contents: Array.from({ length: 1000 }, (_, i) => ({ Key: `${prefix}${current}-${i}` })),
        IsTruncated: page < MAX_LISTED_FILES / 1000,
        NextContinuationToken: String(page),
      };
    });
    expect(await RustFS.listFiles(prefix.slice(0, -1))).toHaveLength(MAX_LISTED_FILES);
  });

  it('preserves the empty-list behavior for an initially missing bucket', async () => {
    send.mockRejectedValueOnce(Object.assign(new Error('absent'), { name: 'NoSuchBucket' }));
    expect(await RustFS.listFiles('absent')).toEqual([]);
  });

  it('bounds empty-page pagination even when every cursor is different', async () => {
    let page = 0;
    send.mockImplementation(async () => ({ IsTruncated: true, NextContinuationToken: String(++page) }));
    await expect(RustFS.listFiles('empty')).rejects.toThrow('page limit');
    expect(send).toHaveBeenCalledTimes(MAX_LISTING_PAGES);
  });

  it.each(['count', 'bytes'])('rejects an inventory exceeding its memory bound (%s)', async limit => {
    let page = 0;
    const filename = limit === 'bytes' ? 'é'.repeat(500) : 'file';
    send.mockImplementation(async () => ({
      Contents: Array.from({ length: 1000 }, (_, i) => ({ Key: `${prefix}${page}-${i}-${filename}` })),
      IsTruncated: true, NextContinuationToken: String(++page),
    }));
    await expect(RustFS.deleteBucket(prefix.slice(0, -1))).rejects.toThrow('inventory limits');
    expect(send.mock.calls.every(([command]) => command instanceof ListObjectsV2Command)).toBe(true);
    expect(send.mock.calls.length).toBeLessThanOrEqual(limit === 'count' ? MAX_LISTED_FILES / 1000 + 1 : Math.ceil(MAX_LISTED_KEY_BYTES / 1_000_000) + 1);
  });
});

describe('bounded deleted-prefix pages', () => {
  it('requests one small page and retains prefix markers for deletion', async () => {
    send.mockResolvedValueOnce({ Contents: [{ Key: prefix }, { Key: `${prefix}body.md` }], IsTruncated: true });
    expect(await RustFS.listDeletedBucketPage(prefix.slice(0, -1))).toEqual({ files: ['', 'body.md'], more: true });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].input).toMatchObject({ Prefix: prefix, MaxKeys: 100 });
  });

  it.each([
    {}, { IsTruncated: true },
    { IsTruncated: false, Contents: [{}] },
    { IsTruncated: false, Contents: [{ Key: 'foreign/object' }] },
    { IsTruncated: false, Contents: [{ Key: prefix + 'x'.repeat(1024) }] },
    { IsTruncated: false, Contents: Array.from({ length: 101 }, () => ({ Key: prefix + 'x' })) },
  ])('rejects malformed or oversized pages', async response => {
    send.mockResolvedValueOnce(response);
    await expect(RustFS.listDeletedBucketPage(prefix.slice(0, -1))).rejects.toThrow();
  });

  it('treats only an absent bucket as empty', async () => {
    send.mockRejectedValueOnce(Object.assign(new Error('missing'), { name: 'NoSuchBucket' }));
    expect(await RustFS.listDeletedBucketPage(prefix.slice(0, -1))).toEqual({ files: [], more: false });
    send.mockRejectedValueOnce(new Error('unavailable'));
    await expect(RustFS.listDeletedBucketPage(prefix.slice(0, -1))).rejects.toThrow('unavailable');
  });
});
