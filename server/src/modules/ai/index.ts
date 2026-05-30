import { credentialManager } from '../auth/kms/index.js';
import { AiService } from './services/ai-service.js';

export const aiService = new AiService(credentialManager);

export { AiService } from './services/ai-service.js';
export type { IAiProvider, Message, ChatOptions } from './types.js';
