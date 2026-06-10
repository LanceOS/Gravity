import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  CreateBucketCommand,
} from '@aws-sdk/client-s3';
import { env } from '../env.js';
import { Transform } from 'node:stream';

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
    let bodyBuffer = typeof content === 'string' ? Buffer.from(content) : content;
    if (bodyBuffer.length === 0) {
      bodyBuffer = Buffer.from(' ');
    }
    const command = new PutObjectCommand({
      Bucket: env.rustfsBucket,
      Key: key,
      Body: bodyBuffer,
      ContentLength: bodyBuffer.length,
    });
    
    try {
      await s3Client.send(command);
    } catch (err: any) {
      if (err.name === 'NoSuchBucket' || err.name === 'NotFound' || err.message?.includes('bucket')) {
        try {
          const createBucket = new CreateBucketCommand({ Bucket: env.rustfsBucket });
          await s3Client.send(createBucket);
          await s3Client.send(command);
        } catch (innerErr: any) {
          if (innerErr.name !== 'BucketAlreadyOwnedByYou' && innerErr.name !== 'BucketAlreadyExists') {
            throw err;
          }
          await s3Client.send(command);
        }
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
      if (err.name === 'NoSuchBucket' || err.name === 'NotFound' || err.message?.includes('bucket')) {
        try {
          const createBucket = new CreateBucketCommand({ Bucket: env.rustfsBucket });
          await s3Client.send(createBucket);
          await s3Client.send(command);
        } catch (innerErr: any) {
          if (innerErr.name !== 'BucketAlreadyOwnedByYou' && innerErr.name !== 'BucketAlreadyExists') {
            throw err;
          }
          await s3Client.send(command);
        }
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
   * Deletes a file from the specified bucket path.
   */
  static async deleteFile(bucketPath: string, filename: string): Promise<void> {
    const key = `${bucketPath}/${filename}`;
    const command = new DeleteObjectCommand({
      Bucket: env.rustfsBucket,
      Key: key,
    });
    await s3Client.send(command);
  }

  /**
   * Deletes an entire bucket directory.
   */
  static async deleteBucket(bucketPath: string): Promise<void> {
    const prefix = `${bucketPath}/`;
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
    const command = new ListObjectsV2Command({
      Bucket: env.rustfsBucket,
      Prefix: prefix,
    });
    try {
      const response = await s3Client.send(command);
      if (!response.Contents) return [];
      
      return response.Contents
        .filter(item => item.Key && item.Key !== prefix)
        .map(item => item.Key!.substring(prefix.length));
    } catch (err: any) {
      if (err.name === 'NoSuchBucket') {
        return [];
      }
      throw err;
    }
  }
}
