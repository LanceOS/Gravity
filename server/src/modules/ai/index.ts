import { credentialManager } from '../auth/kms/index.js';
import { AiService, type AiProviderMap } from './services/ai-service.js';

export const aiService = new AiService(credentialManager);

export function createAiService(deps: { credentialManager: typeof credentialManager; providers?: AiProviderMap }) {
  return new AiService(deps.credentialManager, deps.providers);
}

export { AiService } from './services/ai-service.js';
export type { IAiProvider, Message, ChatOptions } from './types.js';
