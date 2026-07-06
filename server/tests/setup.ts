process.env.DATABASE_URL = 'pgmem://gravity';
process.env.NODE_ENV = 'test';
process.env.LOCAL_TESTING_KEK = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
process.env.BETTER_AUTH_SECRET = 'test-secret-1234567890';
process.env.BETTER_AUTH_BASE_URL = 'http://localhost:8080';
process.env.CORS_ORIGINS = 'http://localhost:5173';
process.env.TRUSTED_ORIGINS = 'http://localhost:5173,http://localhost:8080';
process.env.ALLOW_ENV_AI_KEYS = 'true';
process.env.ALLOW_DEV_AUTH_BYPASS = 'true';
process.env.REDIS_ENABLED = 'false';
const { afterEach, beforeAll, beforeEach, vi } = await import('vitest');

const memfs = new Map<string, Buffer>();

vi.mock('../src/lib/rustfs.js', () => {
  return {
    RustFS: {
      getBucketPath: (projectId: string, userId: string, noteUuid: string) => `notes/${projectId}/${userId}/${noteUuid}`,
      saveFile: async (bucketPath: string, filename: string, content: string | Buffer) => {
        const key = `${bucketPath}/${filename}`;
        memfs.set(key, Buffer.isBuffer(content) ? content : Buffer.from(content));
      },
      saveFileStream: async (bucketPath: string, filename: string, stream: NodeJS.ReadableStream) => {
        const chunks: any[] = [];
        for await (const chunk of stream) {
          chunks.push(chunk);
        }
        const content = Buffer.concat(chunks);
        if (content.length > 10 * 1024 * 1024) {
          throw new Error('LIMIT_EXCEEDED');
        }
        const key = `${bucketPath}/${filename}`;
        memfs.set(key, content);
      },
      readFile: async (bucketPath: string, filename: string) => {
        const key = `${bucketPath}/${filename}`;
        const buf = memfs.get(key);
        if (!buf) {
          const err: any = new Error(`ENOENT: no such file or directory, open '${key}'`);
          err.code = 'ENOENT';
          throw err;
        }
        return buf;
      },
      streamFile: async (bucketPath: string, filename: string) => {
        const key = `${bucketPath}/${filename}`;
        const buf = memfs.get(key);
        if (!buf) {
          const err: any = new Error(`ENOENT: no such file or directory, open '${key}'`);
          err.code = 'ENOENT';
          throw err;
        }
        const { Readable } = await import('node:stream');
        return Readable.from(buf);
      },
      readFileUtf8: async (bucketPath: string, filename: string) => {
        const key = `${bucketPath}/${filename}`;
        const buf = memfs.get(key);
        if (!buf) {
          const err: any = new Error(`ENOENT: no such file or directory, open '${key}'`);
          err.code = 'ENOENT';
          throw err;
        }
        return buf.toString('utf-8');
      },
      deleteFile: async (bucketPath: string, filename: string) => {
        const key = `${bucketPath}/${filename}`;
        memfs.delete(key);
      },
      deleteBucket: async (bucketPath: string) => {
        const prefix = `${bucketPath}/`;
        for (const key of memfs.keys()) {
          if (key.startsWith(prefix)) memfs.delete(key);
        }
      },
      listFiles: async (bucketPath: string) => {
        const prefix = `${bucketPath}/`;
        const files: string[] = [];
        for (const key of memfs.keys()) {
          if (key.startsWith(prefix)) files.push(key.substring(prefix.length));
        }
        return files;
      }
    }
  };
});
const { initializeDatabase } = await import('../src/db/bootstrap.js');
const { resetDatabase } = await import('./helpers/test-helpers.js');

beforeAll(async () => {
  await initializeDatabase();
});

beforeEach(async () => {
  await resetDatabase();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
