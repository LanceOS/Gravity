import { randomUUID } from 'node:crypto';

const UUID_GLOBAL_REGEX = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const GRAVITY_ID_GLOBAL_REGEX = /\b(w|p|ti|co|wsi|wsr|d|c)-[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/g;

export class McpStateMap {
  private static realToTemp = new Map<string, string>();
  private static tempToReal = new Map<string, string>();
  private static counters = new Map<string, number>();

  static clear() {
    this.realToTemp.clear();
    this.tempToReal.clear();
    this.counters.clear();
  }

  static getAllRealToTemp(): [string, string][] {
    return Array.from(this.realToTemp.entries());
  }

  private static getNextTempId(prefix: string): string {
    const current = this.counters.get(prefix) ?? 0;
    this.counters.set(prefix, current + 1);

    let code = '';
    let temp = current;
    while (temp >= 0) {
      code = String.fromCharCode(65 + (temp % 26)) + code;
      temp = Math.floor(temp / 26) - 1;
    }
    return `Temp-${prefix}-${code}`;
  }

  static getOrCreateTempId(realId: string, prefixHint: string): string {
    if (this.realToTemp.has(realId)) {
      return this.realToTemp.get(realId)!;
    }
    const tempId = this.getNextTempId(prefixHint);
    this.realToTemp.set(realId, tempId);
    this.tempToReal.set(tempId, realId);
    return tempId;
  }

  static getRealId(tempId: string): string | undefined {
    return this.tempToReal.get(tempId);
  }
}

function getPrefixHint(key: string, value: string, parentObj?: any): string {
  const lowerVal = value.toLowerCase();
  if (key === 'projectId' || lowerVal.startsWith('p-')) return 'Project';
  if (key === 'workspaceId' || lowerVal.startsWith('w-')) return 'Workspace';
  if (key === 'assigneeId' || key === 'userId' || lowerVal.startsWith('user-')) return 'User';
  if (key === 'domainId' || lowerVal.startsWith('d-')) return 'Domain';
  if (key === 'cycleId' || lowerVal.startsWith('c-')) return 'Cycle';
  if (key === 'parentId' || lowerVal.startsWith('ti-')) return 'Ticket';
  if (key === 'commentId' || lowerVal.startsWith('co-')) return 'Comment';

  if (key === 'id' && parentObj) {
    if ('projectName' in parentObj || 'projectKey' in parentObj || 'project' in parentObj) return 'Project';
    if ('ticketKey' in parentObj || 'title' in parentObj) return 'Ticket';
    if ('userName' in parentObj || 'email' in parentObj || 'role' in parentObj) return 'User';
  }

  return 'Ref';
}

export function sanitize(obj: any, keyContext = '', parentObj?: any): any {
  if (obj === null || obj === undefined) return obj;

  if (typeof obj === 'string') {
    let sanitizedStr = obj;

    // First replace any existing known real IDs
    for (const [realId, tempId] of McpStateMap.getAllRealToTemp()) {
      sanitizedStr = sanitizedStr.replaceAll(realId, tempId);
    }

    // Scan for any unmapped Gravity IDs in the string
    const gravityMatches = sanitizedStr.match(GRAVITY_ID_GLOBAL_REGEX);
    if (gravityMatches) {
      for (const match of gravityMatches) {
        const hint = getPrefixHint(keyContext, match, parentObj);
        const tempId = McpStateMap.getOrCreateTempId(match, hint);
        sanitizedStr = sanitizedStr.replaceAll(match, tempId);
      }
    }

    // Scan for any unmapped raw UUIDs in the string
    const uuidMatches = sanitizedStr.match(UUID_GLOBAL_REGEX);
    if (uuidMatches) {
      for (const match of uuidMatches) {
        const hint = getPrefixHint(keyContext, match, parentObj);
        const tempId = McpStateMap.getOrCreateTempId(match, hint);
        sanitizedStr = sanitizedStr.replaceAll(match, tempId);
      }
    }

    // Check if the whole string itself is a candidate key-based ID (like 'user-1' or similar for assigneeId)
    const isSpecialKey = ['assigneeId', 'userId', 'projectId', 'workspaceId', 'domainId', 'cycleId', 'parentId', 'commentId'].includes(keyContext);
    if (isSpecialKey && sanitizedStr === obj && !sanitizedStr.startsWith('Temp-')) {
      const hint = getPrefixHint(keyContext, sanitizedStr, parentObj);
      sanitizedStr = McpStateMap.getOrCreateTempId(sanitizedStr, hint);
    }

    return sanitizedStr;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitize(item, keyContext, parentObj));
  }

  if (typeof obj === 'object') {
    const copy: any = {};
    for (const [k, v] of Object.entries(obj)) {
      copy[k] = sanitize(v, k, obj);
    }
    return copy;
  }

  return obj;
}

export function desanitize(obj: any): any {
  if (obj === null || obj === undefined) return obj;

  if (typeof obj === 'string') {
    const tempIdMatch = obj.match(/Temp-(Project|Ticket|Comment|Domain|Cycle|Workspace|User|Ref)-[A-Z]+/g);
    if (tempIdMatch) {
      let desanitizedStr = obj;
      for (const match of tempIdMatch) {
        const realId = McpStateMap.getRealId(match);
        if (realId) {
          desanitizedStr = desanitizedStr.replaceAll(match, realId);
        }
      }
      return desanitizedStr;
    }
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => desanitize(item));
  }

  if (typeof obj === 'object') {
    const copy: any = {};
    for (const [k, v] of Object.entries(obj)) {
      copy[k] = desanitize(v);
    }
    return copy;
  }

  return obj;
}
