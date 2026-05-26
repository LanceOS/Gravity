import { credentialManager } from '../kms/index.js';
import { AiService } from './ai-service.js';

export const aiService = new AiService(credentialManager);

export { AiService } from './ai-service.js';
export { IAiProvider, Message, ChatOptions } from './types.js';
