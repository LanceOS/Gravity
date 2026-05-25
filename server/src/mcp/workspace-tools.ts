import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { workspaceSettings } from '../db/schema.js';

/**
 * Loads workspace-level tool disablement so tool discovery and execution share
 * the same feature flag source.
 */
export async function getDisabledTools(workspaceId: string): Promise<string[]> {
  if (!workspaceId) {
    return [];
  }

  const [settings] = await db
    .select({ disabledMcpTools: workspaceSettings.disabledMcpTools })
    .from(workspaceSettings)
    .where(eq(workspaceSettings.workspaceId, workspaceId))
    .limit(1);

  if (settings && Array.isArray(settings.disabledMcpTools)) {
    return settings.disabledMcpTools as string[];
  }

  return [];
}
