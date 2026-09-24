import { randomBytes } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';

const UUID_GLOBAL_REGEX = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const GRAVITY_ID_GLOBAL_REGEX = /\b(w|p|ti|co|wsi|wsr|d|c)-[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/g;

type ScopedReferences = { realToTemp: Map<string, string>; tempToReal: Map<string, string>; touchedAt: number };
const scopeContext = new AsyncLocalStorage<string>();
const scopes = new Map<string, ScopedReferences>();
const MAX_SCOPES = 1000;
const MAX_REFERENCES = 5000;
const REFERENCE_TTL_MS = 60 * 60 * 1000;

/** Legacy references are local to one workspace and actor, bounded, and ephemeral. */
export function withMcpStateScope<T>(scope: string, callback: () => T): T {
  return scopeContext.run(scope, callback);
}

function currentReferences(): ScopedReferences | undefined {
  const scope = scopeContext.getStore();
  if (!scope) return undefined;
  const now = Date.now();
  for (const [key, entry] of scopes) {
    if (now - entry.touchedAt > REFERENCE_TTL_MS) scopes.delete(key);
  }
  let entry = scopes.get(scope);
  if (!entry) entry = { realToTemp: new Map(), tempToReal: new Map(), touchedAt: now };
  entry.touchedAt = now;
  scopes.delete(scope);
  scopes.set(scope, entry);
  while (scopes.size > MAX_SCOPES) scopes.delete(scopes.keys().next().value!);
  return entry;
}

export class McpStateMap {
  static clear() {
    const scope = scopeContext.getStore();
    if (scope) scopes.delete(scope);
    else scopes.clear();
  }

  static getAllRealToTemp(): [string, string][] {
    return Array.from(currentReferences()?.realToTemp.entries() ?? []);
  }

  static getOrCreateTempId(realId: string, prefixHint: string): string {
    const state = currentReferences();
    // Stable authorized IDs remain the default outside an explicitly scoped request.
    if (!state) return realId;
    const existing = state.realToTemp.get(realId);
    if (existing) return existing;
    // Never reuse expired references for another resource or actor.
    const code = Array.from(randomBytes(16), (byte) => String.fromCharCode(65 + byte % 26)).join('');
    const tempId = `Temp-${prefixHint}-${code}`;
    state.realToTemp.set(realId, tempId);
    state.tempToReal.set(tempId, realId);
    if (state.realToTemp.size > MAX_REFERENCES) {
      const first = state.realToTemp.entries().next().value!;
      state.realToTemp.delete(first[0]);
      state.tempToReal.delete(first[1]);
    }
    return tempId;
  }

  static getRealId(tempId: string): string | undefined {
    return currentReferences()?.tempToReal.get(tempId);
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

function replaceMatchedIds(value: string, regex: RegExp, keyContext: string, parentObj?: any): string {
  return value.replace(regex, (match) => {
    const hint = getPrefixHint(keyContext, match, parentObj);
    return McpStateMap.getOrCreateTempId(match, hint);
  });
}

export function sanitize(obj: any, keyContext = '', parentObj?: any): any {
  if (obj === null || obj === undefined) return obj;

  if (typeof obj === 'string') {
    let sanitizedStr = obj;

    // Replace Gravity IDs found in the string in a single regex pass.
    sanitizedStr = replaceMatchedIds(sanitizedStr, GRAVITY_ID_GLOBAL_REGEX, keyContext, parentObj);

    // Replace raw UUIDs found in the string in a single regex pass.
    sanitizedStr = replaceMatchedIds(sanitizedStr, UUID_GLOBAL_REGEX, keyContext, parentObj);

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
    // Define JSON keys as own data properties, including __proto__. Assignment
    // into {} would turn attacker-controlled values into inherited arguments.
    return Object.fromEntries(Object.entries(obj).map(([key, value]) => [key, sanitize(value, key, obj)]));
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
    return Object.fromEntries(Object.entries(obj).map(([key, value]) => [key, desanitize(value)]));
  }

  return obj;
}
