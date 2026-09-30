/** Only run against an EMPTY disposable gravity_note_deletion_test_* database.
 * Uses native PostgreSQL plus synthetic in-process object storage. No Docker.
 */
import assert from 'node:assert/strict';
import { Pool } from 'pg';

const url = new URL(process.env.DATABASE_URL ?? 'postgres://invalid/invalid');
assert.match(url.pathname, /^\/gravity_note_deletion_test_[a-z0-9_]+$/, 'Refusing non-test database');
assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname), 'Use a disposable local database');
process.env.NODE_ENV = 'test';
process.env.REDIS_ENABLED = 'false';
process.env.BETTER_AUTH_SECRET = 'synthetic-note-deletion-postgres-test-secret';
process.env.NODE_IDENTITY_MASTER_KEY = '02'.repeat(32);
process.env.LOCAL_TESTING_KEK = '01'.repeat(32);
const { pool } = await import('../src/db/index.js');
const { initializeDatabase } = await import('../src/db/bootstrap.js');
const { RustFS } = await import('../src/lib/rustfs.js');
const { MetadataRepository } = await import('../src/modules/notes/repositories.js');
const { createNote, updateNote, getNote, deleteNote } = await import('../src/modules/notes/services/notes.js');
const { deleteNoteMedia } = await import('../src/modules/notes/services/media-deletion.js');
const observer = new Pool({ connectionString: url.toString(), max: 1 });

const objects = new Map<string, Buffer>();
RustFS.saveFile = async (bucket, file, data) => { objects.set(`${bucket}/${file}`, Buffer.from(data)); };
RustFS.readFile = async (bucket, file) => {
  const value = objects.get(`${bucket}/${file}`);
  if (!value) throw Object.assign(new Error('missing synthetic object'), { code: 'ENOENT' });
  return value;
};
RustFS.listFiles = async bucket => [...objects.keys()].filter(key => key.startsWith(`${bucket}/`)).map(key => key.slice(bucket.length + 1));
RustFS.statFile = async (bucket, file) => {
  await RustFS.readFile(bucket, file);
  return { etag: 'synthetic-version', lastModified: new Date(0) };
};
RustFS.deleteFile = async (bucket, file) => { objects.delete(`${bucket}/${file}`); };
const normalDelete = RustFS.deleteFile;
const normalStat = RustFS.statFile;
const normalMetadataDelete = MetadataRepository.deleteNoteMetadata;

