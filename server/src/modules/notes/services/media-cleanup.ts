import MarkdownIt from 'markdown-it';
import { isNoteBodyFile } from '../repositories.js';
import { MAX_LISTED_FILES, MAX_LISTED_KEY_BYTES } from '../../../lib/object-list-limits.js';

export type CleanupNote = { id: string; bucketPath: string; bodyKey?: string | null };
export type MediaVersion = { lastModified: Date; etag: string };
export type MediaCleanupDependencies = {
  listNotes: () => Promise<CleanupNote[]>;
  getBody: (bucket: string, bodyKey?: string) => Promise<string>;
  listFiles: (bucket: string) => Promise<string[]>;
  statFile: (bucket: string, file: string) => Promise<MediaVersion>;
  deleteFile: (bucket: string, file: string, etag: string) => Promise<void>;
};
export type CleanupOptions = { dryRun?: boolean; gracePeriodMs?: number };
export const DEFAULT_MEDIA_GRACE_MS = 24 * 60 * 60 * 1000;
const markdown = new MarkdownIt({ html: true });

/** Parse decoded JSON strings and Markdown destinations, never JSON source escapes. */
export function parseMediaReferences(body: string): Map<string, Set<string>> {
  const references = new Map<string, Set<string>>();
  const scan = (value: string, destination = false) => {
    const pattern = destination
      ? /\/api\/v1\/notes\/([^/\s]+)\/media\/(.*)/g
      : /\/api\/v1\/notes\/([^/\s]+)\/media\/([^\s<>"'`]*)/g;
    for (const match of value.matchAll(pattern)) {
      const encoded = destination ? match[2] : match[2].split(')')[0];
      const filename = decodeURIComponent(encoded.split(/[?#]/)[0]);
      const id = decodeURIComponent(match[1]);
      if (!filename || /[\x00-\x1f/\\]/.test(filename)) throw new Error('Malformed note media reference');
      if (!references.has(id)) references.set(id, new Set());
      references.get(id)!.add(filename);
    }
  };
  if (body.trimStart().startsWith('{')) {
    // Damaged rich text must not silently become an empty reference set.
    const parsed: unknown = JSON.parse(body);
    if (!parsed || typeof parsed !== 'object' || !('type' in parsed) || parsed.type !== 'doc') {
      throw new Error('Invalid rich-text document');
    }
    const visit = (value: unknown, key?: string): void => {
      if (typeof value === 'string') scan(value, key === 'src' || key === 'href');
      else if (Array.isArray(value)) value.forEach(item => visit(item));
      else if (value && typeof value === 'object') Object.entries(value).forEach(([key, item]) => visit(item, key));
    };
    visit(parsed);
  } else {
    // Markdown normalizes invalid percent escapes. Reject ambiguity before that
    // normalization so malformed references cannot make an object look orphaned.
    for (const match of body.matchAll(/\/api\/v1\/notes\/[^\s<>"`]+/g)) {
      if (/%(?![0-9a-f]{2})/i.test(match[0])) throw new Error('Malformed note media reference');
    }
    const visit = (tokens: ReturnType<MarkdownIt['parse']>) => {
      for (const token of tokens) {
        for (const [key, value] of token.attrs ?? []) {
          if (key === 'src' || key === 'href') scan(value, true);
        }
        if (token.children) visit(token.children);
        if (['text', 'code_inline', 'code_block', 'fence'].includes(token.type)) scan(token.content);
        if (token.type === 'html_inline' || token.type === 'html_block') {
          for (const attr of token.content.matchAll(/(?:src|href)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) {
            scan(markdown.utils.unescapeAll(attr[1] ?? attr[2] ?? attr[3]), true);
          }
        }
      }
    };
    visit(markdown.parse(body, {}));
  }
  return references;
}

export async function buildMediaReferenceIndex(deps: MediaCleanupDependencies) {
  const notes = await deps.listNotes();
  const referenced = new Map<string, Set<string>>();
  for (const note of notes) {
    try {
      const refs = parseMediaReferences(await deps.getBody(note.bucketPath, note.bodyKey ?? 'body.md'));
      for (const [id, files] of refs) {
        if (!referenced.has(id)) referenced.set(id, new Set());
        for (const file of files) referenced.get(id)!.add(file);
      }
    } catch (cause) {
      throw new Error(`Media cleanup blocked: cannot read or parse body for note ${note.id} (${note.bucketPath})`, { cause });
    }
  }
  return { notes, referenced };
}

export async function cleanupMedia(deps: MediaCleanupDependencies, options: CleanupOptions = {}, target?: CleanupNote) {
  const grace = options.gracePeriodMs ?? DEFAULT_MEDIA_GRACE_MS;
  if (!Number.isFinite(grace) || grace < 0) throw new Error('Invalid media cleanup grace period');
  const initial = await buildMediaReferenceIndex(deps);
  if (target && !initial.notes.some(note => note.id === target.id && note.bucketPath === target.bucketPath)) {
    throw new Error(`Media cleanup blocked: target note ${target.id} missing from reference inventory`);
  }
  const orphanedFound: Array<{ bucket: string; file: string; noteId: string }> = [];
  const deleted: typeof orphanedFound = [];
  const deferred: typeof orphanedFound = [];
  const deadLinks: string[] = [];
  let keyBytes = 0;
  // Finish all inventories before any removal, even when later buckets fail.
  for (const note of target ? [target] : initial.notes) {
    const files = await deps.listFiles(note.bucketPath);
    const refs = initial.referenced.get(note.id) ?? new Set<string>();
    const fileSet = new Set(files);
    if (target) for (const file of refs) if (!fileSet.has(file)) deadLinks.push(file);
    for (const file of files) {
      if (isNoteBodyFile(file) || refs.has(file)) continue;
      keyBytes += Buffer.byteLength(note.bucketPath) + Buffer.byteLength(file);
      if (orphanedFound.length >= MAX_LISTED_FILES || keyBytes > MAX_LISTED_KEY_BYTES) {
        throw new Error('Cleanup plan exceeded inventory limits');
      }
      orphanedFound.push({ bucket: note.bucketPath, file, noteId: note.id });
    }
  }
  if (!options.dryRun) {
    for (const entry of orphanedFound) {
      const version = await deps.statFile(entry.bucket, entry.file);
      if (!version.etag || !Number.isFinite(version.lastModified?.getTime())) {
        throw new Error(`Media cleanup blocked: missing object version for ${entry.bucket}/${entry.file}`);
      }
      if (Date.now() - version.lastModified.getTime() < grace) {
        deferred.push(entry);
        continue;
      }
      // Fetch the note list again too: newly created notes may reference this object.
      const fresh = await buildMediaReferenceIndex(deps);
      if (!fresh.notes.some(note => note.id === entry.noteId && note.bucketPath === entry.bucket)
        || fresh.referenced.get(entry.noteId)?.has(entry.file)) {
        deferred.push(entry);
        continue;
      }
      // Refuse removal if another upload changed the content after HEAD.
      await deps.deleteFile(entry.bucket, entry.file, version.etag);
      deleted.push(entry);
    }
  }
  return { orphanedFound, deleted, deferred, deadLinks };
}
