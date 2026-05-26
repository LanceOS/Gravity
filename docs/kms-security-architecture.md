# Security & KMS Architecture

This document provides a comprehensive overview of the security architecture and Key Management Service (KMS) integrations implemented to securely manage user-provided third-party AI provider credentials.

## Core Philosophy

Our security model assumes that database compromises can happen. Therefore, we ensure that **plaintext third-party API keys are never stored at rest** and are only ever available in memory for the duration of an API request. We achieve this using **Envelope Encryption** powered by an abstracted Key Management Service (KMS).

---

## 1. Envelope Encryption Architecture

The system utilizes an envelope encryption model with **AES-256-GCM** (Authenticated Encryption with Associated Data). 

### Key Concepts

1. **KEK (Key Encryption Key):** Managed by the KMS provider. It is never exposed directly to the application logic.
2. **DEK (Data Encryption Key):** A symmetric key generated uniquely for each user credential. The application uses the DEK to encrypt the actual API keys.
3. **Envelope:** The KMS encrypts the DEK using the KEK. We store the *encrypted DEK* alongside the *encrypted API key* in our database.

### Cryptographic Operations

- **Encryption (Storing a Key):**
  1. The application requests a new DEK from the KMS.
  2. The KMS returns both the Plaintext DEK and the Encrypted DEK.
  3. The application encrypts the user's API key with the Plaintext DEK using AES-256-GCM, producing the ciphertext, Initialization Vector (IV), and Authentication Tag.
  4. The Plaintext DEK is discarded from memory.
  5. The Encrypted DEK, IV, Auth Tag, and ciphertext are stored in the database.

- **Decryption (Using a Key):**
  1. The application fetches the credential row from the database.
  2. The Encrypted DEK is sent to the KMS for decryption.
  3. The KMS returns the Plaintext DEK.
  4. The application uses the Plaintext DEK, IV, and Auth Tag to decrypt the API key.
  5. The API key is used for the downstream request and immediately garbage collected.

---

## 2. Database Schema

Credentials are tied to the user and their associated provider.

```sql
CREATE TABLE user_external_credentials (
    user_id UUID PRIMARY KEY REFERENCES users(id),
    encrypted_api_key BYTEA NOT NULL,      -- The user's cloud API key, encrypted with the DEK
    encrypted_dek BYTEA NOT NULL,          -- The Data Encryption Key, encrypted by the KMS
    aes_iv BYTEA NOT NULL,                 -- Initialization Vector for AES-GCM
    aes_auth_tag BYTEA NOT NULL,           -- Authentication Tag for AES-GCM
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

---

## 3. Credential Management & DI

The `CredentialManager` handles the cryptographic workflow. It relies on dependency injection (DI) to interface with different KMS providers, making the system easily testable and environment-agnostic.

### KMS Interface (`IKMSProvider`)
We enforce a strict interface for KMS providers:
- `GenerateDataKey(): { plaintextDEK: Buffer; encryptedDEK: Buffer; kekId: string }`
- `DecryptDataKey(encryptedDEK: Buffer): Buffer`
### Current KMS Implementations
- **LocalEnvKmsProvider:** Uses `LOCAL_TESTING_KEK` (development/test only). Primarily for local development; do not use in production.
---

## 4. Runtime Security & AI Orchestration

The `AiService` acts as the orchestrator. To ensure keys don't leak into logs or persistent state, we utilize the **ExecuteWithCredential** pattern.

### The `ExecuteWithCredential` Pattern
Instead of fetching credentials and passing them around explicitly, the `AiService` manages the credential scope:
1. Provider logic requests execution.
2. `CredentialManager` decrypts the credential just-in-time.
3. The credential is provided exclusively to the closure handling the remote HTTP request.
4. Cryptographic errors are proactively redacted at the service boundary to prevent information leakage in API responses or logs.

---

## 5. Architectural Hardening Measures

In addition to envelope encryption, several defense-in-depth measures have been implemented:

### SSRF Prevention (Server-Side Request Forgery)
User-provided Ollama URLs (`OLLAMA_BASE_URL`) undergo strict validation before use.
- Local loopback (`127.0.0.0/8`, `::1`), link-local, and private IP spaces (RFC-1918) are blocked in production mode.
- Resolution caching is utilized to prevent DNS rebinding attacks while honoring a 60-second TTL.

### Resiliency and Rate Limiting Protection
- **Exponential Backoff with Jitter:** Cloud LLM providers (OpenAI, Anthropic, Gemini) are wrapped with an async retry utility (`fetchWithTimeout`) to gracefully handle `429 Too Many Requests` and transient network failures.
- **Fail-Open Caching:** In the event of persistent failures, local caches are cleared to trigger aggressive self-healing and fresh DNS resolution.

### Transaction-Aware Updates
Credential and settings updates utilize `db.transaction()` to prevent race conditions and ensure database integrity when handling user configuration state.

### Strict Session Gating
All administrative and execution routes require an authenticated actor. In development/test, `x-user-id` can be used as a shortcut; in production the server resolves the user from the Better Auth session.