function gate() {
  let resolve!: () => void;
  const promise = new Promise<void>(r => { resolve = r; });
  return { promise, resolve };
}
async function waitForLockWaiter() {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    const { rows } = await observer.query(`select pid, granted from pg_locks
      where relation = 'note_metadata'::regclass and mode = 'ShareRowExclusiveLock'`);
    if (rows.some(row => !row.granted)) {
      assert.ok(rows.some(row => row.granted), 'Expected holder on another connection');
      assert.ok(new Set(rows.map(row => row.pid)).size >= 2, 'Expected independent connections');
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error('Expected a blocked note mutation in pg_locks');
}
async function fixture() {
  const owner = await createNote('project', 'actor', 'Source', 'Body');
  const other = await createNote('project', 'actor', 'Other', 'Original');
  await RustFS.saveFile(owner.bucketPath, 'photo.png', 'image');
  const body = `[shared](/api/v1/notes/${owner.id}/media/photo.png)`;
  return {
    owner, other,
    publish: (kind: string) => kind === 'create' ? createNote('project', 'actor', 'New', body) : updateNote(other.id, 'project', 1, { body }),
    remove: (kind: string) => kind === 'media' ? deleteNoteMedia(owner.id, 'project', 'photo.png') : deleteNote(owner.id, 'project'),
  };
}
const outcome = <T>(promise: Promise<T>) => promise.then(value => ({ value, error: undefined }), error => ({ value: undefined, error }));
let passed = 0;
try {
  assert.equal((await observer.query(`select count(*)::int as count from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE'`)).rows[0].count, 0, 'Refusing nonempty database');
  await initializeDatabase();

  for (const deletion of ['media', 'note']) {
    for (const publication of ['create', 'update']) {
      for (const first of ['delete', 'publish']) {
        const f = await fixture();
        const entered = gate();
        const release = gate();
        let firstOperation: ReturnType<typeof outcome> | undefined;
        let secondOperation: ReturnType<typeof outcome> | undefined;
        try {
          if (first === 'delete') {
            if (deletion === 'media') RustFS.deleteFile = async (...args) => {
              entered.resolve(); await release.promise; return normalDelete(...args);
            };
            else MetadataRepository.deleteNoteMetadata = async (...args) => {
              entered.resolve(); await release.promise; return normalMetadataDelete(...args);
            };
            firstOperation = outcome(f.remove(deletion));
            await entered.promise;
            secondOperation = outcome(f.publish(publication));
          } else {
            RustFS.statFile = async (...args) => {
              entered.resolve(); await release.promise; return normalStat(...args);
            };
            firstOperation = outcome(f.publish(publication));
            await entered.promise;
            secondOperation = outcome(f.remove(deletion));
          }
          await waitForLockWaiter();
          // Ordinary reads must remain available while writes wait.
          assert.equal((await getNote(f.other.id, 'project'))?.body, 'Original');
          release.resolve();
          const [a, b] = await Promise.all([firstOperation, secondOperation]);
          assert.equal(a.error, undefined);
          if (first === 'delete') {
            assert.match(b.error?.message ?? '', /Note media references are unavailable/);
            assert.equal((await getNote(f.other.id, 'project'))?.version, 1);
          } else {
            if (deletion === 'note') assert.match(b.error?.message ?? '', /still referenced/);
            else assert.deepEqual(b.value && { deleted: (b.value as any).deleted, blocked: (b.value as any).blocked }, { deleted: false, blocked: true });
            assert.ok(await MetadataRepository.getNoteMetadata(f.owner.id));
            assert.equal((await RustFS.readFile(f.owner.bucketPath, 'photo.png')).toString(), 'image');
          }
          passed++;
          console.log(`PASS ${first} first: ${deletion} deletion / ${publication} publication`);
        } finally {
          release.resolve();
          await Promise.all([firstOperation, secondOperation]);
          RustFS.deleteFile = normalDelete;
          RustFS.statFile = normalStat;
          MetadataRepository.deleteNoteMetadata = normalMetadataDelete;
        }
      }
    }
  }

  // Real rollback: no storage is touched if deleting metadata fails in PostgreSQL.
  const f = await fixture();
  await observer.query(`create function reject_note_delete() returns trigger language plpgsql as $$
    begin raise exception 'synthetic deletion failure'; end $$`);
  await observer.query('create trigger reject_note_delete before delete on note_metadata for each row execute function reject_note_delete()');
  await assert.rejects(f.remove('note'));
  assert.ok(await getNote(f.owner.id, 'project'));
  assert.equal((await RustFS.readFile(f.owner.bucketPath, 'photo.png')).toString(), 'image');
  await observer.query('drop trigger reject_note_delete on note_metadata');
  passed++;
  console.log('PASS PostgreSQL rollback preserves metadata and objects');

  // A competing connection cannot hold callers indefinitely; the configured
  // five-second lock wait fails before any reference scan or object deletion.
  const blocker = await observer.connect();
  try {
    await blocker.query('begin');
    await blocker.query('lock table note_metadata in share row exclusive mode');
    const started = Date.now();
    const result = await outcome(f.remove('media'));
    assert.equal(result.error?.cause?.code ?? result.error?.code, '55P03');
    assert.ok(Date.now() - started >= 4500 && Date.now() - started < 8000);
    assert.equal((await RustFS.readFile(f.owner.bucketPath, 'photo.png')).toString(), 'image');
    passed++;
    console.log('PASS bounded PostgreSQL lock wait leaves objects untouched');
  } finally {
    await blocker.query('rollback');
    blocker.release();
  }
  console.log(`${passed} native PostgreSQL note-deletion checks passed`);
} finally {
  await observer.end();
  await pool.end();
}
