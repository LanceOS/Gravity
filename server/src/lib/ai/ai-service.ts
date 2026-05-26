import { CredentialManager } from '../kms/credential-manager.js';
import { OpenAiProvider } from './openai-provider.js';
import { AnthropicProvider } from './anthropic-provider.js';
import { GeminiProvider } from './gemini-provider.js';
import { OllamaProvider } from './ollama-provider.js';
import { ChatOptions, IAiProvider } from './types.js';
import { env } from '../../env.js';

const PROVIDER_ENV_TOKEN_NAMES: Record<string, string> = {
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  gemini: 'GEMINI_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
};

export class AiService {
  private readonly providers: Record<string, IAiProvider>;

  constructor(private readonly credentialManager: CredentialManager) {
    this.providers = {
      openai: new OpenAiProvider(false),
      deepseek: new OpenAiProvider(true),
      anthropic: new AnthropicProvider(),
      gemini: new GeminiProvider(),
      ollama: new OllamaProvider(),
    };
  }

  getOllamaProvider(): OllamaProvider {
    return this.providers.ollama as OllamaProvider;
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

    return this.credentialManager.ExecuteWithCredential(userId, executionCallback);
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
    const lower = provider.toLowerCase();
    if (lower === 'ollama') {
      return this.getProvider('ollama').chat(options);
    }

    // Validate provider existence first (throws if unsupported)
    this.getProvider(provider);

    return this.withProviderCredential(userId, provider, async (decryptedKey) => {
      const providerInst = this.getProvider(provider);
      return providerInst.chat({ ...options, apiKey: decryptedKey });
    });
  }

  /**
   * Tests the connection of the specified provider, using either newly provided
   * parameters (apiKey or ollamaUrl) or loading and decrypting the saved credentials.
   */
  async testConnection(
    userId: string,
    provider: string,
    options?: { apiKey?: string; ollamaUrl?: string },
  ): Promise<number> {
    const startedAt = Date.now();
    const lower = provider.toLowerCase();

    if (lower === 'ollama') {
      const ollamaUrl = (this.providers.ollama as OllamaProvider);
      await ollamaUrl.testConnection({ ollamaUrl: options?.ollamaUrl || 'http://localhost:11434' });
      return Date.now() - startedAt;
    }

    const providerInst = this.getProvider(provider);

    if (options?.apiKey) {
      // Test the newly typed unsaved API Key
      await providerInst.testConnection({ apiKey: options.apiKey });
    } else {
      // Prefer a non-production environment token when configured; otherwise load the saved key.
      await this.withProviderCredential(userId, provider, async (decryptedKey) => {
        await providerInst.testConnection({ apiKey: decryptedKey });
      });
    }

    return Date.now() - startedAt;
  }
}
