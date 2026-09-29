import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  CreateBucketCommand,
  type ListObjectsV2CommandOutput,
} from '@aws-sdk/client-s3';
import { env } from '../env.js';
import { Transform } from 'node:stream';
import { MAX_LISTED_FILES, MAX_LISTED_KEY_BYTES, MAX_LISTING_PAGES, LIST_PAGE_SIZE } from './object-list-limits.js';

class SizeLimitStream extends Transform {
  private bytesRead = 0;
  constructor(private limit: number) {
    super();
  }
  _transform(chunk: any, encoding: string, callback: any) {
    this.bytesRead += chunk.length;
    if (this.bytesRead > this.limit) {
      callback(new Error('LIMIT_EXCEEDED'));
    } else {
      this.push(chunk);
      callback();
    }
  }
}

const s3Client = new S3Client({
  endpoint: env.rustfsEndpoint,
  region: 'us-east-1',
  credentials: {
    accessKeyId: env.rustfsAccessKey,
    secretAccessKey: env.rustfsSecretKey,
  },
  forcePathStyle: true,
});

export class RustFS {
  /**
   * Generates the bucket path: notes/{project_id}/{user_id}/{note_uuid}/
   */
  static getBucketPath(projectId: string, userId: string, noteUuid: string): string {
    return `notes/${projectId}/${userId}/${noteUuid}`;
  }

  /**
   * Saves a file to the specified bucket path.
   */
  static async saveFile(bucketPath: string, filename: string, content: string | Buffer): Promise<void> {
    const key = `${bucketPath}/${filename}`;
    const command = new PutObjectCommand({
      Bucket: env.rustfsBucket,
      Key: key,
      Body: content,
    });
    
    try {
      await s3Client.send(command);
    } catch (err: any) {
      if (err.name === 'NoSuchBucket') {
        const createBucket = new CreateBucketCommand({ Bucket: env.rustfsBucket });
        await s3Client.send(createBucket);
        await s3Client.send(command);
      } else {
        throw err;
      }
    }
  }

  /**
   * Saves a stream to the specified bucket path with size limiting.
   */
  static async saveFileStream(
    bucketPath: string,
    filename: string,
    stream: NodeJS.ReadableStream,
    contentLength?: number
  ): Promise<void> {
    const key = `${bucketPath}/${filename}`;
    const limitStream = new SizeLimitStream(10 * 1024 * 1024);
    stream.pipe(limitStream);

    const command = new PutObjectCommand({
      Bucket: env.rustfsBucket,
      Key: key,
      Body: limitStream,
      ContentLength: contentLength,
    });

    try {
      await s3Client.send(command);
    } catch (err: any) {
      if (err.name === 'NoSuchBucket') {
        const createBucket = new CreateBucketCommand({ Bucket: env.rustfsBucket });
        await s3Client.send(createBucket);
        await s3Client.send(command);
      } else {
        throw err;
      }
    }
  }

  /**
   * Retrieves a file from the specified bucket path.
   */
  static async readFile(bucketPath: string, filename: string): Promise<Buffer> {
    const key = `${bucketPath}/${filename}`;
    const command = new GetObjectCommand({
      Bucket: env.rustfsBucket,
      Key: key,
    });
    try {
      const response = await s3Client.send(command);
      if (!response.Body) {
        throw new Error(`File ${key} not found or empty`);
      }
      const arrayBuffer = await response.Body.transformToByteArray();
      return Buffer.from(arrayBuffer);
    } catch (err: any) {
      if (err.name === 'NoSuchKey' || err.name === 'NotFound') {
        const error = new Error(`ENOENT: no such file or directory, open '${key}'`);
        (error as any).code = 'ENOENT';
        throw error;
      }
      throw err;
    }
  }

