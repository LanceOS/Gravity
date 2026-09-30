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

Credentials are tied to the user (one credential record per user).

~~~sql
CREATE TABLE user_external_credentials (
    user_id TEXT PRIMARY KEY,
    encrypted_api_key BYTEA NOT NULL,      -- The user's cloud API key, encrypted with the DEK
    encrypted_dek BYTEA NOT NULL,          -- The Data Encryption Key, encrypted by the KMS
    aes_iv BYTEA NOT NULL,                 -- Initialization Vector for AES-GCM
    aes_auth_tag BYTEA NOT NULL,           -- Authentication Tag for AES-GCM
    kms_kek_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
~~~

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

### Resiliency and Rate Limiting Protection
- **Exponential Backoff with Jitter:** Cloud LLM providers (OpenAI, Anthropic, Gemini) are wrapped with an async retry utility (`fetchWithTimeout`) to gracefully handle `429 Too Many Requests` and transient network failures.
- **Credential Isolation:** Provider credentials are decrypted just in time and are never returned to the client after storage.

### Transaction-Aware Updates
Credential and settings updates utilize `db.transaction()` to prevent race conditions and ensure database integrity when handling user configuration state.

### Strict Session Gating
All administrative and execution routes require an authenticated actor. In development/test, `x-user-id` can be used as a shortcut; in production the server resolves the user from the Better Auth session.


## Production availability and recovery (GRAV-247)

This release does not support a production KMS provider. Production runs with
`ENCRYPTED_CREDENTIALS_MODE=disabled` (the default). Set `required` when your
service contract requires encrypted credential features: preflight and startup
then fail rather than serving an apparently ready deployment without KMS.
Never select development mode or reuse `LOCAL_TESTING_KEK` to bypass this gate.
The account preferences page shows the unavailable state and disables key entry,
save and connection testing. API clients receive HTTP 503 for credential writes
and AI operations. Project chat reports `credentials_disabled` with an explanation.
Existing encrypted records remain intact; metadata and deletion still work.
Environment AI key shortcuts remain development/test-only and cannot bypass disabled mode.

For local provisioning only, generate an independent 32-byte KEK using
`openssl rand -hex 32`, put it in `LOCAL_TESTING_KEK` through your secret store,
and select `required` in development/test. Keep the original key securely backed
up separately from the database, restrict access, and test recovery against a
synthetic or isolated restored database. Disabled mode needs no KEK provisioning.

There is no automatic migration from local encryption to a production KMS and
no supported production credential provisioning procedure in this release.
A future provider must authenticate using restricted workload credentials,
validate its key identity/permissions, probe availability, and preserve the
ability to unwrap old DEKs by their recorded `kms_kek_id`. Provisioning and a
verified read/write round trip must precede enabling required features.
Migration must rewrap DEKs using the original key, or re-enroll user credentials;
never overwrite key identifiers without rewrapping their ciphertext. Retain old
keys until every record and retained backup has been migrated or expired.

Database backups alone cannot recover encrypted credentials. Preserve the
original KEK (or future KMS key versions, policies and access) for each retained
backup. Losing/deleting the key makes those credentials irrecoverable: users must
re-enter keys after a supported provider is available. Disabling features does
not rotate, delete or recover keys, and restoring a database does not enable KMS.
