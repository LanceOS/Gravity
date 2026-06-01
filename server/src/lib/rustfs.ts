import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '../env.js';

// Get the base path for RustFS from environment, fallback to a local .rustfs_data folder
const RUSTFS_BASE_PATH = process.env.RUSTFS_BASE_PATH || path.resolve(process.cwd(), '.rustfs_data');

export class RustFS {
  /**
   * Generates the bucket path: notes/{project_id}/{user_id}/{note_uuid}/
   */
  static getBucketPath(projectId: string, userId: string, noteUuid: string): string {
    return path.join('notes', projectId, userId, noteUuid);
  }

  /**
   * Returns the absolute path on the local filesystem given a bucket path and filename
   */
  static getAbsolutePath(bucketPath: string, filename: string): string {
    return path.join(RUSTFS_BASE_PATH, bucketPath, filename);
  }

  /**
   * Ensures the directory exists for the given bucket path
   */
  private static async ensureDir(bucketPath: string): Promise<void> {
    const dir = path.join(RUSTFS_BASE_PATH, bucketPath);
    await fs.mkdir(dir, { recursive: true });
  }

  /**
   * Saves a file to the specified bucket path.
   */
  static async saveFile(bucketPath: string, filename: string, content: string | Buffer): Promise<void> {
    await this.ensureDir(bucketPath);
    const filePath = this.getAbsolutePath(bucketPath, filename);
    await fs.writeFile(filePath, content);
  }

  /**
   * Retrieves a file from the specified bucket path.
   */
  static async readFile(bucketPath: string, filename: string): Promise<Buffer> {
    const filePath = this.getAbsolutePath(bucketPath, filename);
    return await fs.readFile(filePath);
  }

  /**
   * Retrieves a file from the specified bucket path as a string (utf-8).
   */
  static async readFileUtf8(bucketPath: string, filename: string): Promise<string> {
    const filePath = this.getAbsolutePath(bucketPath, filename);
    return await fs.readFile(filePath, 'utf-8');
  }

  /**
   * Deletes a file from the specified bucket path.
   */
  static async deleteFile(bucketPath: string, filename: string): Promise<void> {
    const filePath = this.getAbsolutePath(bucketPath, filename);
    try {
      await fs.unlink(filePath);
    } catch (err: any) {
      if (err.code !== 'ENOENT') {
        throw err;
      }
    }
  }

  /**
   * Deletes an entire bucket directory.
   */
  static async deleteBucket(bucketPath: string): Promise<void> {
    const dir = path.join(RUSTFS_BASE_PATH, bucketPath);
    try {
      await fs.rm(dir, { recursive: true, force: true });
    } catch (err: any) {
      if (err.code !== 'ENOENT') {
        throw err;
      }
    }
  }
}
