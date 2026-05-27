import { customType } from 'drizzle-orm/pg-core';

/**
 * @description Custom Drizzle ORM type for storing raw binary data (bytea) in PostgreSQL.
 * Handles serialization to and from the database driver format, specifically
 * managing the '\\x' hex prefix required by pg-mem and Postgres.
 */
export const bytea = customType<{ data: Buffer; driverData: string }>({
  dataType() {
    return 'bytea';
  },
  toDriver(value: Buffer): string {
    return `\\x${value.toString('hex')}`;
  },
  fromDriver(value: unknown): Buffer {
    if (Buffer.isBuffer(value)) {
      const str = value.toString('utf8');
      if (/^\\x[0-9a-fA-F]+$/.test(str)) {
        return Buffer.from(str.slice(2), 'hex');
      }
      return value;
    }
    if (typeof value === 'string') {
      if (value.startsWith('\\x')) {
        return Buffer.from(value.slice(2), 'hex');
      }
      return Buffer.from(value, 'hex');
    }
    return Buffer.from(value as any);
  }
});
