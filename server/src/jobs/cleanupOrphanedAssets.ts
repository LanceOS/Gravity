import { fileURLToPath } from 'node:url';
import { db } from '../db/index.js';
import { noteMetadata } from '../modules/notes/schema.js';
import { RustFS } from '../lib/rustfs.js';

async function runCleanup(dryRun = false) {
  console.log('Starting orphaned asset cleanup', dryRun ? '(dry-run)' : '');

  // Fetch all notes with their bucket paths
  const rows = await db.select({ id: noteMetadata.id, bucketPath: noteMetadata.bucketPath }).from(noteMetadata);

  const idToBucket = new Map<string, string>();
  for (const r of rows) idToBucket.set(r.id, r.bucketPath);

  // Scan all bodies and build a map of referenced files per bucket
  const referenced = new Map<string, Set<string>>();

  for (const r of rows) {
    let body = '';
    try {
      body = await RustFS.readFileUtf8(r.bucketPath, 'body.md');
    } catch (err: any) {
      if (err.code === 'ENOENT') continue;
      throw err;
    }

    const pattern = /\/api\/v1\/notes\/([^\/\s]+)\/media\/([^\s)\"]+)/g;
    let m;
    while ((m = pattern.exec(body)) !== null) {
      const refNoteId = m[1];
      const filename = decodeURIComponent(m[2]);
      const targetBucket = idToBucket.get(refNoteId);
      if (!targetBucket) continue;
      if (!referenced.has(targetBucket)) referenced.set(targetBucket, new Set<string>());
      referenced.get(targetBucket)!.add(filename);
    }
  }

  const deleted: Array<{ bucket: string; file: string }> = [];
  const orphanedFound: Array<{ bucket: string; file: string }> = [];

  for (const r of rows) {
    const files = await RustFS.listFiles(r.bucketPath);
    for (const f of files) {
      if (f === 'body.md') continue;
      const refs = referenced.get(r.bucketPath);
      const isReferenced = refs ? refs.has(f) : false;
      if (!isReferenced) {
        orphanedFound.push({ bucket: r.bucketPath, file: f });
        if (!dryRun) {
          await RustFS.deleteFile(r.bucketPath, f);
          deleted.push({ bucket: r.bucketPath, file: f });
        }
      }
    }

    // Remove empty buckets
    const remaining = await RustFS.listFiles(r.bucketPath);
    if (remaining.length === 0) {
      if (!dryRun) {
        await RustFS.deleteBucket(r.bucketPath);
      }
    }
  }

  console.log(`Orphaned files found: ${orphanedFound.length}`);
  if (!dryRun) console.log(`Deleted files: ${deleted.length}`);
  return { orphanedFound, deleted };
}

if (import.meta.url) {
  const __filename = fileURLToPath(import.meta.url);
  if (process.argv[1] === __filename) {
    const dry = process.argv.includes('--dry-run');
    runCleanup(dry)
      .then((res) => {
        console.log('Cleanup complete.');
        process.exit(0);
      })
      .catch((err) => {
        console.error('Cleanup failed:', err);
        process.exit(2);
      });
  }
}

export { runCleanup };