  /**
   * Retrieves a file from the specified bucket path as a stream.
   */
  static async streamFile(bucketPath: string, filename: string): Promise<NodeJS.ReadableStream> {
    const key = `${bucketPath}/${filename}`;
    const command = new GetObjectCommand({
      Bucket: env.rustfsBucket,
      Key: key,
    });
    try {
      const response = await s3Client.send(command);
      if (!response.Body) {
        throw new Error(`File ${key} not found or empty`);
      }
      return response.Body as NodeJS.ReadableStream;
    } catch (err: any) {
      if (err.name === 'NoSuchKey' || err.name === 'NotFound') {
        const error = new Error(`ENOENT: no such file or directory, open '${key}'`);
        (error as any).code = 'ENOENT';
        throw error;
      }
      throw err;
    }
  }

  /**
   * Retrieves a file from the specified bucket path as a string (utf-8).
   */
  static async readFileUtf8(bucketPath: string, filename: string): Promise<string> {
    const buffer = await this.readFile(bucketPath, filename);
    return buffer.toString('utf-8');
  }

  /**
   * Reads the upload time and version used by fail-safe media cleanup.
   */
  static async statFile(bucketPath: string, filename: string) {
    const result = await s3Client.send(new HeadObjectCommand({ Bucket: env.rustfsBucket, Key: `${bucketPath}/${filename}` }));
    if (!result.LastModified || !result.ETag) throw new Error(`Missing object version: ${bucketPath}/${filename}`);
    return { lastModified: result.LastModified, etag: result.ETag };
  }

  /** Deletes a file, optionally only if its current ETag matches. */
  static async deleteFile(bucketPath: string, filename: string, etag?: string): Promise<void> {
    const key = `${bucketPath}/${filename}`;
    const command = new DeleteObjectCommand({
      IfMatch: etag,
      Bucket: env.rustfsBucket,
      Key: key,
    });
    await s3Client.send(command);
  }

  /**
   * Deletes an entire bucket directory.
   */
  static async deleteBucket(bucketPath: string): Promise<void> {
    const files = await this.listFiles(bucketPath);
    for (const file of files) {
      await this.deleteFile(bucketPath, file);
    }
  }

  /**
   * Lists all files in the specified bucket path.
   */
  static async listFiles(bucketPath: string): Promise<string[]> {
    const prefix = `${bucketPath}/`;
    const files: string[] = [];
    const seenTokens = new Set<string>();
    let continuationToken: string | undefined;
    let keyBytes = 0;
    for (let page = 0; page < MAX_LISTING_PAGES; page += 1) {
      let response: ListObjectsV2CommandOutput;
      try {
        response = await s3Client.send(new ListObjectsV2Command({
          Bucket: env.rustfsBucket,
          Prefix: prefix,
          MaxKeys: LIST_PAGE_SIZE,
          ContinuationToken: continuationToken,
        }));
      } catch (err: unknown) {
        // An absent bucket is empty only before pagination has begun. A bucket
        // disappearing midway is a failed inventory, never a partial success.
        if (page === 0 && err instanceof Error && err.name === 'NoSuchBucket') return [];
        throw err;
      }
      if (typeof response.IsTruncated !== 'boolean') {
        throw new Error('Object listing did not confirm whether the inventory is complete');
      }
      if ((response.Contents?.length ?? 0) > LIST_PAGE_SIZE) {
        throw new Error('Object listing exceeded page size');
      }
      for (const item of response.Contents ?? []) {
        if (typeof item.Key !== 'string' || !item.Key) {
          throw new Error('Object listing returned an invalid key');
        }
        if (item.Key === prefix) continue;
        if (!item.Key.startsWith(prefix)) throw new Error('Object listing returned an out-of-prefix key');
        const file = item.Key.slice(prefix.length);
        keyBytes += Buffer.byteLength(file);
        if (files.length >= MAX_LISTED_FILES || keyBytes > MAX_LISTED_KEY_BYTES) {
          throw new Error('Object listing exceeded inventory limits');
        }
        files.push(file);
      }
      if (!response.IsTruncated) return files;
      const nextToken = response.NextContinuationToken;
      if (!nextToken || Buffer.byteLength(nextToken) > 16 * 1024 || seenTokens.has(nextToken)) {
        throw new Error('Object listing returned an invalid continuation token');
      }
      seenTokens.add(nextToken);
      continuationToken = nextToken;
    }
    throw new Error('Object listing exceeded page limit');
  }
}
