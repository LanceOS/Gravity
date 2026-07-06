import { createHash } from 'node:crypto';
import { CredentialManager } from '../../auth/kms/credential-manager.js';
import { OpenAiProvider } from '../providers/openai-provider.js';
import { AnthropicProvider } from '../providers/anthropic-provider.js';
import { GeminiProvider } from '../providers/gemini-provider.js';
import { ChatOptions, IAiProvider } from '../types.js';
import { env } from '../../../env.js';
import { chooseBestMcpModel } from '../utils/utils.js';

export type AiProviderMap = Record<string, IAiProvider>;

const PROVIDER_ENV_TOKEN_NAMES: Record<string, string> = {
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  gemini: 'GEMINI_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
};

function createDefaultAiProviders(): AiProviderMap {
  return {
    openai: new OpenAiProvider(false),
    deepseek: new OpenAiProvider(true),
    anthropic: new AnthropicProvider(),
    gemini: new GeminiProvider(),
  };
}

function hashCredential(apiKey: string): string {
  return createHash('sha256').update(apiKey).digest('hex').slice(0, 16);
}

export class AiService {
  private readonly providers: Record<string, IAiProvider>;
  private readonly modelCache = new Map<string, { models: string[]; fetchedAt: number }>();
  private readonly modelCacheTtlMs = 10 * 60 * 1000;

  constructor(
    private readonly credentialManager: CredentialManager,
    providers: AiProviderMap = createDefaultAiProviders(),
  ) {
    this.providers = providers;
  }

  private getProvider(provider: string): IAiProvider {
    const lower = provider.toLowerCase();
    const inst = this.providers[lower];
    if (!inst) {
      throw new Error(`Unsupported provider: ${provider}`);
    }
    return inst;
  }

  private getEnvironmentApiKey(provider: string): string | undefined {
    if (!env.allowEnvAiKeys) {
      return undefined;
    }

    if (env.nodeEnv !== 'development' && env.nodeEnv !== 'test') {
      return undefined;
    }

    const envName = PROVIDER_ENV_TOKEN_NAMES[provider.toLowerCase()];
    if (!envName) {
      return undefined;
    }

    const token = process.env[envName]?.trim();
    return token ? token : undefined;
  }

  private async withProviderCredential<T>(
    userId: string,
    provider: string,
    executionCallback: (apiKey: string) => Promise<T>,
  ): Promise<T> {
    const environmentApiKey = this.getEnvironmentApiKey(provider);
    if (environmentApiKey) {
      return executionCallback(environmentApiKey);
    }

    return this.credentialManager.ExecuteWithCredential(userId, provider, executionCallback);
  }

  /**
   * Proxies a chat completion to the specified provider.
   * Decrypts any stored external API keys in-memory on the fly and wipes them when done.
   */
  async chat(
    userId: string,
    provider: string,
    options: Omit<ChatOptions, 'apiKey'>,
  ): Promise<{ content: string; toolCalls?: any[] }> {
    // Validate provider existence first (throws if unsupported)
    this.getProvider(provider);

    return this.withProviderCredential(userId, provider, async (decryptedKey) => {
      const providerInst = this.getProvider(provider);
      return providerInst.chat({ ...options, apiKey: decryptedKey });
    });
  }

  /**
   * Tests the connection of the specified provider, using either newly provided
   * parameters or loading and decrypting the saved credentials.
   */
  async testConnection(
    userId: string,
    provider: string,
    options?: { apiKey?: string },
  ): Promise<number> {
    const startedAt = Date.now();

    const providerInst = this.getProvider(provider);

    if (options?.apiKey) {
      // Test the newly typed unsaved API Key
      await providerInst.testConnection({ apiKey: options.apiKey });
    } else {
      // Always test the actual stored user credential — never use env token shortcuts here,
      // so the result genuinely reflects whether the saved key is valid.
      await this.credentialManager.ExecuteWithCredential(userId, provider, async (decryptedKey) => {
        await providerInst.testConnection({ apiKey: decryptedKey });
      });
    }

    return Date.now() - startedAt;
  }

  async fetchAndChooseBestModel(provider: string, apiKey: string): Promise<string> {
    const lower = provider.toLowerCase();
    // Avoid making external network calls during test runs — return the provider's
    // default preferred model (so tests remain deterministic) instead of fetching.
    if (env.nodeEnv === 'test') {
      return chooseBestMcpModel(lower, []);
    }

    const providerInst = this.getProvider(lower);
    if (!providerInst.fetchModels) {
      throw new Error(`fetchModels is not supported by provider ${provider}`);
    }

    const modelCacheKey = `${lower}:${hashCredential(apiKey)}`;
    const cachedModels = this.modelCache.get(modelCacheKey);
    if (cachedModels && Date.now() - cachedModels.fetchedAt < this.modelCacheTtlMs) {
      return chooseBestMcpModel(lower, cachedModels.models);
    }

    const models = await providerInst.fetchModels(apiKey);
    this.modelCache.set(modelCacheKey, { models, fetchedAt: Date.now() });
    return chooseBestMcpModel(lower, models);
  }
}
